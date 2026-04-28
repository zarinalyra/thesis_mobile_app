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
from concurrent.futures import ThreadPoolExecutor, as_completed
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
# 320px is sufficient for color-based chlorosis detection; smaller
# images make GrabCut roughly 2x faster on Render's 0.5 CPU core.
MAX_IMAGE_DIM = 320


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
#
# Calls /predict-debug to obtain the full probability vector per stage.
#
# Returns:
#   {
#     "stage1":       "Healthy" | "Unhealthy",
#     "stage2":       label | None,
#     "stage3":       label | None,
#     "confidence":   float,
#     "stage2_probs": {label: prob, ...} | None,   # None when stage1=Healthy
#     "stage3_probs": {label: prob, ...} | None,   # None unless stage2=BSL
#   }
#
# Falls back to a safe placeholder if HF is unreachable so chlorosis still
# surfaces to the mobile app instead of failing the whole /analyze call.
# =============================================================================
def _safe_swat_default() -> dict:
    return {
        "stage1":       "Healthy",
        "stage2":       None,
        "stage3":       None,
        "confidence":   0.0,
        "stage2_probs": None,
        "stage3_probs": None,
    }


def run_swat_dcnn(image_url: str) -> dict:
    short_url = image_url.split("/")[-1][:60]

    if not HF_SPACE_URL:
        print(f"[swat] HF_SPACE_URL not set — placeholder for {short_url}")
        return _safe_swat_default()

    print(f"[swat] → calling HF Space /predict-debug for {short_url}", flush=True)
    t0 = time.time()
    try:
        resp = httpx.post(
            f"{HF_SPACE_URL}/predict-debug",
            json={"image_url": image_url},
            timeout=HF_TIMEOUT_SECONDS,
        )
        elapsed = round(time.time() - t0, 2)
        print(f"[swat] ← HTTP {resp.status_code} in {elapsed}s for {short_url}", flush=True)
        resp.raise_for_status()
        data = resp.json()

        final   = data.get("final", {})
        cascade = data.get("cascade", {})

        stage1 = final.get("stage1", "Healthy")
        stage2 = final.get("stage2")
        stage3 = final.get("stage3")
        conf   = float(final.get("confidence", 0.0) or 0.0)

        stage2_probs = None
        stage3_probs = None

        s2_trace = cascade.get("stage2")
        if s2_trace and isinstance(s2_trace.get("all_probs"), dict):
            stage2_probs = {k: round(float(v), 4) for k, v in s2_trace["all_probs"].items()}

        s3_trace = cascade.get("stage3")
        if s3_trace and isinstance(s3_trace.get("all_probs"), dict):
            stage3_probs = {k: round(float(v), 4) for k, v in s3_trace["all_probs"].items()}

        print(
            f"[swat]   stage1={stage1} stage2={stage2} stage3={stage3} "
            f"conf={conf} s2_probs={stage2_probs is not None} s3_probs={stage3_probs is not None}",
            flush=True,
        )

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
        "stage1":       stage1,
        "stage2":       stage2,
        "stage3":       stage3,
        "confidence":   conf,
        "stage2_probs": stage2_probs,
        "stage3_probs": stage3_probs,
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
    per_image_results = []

    for i, (swat, chlorosis) in enumerate(zip(swat_results, chlorosis_results)):
        is_healthy = swat["stage1"] == "Healthy"

        if is_healthy:
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

        if not is_healthy and swat.get("confidence", 0) > 0:
            confidences.append(swat["confidence"])

        # Most specific label for this image
        final_label = swat.get("stage3") or swat.get("stage2") or swat["stage1"]

        per_image_results.append({
            "image_index":    i + 1,
            "final_label":    final_label,
            "stage_1_result": swat["stage1"],
            "stage_2":        swat.get("stage2_probs"),   # None when Healthy
            "stage_3":        swat.get("stage3_probs"),   # None unless BSL
            "chlorosis_pct":  round(chlorosis.get("chlorosis_percentage", 0), 2),
        })

    return {
        "diseases_detected":   list(diseases),
        "pests_detected":      list(pests),
        "confidence":          round(max(confidences), 4) if confidences else 0,
        "total_images":        len(swat_results),
        "images_with_disease": disease_count,
        "images_healthy":      healthy_count,
        "per_image_results":   per_image_results,
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
                ...
            ]
        }

    Returns JSON:
        {
            "tree_id": "T-001",
            "inspection_date": "2026-04-20",
            "detection": {
                "diseases_detected": ["CLR"],
                "pests_detected": [],
                "confidence": 0.72
            },
            "chlorosis_readings": [...],
            "total_images": 3,
            "images_with_disease": 2,
            "images_healthy": 1,
            "per_image_results": [
                {
                    "image_index": 1,
                    "final_label": "CLR",
                    "stage_1_result": "Unhealthy",
                    "stage_2": {"CLR": 0.72, "BSL": 0.21, "SM": 0.07},
                    "stage_3": null,
                    "chlorosis_pct": 23.4
                },
                ...
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

    # --- Phase 1: Download, resize, and chlorosis (CPU-bound, sequential) ---
    # GrabCut is CPU-intensive; running sequentially avoids contention on
    # Render's single 0.5-core CPU.
    image_bytes_list   = []
    chlorosis_results  = []

    for i, url in enumerate(image_urls, start=1):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                raw = resp.read()
        except Exception as e:
            return jsonify({"error": f"Failed to download image {i}: {str(e)}"}), 500

        raw = resize_image_bytes(raw, MAX_IMAGE_DIM)
        image_bytes_list.append(raw)

        t0 = time.time()
        chlorosis_result = compute_chlorosis_from_bytes(raw)
        print(f"[chlorosis] image {i} done in {round(time.time()-t0,2)}s  "
              f"pct={chlorosis_result.get('chlorosis_percentage',0):.1f}%", flush=True)
        chlorosis_results.append(chlorosis_result)

    # --- Phase 2: SWAT-DCNN (I/O-bound, parallel) ---
    # Each call blocks on the HF Space network round-trip; running them
    # concurrently reduces total SWAT time from sum(t_i) to max(t_i).
    swat_results = [None] * len(image_urls)

    def _swat(idx_url):
        idx, url = idx_url
        t0 = time.time()
        result = run_swat_dcnn(url)
        print(f"[swat-par] image {idx+1} done in {round(time.time()-t0,2)}s", flush=True)
        return idx, result

    with ThreadPoolExecutor(max_workers=len(image_urls)) as pool:
        futures = {pool.submit(_swat, (idx, url)): idx
                   for idx, url in enumerate(image_urls)}
        for future in as_completed(futures):
            idx, result = future.result()
            swat_results[idx] = result

    # --- Build chlorosis_readings using combined results ---
    chlorosis_readings = []
    for i, (chlorosis_result, swat_result) in enumerate(
        zip(chlorosis_results, swat_results), start=1
    ):
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
        "per_image_results":   aggregated["per_image_results"],
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
