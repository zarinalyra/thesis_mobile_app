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
export const FLASK_SERVER_URL = "http://192.168.1.19:5000"; // ← UPDATE IF ON HOTSPOT

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

  // React Native FormData supports { uri, type, name } directly
  // This is the correct way to upload files in React Native
  // Do NOT use Blob or ArrayBuffer — not supported in RN
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

  const response = await fetch(`${FLASK_SERVER_URL}/analyze`, {
    method: "POST",
    body: formData,
    headers: {
      // Do NOT manually set Content-Type for multipart
      // React Native sets it automatically with the correct boundary
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server error ${response.status}: ${errorText}`);
  }

  const result: AnalysisResult = await response.json();
  console.log("Flask response received:", JSON.stringify(result));
  return result;
}
