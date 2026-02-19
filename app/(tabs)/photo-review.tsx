import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { supabase } from "@/supabase";
import { uploadPhotosToSupabase, PhotoWithExif } from "@/utils/exif-extractor";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePhotos } from "@/context/PhotoContext";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const CARD_SIZE = (width - 48) / 2; // 2 cards per row with padding

export default function PhotoReviewScreen() {
  const { farmId } = useLocalSearchParams();
  const router = useRouter();
  const { photos, setPhotos, clearPhotos } = usePhotos();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  const handleAddMore = () => {
    router.push(`/(tabs)/camera-capture?farmId=${farmId}`);
  };

  const handleDelete = (uri: string) => {
    setPhotos(photos.filter((p) => p.uri !== uri));
  };

  const handleSubmit = async () => {
    setUploading(true);
    try {
      console.log('Starting batch upload of', photos.length, 'photos');
      
      // TODO: Add disease detection ML model here
      // For now, randomly assign disease status for demo
      const hasDisease = Math.random() > 0.7;
      
      await uploadPhotosToSupabase(supabase, photos, farmId as string, hasDisease);
      
      alert("Photos uploaded successfully! Average location saved.");
      clearPhotos();
      router.push(`/(tabs)/farm-map?farmId=${farmId}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      alert(`Failed to upload photos: ${error.message || "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          Add New Tree to Farm-{farmId}
        </ThemedText>
        <View style={styles.spacer} />
      </View>

      {/* Grid */}
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

      {/* Image Preview Modal */}
      <Modal
        visible={previewImage !== null}
        transparent={true}
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
  container: {
    flex: 1,
    backgroundColor: "#E8F5E9",
  },
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
    position: "relative",
  },
  backButton: {
    paddingLeft: 15,
  },
  spacer: {
    width: 24,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  grid: {
    padding: 16,
  },
  photoCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    margin: 4,
    position: "relative",
    backgroundColor: "#ddd",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
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
  closeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
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
  addPlus: {
    fontSize: 32,
    fontWeight: "700",
    color: "#000",
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    height: "80%",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  closePreviewButton: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  closePreviewText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
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
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});
