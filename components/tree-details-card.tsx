import { ThemedText } from "@/components/themed-text";
import { supabase } from "@/supabase";
import {
    analyzeLeafImages,
    warmUpFlask,
    type PerImageResult,
} from "@/utils/analysis-service";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Modal,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface ChlorosisReading {
  image_id: number;
  chlorosis_percentage: number;
  valid: boolean;
}

interface AnalysisData {
  inspection_date: string;
  diseases_detected: string[];
  pests_detected: string[];
  chlorosis_readings: ChlorosisReading[];
  image_ids: number[];
  per_image_results: PerImageResult[] | null;
}

interface TreeDetailsCardProps {
  tree: {
    id: string;
    treeId: string;
    farmId: string;
    treeType: string;
    datePlanted: string;
    capturedAt: string;
    coordinate: { latitude: number; longitude: number };
    latestImages: string[];
  };
  onUpdate: () => void;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getTreeAge(datePlanted: string): string {
  if (!datePlanted) return "-";
  const parts = datePlanted.split("-");
  if (parts.length !== 3) return "-";
  const [month, day, year] = parts.map(Number);
  const plantedDate = new Date(year, month - 1, day);
  if (Number.isNaN(plantedDate.getTime())) return "-";
  const now = new Date();
  let years = now.getFullYear() - plantedDate.getFullYear();
  let months = now.getMonth() - plantedDate.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return "Less than a month";
  if (years <= 0) return `${months} month${months > 1 ? "s" : ""}`;
  return `${years} year${years > 1 ? "s" : ""}${months > 0 ? ` ${months} month${months > 1 ? "s" : ""}` : ""}`;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────
// PROBABILITY BAR
// Renders one label row: "CLR ████████░░ 72%"
// ─────────────────────────────────────────────────────────────
function ProbabilityBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <View style={bar.row}>
      <ThemedText style={bar.label}>{label}</ThemedText>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${pct}%` as any }]} />
      </View>
      <ThemedText style={bar.pct}>{pct}%</ThemedText>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PER-IMAGE CARD
// Renders the full breakdown for one image:
//   thumbnail, final label, chlorosis %, stage bars
// ─────────────────────────────────────────────────────────────
function PerImageCard({
  item,
  thumbnailUrl,
  onPreviewImage,
}: {
  item: PerImageResult;
  thumbnailUrl?: string;
  onPreviewImage?: (url: string, imageIndex: number) => void;
}) {
  // Determine the Stage 2 winning label (max probability entry)
  const s2Winner =
    item.stage_2 && Object.keys(item.stage_2).length > 0
      ? Object.entries(item.stage_2).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      : null;

  const showStage2 =
    item.stage_1_result === "Unhealthy" && item.stage_2 != null;
  const showStage3 = item.stage_3 != null && s2Winner === "BSL";

  return (
    <View style={card.container}>
      {/* Image header: number + thumbnail */}
      <View style={card.header}>
        <ThemedText style={card.imageTitle}>
          Image {item.image_index}
        </ThemedText>
        {thumbnailUrl ? (
          <Pressable
            onPress={() => onPreviewImage?.(thumbnailUrl, item.image_index)}
            style={card.thumbnailButton}
          >
            <Image
              source={{ uri: thumbnailUrl }}
              style={card.thumbnail}
              resizeMode="cover"
            />
          </Pressable>
        ) : (
          <View style={[card.thumbnail, card.thumbnailEmpty]} />
        )}
      </View>

      {/* Final result + Chlorosis */}
      <ThemedText style={card.resultText}>
        Final result:{" "}
        <ThemedText style={card.resultValue}>{item.final_label}</ThemedText>
      </ThemedText>
      <ThemedText style={card.chlorosisText}>
        Chlorosis: {item.chlorosis_pct.toFixed(1)}%
      </ThemedText>

      {/* Stage 1 — plain text only, no bar */}
      <ThemedText style={card.stageHeader}>Stage 1</ThemedText>
      <ThemedText style={card.stageValue}>{item.stage_1_result}</ThemedText>

      {/* Stage 2 — probability bars, only if Unhealthy */}
      {showStage2 && (
        <>
          <ThemedText style={card.stageHeader}>Stage 2</ThemedText>
          {Object.entries(item.stage_2!).map(([label, prob]) => (
            <ProbabilityBar key={label} label={label} value={prob} />
          ))}
        </>
      )}

      {/* Stage 3 — only shown when Stage 2 winner is BSL */}
      {showStage3 && (
        <>
          <ThemedText style={card.stageHeader}>Stage 3</ThemedText>
          {Object.entries(item.stage_3!).map(([label, prob]) => (
            <ProbabilityBar key={label} label={label} value={prob} />
          ))}
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function TreeDetailsCard({
  tree,
  onUpdate,
  onClose,
}: TreeDetailsCardProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  // ── State ──────────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [inspectionImages, setInspectionImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const treeKey = tree.treeId || tree.id;

  // ── Fetch images from the latest geotag (used when no analysis exists) ─
  const fetchGeotagImages = useCallback(async () => {
    try {
      const { data: geotagData } = await supabase
        .from("geotags")
        .select("raw_exif")
        .eq("tree_id", treeKey)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();

      if (!geotagData?.raw_exif) return;
      let rawExif = geotagData.raw_exif;
      if (typeof rawExif === "string") {
        try {
          rawExif = JSON.parse(rawExif);
        } catch {
          return;
        }
      }
      const ids: number[] = rawExif.image_ids || rawExif.imageIds || [];
      if (ids.length > 0) fetchInspectionImages(ids);
    } catch {
      // no geotag images available
    }
  }, [treeKey]);

  // ── Fetch latest analysis ───────────────────────────────────
  const fetchLatestAnalysis = useCallback(async () => {
    setLoadingAnalysis(true);
    setInspectionImages([]);
    try {
      const { data, error } = await supabase
        .from("analysis_results")
        .select(
          "inspection_date, diseases_detected, pests_detected, chlorosis_readings, image_ids, per_image_results, created_at",
        )
        .eq("tree_id", treeKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.log("No analysis results for tree:", treeKey);
        setAnalysis(null);
        // Show the latest captured images even without analysis
        await fetchGeotagImages();
      } else {
        console.log("Latest analysis fetched:", JSON.stringify(data));
        setAnalysis(data as AnalysisData);
        const ids = Array.isArray(data.image_ids) ? data.image_ids : [];
        if (ids.length > 0) {
          fetchInspectionImages(ids);
        }
      }
    } catch (err) {
      console.warn("Error fetching analysis:", err);
      setAnalysis(null);
      await fetchGeotagImages();
    } finally {
      setLoadingAnalysis(false);
    }
  }, [treeKey, fetchGeotagImages]);

  useEffect(() => {
    fetchLatestAnalysis();
  }, [fetchLatestAnalysis]);

  // ── Fetch images for this inspection ───────────────────────
  const fetchInspectionImages = async (imageIds: number[]) => {
    if (!imageIds || imageIds.length === 0) {
      setInspectionImages([]);
      return;
    }
    setLoadingImages(true);
    try {
      const { data: imageRows, error } = await supabase
        .from("images")
        .select("id, file_path")
        .in("id", imageIds);

      if (error || !imageRows) {
        console.warn("Error fetching inspection images:", error?.message);
        setInspectionImages([]);
        return;
      }

      const sortedRows = imageIds
        .map((id) => imageRows.find((row: any) => row.id === id))
        .filter(Boolean);

      const urls = sortedRows.map(
        (row: any) =>
          supabase.storage.from("leafImages").getPublicUrl(row.file_path).data
            .publicUrl,
      );

      setInspectionImages(urls);
    } catch (err) {
      console.warn("Error fetching inspection images:", err);
      setInspectionImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  // ── Analyze handler ─────────────────────────────────────────
  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    warmUpFlask(); // fire-and-forget to wake Render while we fetch image URLs

    try {
      // 1. Get image IDs from the latest geotag for this tree
      const { data: geotagData, error: geoError } = await supabase
        .from("geotags")
        .select("id, raw_exif")
        .eq("tree_id", treeKey)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();

      if (geoError || !geotagData) {
        throw new Error("Could not find geotag for this tree.");
      }

      let rawExif: any = geotagData.raw_exif;
      if (typeof rawExif === "string") {
        try {
          rawExif = JSON.parse(rawExif);
        } catch {
          rawExif = {};
        }
      }

      const imageIds: number[] = rawExif.image_ids || rawExif.imageIds || [];

      if (imageIds.length < 3) {
        throw new Error(
          `Need at least 3 images for analysis (found ${imageIds.length}). ` +
            "Please capture more photos first.",
        );
      }

      // 2. Build public URLs from image IDs
      const { data: imageRows, error: imgError } = await supabase
        .from("images")
        .select("id, file_path")
        .in("id", imageIds);

      if (imgError || !imageRows) {
        throw new Error("Could not load image records from database.");
      }

      // eslint-disable-next-line eqeqeq
      const imageUrls = imageIds
        .map((id) => imageRows.find((r: any) => r.id == id))
        .filter(Boolean)
        .map(
          (r: any) =>
            supabase.storage.from("leafImages").getPublicUrl(r.file_path).data
              .publicUrl,
        );

      if (imageUrls.length < 3) {
        throw new Error(
          `Only ${imageUrls.length} image URLs resolved. Need at least 3.`,
        );
      }

      // 3. Call Flask → Hugging Face cascade
      console.log("[Analyze] sending", imageUrls.length, "URLs to Flask");
      const result = await analyzeLeafImages(imageUrls, treeKey);
      console.log("[Analyze] result:", JSON.stringify(result));

      // 4. Save to analysis_results
      const hasDisease = result.detection.diseases_detected.length > 0;
      const hasChlorosis = result.chlorosis_readings.some(
        (r) => r.chlorosis_percentage > 0,
      );

      const { error: insertError } = await supabase
        .from("analysis_results")
        .insert({
          tree_id: treeKey,
          farm_id: tree.farmId,
          geotag_id: geotagData.id,
          inspection_date: result.inspection_date,
          diseases_detected: result.detection.diseases_detected,
          pests_detected: result.detection.pests_detected,
          confidence: result.detection.confidence,
          chlorosis_readings: result.chlorosis_readings,
          per_image_results: result.per_image_results,
          image_ids: imageIds,
          total_images: result.total_images,
          images_with_disease: result.images_with_disease,
          images_healthy: result.images_healthy,
          has_disease: hasDisease,
          has_chlorosis: hasChlorosis,
        });

      if (insertError) {
        throw new Error(`Failed to save analysis: ${insertError.message}`);
      }

      // 5. Refresh the card to show new results
      await fetchLatestAnalysis();
    } catch (err: any) {
      console.error("[Analyze] failed:", err);
      const msg = err.message || "Analysis failed. Please try again.";
      setAnalyzeError(msg);
      Alert.alert("Analysis Failed", msg);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Drag handle ─────────────────────────────────────────────
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: 700,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // ── Analyze button appearance ───────────────────────────────
  const analyzeReady = !loadingAnalysis && !analysis && !analyzing;
  const analyzeDisabled = loadingAnalysis || !!analysis || analyzing;

  // ── Render ─────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY }] }]}>
      {/* Drag handle */}
      <View style={styles.dragArea} {...handlePanResponder.panHandlers}>
        <View style={styles.dragHandle} />
      </View>

      <ScrollView
        style={styles.card}
        contentContainerStyle={styles.cardContent}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row: title + action buttons */}
        <View style={styles.headerRow}>
          <ThemedText style={styles.sectionTitle}>
            Coffee Tree Information
          </ThemedText>
          <View style={styles.headerButtons}>
            <Pressable
              style={[
                styles.analyzeButton,
                analyzeDisabled
                  ? styles.analyzeButtonDisabled
                  : styles.analyzeButtonActive,
              ]}
              onPress={analyzeReady ? handleAnalyze : undefined}
              disabled={analyzeDisabled}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText
                  style={[
                    styles.analyzeButtonText,
                    analyzeDisabled && styles.analyzeButtonTextDisabled,
                  ]}
                >
                  {analysis ? "Analyzed" : "Analyze"}
                </ThemedText>
              )}
            </Pressable>

            <Pressable style={styles.updateButton} onPress={onUpdate}>
              <ThemedText style={styles.updateButtonText}>
                Update Card
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Analyzing banner */}
        {analyzing && (
          <View style={styles.analyzingBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <ThemedText style={styles.analyzingText}>
              Analyzing leaves…
            </ThemedText>
          </View>
        )}

        {/* Analyze error */}
        {analyzeError && !analyzing && (
          <ThemedText style={styles.analyzeErrorText}>
            ⚠ {analyzeError}
          </ThemedText>
        )}

        {/* Tree info */}
        <ThemedText style={styles.detailText}>
          Tree ID: {tree.treeId || tree.id}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          Farm ID: {tree.farmId}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          Tree Type: {tree.treeType || "-"}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          Date Planted: {tree.datePlanted || "-"}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          Tree Age: {getTreeAge(tree.datePlanted)}
        </ThemedText>
        <ThemedText style={styles.detailText}>
          GPS Coordinates: {tree.coordinate.latitude.toFixed(6)},{" "}
          {tree.coordinate.longitude.toFixed(6)}
        </ThemedText>

        {/* Latest Inspection */}
        <ThemedText style={styles.sectionTitle}>
          Latest Inspection: {formatDate(tree.capturedAt)}
        </ThemedText>

        {/* ── Per-image breakdown ──────────────────────────── */}
        {loadingAnalysis ? (
          <ActivityIndicator
            size="small"
            color="#555"
            style={{ marginVertical: 8 }}
          />
        ) : analysis ? (
          analysis.per_image_results &&
          analysis.per_image_results.length > 0 ? (
            // New per-image cards with probability bars
            analysis.per_image_results.map((item, idx) => (
              <PerImageCard
                key={item.image_index}
                item={item}
                thumbnailUrl={inspectionImages[idx]}
                onPreviewImage={(url) => setPreviewUrl(url)}
              />
            ))
          ) : (
            // Fallback for older rows that predate per_image_results
            <>
              <ThemedText style={styles.detailText}>
                Diseases Detected:
              </ThemedText>
              {analysis.diseases_detected.length > 0 ? (
                analysis.diseases_detected.map((d, i) => (
                  <ThemedText key={i} style={styles.bulletText}>
                    • {d}
                  </ThemedText>
                ))
              ) : (
                <ThemedText style={styles.bulletText}>
                  • None detected
                </ThemedText>
              )}

              <ThemedText style={styles.detailText}>Pests Detected:</ThemedText>
              {analysis.pests_detected.length > 0 ? (
                analysis.pests_detected.map((p, i) => (
                  <ThemedText key={i} style={styles.bulletText}>
                    • {p}
                  </ThemedText>
                ))
              ) : (
                <ThemedText style={styles.bulletText}>
                  • None detected
                </ThemedText>
              )}

              <ThemedText style={styles.detailText}>
                Chlorosis Readings:
              </ThemedText>
              {analysis.chlorosis_readings &&
              analysis.chlorosis_readings.length > 0 ? (
                analysis.chlorosis_readings.map((r) => (
                  <ThemedText key={r.image_id} style={styles.bulletText}>
                    • Image {r.image_id} —{" "}
                    {r.valid
                      ? `${r.chlorosis_percentage.toFixed(2)}%`
                      : "Invalid image"}
                  </ThemedText>
                ))
              ) : (
                <ThemedText style={styles.bulletText}>
                  • No readings available
                </ThemedText>
              )}
            </>
          )
        ) : (
          <ThemedText style={styles.bulletText}>• Pending analysis</ThemedText>
        )}

        {/* Latest Images */}
        <ThemedText style={styles.sectionTitle}>Latest Images</ThemedText>
        {loadingImages ? (
          <ActivityIndicator
            size="small"
            color="#555"
            style={{ marginVertical: 8 }}
          />
        ) : (
          <View style={styles.imageGrid}>
            {inspectionImages.length > 0 ? (
              inspectionImages.map((url, index) => (
                <Pressable key={index} onPress={() => setPreviewUrl(url)}>
                  <Image source={{ uri: url }} style={styles.image} />
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyImageCard}>
                <ThemedText style={styles.emptyImageText}>
                  No images yet
                </ThemedText>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full-screen image preview modal */}
      <Modal
        visible={previewUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <Pressable
          style={styles.modalBackground}
          onPress={() => setPreviewUrl(null)}
        >
          <View style={styles.modalContent}>
            {previewUrl && (
              <Image
                source={{ uri: previewUrl }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
            <Pressable
              style={styles.modalClose}
              onPress={() => setPreviewUrl(null)}
            >
              <ThemedText style={styles.modalCloseText}>✕</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES — main card
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.2)",
    zIndex: 100,
  },
  dragArea: {
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dragHandle: {
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#d4d4d4",
  },
  card: { flex: 1, backgroundColor: "#fff" },
  cardContent: { padding: 16, gap: 8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginTop: 12,
    marginBottom: 4,
    flex: 1,
    flexShrink: 1,
    paddingRight: 8,
  },
  headerButtons: {
    gap: 6,
    alignItems: "flex-end",
  },
  updateButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d5d5d5",
    borderRadius: 999,
    backgroundColor: "#fafafa",
  },
  updateButtonText: { fontSize: 13, fontWeight: "600", color: "#222" },
  analyzeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeButtonActive: { backgroundColor: "#16a34a" },
  analyzeButtonDisabled: { backgroundColor: "#d1d5db" },
  analyzeButtonText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  analyzeButtonTextDisabled: { color: "#6b7280" },
  analyzingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#166534",
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  analyzingText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  analyzeErrorText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 4,
  },
  detailText: { fontSize: 15, fontWeight: "600", color: "#111" },
  bulletText: { fontSize: 15, color: "#111", marginLeft: 8 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  image: { width: 110, height: 110, borderRadius: 8, backgroundColor: "#ddd" },
  emptyImageCard: {
    width: 150,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyImageText: { color: "#666", fontSize: 14 },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: { width: "100%", height: "80%", position: "relative" },
  modalImage: { width: "100%", height: "100%" },
  modalClose: {
    position: "absolute",
    top: 12,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: { fontSize: 18, fontWeight: "700", color: "#000" },
});

// ─────────────────────────────────────────────────────────────
// STYLES — per-image card
// ─────────────────────────────────────────────────────────────
const card = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    backgroundColor: "#fafafa",
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  imageTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  thumbnailButton: {
    padding: 0,
    backgroundColor: "transparent",
  },
  thumbnail: { width: 64, height: 64, borderRadius: 8 },
  thumbnailEmpty: { backgroundColor: "#e5e7eb" },
  resultText: { fontSize: 14, color: "#374151" },
  resultValue: { fontWeight: "700", color: "#111" },
  chlorosisText: { fontSize: 14, color: "#374151" },
  stageHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stageValue: { fontSize: 14, fontWeight: "600", color: "#111", marginLeft: 4 },
});

// ─────────────────────────────────────────────────────────────
// STYLES — probability bar
// ─────────────────────────────────────────────────────────────
const bar = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    width: 36,
  },
  track: {
    flex: 1,
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: "#16a34a",
    borderRadius: 5,
  },
  pct: {
    fontSize: 12,
    color: "#6b7280",
    width: 36,
    textAlign: "right",
  },
});
