import React, { useState, useEffect } from 'react'
import { loadDashboardData, formatDate } from '../lib/coffeeData'
import StatCard from '../components/StatCard'
import './Dashboard.css'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTrees: 0,
    treesWithoutDisease: 0,
    treesWithDisease: 0,
    latestInspectionDate: '-',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const { latestTrees, latestInspection } = await loadDashboardData()

      const totalTrees = latestTrees.length
      const treesWithDisease = latestTrees.filter((tree) => tree.hasDisease).length
      const treesWithoutDisease = totalTrees - treesWithDisease

      setStats({
        totalTrees,
        treesWithoutDisease,
        treesWithDisease,
        latestInspectionDate: formatDate(latestInspection?.inspection_date || latestInspection?.created_at),
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="page-content">Loading...</div>
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
          title="Last Updated"
          value={stats.latestInspectionDate}
          icon="⏰"
          color="#ffa726"
        />
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Total Number of Tagged Trees Graph</h3>
          <p className="placeholder">Chart placeholder - Recharts integration pending</p>
        </div>
        <div className="chart-card">
          <h3>Recent Inspections</h3>
          <p className="placeholder">Table placeholder - Recent inspections data pending</p>
        </div>
        <div className="chart-card">
          <h3>Detected Diseases Graph</h3>
          <p className="placeholder">Chart placeholder - Recharts integration pending</p>
        </div>
        <div className="chart-card">
          <h3>Detected Pests Graph</h3>
          <p className="placeholder">Chart placeholder - Recharts integration pending</p>
        </div>
      </div>
    </div>
  )
}
