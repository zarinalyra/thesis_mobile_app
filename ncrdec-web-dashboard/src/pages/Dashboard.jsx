import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "../components/StatCard";
import { formatDate, loadDashboardData } from "../lib/coffeeData";
import "./Dashboard.css";

function formatTrendDateLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

function toDateKey(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function toMonthKey(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) {
    return "-";
  }

  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    return monthKey;
  }

  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTrees: 0,
    treesWithoutDisease: 0,
    treesWithDisease: 0,
    treesNotYetAnalyzed: 0,
    latestInspectionDate: "-",
  });
  const [loading, setLoading] = useState(true);
  const [farmGraphData, setFarmGraphData] = useState([]);
  const [healthTrendData, setHealthTrendData] = useState([]);
  const [diseaseBreakdownData, setDiseaseBreakdownData] = useState([]);
  const [recoveryTrackingData, setRecoveryTrackingData] = useState([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const {
        latestTrees,
        latestInspection,
        latestAnalysisByTree,
        analysisRows = [],
      } = await loadDashboardData();

      const totalTrees = latestTrees.length;
      let treesWithDisease = 0;
      let treesWithoutDisease = 0;
      let treesNotYetAnalyzed = 0;

      latestTrees.forEach((tree) => {
        const latestAnalysis = latestAnalysisByTree.get(
          String(tree.treeId || ""),
        );
        if (!latestAnalysis) {
          treesNotYetAnalyzed += 1;
          return;
        }

        const hasDetectedDisease =
          Array.isArray(latestAnalysis.diseases_detected) &&
          latestAnalysis.diseases_detected.length > 0;
        const hasDetectedPest =
          Array.isArray(latestAnalysis.pests_detected) &&
          latestAnalysis.pests_detected.length > 0;

        if (hasDetectedDisease || hasDetectedPest) {
          treesWithDisease += 1;
        } else {
          treesWithoutDisease += 1;
        }
      });

      const monthlyTotalsMap = new Map();
      latestTrees.forEach((tree) => {
        const monthKey = toMonthKey(tree.capturedAt);
        if (!monthKey) {
          return;
        }

        monthlyTotalsMap.set(
          monthKey,
          (monthlyTotalsMap.get(monthKey) || 0) + 1,
        );
      });

      const monthlyKeys = Array.from(monthlyTotalsMap.keys()).sort();
      let runningTotal = 0;
      const monthlyTrendRows = monthlyKeys.map((monthKey) => {
        runningTotal += monthlyTotalsMap.get(monthKey) || 0;
        return {
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          totalTrees: runningTotal,
        };
      });

      setFarmGraphData(monthlyTrendRows);

      const dailyRows = new Map();
      latestTrees.forEach((tree) => {
        const dateKey = toDateKey(tree.capturedAt);
        if (!dateKey) {
          return;
        }

        const current = dailyRows.get(dateKey) || {
          dateKey,
          label: formatTrendDateLabel(dateKey),
          detected: 0,
          healthy: 0,
          notYetAnalyzed: 0,
        };

        const latestAnalysis = latestAnalysisByTree.get(
          String(tree.treeId || ""),
        );
        if (!latestAnalysis) {
          current.notYetAnalyzed += 1;
        } else {
          const hasDetectedDisease =
            Array.isArray(latestAnalysis.diseases_detected) &&
            latestAnalysis.diseases_detected.length > 0;
          const hasDetectedPest =
            Array.isArray(latestAnalysis.pests_detected) &&
            latestAnalysis.pests_detected.length > 0;

          if (hasDetectedDisease || hasDetectedPest) {
            current.detected += 1;
          } else {
            current.healthy += 1;
          }
        }

        dailyRows.set(dateKey, current);
      });

      const trendRows = Array.from(dailyRows.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .slice(-10);

      setHealthTrendData(trendRows);

      // Build Disease/Pest breakdown
      const diseaseCountMap = new Map();
      const pestCountMap = new Map();
      analysisRows.forEach((analysis) => {
        if (Array.isArray(analysis.diseases_detected)) {
          analysis.diseases_detected.forEach((disease) => {
            if (disease && disease.trim()) {
              diseaseCountMap.set(
                disease,
                (diseaseCountMap.get(disease) || 0) + 1,
              );
            }
          });
        }
        if (Array.isArray(analysis.pests_detected)) {
          analysis.pests_detected.forEach((pest) => {
            if (pest && pest.trim()) {
              pestCountMap.set(pest, (pestCountMap.get(pest) || 0) + 1);
            }
          });
        }
      });

      function getColorForType(type) {
        if (type === "SM") {
          return "#999999"; // gray
        }
        if (type === "BSL") {
          return "#1b5e20"; // dark green
        }
        return "#ff9800"; // default orange
      }

      const diseaseBreakdown = [
        ...Array.from(diseaseCountMap.entries()).map(([name, count]) => ({
          type: name,
          count,
          category: "Disease",
          color: getColorForType(name),
        })),
        ...Array.from(pestCountMap.entries()).map(([name, count]) => ({
          type: name,
          count,
          category: "Pest",
          color: getColorForType(name),
        })),
      ].sort((a, b) => b.count - a.count);
      setDiseaseBreakdownData(diseaseBreakdown);

      // Build Recovery tracking
      const treeAnalysesMap = new Map();
      [...(analysisRows || [])]
        .sort((a, b) => {
          const aTime = new Date(
            a.inspection_date || a.created_at || 0,
          ).getTime();
          const bTime = new Date(
            b.inspection_date || b.created_at || 0,
          ).getTime();
          return aTime - bTime;
        })
        .forEach((analysis) => {
          const treeId = String(analysis.tree_id || "");
          if (!treeId) {
            return;
          }
          if (!treeAnalysesMap.has(treeId)) {
            treeAnalysesMap.set(treeId, []);
          }
          treeAnalysesMap.get(treeId).push(analysis);
        });

      let recoveredCount = 0;
      let stillAffectedCount = 0;
      treeAnalysesMap.forEach((analyses) => {
        // Sort analyses per tree by date
        const sortedPerTree = [...analyses].sort((a, b) => {
          const aTime = new Date(
            a.inspection_date || a.created_at || 0,
          ).getTime();
          const bTime = new Date(
            b.inspection_date || b.created_at || 0,
          ).getTime();
          return aTime - bTime;
        });
        const firstAnalysis = sortedPerTree[0];
        const latestAnalysis = sortedPerTree[sortedPerTree.length - 1];

        const hadDiseaseOrPestBefore =
          (Array.isArray(firstAnalysis.diseases_detected) &&
            firstAnalysis.diseases_detected.length > 0) ||
          (Array.isArray(firstAnalysis.pests_detected) &&
            firstAnalysis.pests_detected.length > 0);

        const hasDiseaseOrPestNow =
          (Array.isArray(latestAnalysis.diseases_detected) &&
            latestAnalysis.diseases_detected.length > 0) ||
          (Array.isArray(latestAnalysis.pests_detected) &&
            latestAnalysis.pests_detected.length > 0);

        if (hadDiseaseOrPestBefore && !hasDiseaseOrPestNow) {
          recoveredCount += 1;
        } else if (hasDiseaseOrPestNow) {
          stillAffectedCount += 1;
        }
      });

      const recoveryData = [
        { status: "Recovered", count: recoveredCount, color: "#66bb6a" }, // green
        {
          status: "Still Affected",
          count: stillAffectedCount,
          color: "#ff9800",
        }, // orange
      ];
      setRecoveryTrackingData(recoveryData);

      setStats({
        totalTrees,
        treesWithoutDisease,
        treesWithDisease,
        treesNotYetAnalyzed,
        latestInspectionDate: formatDate(latestTrees[0]?.capturedAt),
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page-content">Loading...</div>;
  }

  return (
    <div className="page-content dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <div className="stats-grid">
        <StatCard
          title="Total Number of Tagged Trees"
          value={stats.totalTrees}
          icon="📍"
          color="#42a5f5"
        />
        <StatCard
          title="Number of Trees with No Detected Diseases or Pests"
          value={stats.treesWithoutDisease}
          icon="🌿"
          color="#66bb6a"
        />
        <StatCard
          title="Number of Trees with Detected Diseases or Pests"
          value={stats.treesWithDisease}
          icon="🦠"
          color="#ef5350"
        />
        <StatCard
          title="Number of Trees Not Yet Analyzed"
          value={stats.treesNotYetAnalyzed}
          icon="⏳"
          color="#78909c"
        />
        <StatCard
          title="Last Updated"
          value={stats.latestInspectionDate}
          icon="⏰"
          color="#ffa726"
        />
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Disease/Pest Type Breakdown</h3>
          {diseaseBreakdownData.length > 0 ? (
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={diseaseBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="type"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ display: "none" }} />
                  <Bar
                    dataKey="count"
                    name="Number of Trees"
                    radius={[6, 6, 0, 0]}
                  >
                    {diseaseBreakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="placeholder">
              No disease or pest data available yet.
            </p>
          )}
        </div>
        <div className="chart-card">
          <h3>Tree Health Cards</h3>
          <div className="health-card-grid">
            <div className="health-card health-card-detected">
              <p>With Diseases/Pest</p>
              <h4>{stats.treesWithDisease}</h4>
            </div>
            <div className="health-card health-card-healthy">
              <p>No Disease/Pest</p>
              <h4>{stats.treesWithoutDisease}</h4>
            </div>
            <div className="health-card health-card-pending">
              <p>Not Yet Analyzed</p>
              <h4>{stats.treesNotYetAnalyzed}</h4>
            </div>
          </div>
          {healthTrendData.length > 0 ? (
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={healthTrendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="detected"
                    name="With Diseases/Pest"
                    stroke="#ef5350"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="healthy"
                    name="No Disease/Pest"
                    stroke="#66bb6a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="notYetAnalyzed"
                    name="Not Yet Analyzed"
                    stroke="#78909c"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="placeholder">
              No inspection trend data available yet.
            </p>
          )}
        </div>
        <div className="chart-card">
          <h3>Trees Added Over Time</h3>
          {farmGraphData.length > 0 ? (
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={farmGraphData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="monthLabel" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="totalTrees"
                    name="Total Tagged Trees"
                    stroke="#2e7d32"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="placeholder">No tagged tree data available yet.</p>
          )}
        </div>
        <div className="chart-card">
          <h3>Recovery Tracking</h3>
          {recoveryTrackingData.some((item) => item.count > 0) ? (
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={recoveryTrackingData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ display: "none" }} />
                  <Bar
                    dataKey="count"
                    name="Number of Trees"
                    radius={[6, 6, 0, 0]}
                  >
                    {recoveryTrackingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="placeholder">
              Not enough historical data for recovery tracking.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
