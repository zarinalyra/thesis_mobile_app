import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import './Map.css'

const FARM_CENTER = { lat: 14.1976, lng: 120.884357 }
const MAP_ZOOM = 23
const containerStyle = { width: '100%', height: '100%' }

function normalizeRawExif(rawExif) {
  if (!rawExif) {
    return {}
  }

  if (typeof rawExif === 'string') {
    try {
      return JSON.parse(rawExif)
    } catch {
      return {}
    }
  }

  if (typeof rawExif === 'object') {
    return rawExif
  }

  return {}
}

function toDateKey(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString()
}

function getTreeAge(datePlanted) {
  if (!datePlanted || datePlanted === '-') {
    return '-'
  }

  const parts = datePlanted.split('-')
  if (parts.length !== 3) {
    return '-'
  }

  const [month, day, year] = parts.map(Number)
  const plantedDate = new Date(year, month - 1, day)
  if (Number.isNaN(plantedDate.getTime())) {
    return '-'
  }

  const now = new Date()
  let years = now.getFullYear() - plantedDate.getFullYear()
  let months = now.getMonth() - plantedDate.getMonth()

  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years <= 0 && months <= 0) {
    return 'Less than a month'
  }

  if (years <= 0) {
    return `${months} month${months > 1 ? 's' : ''}`
  }

  return `${years} year${years > 1 ? 's' : ''}${months > 0 ? ` ${months} month${months > 1 ? 's' : ''}` : ''}`
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveCoordinate(tree, rawExif) {
  const latitudeCandidates = [
    tree.latitude,
    rawExif.latitude,
    rawExif.lat,
    rawExif.gps_latitude,
    rawExif.gpsLatitude,
  ]
  const longitudeCandidates = [
    tree.longitude,
    rawExif.longitude,
    rawExif.lng,
    rawExif.lon,
    rawExif.gps_longitude,
    rawExif.gpsLongitude,
  ]

  const latitude = latitudeCandidates.map(toFiniteNumber).find((value) => value !== null)
  const longitude = longitudeCandidates.map(toFiniteNumber).find((value) => value !== null)

  if (latitude === null || longitude === null) {
    return null
  }

  return { latitude, longitude }
}

