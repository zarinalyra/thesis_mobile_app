import React, { useRef } from 'react';
import { Animated, Image, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

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

function getTreeAge(datePlanted: string): string {
  if (!datePlanted) {
    return '-';
  }

  const parts = datePlanted.split('-');
  if (parts.length !== 3) {
    return '-';
  }

  const [month, day, year] = parts.map(Number);
  const plantedDate = new Date(year, month - 1, day);
  if (Number.isNaN(plantedDate.getTime())) {
    return '-';
  }

  const now = new Date();
  let years = now.getFullYear() - plantedDate.getFullYear();
  let months = now.getMonth() - plantedDate.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) {
    return 'Less than a month';
  }

  if (years <= 0) {
    return `${months} month${months > 1 ? 's' : ''}`;
  }

  return `${years} year${years > 1 ? 's' : ''}${months > 0 ? ` ${months} month${months > 1 ? 's' : ''}` : ''}`;
}

function formatDate(value: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

export default function TreeDetailsCard({ tree, onUpdate, onClose }: TreeDetailsCardProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.9) {
          Animated.timing(translateY, {
            toValue: 600,
            duration: 180,
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
    })
  ).current;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
      <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
        <View style={styles.dragArea}>
          <View style={styles.dragHandle} />
        </View>
        <View style={styles.headerRow}>
          <ThemedText style={styles.sectionTitle}>Coffee Tree Information</ThemedText>
          <Pressable style={styles.updateButton} onPress={onUpdate}>
            <ThemedText style={styles.updateButtonText}>Update Card</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.detailText}>Tree ID: {tree.treeId || tree.id}</ThemedText>
        <ThemedText style={styles.detailText}>Farm ID: {tree.farmId}</ThemedText>
        <ThemedText style={styles.detailText}>Tree Type: {tree.treeType || '-'}</ThemedText>
        <ThemedText style={styles.detailText}>Date Planted: {tree.datePlanted || '-'}</ThemedText>
        <ThemedText style={styles.detailText}>Tree Age: {getTreeAge(tree.datePlanted)}</ThemedText>
        <ThemedText style={styles.detailText}>
          GPS Coordinates: {tree.coordinate.latitude.toFixed(6)}, {tree.coordinate.longitude.toFixed(6)}
        </ThemedText>

        <ThemedText style={styles.sectionTitle}>Inspection Result</ThemedText>
        <ThemedText style={styles.detailText}>Disease/s Detected:</ThemedText>
        <ThemedText style={styles.bulletText}>• Placeholder</ThemedText>
        <ThemedText style={styles.bulletText}>• Placeholder</ThemedText>

        <ThemedText style={styles.detailText}>Pest/s Detected:</ThemedText>
        <ThemedText style={styles.bulletText}>• Placeholder</ThemedText>
        <ThemedText style={styles.bulletText}>• Placeholder</ThemedText>

        <ThemedText style={styles.detailText}>Leaf Chlorosis (Average): Placeholder</ThemedText>
        <ThemedText style={styles.detailText}>Date of Last Inspection: {formatDate(tree.capturedAt)}</ThemedText>

        <ThemedText style={styles.sectionTitle}>Latest Images</ThemedText>
        <View style={styles.imageGrid}>
          {tree.latestImages.length > 0 ? (
            tree.latestImages.map((imageUrl, index) => (
              <Image key={`${tree.id}-${index}`} source={{ uri: imageUrl }} style={styles.image} />
            ))
          ) : (
            <View style={styles.emptyImageCard}>
              <ThemedText style={styles.emptyImageText}>No images yet</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 0,
    zIndex: 100,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 0,
  },
  cardContent: {
    padding: 16,
    gap: 8,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#d4d4d4',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginTop: 12,
    marginBottom: 4,
  },
  updateButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d5d5d5',
    borderRadius: 999,
    backgroundColor: '#fafafa',
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  detailText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  bulletText: {
    fontSize: 15,
    color: '#111',
    marginLeft: 8,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingBottom: 16,
  },
  image: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  emptyImageCard: {
    width: 150,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyImageText: {
    color: '#666',
    fontSize: 14,
  },
});