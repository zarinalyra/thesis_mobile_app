import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function CameraCaptureScreen() {
  const { farmId, photos: photosParam } = useLocalSearchParams();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (typeof photosParam === 'string') {
      try {
        const parsed = JSON.parse(decodeURIComponent(photosParam));
        setPhotos(parsed);
      } catch {
        setPhotos([]);
      }
    } else {
      setPhotos([]);
    }
  }, [photosParam]);

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
      const nextPhotos = [...photos, result.uri];
      setPhotos(nextPhotos);

      if (nextPhotos.length >= 3) {
        const encoded = encodeURIComponent(JSON.stringify(nextPhotos));
        router.push(`/(tabs)/photo-review?farmId=${farmId}&photos=${encoded}`);
      }
    } catch (e) {
      console.warn('Failed to take photo', e);
    }
  };

  if (!permission || !permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <ThemedText style={styles.permissionText}>
          Camera access is required to capture photos.
        </ThemedText>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <ThemedText style={styles.permissionButtonText}>Grant Permission</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress}>
          <IconSymbol name="map" size={24} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Add New Tree to Farm-{farmId}</ThemedText>
        <View style={styles.spacer} />
      </View>

      {/* Camera Preview */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        />
        <View style={styles.overlayBottom}>
          <ThemedText style={styles.counterText}>{photos.length}/3</ThemedText>
          <Pressable style={styles.shutterButton} onPress={handleCapture}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  backButton: {
    paddingLeft: 15,
  },
  spacer: {
    width: 24,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  shutterButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  permissionButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },
});
