/**
 * analysis-service.ts
 * -------------------
 * Sends Supabase image URLs to the Flask backend for chlorosis analysis.
 * Flask downloads the images itself — this avoids multipart upload issues
 * on Render's free tier proxy.
 */

export const FLASK_SERVER_URL = "https://thesis-mobile-app-v15u.onrender.com";

// How long to wait for Flask before giving up (120 seconds).
const TIMEOUT_MS = 120000;

// How many times to attempt before failing.
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────────────────────
// PRE-WARM
// Render free tier sleeps after 15 min. Ping / as soon as the
// submit flow starts so the server wakes up during the upload
// phase, before we need /analyze.
// ─────────────────────────────────────────────────────────────
export async function warmUpFlask(): Promise<void> {
  try {
    await fetchWithTimeout(FLASK_SERVER_URL, { method: "GET" }, 15000);
    console.log("Flask warm-up OK");
  } catch {
    console.warn("Flask warm-up ping failed (server may still wake in time)");
  }
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export interface ChlorosisReading {
  image_id: number;
  chlorosis_percentage: number;
  valid: boolean;
}

export interface PerImageResult {
  image_index: number;
  final_label: string;
  stage_1_result: string;
  stage_2: Record<string, number> | null;
  stage_3: Record<string, number> | null;
  chlorosis_pct: number;
}

export interface AnalysisResult {
  tree_id: string;
  inspection_date: string;
  detection: {
    diseases_detected: string[];
    pests_detected: string[];
    confidence: number;
  };
  total_images: number;
  images_with_disease: number;
  images_healthy: number;
  chlorosis_readings: ChlorosisReading[];
  per_image_results: PerImageResult[];
}

interface RawAnalysisResult {
  tree_id: string;
  inspection_date: string;
  detection: {
    diseases_detected: string[];
    pests_detected: string[];
    confidence: number;
  };
  total_images: number;
  images_with_disease: number;
  images_healthy: number;
  chlorosis_readings: Array<{
    image_id: number;
    chlorosis_percentage: number;
    valid: boolean;
  }>;
  per_image_results: PerImageResult[];
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

  const postAnalyze = async (urls: string[]): Promise<RawAnalysisResult> => {
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
          image_urls: urls,
        }),
      },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }

    return response.json();
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Flask attempt ${attempt} of ${MAX_RETRIES}...`);

      const result = await postAnalyze(imageUrls);

      // Some deployed backends still return only the first 3 chlorosis readings.
      // If that happens, run additional analyses for missing images and merge.
      if (Array.isArray(result.chlorosis_readings) && result.chlorosis_readings.length < imageUrls.length) {
        console.warn(
          `Flask returned ${result.chlorosis_readings.length}/${imageUrls.length} chlorosis readings. Backfilling missing readings...`,
        );

        const mergedReadings: ChlorosisReading[] = [];
        const CHUNK_SIZE = 3;

        for (let start = 0; start < imageUrls.length; start += CHUNK_SIZE) {
          const chunk = imageUrls.slice(start, start + CHUNK_SIZE);
          if (chunk.length === 0) {
            continue;
          }

          const paddedChunk = [...chunk];
          while (paddedChunk.length < CHUNK_SIZE) {
            paddedChunk.push(chunk[chunk.length - 1]);
          }

          const chunkResult = await postAnalyze(paddedChunk);
          const chunkReadings = Array.isArray(chunkResult?.chlorosis_readings)
            ? chunkResult.chlorosis_readings
            : [];

          const readingsForRealImages = chunkReadings.slice(0, chunk.length);
          readingsForRealImages.forEach((reading, index) => {
            mergedReadings.push({
              image_id: start + index + 1,
              chlorosis_percentage: Number(reading?.chlorosis_percentage) || 0,
              valid: Boolean(reading?.valid),
            });
          });
        }

        const finalResult: AnalysisResult = {
          ...result,
          chlorosis_readings: mergedReadings,
          per_image_results: Array.isArray(result.per_image_results)
            ? result.per_image_results
            : [],
        };

        console.log("Flask response (merged) received:", JSON.stringify(finalResult));
        return finalResult;
      }

      const normalized: AnalysisResult = {
        ...result,
        chlorosis_readings: (result.chlorosis_readings || []).map((reading, index) => ({
          image_id: index + 1,
          chlorosis_percentage: Number(reading?.chlorosis_percentage) || 0,
          valid: Boolean(reading?.valid),
        })),
        per_image_results: Array.isArray(result.per_image_results)
          ? result.per_image_results
          : [],
      };

      console.log("Flask response received:", JSON.stringify(normalized));
      return normalized;
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
