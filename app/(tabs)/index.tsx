import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import { FarmCard } from "@/components/farm-card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "@/supabase";

interface FarmSummary {
  farmId: string;
  farmName: string;
  totalTrees: number;
  healthyTrees: number;
  diseasedTrees: number;
}

export default function HomeScreen() {
  const [farmData, setFarmData] = useState<FarmSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchFarmSummaries = useCallback(async () => {
    try {
      setErrorMessage(null);

      // Unique trees per farm come from geotags (source of truth for tree count)
      const { data: geotagData, error: geotagError } = await supabase
        .from("geotags")
        .select("farm_id, tree_id");

      if (geotagError) throw geotagError;

      // Latest disease status per tree comes from analysis_results
      const { data: analysisData, error: analysisError } = await supabase
        .from("analysis_results")
        .select("tree_id, has_disease, inspection_date")
        .order("inspection_date", { ascending: false });

      if (analysisError) throw analysisError;

      // Build map: tree_id → has_disease from the most recent inspection
      const latestAnalysis = new Map<string, boolean>();
      for (const row of analysisData || []) {
        if (!latestAnalysis.has(row.tree_id)) {
          latestAnalysis.set(row.tree_id, row.has_disease ?? false);
        }
      }

      // Collect unique tree_ids per farm
      const farmTreeMap = new Map<string, Set<string>>();
      for (const row of geotagData || []) {
        const farmId = String(row.farm_id || "01");
        const treeId = String(row.tree_id || "");
        if (!treeId) continue;
        if (!farmTreeMap.has(farmId)) farmTreeMap.set(farmId, new Set());
        farmTreeMap.get(farmId)!.add(treeId);
      }

      // Aggregate per-farm counts using analysis_results for health status
      const farmSummaryMap = new Map<string, FarmSummary>();
      for (const [farmId, trees] of farmTreeMap.entries()) {
        let healthyTrees = 0;
        let diseasedTrees = 0;
        for (const treeId of trees) {
          if (latestAnalysis.get(treeId)) {
            diseasedTrees++;
          } else {
            healthyTrees++;
          }
        }
        farmSummaryMap.set(farmId, {
          farmId,
          farmName: `Farm-${farmId}`,
          totalTrees: trees.size,
          healthyTrees,
          diseasedTrees,
        });
      }

      const summaries = Array.from(farmSummaryMap.values()).sort((a, b) =>
        a.farmId.localeCompare(b.farmId, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

      setFarmData(summaries);
    } catch (error: any) {
      const message = String(error?.message || error || "Unknown error");
      const isNetworkError = /network request failed/i.test(message);
      setErrorMessage(
        isNetworkError
          ? "Cannot reach server right now. Please check your internet and try again."
          : "Failed to load dashboard data. Please try again.",
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
      .channel("dashboard-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "geotags" },
        () => { fetchFarmSummaries(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_results" },
        () => { fetchFarmSummaries(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFarmSummaries]);

  const hasNoData = useMemo(
    () => !isLoading && farmData.length === 0 && !errorMessage,
    [isLoading, farmData.length, errorMessage],
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: "#CFE1CC" }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView
          style={[styles.farmsContainer, { backgroundColor: "#CFE1CC" }]}
        >
          {isLoading && (
            <ThemedView style={styles.centeredMessage}>
              <ActivityIndicator size="large" color="#4CAF50" />
            </ThemedView>
          )}

          {!isLoading && errorMessage && (
            <ThemedView style={styles.centeredMessage}>
              <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
              <Pressable
                style={styles.retryButton}
                onPress={fetchFarmSummaries}
              >
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {!isLoading &&
            !errorMessage &&
            farmData.map((farm) => (
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
            <FarmCard
              farmId="01"
              farmName="Farm-01"
              totalTrees={0}
              healthyTrees={0}
              diseasedTrees={0}
            />
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
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 12,
    backgroundColor: "#CFE1CC",
  },
  errorText: {
    fontSize: 14,
    color: "#8b1d1d",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryText: {
    color: "#111111",
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 14,
    color: "#333333",
  },
});
