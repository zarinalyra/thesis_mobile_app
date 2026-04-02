import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MapComponent from '@/components/map-component';
import { supabase } from '@/supabase';

interface TreeMarker {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  hasDisease: boolean;
}

export default function FarmMapScreen() {
  const { farmId } = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();
  const [markers, setMarkers] = useState<TreeMarker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrees();

    // Realtime subscription
    const channel = supabase
      .channel('geotags-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'geotags', filter: `farm_id=eq.${farmId}` },
        (payload) => {
          const tree = payload.new;
          setMarkers((prev) => [
            ...prev,
            {
              id: tree.id,
              coordinate: { latitude: tree.latitude, longitude: tree.longitude },
              title: `Tree ${prev.length + 1}`,
              hasDisease: tree.raw_exif?.hasDisease || false,
            },
          ]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farmId]);

  const fetchTrees = async () => {
    try {
      console.log('Fetching trees for farm:', farmId);
      const { data, error } = await supabase
        .from('geotags')
        .select('id, latitude, longitude, raw_exif, farm_id')
        .eq('farm_id', farmId);

      if (error) {
        console.error('Error fetching trees:', error);
        throw error;
      }

      console.log('Fetched data:', data);

      const treeMarkers: TreeMarker[] = data.map((tree, index) => ({
        id: tree.id,
        coordinate: {
          latitude: tree.latitude,
          longitude: tree.longitude,
        },
        title: `Tree ${index + 1}`,
        hasDisease: tree.raw_exif?.hasDisease || false,
      }));

      console.log('Tree markers:', treeMarkers);
      setMarkers(treeMarkers);
    } catch (error) {
      console.error('Error fetching trees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHomePress = () => {
    navigation.goBack();
  };

  const handleAddTreePress = () => {
    router.push(`/(tabs)/add-tree?farmId=${farmId}`);
  };

  const handleMapPress = (event: any) => {
    // Disabled manual marker addition
  };

  const farmName = `Farm-${farmId}`;

  return (
    <View style={styles.container}>
      {/* Header with Home button and centered title */}
      <View style={styles.header}>
        <Pressable style={styles.homeButton} onPress={handleHomePress}>
          <IconSymbol name="house.fill" size={28} color="#000" />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{farmName} Map</ThemedText>
        <View style={styles.spacer} />
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <Pressable style={styles.addTreeButton} onPress={handleAddTreePress}>
          <ThemedText style={styles.addTreeButtonText}>Add Tree</ThemedText>
        </Pressable>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : (
          <MapComponent markers={markers} onMapPress={handleMapPress} farmName={farmName} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  backButton: {
    paddingRight: 8,
  },
  homeButton: {
    paddingLeft: 15
  },
  spacer: {
    width: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  addTreeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addTreeButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
