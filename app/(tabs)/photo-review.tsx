import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { usePhotos } from "@/context/PhotoContext";
import { supabase } from "@/supabase";
import { analyzeLeafImages, FLASK_SERVER_URL } from "@/utils/analysis-service";
import {
  PhotoWithExif,
  uploadImagesOnlyToSupabase,
  uploadPhotosToSupabase,
} from "@/utils/exif-extractor";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const CARD_SIZE = (width - 48) / 2;

export default function PhotoReviewScreen() {
  const { farmId, treeId, treeType, datePlanted, isUpdate } =
    useLocalSearchParams();
  const router = useRouter();
  const { photos, setPhotos, clearPhotos, treeDetails } = usePhotos();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const resolvedTreeId = (treeDetails.treeId || String(treeId ?? "")).trim();
  const resolvedTreeType = (
    treeDetails.treeType || String(treeType ?? "")
  ).trim();
  const resolvedDatePlanted = (
    treeDetails.datePlanted || String(datePlanted ?? "")
  ).trim();
  const isUpdateFlow = isUpdate === "true";

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  const handleAddMore = () => {
    router.push({
      pathname: "/(tabs)/camera-capture",
      params: {
        farmId: String(farmId),
        treeId: resolvedTreeId,
        treeType: resolvedTreeType,
        datePlanted: resolvedDatePlanted,
        isUpdate: String(isUpdate ?? "false"),
      },
    });
  };

  const handleDelete = (uri: string) => {
    setPhotos(photos.filter((p) => p.uri !== uri));
  };

  const handleSubmit = async () => {
    if (!resolvedTreeId || !resolvedTreeType || !resolvedDatePlanted) {
      Alert.alert(
        "Missing Tree Details",
        "Tree ID, Tree Type, and Date Planted are required.",
      );
      return;
    }
    if (photos.length < 3) {
      Alert.alert(
        "Not Enough Images",
        "Please capture at least 3 images before submitting.",
      );
      return;
    }

    setUploading(true);
    try {
      // ── STEP 1: Upload images to Supabase first ─────────────
      // Upload before calling Flask so we can pass public URLs
      // to Flask instead of raw files. This avoids the multipart
      // upload being blocked by Render's free tier proxy.
      setStatusMessage("Uploading photos...");

      let geotagId: number | null = null;
      let inspectionImageIds: number[] = [];
      let inspectionImageUrls: string[] = [];

      if (isUpdateFlow) {
        console.log("Update flow — uploading images only");
        inspectionImageIds = await uploadImagesOnlyToSupabase(
          supabase,
          photos,
          farmId as string,
        );
        console.log("Update image IDs:", inspectionImageIds);
      } else {
        console.log("Add tree flow — uploading with geotag");
        const geotagData = await uploadPhotosToSupabase(
          supabase,
          photos,
          farmId as string,
          false,
          {
            treeId: resolvedTreeId,
            treeType: resolvedTreeType,
            datePlanted: resolvedDatePlanted,
          },
        );
        geotagId = geotagData?.id ?? null;

        const rawExif = geotagData?.raw_exif as any;
        inspectionImageIds = Array.isArray(rawExif?.image_ids)
          ? rawExif.image_ids
          : Array.isArray(rawExif?.imageIds)
            ? rawExif.imageIds
            : [];

        console.log("Add tree geotag ID:", geotagId);
        console.log("Add tree image IDs:", inspectionImageIds);
      }

      // Build public Supabase URLs for the uploaded images
      if (inspectionImageIds.length > 0) {
        const { data: imageRows } = await supabase
          .from("images")
          .select("id, file_path")
          .in("id", inspectionImageIds);

        if (imageRows && imageRows.length > 0) {
          inspectionImageUrls = inspectionImageIds
            .map((id: number) => imageRows.find((r: any) => r.id === id))
            .filter(Boolean)
            .map(
              (r: any) =>
                supabase.storage.from("leafImages").getPublicUrl(r.file_path)
                  .data.publicUrl,
            );
          console.log("Image URLs for Flask:", inspectionImageUrls);
        }
      }

      // ── STEP 2: Flask analysis using URLs ──────────────────
      setStatusMessage("Analyzing leaf images...");
      console.log("=== FLASK CALL START ===");
      console.log("Flask URL:", FLASK_SERVER_URL);
      console.log("Tree ID:", resolvedTreeId);

      let analysisResult = null;

      try {
        analysisResult = await analyzeLeafImages(
          inspectionImageUrls,
          resolvedTreeId,
        );
        console.log("Flask result:", JSON.stringify(analysisResult));
      } catch (err: any) {
        console.warn("Flask failed:", err.message);
        analysisResult = null;
      }
      console.log("=== FLASK CALL END ===");

      // ── STEP 3: Save analysis results ──────────────────────
      // Always save so images are always linked even if Flask failed.
      setStatusMessage("Saving analysis results...");
      console.log("Saving analysis results...");

      const { error: analysisError } = await supabase
        .from("analysis_results")
        .insert({
          tree_id: resolvedTreeId,
          farm_id: farmId,
          geotag_id: geotagId,
          inspection_date:
            analysisResult?.inspection_date ??
            new Date().toISOString().slice(0, 10),
          diseases_detected: analysisResult?.detection.diseases_detected ?? [],
          pests_detected: analysisResult?.detection.pests_detected ?? [],
          confidence: analysisResult?.detection.confidence ?? 0,
          chlorosis_readings: analysisResult?.chlorosis_readings ?? [],
          image_ids: inspectionImageIds,
        });

      if (analysisError) {
        console.warn("Analysis save failed:", analysisError.message);
      } else {
        console.log(
          "Analysis results saved with image IDs:",
          inspectionImageIds,
        );
      }

      // ── DONE ───────────────────────────────────────────────
      setStatusMessage("");
      alert(
        isUpdateFlow
          ? "Card updated successfully!"
          : "Tree added successfully!",
      );
      clearPhotos();
      router.push(`/(tabs)/farm-map?farmId=${farmId}`);
    } catch (error: any) {
      console.error("Submit error:", error);
      setStatusMessage("");
      alert(`Failed to upload: ${error.message || "Unknown error"}`);
    } finally {
      setUploading(false);
      setStatusMessage("");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {isUpdateFlow
            ? `Update Tree ${resolvedTreeId}`
            : `Add New Tree to Farm-${farmId}`}
        </ThemedText>
        <View style={styles.spacer} />
      </View>

      <FlatList
        data={[...photos, "+" as any]}
        numColumns={2}
        keyExtractor={(item, index) =>
          `${typeof item === "string" ? item : item.uri}-${index}`
        }
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const isAdd = item === "+";
          if (isAdd) {
            return (
              <Pressable style={styles.addCard} onPress={handleAddMore}>
                <View style={styles.addCircle}>
                  <ThemedText style={styles.addPlus}>+</ThemedText>
                </View>
              </Pressable>
            );
          }
          const photo = item as PhotoWithExif;
          return (
            <Pressable onPress={() => setPreviewImage(photo.uri)}>
              <View style={styles.photoCard}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.closeButton}
                  onPress={() => handleDelete(photo.uri)}
                >
                  <ThemedText style={styles.closeText}>✕</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />

      {uploading && statusMessage ? (
        <ThemedText style={styles.statusText}>{statusMessage}</ThemedText>
      ) : null}

      <Pressable
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <ThemedText style={styles.submitButtonText}>Submit</ThemedText>
        )}
      </Pressable>

      <Modal
        visible={previewImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <Pressable
          style={styles.modalBackground}
          onPress={() => setPreviewImage(null)}
          activeOpacity={1}
        >
          <View style={styles.modalContent}>
            {previewImage && (
              <Image
                source={{ uri: previewImage }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
            <Pressable
              style={styles.closePreviewButton}
              onPress={() => setPreviewImage(null)}
            >
              <ThemedText style={styles.closePreviewText}>✕</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E8F5E9" },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backButton: { paddingLeft: 15 },
  spacer: { width: 24 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  grid: { padding: 16 },
  photoCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    margin: 4,
    backgroundColor: "#ddd",
  },
  photo: { width: "100%", height: "100%" },
  closeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: { fontSize: 14, fontWeight: "700", color: "#000" },
  addCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 10,
    margin: 4,
    backgroundColor: "#C8D7C5",
    justifyContent: "center",
    alignItems: "center",
  },
  addCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  addPlus: { fontSize: 32, fontWeight: "700", color: "#000" },
  statusText: {
    textAlign: "center",
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginVertical: 20,
    borderWidth: 1,
    borderColor: "#000",
    alignSelf: "center",
    width: 150,
  },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: "#000" },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: { width: "90%", height: "80%", position: "relative" },
  previewImage: { width: "100%", height: "100%" },
  closePreviewButton: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  closePreviewText: { fontSize: 20, fontWeight: "700", color: "#000" },
});
