import React from 'react'
import './StatCard.css'

export default function StatCard({ title, value, icon, color }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-icon" style={{ backgroundColor: `${color}20` }}>
        {icon}
      </div>
      <div className="stat-content">
        <p className="stat-title">{title}</p>
        <h2 className="stat-value">{value}</h2>
      </div>
    </div>
  )
}
