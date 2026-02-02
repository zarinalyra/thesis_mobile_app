import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FarmCard } from '@/components/farm-card';

// Farm data - will be populated from geotagging
const FARM_DATA = [
  {
    farmId: '01',
    farmName: 'Farm-01',
    totalTrees: 0,
    healthyTrees: 0,
    diseasedTrees: 0,
  },
];

export default function HomeScreen() {
  return (
    <ThemedView style={[styles.container, { backgroundColor: '#CFE1CC' }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.farmsContainer, { backgroundColor: '#CFE1CC' }]}>
          {FARM_DATA.map((farm) => (
            <FarmCard
              key={farm.farmId}
              farmId={farm.farmId}
              farmName={farm.farmName}
              totalTrees={farm.totalTrees}
              healthyTrees={farm.healthyTrees}
              diseasedTrees={farm.diseasedTrees}
            />
          ))}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  farmsContainer: {
    paddingHorizontal: 16,
    paddingTop: 80,
    paddingBottom: 50,
  },
});
