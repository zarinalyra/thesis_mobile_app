import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { usePhotos } from "@/context/PhotoContext";
import { supabase } from "@/supabase";
import {
  PhotoWithExif,
  uploadImagesOnlyToSupabase,
  uploadPhotosToSupabase,
} from "@/utils/exif-extractor";
import * as Location from "expo-location";
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

// ─────────────────────────────────────────────────────────────
// GPS HELPERS
// ─────────────────────────────────────────────────────────────
const toRad = (val: number) => (val * Math.PI) / 180;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────
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

  // ── SUBMIT ────────────────────────────────────────────────────
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
      if (isUpdateFlow) {
        // ── STEP 1: Get original GPS from the existing geotag ────
        setStatusMessage("Validating location…");
        const { data: originalGeotag, error: geoFetchError } = await supabase
          .from("geotags")
          .select("id, image_id, raw_exif, latitude, longitude")
          .eq("tree_id", resolvedTreeId)
          .limit(1)
          .single();

        if (geoFetchError || !originalGeotag) {
          throw new Error("Could not find the original tree location.");
        }

        // ── STEP 2: Get current device GPS ──────────────────────
        let currentLocation: { latitude: number; longitude: number } | null =
          null;
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          currentLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
        } catch {
          throw new Error(
            "Could not get your current location. Please enable location services and try again.",
          );
        }

        // ── STEP 3: Haversine distance ───────────────────────────
        const origLat = Number(originalGeotag.latitude);
        const origLon = Number(originalGeotag.longitude);

        // If the original geotag has no valid GPS, skip distance check
        const hasOriginalGps =
          origLat !== 0 || origLon !== 0;

        if (hasOriginalGps) {
          const distance = haversineDistance(
            origLat,
            origLon,
            currentLocation.latitude,
            currentLocation.longitude,
          );

          console.log(
            `[GPS check] distance to original tree: ${distance.toFixed(1)}m`,
          );

          // ── STEP 4: Decision ─────────────────────────────────
          if (distance > 5) {
            clearPhotos();
            Alert.alert(
              "Wrong Location",
              "Your current location is too far from this tree's recorded position. Please move closer to the correct tree and retake the photos to get accurate GPS coordinates.",
              [
                {
                  text: "Retake Photos",
                  onPress: () =>
                    router.push({
                      pathname: "/(tabs)/camera-capture",
                      params: {
                        farmId: String(farmId),
                        treeId: resolvedTreeId,
                        treeType: resolvedTreeType,
                        datePlanted: resolvedDatePlanted,
                        isUpdate: "true",
                      },
                    }),
                },
              ],
            );
            return;
          }
        }

        // ── STEP 5: Within 5m — upload images, update geotag ────
        // GPS columns (latitude, longitude, altitude, location) are
        // NEVER updated on the Update Card flow.
        setStatusMessage("Uploading photos…");
        const imageIds = await uploadImagesOnlyToSupabase(
          supabase,
          photos,
          farmId as string,
        );
        console.log("Update image IDs:", imageIds);

        let rawExif: any = originalGeotag.raw_exif;
        if (typeof rawExif === "string") {
          try {
            rawExif = JSON.parse(rawExif);
          } catch {
            rawExif = {};
          }
        }

        const { error: updateError } = await supabase
          .from("geotags")
          .update({
            image_id: imageIds[0] ?? originalGeotag.image_id,
            captured_at: new Date().toISOString(),
            raw_exif: { ...rawExif, image_ids: imageIds, imageIds },
          })
          .eq("id", originalGeotag.id);

        if (updateError) {
          console.error("Geotag update error:", updateError.message);
        } else {
          console.log("Geotag updated for tree:", resolvedTreeId);
        }
      } else {
        // ── Add Tree flow ───────────────────────────────────────
        // uploadPhotosToSupabase handles images + geotag INSERT.
        setStatusMessage("Uploading photos…");
        await uploadPhotosToSupabase(
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
        console.log("Add tree upload complete for:", resolvedTreeId);
      }

      // ── Done ────────────────────────────────────────────────
      setStatusMessage("");
      clearPhotos();
      Alert.alert(
        isUpdateFlow ? "Photos Updated" : "Tree Added",
        isUpdateFlow
          ? "New photos saved. Open the tree card and tap Analyze when you have a stable connection."
          : "Tree added. Open the tree card and tap Analyze when you have a stable connection.",
        [
          {
            text: "OK",
            onPress: () => router.push(`/(tabs)/farm-map?farmId=${farmId}`),
          },
        ],
      );
    } catch (error: any) {
      console.error("Submit error:", error);
      setStatusMessage("");
      Alert.alert(
        "Upload Failed",
        error.message || "Unknown error. Please try again.",
      );
    } finally {
      setUploading(false);
      setStatusMessage("");
    }
  };

  // ── RENDER ────────────────────────────────────────────────────
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
