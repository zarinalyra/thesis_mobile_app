import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Layout.css'

export default function Layout({ children }) {
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <h2>NCRDEC</h2>
          <p>Coffee Tree Monitoring</p>
        </div>

        <nav className="nav">
          <Link
            to="/"
            className={`nav-link ${isActive('/') ? 'active' : ''}`}
          >
            <span className="icon">📊</span>
            Dashboard
          </Link>
          <Link
            to="/records"
            className={`nav-link ${isActive('/records') ? 'active' : ''}`}
          >
            <span className="icon">📋</span>
            Records
          </Link>
          <Link
            to="/map"
            className={`nav-link ${isActive('/map') ? 'active' : ''}`}
          >
            <span className="icon">🗺️</span>
            Map
          </Link>
        </nav>
      </aside>

      <div className="main-content">
        {children}
      </div>
    </div>
  )
}
