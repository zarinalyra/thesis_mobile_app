"""
server.py
---------
Flask backend server for the Coffee Leaf Disease Monitoring App.

Endpoints:
    POST /analyze   — receives 3+ leaf images, runs chlorosis computation
                      on each, returns per-image results back to the mobile app.

This server is intended to run on Google Colab (or any Python host).
The SWAT-DCNN inference call is marked with a placeholder — plug in
your existing model inference function there.
"""

from flask import Flask, request, jsonify
from datetime import date
from chlorosis import compute_chlorosis_from_bytes

app = Flask(__name__)


# =============================================================================
# PLACEHOLDER — replace this with your actual SWAT-DCNN inference function
# =============================================================================
def run_swat_dcnn(image_bytes: bytes) -> dict:
    """
    Run SWAT-DCNN inference on a single image.

    Replace the body of this function with your actual model call.
    Expected return format:
        {
            "stage1": "Unhealthy",
            "stage2": "Brown Spot Lesions",
            "stage3": "Cercospora Leaf Spots",
            "confidence": 0.91
        }
    """
    # ── PLUG YOUR MODEL HERE ──────────────────────────────────────────────────
    # Example (pseudocode):
    #   img_tensor = preprocess(image_bytes)
    #   stage1_out = stage1_model.predict(img_tensor)
    #   if stage1_out == "Unhealthy":
    #       stage2_out = stage2_model.predict(img_tensor)
    #       ...
    #   return { "stage1": ..., "stage2": ..., "stage3": ..., "confidence": ... }
    # ─────────────────────────────────────────────────────────────────────────

    # Temporary placeholder return so the server runs without the model:
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
    """
    From a list of SWAT-DCNN results (one per image),
    return the one with the highest confidence score.

    If all images are Healthy, returns a Healthy result.
    If any image is Unhealthy, prioritizes the most confident
    Unhealthy detection — because missing a disease is worse
    than a false positive.
    """
    # Separate healthy vs unhealthy detections
    unhealthy = [d for d in detections if d["stage1"] == "Unhealthy"]

    if unhealthy:
        # Return the unhealthy detection with the highest confidence
        return max(unhealthy, key=lambda d: d["confidence"])
    else:
        # All healthy — return the one with highest confidence
        return max(detections, key=lambda d: d["confidence"])


# =============================================================================
# MAIN ENDPOINT
# =============================================================================
@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Receives 3+ leaf images from the mobile app.
    Runs chlorosis computation on EACH image.
    Runs SWAT-DCNN on EACH image and picks the best detection result.
    Returns per-image chlorosis readings + one disease/pest detection.

    Expected request:
        multipart/form-data
        files: image_1, image_2, image_3, ... (at least 3)
        form:  tree_id (string)

    Returns JSON:
        {
            "tree_id": "T-001",
            "inspection_date": "2026-04-18",
            "detection": {
                "diseases_detected": ["Coffee Leaf Rust"],
                "pests_detected": [],
                "confidence": 0.91
            },
            "chlorosis_readings": [
                {"image_id": 1, "chlorosis_percentage": 3.00, "valid": true},
                {"image_id": 2, "chlorosis_percentage": 4.50, "valid": true},
                {"image_id": 3, "chlorosis_percentage": 48.00, "valid": true}
            ]
        }
    """

    # --- Validate tree_id ---
    tree_id = request.form.get("tree_id")
    if not tree_id:
        return jsonify({"error": "tree_id is required."}), 400

    # --- Collect uploaded images ---
    # Mobile app sends them as image_1, image_2, image_3, etc.
    images = []
    index  = 1
    while f"image_{index}" in request.files:
        images.append(request.files[f"image_{index}"].read())
        index += 1

    if len(images) < 3:
        return jsonify({"error": "At least 3 images are required."}), 400

    # --- Process each image ---
    chlorosis_readings = []
    swat_results       = []

    for i, image_bytes in enumerate(images, start=1):

        # 1. Chlorosis computation
        chlorosis_result = compute_chlorosis_from_bytes(image_bytes)
        chlorosis_readings.append({
            "image_id":             i,
            "chlorosis_percentage": chlorosis_result["chlorosis_percentage"],
            "valid":                chlorosis_result["valid"],
        })

        # 2. SWAT-DCNN inference
        swat_result = run_swat_dcnn(image_bytes)
        swat_results.append(swat_result)

    # --- Pick best SWAT-DCNN result ---
    best_detection = pick_best_detection(swat_results)

    # --- Format diseases and pests from best detection ---
    # Stage 2 tells us the broad category, Stage 3 tells us the specific condition.
    # We separate them into diseases vs pests based on known labels.
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

    # --- Build response ---
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
# HEALTH CHECK — useful for confirming the server is alive
# =============================================================================
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "Server is running."}), 200


# =============================================================================
# RUN
# =============================================================================
if __name__ == "__main__":
    # For Colab: use ngrok or similar to expose this port publicly
    # For local testing: just run python server.py
    app.run(host="0.0.0.0", port=5000, debug=True)
