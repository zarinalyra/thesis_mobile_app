import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import MapComponent from '@/components/map-component';
import TreeDetailsCard from '@/components/tree-details-card';
import { supabase } from '@/supabase';

interface TreeMarker {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  hasDisease: boolean;
  treeId: string;
  treeType: string;
  datePlanted: string;
  capturedAt: string;
  imageIds: string[];
  latestImages: string[];
}

function normalizeRawExif(rawExif: unknown): Record<string, any> {
  if (!rawExif) {
    return {};
  }

  if (typeof rawExif === 'string') {
    try {
      return JSON.parse(rawExif);
    } catch {
      return {};
    }
  }

  if (typeof rawExif === 'object') {
    return rawExif as Record<string, any>;
  }

  return {};
}

function toDateKey(value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

export default function FarmMapScreen() {
  const { farmId } = useLocalSearchParams();
  const navigation = useNavigation();
  const router = useRouter();
  const [markers, setMarkers] = useState<TreeMarker[]>([]);
  const [selectedTree, setSelectedTree] = useState<TreeMarker | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrees();

    // Realtime subscription
    const channel = supabase
      .channel('geotags-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'geotags', filter: `farm_id=eq.${farmId}` },
        () => {
          fetchTrees();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farmId]);

  const fetchTrees = async () => {
    try {
      setFetchError(null);
      console.log('Fetching trees for farm:', farmId);
      const withTreeColumnsSelect = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id, tree_id, tree_type, date_planted';
      const legacySelect = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id';

      let { data, error } = await supabase
        .from('geotags')
        .select(withTreeColumnsSelect)
        .eq('farm_id', farmId);

      if (
        error &&
        /tree_id/i.test(error.message || '') &&
        /does not exist/i.test(error.message || '')
      ) {
        ({ data, error } = await supabase
          .from('geotags')
          .select(legacySelect)
          .eq('farm_id', farmId));
      }

      if (error) {
        console.error('Error fetching trees:', error);
        throw error;
      }

      console.log('Fetched data:', data);

      const groupedByTree = new Map<string, Array<{
        rowId: string;
        coordinate: { latitude: number; longitude: number };
        hasDisease: boolean;
        treeId: string;
        treeType: string;
        datePlanted: string;
        capturedAt: string;
        imageIds: string[];
      }>>();

      for (const tree of data) {
        const rawExif = normalizeRawExif(tree.raw_exif);
        const resolvedTreeId = tree.tree_id || rawExif.tree_id || rawExif.treeId || tree.id;
        const resolvedTreeType = tree.tree_type || rawExif.tree_type || rawExif.treeType || 'Unknown';
        const resolvedDatePlanted = tree.date_planted || rawExif.date_planted || rawExif.datePlanted || '-';

        const imageIds = Array.isArray(rawExif.image_ids)
          ? rawExif.image_ids
          : Array.isArray(rawExif.imageIds)
            ? rawExif.imageIds
            : tree.image_id
              ? [tree.image_id]
              : [];

        const key = String(resolvedTreeId || tree.id);
        const current = groupedByTree.get(key) || [];
        current.push({
          rowId: tree.id,
          coordinate: {
            latitude: tree.latitude,
            longitude: tree.longitude,
          },
          hasDisease: rawExif.has_disease || rawExif.hasDisease || false,
          treeId: String(resolvedTreeId),
          treeType: String(resolvedTreeType),
          datePlanted: String(resolvedDatePlanted),
          capturedAt: tree.captured_at || '',
          imageIds,
        });
        groupedByTree.set(key, current);
      }

      const treeMarkers: TreeMarker[] = Array.from(groupedByTree.values()).map((rows) => {
        const sortedRows = [...rows].sort(
          (a, b) => new Date(b.capturedAt || 0).getTime() - new Date(a.capturedAt || 0).getTime()
        );

        const latest = sortedRows[0];
        const latestDateKey = toDateKey(latest.capturedAt);
        const latestDateRows = sortedRows.filter((row) => toDateKey(row.capturedAt) === latestDateKey);

        const latestDateImageIds = Array.from(
          new Set(latestDateRows.flatMap((row) => row.imageIds).filter(Boolean))
        );

        return {
          id: latest.rowId,
          coordinate: latest.coordinate,
          title: latest.treeId ? `Tree ${latest.treeId}` : `Tree ${latest.rowId}`,
          hasDisease: latest.hasDisease,
          treeId: latest.treeId,
          treeType: latest.treeType,
          datePlanted: latest.datePlanted,
          capturedAt: latest.capturedAt,
          imageIds: latestDateImageIds,
          latestImages: [],
        };
      });

      const allImageIds = Array.from(
        new Set(treeMarkers.flatMap((marker) => marker.imageIds).filter(Boolean))
      );

      let imageById = new Map<string, { file_path: string; uploaded_at?: string }>();
      if (allImageIds.length > 0) {
        const { data: imageRows, error: imageError } = await supabase
          .from('images')
          .select('id, file_path, uploaded_at')
          .in('id', allImageIds);

        if (imageError) {
          console.error('Error fetching tree images:', imageError);
        } else {
          imageById = new Map(
            (imageRows || []).map((row: any) => [row.id, { file_path: row.file_path, uploaded_at: row.uploaded_at }])
          );
        }
      }

      const markersWithImages = treeMarkers.map((marker) => {
        const latestImages = marker.imageIds
          .map((imageId) => imageById.get(imageId))
          .filter((value): value is { file_path: string; uploaded_at?: string } => Boolean(value?.file_path))
          .sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime())
          .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl);

        return { ...marker, latestImages };
      });

      console.log('Tree markers:', treeMarkers);
      setMarkers(markersWithImages);
    } catch (error) {
      const message = String((error as any)?.message || error || 'Unknown error');
      const isNetworkError = /network request failed/i.test(message);
      setFetchError(
        isNetworkError
          ? 'Cannot reach server right now. Please check your internet and try again.'
          : 'Failed to load trees. Please try again.'
      );
      console.warn('Error fetching trees:', error);
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

  const handleMarkerPress = (marker: TreeMarker) => {
    setSelectedTree(marker);
  };

  const handleUpdateCardPress = (marker: TreeMarker) => {
    router.push({
      pathname: '/(tabs)/camera-capture',
      params: {
        farmId: String(farmId),
        treeId: marker.treeId,
        treeType: marker.treeType,
        datePlanted: marker.datePlanted,
      },
    });
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
          <MapComponent
            markers={markers}
            onMapPress={handleMapPress}
            onMarkerPress={handleMarkerPress}
            farmName={farmName}
          />
        )}
        {selectedTree && (
          <TreeDetailsCard
            tree={{
              id: selectedTree.id,
              treeId: selectedTree.treeId,
              farmId: String(farmId),
              treeType: selectedTree.treeType,
              datePlanted: selectedTree.datePlanted,
              capturedAt: selectedTree.capturedAt,
              coordinate: selectedTree.coordinate,
              latestImages: selectedTree.latestImages,
            }}
            onUpdate={() => handleUpdateCardPress(selectedTree)}
            onClose={() => setSelectedTree(null)}
          />
        )}
        {!loading && fetchError && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{fetchError}</ThemedText>
            <Pressable style={styles.retryButton} onPress={fetchTrees}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </Pressable>
          </View>
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
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  errorText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  retryButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryText: {
    color: '#111',
    fontSize: 12,
    fontWeight: '700',
  },
});
