"""
server.py
---------
Flask backend server for the Coffee Leaf Disease Monitoring App.

Endpoints:
    POST /analyze   — receives 3+ image URLs, downloads each image,
                      runs chlorosis computation, returns per-image results.

    GET  /          — health check
"""

from flask import Flask, request, jsonify
from datetime import date
from chlorosis import compute_chlorosis_from_bytes
import urllib.request
import cv2
import numpy as np

app = Flask(__name__)

# Maximum dimension for any side of the image before processing.
# 480px is sufficient for color-based chlorosis detection and keeps
# GrabCut fast enough to finish within Render's 30s worker timeout.
MAX_IMAGE_DIM = 480


# =============================================================================
# HELPER — resize image bytes before processing
# =============================================================================
def resize_image_bytes(image_bytes: bytes, max_dim: int = MAX_IMAGE_DIM) -> bytes:
    """
    Decode image bytes, resize so the longest side <= max_dim,
    then re-encode as JPEG and return new bytes.
    Returns original bytes unchanged if decoding fails.
    """
    img_array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        return image_bytes

    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return image_bytes  # already small enough

    scale = max_dim / max(h, w)
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    success, encoded = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        return image_bytes

    return encoded.tobytes()


# =============================================================================
# PLACEHOLDER — replace this with your actual SWAT-DCNN inference function
# =============================================================================
def run_swat_dcnn(image_bytes: bytes) -> dict:
    return {
        "stage1":     "Healthy",
        "stage2":     None,
        "stage3":     None,
        "confidence": 0.0
    }


# =============================================================================
# HELPER — pick the best SWAT-DCNN result across all images
# =============================================================================
def pick_best_detection(detections: list) -> dict:
    unhealthy = [d for d in detections if d["stage1"] == "Unhealthy"]
    if unhealthy:
        return max(unhealthy, key=lambda d: d["confidence"])
    else:
        return max(detections, key=lambda d: d["confidence"])


# =============================================================================
# MAIN ENDPOINT
# =============================================================================
@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Receives a JSON body with tree_id and a list of image URLs.
    Downloads each image, resizes it, runs chlorosis and SWAT-DCNN.

    Expected request (JSON):
        {
            "tree_id": "T-001",
            "image_urls": [
                "https://...supabase.co/.../image1.jpg",
                "https://...supabase.co/.../image2.jpg",
                "https://...supabase.co/.../image3.jpg"
            ]
        }

    Returns JSON:
        {
            "tree_id": "T-001",
            "inspection_date": "2026-04-20",
            "detection": {
                "diseases_detected": [],
                "pests_detected": [],
                "confidence": 0.0
            },
            "chlorosis_readings": [
                {"image_id": 1, "chlorosis_percentage": 3.00, "valid": true},
                {"image_id": 2, "chlorosis_percentage": 4.50, "valid": true},
                {"image_id": 3, "chlorosis_percentage": 48.00, "valid": true}
            ]
        }
    """

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON body required."}), 400

    tree_id = data.get("tree_id")
    if not tree_id:
        return jsonify({"error": "tree_id is required."}), 400

    image_urls = data.get("image_urls", [])
    if len(image_urls) < 3:
        return jsonify({"error": "At least 3 image URLs are required."}), 400

    # --- Download, resize, and process each image ---
    chlorosis_readings = []
    swat_results       = []

    for i, url in enumerate(image_urls, start=1):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                image_bytes = resp.read()
        except Exception as e:
            return jsonify({"error": f"Failed to download image {i}: {str(e)}"}), 500

        # Resize to prevent OOM on Render free tier
        image_bytes = resize_image_bytes(image_bytes, MAX_IMAGE_DIM)

        # Chlorosis computation
        chlorosis_result = compute_chlorosis_from_bytes(image_bytes)
        chlorosis_readings.append({
            "image_id":             i,
            "chlorosis_percentage": chlorosis_result["chlorosis_percentage"],
            "valid":                chlorosis_result["valid"],
        })

        # SWAT-DCNN inference
        swat_result = run_swat_dcnn(image_bytes)
        swat_results.append(swat_result)

    # --- Pick best SWAT-DCNN result ---
    best_detection = pick_best_detection(swat_results)

    PEST_LABELS = {"Coffee Leaf Miner", "Red Spider Mite"}
    diseases_detected = []
    pests_detected    = []

    for label in [best_detection.get("stage2"), best_detection.get("stage3")]:
        if label is None:
            continue
        if label in PEST_LABELS:
            pests_detected.append(label)
        else:
            diseases_detected.append(label)

    response = {
        "tree_id":         tree_id,
        "inspection_date": str(date.today()),
        "detection": {
            "diseases_detected": diseases_detected,
            "pests_detected":    pests_detected,
            "confidence":        round(best_detection["confidence"], 4),
        },
        "chlorosis_readings": chlorosis_readings,
    }

    return jsonify(response), 200


# =============================================================================
# HEALTH CHECK
# =============================================================================
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "Server is running."}), 200


# =============================================================================
# RUN
# =============================================================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)