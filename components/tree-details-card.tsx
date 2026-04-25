import { ThemedText } from "@/components/themed-text";
import { supabase } from "@/supabase";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
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
  image_ids: number[]; // ← images for THIS inspection only
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

  // ── Fetch every time the card opens ───────────────────────
  useEffect(() => {
    fetchLatestAnalysis();
  }, [tree.treeId, tree.id]);

  const fetchLatestAnalysis = async () => {
    setLoadingAnalysis(true);
    setInspectionImages([]);
    try {
      // Order by created_at so same-day updates work correctly
      const { data, error } = await supabase
        .from("analysis_results")
        .select(
          "inspection_date, diseases_detected, pests_detected, chlorosis_readings, image_ids, created_at",
        )
        .eq("tree_id", tree.treeId || tree.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.log("No analysis results for tree:", tree.treeId);
        setAnalysis(null);
      } else {
        console.log("Latest analysis fetched:", JSON.stringify(data));
        setAnalysis(data as AnalysisData);

        // Immediately fetch images for this inspection
        const ids = Array.isArray(data.image_ids) ? data.image_ids : [];
        if (ids.length > 0) {
          fetchInspectionImages(ids);
        }
      }
    } catch (err) {
      console.warn("Error fetching analysis:", err);
      setAnalysis(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Fetch images for the current inspection only, in order (1st to last)
  const fetchInspectionImages = async (imageIds: number[]) => {
    if (!imageIds || imageIds.length === 0) {
      setInspectionImages([]);
      return;
    }

    setLoadingImages(true);
    try {
      console.log("Fetching images for IDs:", imageIds);

      const { data: imageRows, error } = await supabase
        .from("images")
        .select("id, file_path")
        .in("id", imageIds);

      if (error || !imageRows) {
        console.warn("Error fetching inspection images:", error?.message);
        setInspectionImages([]);
        return;
      }

      // Sort by the original imageIds order (1st to last as captured)
      const sortedRows = imageIds
        .map((id) => imageRows.find((row: any) => row.id === id))
        .filter(Boolean);

      const urls = sortedRows.map(
        (row: any) =>
          supabase.storage.from("leafImages").getPublicUrl(row.file_path).data
            .publicUrl,
      );

      console.log("Inspection images loaded:", urls.length);
      setInspectionImages(urls);
    } catch (err) {
      console.warn("Error fetching inspection images:", err);
      setInspectionImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  // ── Drag handle only — fixes scroll conflict ───────────────
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

  // ── Render ─────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY }] }]}>
      {/* Drag handle — ONLY this area triggers dismiss */}
      <View style={styles.dragArea} {...handlePanResponder.panHandlers}>
        <View style={styles.dragHandle} />
      </View>

      {/* ScrollView — scrolls freely, no pan conflict */}
      <ScrollView
        style={styles.card}
        contentContainerStyle={styles.cardContent}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <ThemedText style={styles.sectionTitle}>
            Coffee Tree Information
          </ThemedText>
          <Pressable style={styles.updateButton} onPress={onUpdate}>
            <ThemedText style={styles.updateButtonText}>Update Card</ThemedText>
          </Pressable>
        </View>

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
          Latest Inspection:{" "}
          {analysis
            ? formatDate(analysis.inspection_date)
            : formatDate(tree.capturedAt)}
        </ThemedText>

        {loadingAnalysis ? (
          <ActivityIndicator
            size="small"
            color="#555"
            style={{ marginVertical: 8 }}
          />
        ) : analysis ? (
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
              <ThemedText style={styles.bulletText}>• None detected</ThemedText>
            )}

            <ThemedText style={styles.detailText}>Pests Detected:</ThemedText>
            {analysis.pests_detected.length > 0 ? (
              analysis.pests_detected.map((p, i) => (
                <ThemedText key={i} style={styles.bulletText}>
                  • {p}
                </ThemedText>
              ))
            ) : (
              <ThemedText style={styles.bulletText}>• None detected</ThemedText>
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
        ) : (
          <>
            <ThemedText style={styles.detailText}>
              Diseases Detected:
            </ThemedText>
            <ThemedText style={styles.bulletText}>
              • Pending analysis
            </ThemedText>
            <ThemedText style={styles.detailText}>Pests Detected:</ThemedText>
            <ThemedText style={styles.bulletText}>
              • Pending analysis
            </ThemedText>
            <ThemedText style={styles.detailText}>
              Chlorosis Readings:
            </ThemedText>
            <ThemedText style={styles.bulletText}>
              • Pending analysis
            </ThemedText>
          </>
        )}

        {/* Latest Images — current inspection only, 1st to last */}
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
                <Image key={index} source={{ uri: url }} style={styles.image} />
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
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginTop: 12,
    marginBottom: 4,
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
  detailText: { fontSize: 15, fontWeight: "600", color: "#111" },
  bulletText: { fontSize: 15, color: "#111", marginLeft: 8 },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  image: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#ddd",
  },
  emptyImageCard: {
    width: 150,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyImageText: { color: "#666", fontSize: 14 },
});
