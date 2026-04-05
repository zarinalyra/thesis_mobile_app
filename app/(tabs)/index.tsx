import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FarmCard } from '@/components/farm-card';
import { supabase } from '@/supabase';

interface FarmSummary {
  farmId: string;
  farmName: string;
  totalTrees: number;
  healthyTrees: number;
  diseasedTrees: number;
}

interface GeotagRow {
  id: string;
  farm_id?: string | null;
  tree_id?: string | null;
  raw_exif?: unknown;
  captured_at?: string | null;
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

export default function HomeScreen() {
  const [farmData, setFarmData] = useState<FarmSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchFarmSummaries = useCallback(async () => {
    try {
      setErrorMessage(null);

      const withTreeColumnsSelect = 'id, farm_id, tree_id, raw_exif, captured_at';
      const legacySelect = 'id, farm_id, raw_exif, captured_at';

      let { data, error } = await supabase
        .from('geotags')
        .select(withTreeColumnsSelect);

      if (
        error &&
        /tree_id/i.test(error.message || '') &&
        /does not exist/i.test(error.message || '')
      ) {
        ({ data, error } = await supabase
          .from('geotags')
          .select(legacySelect));
      }

      if (error) {
        throw error;
      }

      const rows = (data || []) as GeotagRow[];
      const latestByTree = new Map<string, {
        farmId: string;
        treeId: string;
        capturedAt: string;
        hasDisease: boolean;
      }>();

      for (const row of rows) {
        const rawExif = normalizeRawExif(row.raw_exif);
        const farmId = String(row.farm_id || rawExif.farm_id || '01');
        const treeId = String(row.tree_id || rawExif.tree_id || rawExif.treeId || row.id);
        const capturedAt = row.captured_at || '';
        const hasDisease = Boolean(rawExif.has_disease || rawExif.hasDisease || false);
        const mapKey = `${farmId}::${treeId}`;

        const existing = latestByTree.get(mapKey);
        if (!existing) {
          latestByTree.set(mapKey, { farmId, treeId, capturedAt, hasDisease });
          continue;
        }

        const existingTime = new Date(existing.capturedAt || 0).getTime();
        const currentTime = new Date(capturedAt || 0).getTime();

        if (currentTime >= existingTime) {
          latestByTree.set(mapKey, { farmId, treeId, capturedAt, hasDisease });
        }
      }

      const farmSummaryMap = new Map<string, FarmSummary>();
      for (const row of latestByTree.values()) {
        const existing = farmSummaryMap.get(row.farmId) || {
          farmId: row.farmId,
          farmName: `Farm-${row.farmId}`,
          totalTrees: 0,
          healthyTrees: 0,
          diseasedTrees: 0,
        };

        existing.totalTrees += 1;
        if (row.hasDisease) {
          existing.diseasedTrees += 1;
        } else {
          existing.healthyTrees += 1;
        }

        farmSummaryMap.set(row.farmId, existing);
      }

      const summaries = Array.from(farmSummaryMap.values()).sort((a, b) =>
        a.farmId.localeCompare(b.farmId, undefined, { numeric: true, sensitivity: 'base' })
      );

      setFarmData(summaries);
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown error');
      const isNetworkError = /network request failed/i.test(message);
      setErrorMessage(
        isNetworkError
          ? 'Cannot reach server right now. Please check your internet and try again.'
          : 'Failed to load dashboard data. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFarmSummaries();
  }, [fetchFarmSummaries]);

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-geotags-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geotags' }, () => {
        fetchFarmSummaries();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFarmSummaries]);

  const hasNoData = useMemo(() => !isLoading && farmData.length === 0 && !errorMessage, [isLoading, farmData.length, errorMessage]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: '#CFE1CC' }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.farmsContainer, { backgroundColor: '#CFE1CC' }]}>
          {isLoading && (
            <ThemedView style={styles.centeredMessage}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </ThemedView>
          )}

          {!isLoading && errorMessage && (
            <ThemedView style={styles.centeredMessage}>
              <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
              <Pressable style={styles.retryButton} onPress={fetchFarmSummaries}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {!isLoading && !errorMessage && farmData.map((farm) => (
            <FarmCard
              key={farm.farmId}
              farmId={farm.farmId}
              farmName={farm.farmName}
              totalTrees={farm.totalTrees}
              healthyTrees={farm.healthyTrees}
              diseasedTrees={farm.diseasedTrees}
            />
          ))}

          {hasNoData && (
            <ThemedView style={styles.centeredMessage}>
              <ThemedText style={styles.emptyText}>No tree data yet.</ThemedText>
            </ThemedView>
          )}
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
  centeredMessage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
    backgroundColor: '#CFE1CC',
  },
  errorText: {
    fontSize: 14,
    color: '#8b1d1d',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryText: {
    color: '#111111',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    color: '#333333',
  },
});
