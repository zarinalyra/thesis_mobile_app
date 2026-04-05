import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import FarmCardMap from '@/components/farm-card-map';

interface FarmCardProps {
  farmId: string;
  farmName: string;
  totalTrees: number;
  healthyTrees: number;
  diseasedTrees: number;
  markers?: { id: string; coordinate: { latitude: number; longitude: number }; title: string }[];
}

export function FarmCard({
  farmId,
  farmName,
  totalTrees,
  healthyTrees,
  diseasedTrees,
  markers = [],
}: FarmCardProps) {
  const router = useRouter();

  const handleMapPress = () => {
    router.push(`/(tabs)/farm-map?farmId=${farmId}`);
  };

  return (
    <View style={styles.card}>
      {/* Interactive Map Preview - Clickable */}
      <Pressable 
        style={styles.mapContainer}
        onPress={handleMapPress}
      >
        <FarmCardMap 
          markers={markers} 
          farmName={farmName}
        />
      </Pressable>

      {/* Farm Info */}
      <View style={styles.infoContainer}>
        <ThemedText style={styles.farmName}>
          {farmName}
        </ThemedText>

        {/* Tree Count */}
        <View style={styles.statsRow}>
          <ThemedText style={styles.labelText}>
            Total Number of Trees: <ThemedText style={styles.valueText}>{totalTrees} Trees</ThemedText>
          </ThemedText>
        </View>

        {/* Health Indicators */}
        <View style={styles.indicatorContainer}>
          {/* Healthy Trees */}
          <View style={styles.indicatorRow}>
            <View style={[styles.indicator, { backgroundColor: '#4CAF50' }]} />
            <ThemedText style={styles.indicatorLabel}>
              No Detected Disease/Pest: 
            </ThemedText>
            <ThemedText style={styles.indicatorValue}>{healthyTrees} Trees</ThemedText>
          </View>

          {/* Diseased Trees */}
          <View style={styles.indicatorRow}>
            <View style={[styles.indicator, { backgroundColor: '#FF9800' }]} />
            <ThemedText style={styles.indicatorLabel}>
              Detected Disease/Pest: 
            </ThemedText>
            <ThemedText style={styles.indicatorValue}>{diseasedTrees} Trees</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 25,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapContainer: {
    height: 250,
    position: 'relative',
    backgroundColor: '#e0e0e0',
  },
  infoContainer: {
    padding: 16,
    gap: 12,
  },
  farmName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Arial',
    marginBottom: 4,
  },
  labelText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Arial',
    fontWeight: '400',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  valueText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Arial',
    fontWeight: '600',
  },
  indicatorContainer: {
    gap: 8,
    marginTop: 8,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  indicatorLabel: {
    fontSize: 13,
    color: '#9C9C9C',
    fontFamily: 'Arial',
    fontWeight: '400',
  },
  indicatorValue: {
    fontSize: 13,
    color: '#9C9C9C',
    fontFamily: 'Arial',
    fontWeight: '400',
  },
});
