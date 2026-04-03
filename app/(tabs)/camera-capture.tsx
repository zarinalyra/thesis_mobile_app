import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Text, Dimensions, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { extractExifData } from '@/utils/exif-extractor';
import { usePhotos } from '@/context/PhotoContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_HEIGHT = 100;
const BOTTOM_CONTROLS = 250;
const AVAILABLE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - BOTTOM_CONTROLS;
const ROI_WIDTH = SCREEN_WIDTH * 0.65;
const ROI_HEIGHT = AVAILABLE_HEIGHT * 0.85;
const ROI_LEFT = (SCREEN_WIDTH - ROI_WIDTH) / 2;
const ROI_TOP = HEADER_HEIGHT + (AVAILABLE_HEIGHT - ROI_HEIGHT) / 2;

export default function CameraCaptureScreen() {
  const { farmId, treeId, treeType, datePlanted } = useLocalSearchParams();
  const router = useRouter();
  const { photos, setPhotos, addPhoto, treeDetails } = usePhotos();
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

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
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Flash effect
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();

      // Capture photo
      const result = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        exif: true
      });

      // Add photo to list (skip cropping for now due to rotation issues)
      const placeholderPhoto = { 
        uri: result.uri, 
        exif: { timestamp: new Date().toISOString() },
        location: undefined as any
      };
      addPhoto(placeholderPhoto);

      // Process EXIF and location in background
      (async () => {
        let freshLocation;
        if (locationPermission?.granted) {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            freshLocation = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: location.coords.altitude,
              accuracy: location.coords.accuracy,
            };
            placeholderPhoto.location = freshLocation;
            console.log('Captured device location:', freshLocation);
          } catch (err) {
            console.warn('Failed to get location:', err);
          }
        }

        try {
          const exif = await extractExifData(result, freshLocation);
          placeholderPhoto.exif = exif;
        } catch (err) {
          console.warn('Failed to extract EXIF:', err);
        }
      })();

      // Check if we have 3 photos
      if (photos.length >= 2) {
        const resolvedTreeId = treeDetails.treeId || String(treeId ?? '');
        const resolvedTreeType = treeDetails.treeType || String(treeType ?? '');
        const resolvedDatePlanted = treeDetails.datePlanted || String(datePlanted ?? '');

        router.push({
          pathname: '/(tabs)/photo-review',
          params: {
            farmId: String(farmId),
            treeId: resolvedTreeId,
            treeType: resolvedTreeType,
            datePlanted: resolvedDatePlanted,
          },
        });
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
        
        {/* ROI Overlay */}
        <View style={styles.overlay}>
          <View style={[styles.darkRegion, { height: ROI_TOP }]} />
          <View style={{ flexDirection: 'row', height: ROI_HEIGHT }}>
            <View style={[styles.darkRegion, { width: ROI_LEFT }]} />
            <View style={styles.roiBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={[styles.darkRegion, { flex: 1 }]} />
          </View>
          <View style={[styles.darkRegion, { flex: 1 }]} />
        </View>

        {/* Instructions */}
        <View style={[styles.instructionContainer, { top: ROI_TOP - 48 }]}>
          <ThemedText style={styles.instructionText}>
            Place one coffee leaf inside the box
          </ThemedText>
        </View>
        <View style={[styles.subInstructionContainer, { top: ROI_TOP + ROI_HEIGHT + 12 }]}>
          <ThemedText style={styles.subInstructionText}>
            Ensure the leaf fills the frame and avoid overlapping leaves
          </ThemedText>
        </View>

        <View style={styles.overlayBottom}>
          <ThemedText style={styles.counterText}>{photos.length}/3</ThemedText>
          <Pressable 
            style={styles.shutterButton} 
            onPress={handleCapture}
          >
            {({ pressed }) => (
              <View style={[styles.shutterInner, pressed && styles.shutterInnerPressed]} />
            )}
          </Pressable>
        </View>

        {/* Flash effect */}
        <Animated.View 
          style={[styles.flashOverlay, { opacity: flashAnim }]} 
          pointerEvents="none"
        />
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  darkRegion: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  roiBox: {
    width: ROI_WIDTH,
    height: ROI_HEIGHT,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#4ADE80',
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#4ADE80',
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#4ADE80',
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#4ADE80',
  },
  instructionContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subInstructionContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  subInstructionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  shutterInnerPressed: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
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
