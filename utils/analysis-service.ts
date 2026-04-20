/**
 * analysis-service.ts
 * -------------------
 * Sends Supabase image URLs to the Flask backend for chlorosis analysis.
 * Flask downloads the images itself — this avoids multipart upload issues
 * on Render's free tier proxy.
 */

export const FLASK_SERVER_URL = "https://thesis-mobile-app-v15u.onrender.com";

// How long to wait for Flask before giving up (90 seconds).
const TIMEOUT_MS = 90000;

// How many times to attempt before failing.
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
// Takes public Supabase URLs of already-uploaded images
// and sends them to Flask as JSON.
// ─────────────────────────────────────────────────────────────
export async function analyzeLeafImages(
  imageUrls: string[],
  treeId: string,
): Promise<AnalysisResult> {
  if (imageUrls.length < 3) {
    throw new Error("At least 3 image URLs are required for analysis.");
  }

  console.log(
    `Sending ${imageUrls.length} image URLs to Flask at ${FLASK_SERVER_URL}`,
  );

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Flask attempt ${attempt} of ${MAX_RETRIES}...`);

      const response = await fetchWithTimeout(
        `${FLASK_SERVER_URL}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tree_id: treeId,
            image_urls: imageUrls,
          }),
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
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.warn(
          `Flask attempt ${attempt} failed: ${err.message}. Giving up.`,
        );
      }
    }
  }

  throw lastError;
}
