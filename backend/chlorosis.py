"""
chlorosis.py
------------
Chlorosis computation module for the Coffee Leaf Disease Monitoring App.
Adapted from the ALR-Original notebook pipeline.

Accepts image bytes (from HTTP upload), returns chlorosis percentage per image.
"""

import cv2
import numpy as np

# =============================================================================
# SETTINGS (same as notebook)
# =============================================================================
GLARE_SAT_MAX     = 40
GLARE_VAL_MIN     = 200
GLARE_RGB_MIN     = 210

LIGHT_GREEN_H_MIN = 35
LIGHT_GREEN_H_MAX = 75
LIGHT_GREEN_S_MIN = 15
LIGHT_GREEN_S_MAX = 140
LIGHT_GREEN_V_MIN = 140

CHLOROSIS_B_MIN   = 12
CHLOROSIS_MORPH_K = 3


# =============================================================================
# BACKGROUND REMOVAL  (GrabCut + green mask — for natural background images)
# =============================================================================
def segment_leaf(img_bgr):
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    h, w    = img_bgr.shape[:2]

    # Broad green/yellow-green mask
    lower_green = np.array([15, 25, 25])
    upper_green = np.array([95, 255, 255])
    green_mask  = cv2.inRange(img_hsv, lower_green, upper_green)

    # GrabCut
    margin_x = max(5, int(w * 0.05))
    margin_y = max(5, int(h * 0.04))
    rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    gc_mask   = np.zeros((h, w), np.uint8)

    try:
        cv2.grabCut(img_bgr, gc_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
        gc_fg = np.where(
            (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
        ).astype(np.uint8)
    except Exception:
        gc_fg = np.ones((h, w), np.uint8) * 255  # fallback

    combined = cv2.bitwise_and(green_mask, gc_fg)

    # If GrabCut removed too much, fall back to green mask only
    if np.sum(combined > 0) < 0.05 * h * w:
        combined = green_mask

    # Morphological clean-up
    kernel   = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=3)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN,  kernel, iterations=1)

    # Keep only the largest connected component (the main leaf)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(combined, connectivity=8)
    if num_labels > 1:
        largest    = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        clean_mask = np.zeros_like(combined)
        clean_mask[labels == largest] = 255
    else:
        clean_mask = combined

    # Fill holes inside the leaf mask
    flood = clean_mask.copy()
    cv2.floodFill(flood, None, (0, 0), 255)
    holes      = cv2.bitwise_not(flood)
    clean_mask = cv2.bitwise_or(clean_mask, holes)

    return clean_mask


# =============================================================================
# GLARE MASK
# =============================================================================
def build_glare_mask(img_bgr, img_hsv):
    hsv_glare = (
        (img_hsv[:, :, 1] < GLARE_SAT_MAX) &
        (img_hsv[:, :, 2] > GLARE_VAL_MIN)
    ).astype(np.uint8) * 255

    img_rgb   = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    rgb_glare = (
        (img_rgb[:, :, 0] > GLARE_RGB_MIN) &
        (img_rgb[:, :, 1] > GLARE_RGB_MIN) &
        (img_rgb[:, :, 2] > GLARE_RGB_MIN)
    ).astype(np.uint8) * 255

    glare  = cv2.bitwise_or(hsv_glare, rgb_glare)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.dilate(glare, kernel, iterations=1)


# =============================================================================
# CORE FUNCTION — accepts image bytes from HTTP upload
# =============================================================================
def compute_chlorosis_from_bytes(image_bytes: bytes) -> dict:
    """
    Compute chlorosis percentage from image bytes.

    Parameters
    ----------
    image_bytes : bytes
        Raw image bytes received from the mobile app upload.

    Returns
    -------
    dict with keys:
        chlorosis_percentage : float  (0.00 – 100.00)
        glare_percentage     : float  (informational)
        valid                : bool   (False if image could not be read)
        error                : str    (only present if valid=False)
    """
    # Decode bytes → OpenCV image
    img_array = np.frombuffer(image_bytes, np.uint8)
    img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        return {"valid": False, "error": "Could not decode image.", "chlorosis_percentage": 0.0}

    img_hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)

    # --- Background removal ---
    leaf_bg = segment_leaf(img)

    # --- Glare ---
    glare = build_glare_mask(img, img_hsv)
    glare = cv2.bitwise_and(glare, leaf_bg)

    # --- Green masks ---
    dark_green  = cv2.inRange(img_hsv, np.array([25, 40, 40]),  np.array([85, 255, 255]))
    light_green = cv2.inRange(
        img_hsv,
        np.array([LIGHT_GREEN_H_MIN, LIGHT_GREEN_S_MIN, LIGHT_GREEN_V_MIN]),
        np.array([LIGHT_GREEN_H_MAX, LIGHT_GREEN_S_MAX, 255])
    )
    green = cv2.bitwise_or(dark_green, light_green)
    green = cv2.bitwise_and(green, cv2.bitwise_not(glare))
    green = cv2.bitwise_and(green, leaf_bg)

    # --- Yellow mask ---
    yellow = cv2.inRange(img_hsv, np.array([20, 40, 40]), np.array([35, 255, 255]))
    yellow = cv2.bitwise_and(yellow, cv2.bitwise_not(glare))
    yellow = cv2.bitwise_and(yellow, leaf_bg)

    # --- LAB b-channel confirmation ---
    lab_b    = img_lab[:, :, 2].astype(np.int32) - 128
    lab_mask = (lab_b >= CHLOROSIS_B_MIN).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (CHLOROSIS_MORPH_K, CHLOROSIS_MORPH_K)
    )
    yellow = cv2.erode(yellow, kernel)
    yellow = cv2.bitwise_and(yellow, lab_mask)

    # --- Pixel counts ---
    leaf      = cv2.bitwise_or(green, yellow)
    leaf_px   = int(np.sum(leaf   > 0))
    yellow_px = int(np.sum(yellow > 0))
    glare_px  = int(np.sum(glare  > 0))
    total_px  = img.shape[0] * img.shape[1]

    if leaf_px == 0:
        return {
            "valid": False,
            "error": "No leaf detected in image.",
            "chlorosis_percentage": 0.0
        }

    chlorosis_pct = round((yellow_px / leaf_px) * 100, 2)
    glare_pct     = round((glare_px  / total_px) * 100, 2)

    return {
        "valid":                 True,
        "chlorosis_percentage":  chlorosis_pct,
        "glare_percentage":      glare_pct,
    }