export default function MapPage() {
  const [markers, setMarkers] = useState([])
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
  })
  const googleMapRef = useRef(null)

  const mapCenter = useMemo(() => FARM_CENTER, [])
  const mapOptions = useMemo(() => ({
    mapTypeId: 'satellite',
    mapId,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  }), [mapId])
  const mapUnavailableReason = !apiKey
    ? 'Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY in your .env.local file.'
    : loadError
      ? 'Google Maps failed to load. Check your API key restrictions and billing setup, then refresh.'
      : ''

  const fetchMarkers = useCallback(async (showLoader = true) => {
    try {
      setFetchError(null)
      if (showLoader) {
        setLoading(true)
      }

      const withTreeColumnsSelect = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id, tree_id, tree_type, date_planted'
      const legacySelect = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id'

      let data = null
      let error = null

      const attempts = [
        () => supabase.from('geotags').select(withTreeColumnsSelect).order('captured_at', { ascending: false }),
        () => supabase.from('geotags').select(legacySelect).order('captured_at', { ascending: false }),
        () => supabase.from('geotags').select(withTreeColumnsSelect),
        () => supabase.from('geotags').select(legacySelect),
      ]

      for (const runAttempt of attempts) {
        const result = await runAttempt()
        data = result.data
        error = result.error
        if (!error) {
          break
        }
      }

      if (error) throw error

      const groupedByTree = new globalThis.Map()
      for (const tree of data || []) {
        const rawExif = normalizeRawExif(tree.raw_exif)
        const coordinate = resolveCoordinate(tree, rawExif)
        if (!coordinate) {
          continue
        }

        const resolvedTreeId = tree.tree_id || rawExif.tree_id || rawExif.treeId || tree.id
        const resolvedTreeType = tree.tree_type || rawExif.tree_type || rawExif.treeType || 'Unknown'
        const resolvedDatePlanted = tree.date_planted || rawExif.date_planted || rawExif.datePlanted || '-'

        const imageIds = Array.isArray(rawExif.image_ids)
          ? rawExif.image_ids
          : Array.isArray(rawExif.imageIds)
            ? rawExif.imageIds
            : tree.image_id
              ? [tree.image_id]
              : []

        const key = String(resolvedTreeId || tree.id)
        const current = groupedByTree.get(key) || []
        current.push({
          rowId: tree.id,
          coordinate,
          hasDisease: Boolean(rawExif.has_disease || rawExif.hasDisease),
          treeId: String(resolvedTreeId),
          treeType: String(resolvedTreeType),
          datePlanted: String(resolvedDatePlanted),
          capturedAt: tree.captured_at || '',
          farmId: tree.farm_id || '-',
          imageIds,
        })
        groupedByTree.set(key, current)
      }

      const treeMarkers = Array.from(groupedByTree.values()).map((rows) => {
        const sortedRows = [...rows].sort(
          (a, b) => new Date(b.capturedAt || 0).getTime() - new Date(a.capturedAt || 0).getTime()
        )

        const latest = sortedRows[0]
        const latestDateKey = toDateKey(latest.capturedAt)
        const latestDateRows = sortedRows.filter((row) => toDateKey(row.capturedAt) === latestDateKey)
        const latestDateImageIds = Array.from(new Set(latestDateRows.flatMap((row) => row.imageIds).filter(Boolean)))

        return {
          id: latest.rowId,
          coordinate: latest.coordinate,
          hasDisease: latest.hasDisease,
          treeId: latest.treeId,
          treeType: latest.treeType,
          datePlanted: latest.datePlanted,
          capturedAt: latest.capturedAt,
          farmId: latest.farmId,
          imageIds: latestDateImageIds,
          latestImages: [],
        }
      })

      const allImageIds = Array.from(new Set(treeMarkers.flatMap((marker) => marker.imageIds).filter(Boolean)))

      let imageById = new globalThis.Map()
      if (allImageIds.length > 0) {
        const { data: imageRows, error: imageError } = await supabase
          .from('images')
          .select('id, file_path, uploaded_at')
          .in('id', allImageIds)

        if (!imageError) {
          imageById = new globalThis.Map((imageRows || []).map((row) => [row.id, { file_path: row.file_path, uploaded_at: row.uploaded_at }]))
        }
      }

      const markersWithImages = treeMarkers.map((marker) => {
        const latestImages = marker.imageIds
          .map((imageId) => imageById.get(imageId))
          .filter((value) => Boolean(value?.file_path))
          .sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime())
          .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl)

        return { ...marker, latestImages }
      })

      setMarkers(markersWithImages)
    } catch (error) {
      console.error('Error fetching markers:', error)
      const message = String(error?.message || error || 'Unknown error')
      const isNetworkError = /network request failed|failed to fetch|fetch/i.test(message)
      setFetchError(
        isNetworkError
          ? 'Cannot reach the database right now. Check internet and Supabase config, then retry.'
          : `Failed to load map trees: ${message}`
      )
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchMarkers(true)

    const channel = supabase
      .channel('web-geotags-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geotags' }, () => {
        fetchMarkers(false)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchMarkers])

  if (loading) {
    return <div className="page-content">Loading map...</div>
  }

  return (
    <div className="page-content map-page">
      <div className="page-header">
        <h1>Farm Map</h1>
      </div>

      {fetchError && (
        <div className="map-fetch-error">
          <span>{fetchError}</span>
          <button className="map-retry-btn" onClick={fetchMarkers}>Retry</button>
        </div>
      )}

      <div className="map-container">
        <div className="google-map-shell">
          {isLoaded && !mapUnavailableReason ? (
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={mapCenter}
              zoom={MAP_ZOOM}
              onLoad={(map) => {
                googleMapRef.current = map
              }}
              options={mapOptions}
            >
              {markers.map((marker) => (
                <MarkerF
                  key={marker.id}
                  position={{ lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }}
                  onClick={() => setSelectedMarker(marker)}
                />
              ))}
            </GoogleMap>
          ) : mapUnavailableReason ? (
            <div className="map-api-error">{mapUnavailableReason}</div>
          ) : (
            <div className="map-api-error">Loading Google Map...</div>
          )}
        </div>

        <div className="map-sidebar">
          <div className="farm-info">
            <h3>Farm-01</h3>
            <div className="stat">
              <span className="label">Total Number of Trees:</span>
              <span className="value">{markers.length}</span>
            </div>
            <div className="stat">
              <span className="label status-label status-label-healthy">
                <span className="status-dot" aria-hidden="true" />
                No Detected Diseases/Pests:
              </span>
              <span className="value">{markers.filter((marker) => !marker.hasDisease).length}</span>
            </div>
            <div className="stat">
              <span className="label status-label status-label-detected">
                <span className="status-dot" aria-hidden="true" />
                Detected Diseases/Pests:
              </span>
              <span className="value">{markers.filter((marker) => marker.hasDisease).length}</span>
            </div>
          </div>

          {selectedMarker && (
            <div className="tree-info">
              <h3>Coffee Tree Information</h3>
              <div className="info-row">
                <span className="label">Tree ID:</span>
                <span className="value">{selectedMarker.treeId || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Farm ID:</span>
                <span className="value">{selectedMarker.farmId || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Tree Type:</span>
                <span className="value">{selectedMarker.treeType || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Date Planted:</span>
                <span className="value">{selectedMarker.datePlanted || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Tree Age:</span>
                <span className="value">{getTreeAge(selectedMarker.datePlanted)}</span>
              </div>
              <div className="info-row">
                <span className="label">GPS Coordinates:</span>
                <span className="value">
                  {selectedMarker.coordinate.latitude.toFixed(6)}, {selectedMarker.coordinate.longitude.toFixed(6)}
                </span>
              </div>

              <h3 style={{ marginTop: '16px' }}>Inspection Result</h3>
              <div className="info-row">
                <span className="label">Disease/s Detected:</span>
                <span className="value">Placeholder</span>
              </div>
              <div className="info-row">
                <span className="label">Pest/s Detected:</span>
                <span className="value">Placeholder</span>
              </div>
              <div className="info-row">
                <span className="label">Leaf Chlorosis (Average):</span>
                <span className="value">Placeholder</span>
              </div>
              <div className="info-row">
                <span className="label">Date of Last Inspection:</span>
                <span className="value">{formatDate(selectedMarker.capturedAt)}</span>
              </div>

              <h3 style={{ marginTop: '16px' }}>Latest Images</h3>
              {selectedMarker.latestImages.length > 0 ? (
                <div className="image-grid">
                  {selectedMarker.latestImages.map((imageUrl, index) => (
                    <img key={`${selectedMarker.id}-${index}`} src={imageUrl} alt="Leaf" className="tree-image" />
                  ))}
                </div>
              ) : (
                <div className="image-placeholder">No images yet</div>
              )}
            </div>
          )}

          {!selectedMarker && (
            <div style={{ padding: '16px', color: '#999', textAlign: 'center' }}>
              Click on a marker to view tree details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
