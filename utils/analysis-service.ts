/**
 * analysis-service.ts
 * -------------------
 * Sends captured leaf images to the Flask backend server
 * for chlorosis computation and SWAT-DCNN disease/pest detection.
 *
 * Uses React Native compatible FormData image upload.
 * Note: base64 Blob creation is NOT supported in React Native —
 * we use the { uri, type, name } object format instead.
 */

import { PhotoWithExif } from "./exif-extractor";

// ─────────────────────────────────────────────────────────────
// CONFIG — update this to your laptop's IP
// Home WiFi:  http://192.168.1.19:5000
// Hotspot:    http://192.168.43.XXX:5000  (check ipconfig)
// ─────────────────────────────────────────────────────────────
export const FLASK_SERVER_URL = "https://thesis-mobile-app-v15u.onrender.com"; // ← UPDATE IF ON HOTSPOT

// How long to wait for Flask before giving up (90 seconds).
// Render free tier can take 50+ seconds to wake from sleep.
const TIMEOUT_MS = 90000;

// How many times to attempt the request before failing.
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export interface ChlorosisReading {
  image_id: number;
  chlorosis_percentage: number;
  valid: boolean;
}

export interface AnalysisResult {
  tree_id: string;
  inspection_date: string;
  detection: {
    diseases_detected: string[];
    pests_detected: string[];
    confidence: number;
  };
  chlorosis_readings: ChlorosisReading[];
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Wraps fetch with an AbortController timeout.
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────
export async function analyzeLeafImages(
  photos: PhotoWithExif[],
  treeId: string,
): Promise<AnalysisResult> {
  if (photos.length < 3) {
    throw new Error("At least 3 images are required for analysis.");
  }

  console.log(
    `Sending ${photos.length} images to Flask at ${FLASK_SERVER_URL}`,
  );

  // React Native FormData supports { uri, type, name } directly.
  // Do NOT use Blob or ArrayBuffer — not supported in RN.
  const formData = new FormData();
  formData.append("tree_id", treeId);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    formData.append(`image_${i + 1}`, {
      uri: photo.uri,
      type: "image/jpeg",
      name: `image_${i + 1}.jpg`,
    } as any);
  }

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Flask attempt ${attempt} of ${MAX_RETRIES}...`);

      const response = await fetchWithTimeout(
        `${FLASK_SERVER_URL}/analyze`,
        {
          method: "POST",
          body: formData,
          headers: {
            // Do NOT manually set Content-Type for multipart —
            // React Native sets it automatically with the correct boundary.
            Accept: "application/json",
          },
        },
        TIMEOUT_MS,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error ${response.status}: ${errorText}`);
      }

      const result: AnalysisResult = await response.json();
      console.log("Flask response received:", JSON.stringify(result));
      return result;
    } catch (err: any) {
      lastError = err;
      const isLastAttempt = attempt === MAX_RETRIES;
      if (!isLastAttempt) {
        console.warn(
          `Flask attempt ${attempt} failed: ${err.message}. Retrying...`,
        );
        // Wait 3 seconds before retrying to give the server more wake-up time.
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.warn(`Flask attempt ${attempt} failed: ${err.message}. Giving up.`);
      }
    }
  }

  throw lastError;
}
