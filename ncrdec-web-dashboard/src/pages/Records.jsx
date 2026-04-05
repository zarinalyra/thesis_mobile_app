import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Records.css'

export default function Records() {
  const [records, setRecords] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTree, setSelectedTree] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecords()
  }, [])

  const fetchRecords = async () => {
    try {
      const { data: geotags, error } = await supabase
        .from('geotags')
        .select('*, images(file_path, uploaded_at)')
        .order('captured_at', { ascending: false })

      if (error) throw error

      // Group by tree_id
      const groupedRecords = {}
      geotags?.forEach(record => {
        const treeId = record.tree_id || 'unknown'
        if (!groupedRecords[treeId]) {
          groupedRecords[treeId] = []
        }
        groupedRecords[treeId].push(record)
      })

      setRecords(geotags || [])
    } catch (error) {
      console.error('Error fetching records:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredRecords = records.filter(record =>
    (record.tree_id || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <div className="page-content">Loading...</div>
  }

  return (
    <div className="page-content records-page">
      <div className="page-header">
        <h1>Coffee Tree Monitoring Records</h1>
      </div>

      <div className="records-container">
        <div className="records-list">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by Tree ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <table className="records-table">
            <thead>
              <tr>
                <th>Tree ID</th>
                <th>Farm ID</th>
                <th>Tree Type</th>
                <th>Date Planted</th>
                <th>Tree Age</th>
                <th>GPS Coordinates</th>
                <th>Monitoring History</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedTree(record)}
                    className={selectedTree?.id === record.id ? 'active' : ''}
                  >
                    <td>{record.tree_id || '-'}</td>
                    <td>{record.farm_id || '-'}</td>
                    <td>{record.tree_type || '-'}</td>
                    <td>{record.date_planted || '-'}</td>
                    <td>-</td>
                    <td>{record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}</td>
                    <td>
                      <button className="view-btn">View</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="no-data">No records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedTree && (
          <div className="tree-details-panel">
            <h3>Tree ID: {selectedTree.tree_id || '-'}</h3>

            <div className="details-section">
              <h4>Coffee Tree Information</h4>
              <div className="detail-row">
                <span className="label">Tree ID:</span>
                <span className="value">{selectedTree.tree_id || '-'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Farm ID:</span>
                <span className="value">{selectedTree.farm_id || '-'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Tree Type:</span>
                <span className="value">{selectedTree.tree_type || '-'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Date Planted:</span>
                <span className="value">{selectedTree.date_planted || '-'}</span>
              </div>
            </div>

            <div className="details-section">
              <h4>Inspection Result</h4>
              <div className="detail-row">
                <span className="label">Disease/s Detected:</span>
                <span className="value">-</span>
              </div>
              <div className="detail-row">
                <span className="label">Pest/s Detected:</span>
                <span className="value">-</span>
              </div>
              <div className="detail-row">
                <span className="label">Leaf Chlorosis (Average):</span>
                <span className="value">-</span>
              </div>
              <div className="detail-row">
                <span className="label">Date of Last Inspection:</span>
                <span className="value">{new Date(selectedTree.captured_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="details-section">
              <h4>Location</h4>
              <div className="detail-row">
                <span className="label">GPS Coordinates:</span>
                <span className="value">{selectedTree.latitude.toFixed(6)}, {selectedTree.longitude.toFixed(6)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
