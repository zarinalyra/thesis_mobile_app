import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { extractExifData } from '@/utils/exif-extractor';
import { usePhotos } from '@/context/PhotoContext';

export default function CameraCaptureScreen() {
  const { farmId } = useLocalSearchParams();
  const router = useRouter();
  const { photos, setPhotos, addPhoto } = usePhotos();
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    requestPermission();
    requestLocationPermission();
  }, [requestPermission, requestLocationPermission]);

  const handleBackPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      // Capture photo IMMEDIATELY - no waiting
      const result = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        exif: true
      });

      // Add photo to list immediately with placeholder EXIF
      const placeholderPhoto = { 
        uri: result.uri, 
        exif: { timestamp: new Date().toISOString() },
        location: undefined as any
      };
      addPhoto(placeholderPhoto);

      // Process EXIF and location in background (don't await)
      (async () => {
        try {
          const exif = await extractExifData(result);
          placeholderPhoto.exif = exif;
        } catch (err) {
          console.warn('Failed to extract EXIF:', err);
        }

        if (locationPermission?.granted) {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            placeholderPhoto.location = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: location.coords.altitude,
            };
            console.log('Captured device location:', placeholderPhoto.location);
          } catch (err) {
            console.warn('Failed to get location:', err);
          }
        }
      })();

      // Check if we have 3 photos (this will happen instantly now)
      if (photos.length >= 2) { // Will be 3 after adding
        router.push(`/(tabs)/photo-review?farmId=${farmId}`);
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
