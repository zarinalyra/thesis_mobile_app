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
import os
import cv2
import httpx
import numpy as np
import time

app = Flask(__name__)

# URL of the Hugging Face Space that runs SWAT-DCNN inference.
# Set this in Render → Environment, e.g.
#   HF_SPACE_URL=https://yourname-swat-dcnn.hf.space
HF_SPACE_URL = os.getenv("HF_SPACE_URL", "").rstrip("/")

# HF Spaces sleep after inactivity; first request can cold-start for ~30–60s.
HF_TIMEOUT_SECONDS = 300

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
# SWAT-DCNN — delegated to the Hugging Face Space (heavy TF inference).
# Returns the same shape the rest of this file expects:
#   {"stage1": str, "stage2": str|None, "stage3": str|None, "confidence": float}
# Falls back to a safe placeholder if HF is unreachable so chlorosis still
# surfaces to the mobile app instead of failing the whole /analyze call.
# =============================================================================
def _safe_swat_default() -> dict:
    return {
        "stage1":     "Healthy",
        "stage2":     None,
        "stage3":     None,
        "confidence": 0.0,
    }


def run_swat_dcnn(image_url: str) -> dict:
    short_url = image_url.split("/")[-1][:60]

    if not HF_SPACE_URL:
        print(f"[swat] HF_SPACE_URL not set — placeholder for {short_url}")
        return _safe_swat_default()

    print(f"[swat] → calling HF Space for {short_url}", flush=True)
    t0 = time.time()
    try:
        resp = httpx.post(
            f"{HF_SPACE_URL}/predict",
            json={"image_url": image_url},
            timeout=HF_TIMEOUT_SECONDS,
        )
        elapsed = round(time.time() - t0, 2)
        print(f"[swat] ← HTTP {resp.status_code} in {elapsed}s for {short_url}", flush=True)
        resp.raise_for_status()
        result = resp.json()
        print(f"[swat]   stage1={result.get('stage1')} stage2={result.get('stage2')} "
              f"stage3={result.get('stage3')} conf={result.get('confidence')}", flush=True)
    except httpx.TimeoutException as e:
        elapsed = round(time.time() - t0, 2)
        print(f"[swat] TIMEOUT after {elapsed}s for {short_url}: {e}", flush=True)
        return _safe_swat_default()
    except httpx.HTTPStatusError as e:
        elapsed = round(time.time() - t0, 2)
        print(f"[swat] HTTP ERROR {e.response.status_code} after {elapsed}s for {short_url}", flush=True)
        return _safe_swat_default()
    except Exception as e:
        elapsed = round(time.time() - t0, 2)
        print(f"[swat] ERROR after {elapsed}s for {short_url}: {type(e).__name__}: {e}", flush=True)
        return _safe_swat_default()

    return {
        "stage1":     result.get("stage1", "Healthy"),
        "stage2":     result.get("stage2"),
        "stage3":     result.get("stage3"),
        "confidence": float(result.get("confidence", 0.0) or 0.0),
    }


# =============================================================================
# LABEL SETS
# =============================================================================
PEST_LABELS    = {"CLM", "RSM"}
DISEASE_LABELS = {"CLR", "BSL", "SM", "CLS", "PLS"}


# =============================================================================
# AGGREGATION — union across all images, one result per inspection
# =============================================================================
def aggregate_results(swat_results: list, chlorosis_results: list) -> dict:
    diseases       = set()
    pests          = set()
    confidences    = []
    healthy_count  = 0
    disease_count  = 0
    image_findings = []

    for i, (swat, chlorosis) in enumerate(zip(swat_results, chlorosis_results)):
        if swat["stage1"] == "Healthy":
            healthy_count += 1
        else:
            disease_count += 1

        for label in [swat.get("stage2"), swat.get("stage3")]:
            if label is None:
                continue
            if label in PEST_LABELS:
                pests.add(label)
            elif label in DISEASE_LABELS:
                diseases.add(label)

        if swat["stage1"] == "Unhealthy" and swat.get("confidence", 0) > 0:
            confidences.append(swat["confidence"])

        image_findings.append({
            "image_index":          i,
            "stage1":               swat["stage1"],
            "stage2":               swat.get("stage2"),
            "stage3":               swat.get("stage3"),
            "confidence":           swat.get("confidence", 0),
            "chlorosis_percentage": chlorosis.get("chlorosis_percentage", 0),
            "chlorosis_valid":      chlorosis.get("valid", False),
            "glare_percentage":     chlorosis.get("glare_percentage", 0),
        })

    return {
        "diseases_detected":   list(diseases),
        "pests_detected":      list(pests),
        "confidence":          round(max(confidences), 4) if confidences else 0,
        "total_images":        len(swat_results),
        "images_with_disease": disease_count,
        "images_healthy":      healthy_count,
        "image_findings":      image_findings,
    }


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
    chlorosis_readings = []   # trimmed — for the response chlorosis_readings field
    chlorosis_results  = []   # full (includes glare_percentage) — for aggregate_results
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
        chlorosis_results.append(chlorosis_result)

        # SWAT-DCNN inference (heavy work runs on the HF Space, so we just
        # forward the original Supabase URL — no need to upload bytes again).
        swat_result = run_swat_dcnn(url)
        swat_results.append(swat_result)

        chlorosis_readings.append({
            "image_id":             i,
            "chlorosis_percentage": chlorosis_result["chlorosis_percentage"],
            "valid":                chlorosis_result["valid"],
            "stage1":               swat_result["stage1"],
            "stage2":               swat_result.get("stage2"),
            "stage3":               swat_result.get("stage3"),
        })

    # --- Aggregate across all images (union of diseases/pests) ---
    aggregated = aggregate_results(swat_results, chlorosis_results)

    response = {
        "tree_id":             tree_id,
        "inspection_date":     str(date.today()),
        "detection": {
            "diseases_detected": aggregated["diseases_detected"],
            "pests_detected":    aggregated["pests_detected"],
            "confidence":        aggregated["confidence"],
        },
        "total_images":        aggregated["total_images"],
        "images_with_disease": aggregated["images_with_disease"],
        "images_healthy":      aggregated["images_healthy"],
        "chlorosis_readings":  chlorosis_readings,
        "image_findings":      aggregated["image_findings"],
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