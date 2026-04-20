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

app = Flask(__name__)


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
    Downloads each image, runs chlorosis and SWAT-DCNN.

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

    # --- Download and process each image ---
    chlorosis_readings = []
    swat_results       = []

    for i, url in enumerate(image_urls, start=1):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                image_bytes = resp.read()
        except Exception as e:
            return jsonify({"error": f"Failed to download image {i}: {str(e)}"}), 500

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
