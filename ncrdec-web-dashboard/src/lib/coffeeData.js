import { supabase } from './supabase'

const WITH_TREE_COLUMNS_SELECT = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id, tree_id, tree_type, date_planted'
const LEGACY_SELECT = 'id, latitude, longitude, raw_exif, farm_id, captured_at, image_id'
const ANALYSIS_SELECT = 'id, tree_id, farm_id, geotag_id, inspection_date, diseases_detected, pests_detected, confidence, chlorosis_readings, image_ids, created_at'

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

function toDateTime(value) {
  if (!value) {
    return 0
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function toDateKey(value) {
  if (!value) {
    return ''
  }

  const time = new Date(value).getTime()
  if (Number.isNaN(time)) {
    return ''
  }

  return new Date(time).toISOString().slice(0, 10)
}

function getTreeKey(row, rawExif) {
  return String(row.tree_id || rawExif.tree_id || rawExif.treeId || row.id)
}

function getCompositeTreeKey(farmId, treeId) {
  return `${String(farmId || '01')}::${String(treeId || '')}`
}

function extractImageIds(row, rawExif) {
  if (Array.isArray(rawExif.image_ids)) {
    return rawExif.image_ids.filter(Boolean)
  }

  if (Array.isArray(rawExif.imageIds)) {
    return rawExif.imageIds.filter(Boolean)
  }

  if (row.image_id) {
    return [row.image_id]
  }

  return []
}

async function fetchGeotags({ farmId } = {}) {
  const attempts = [
    () => supabase.from('geotags').select(WITH_TREE_COLUMNS_SELECT).order('captured_at', { ascending: false }),
    () => supabase.from('geotags').select(LEGACY_SELECT).order('captured_at', { ascending: false }),
    () => supabase.from('geotags').select(WITH_TREE_COLUMNS_SELECT),
    () => supabase.from('geotags').select(LEGACY_SELECT),
  ]

  let data = null
  let error = null

  for (const attempt of attempts) {
    const result = await attempt()
    data = result.data
    error = result.error
    if (!error) {
      break
    }
  }

  if (error) {
    throw error
  }

  const rows = (data || []).filter((row) => {
    if (!farmId) {
      return true
    }

    const rawExif = normalizeRawExif(row.raw_exif)
    return String(row.farm_id || rawExif.farm_id || '') === String(farmId)
  })

  return rows
}

function buildLatestTrees(rows) {
  const latestByTree = new Map()

  for (const row of rows || []) {
    const rawExif = normalizeRawExif(row.raw_exif)
    const farmId = String(row.farm_id || rawExif.farm_id || '01')
    const treeId = getTreeKey(row, rawExif)
    const capturedAt = row.captured_at || ''
    const hasDisease = Boolean(rawExif.has_disease || rawExif.hasDisease || false)
    const latitude = Number(row.latitude || rawExif.latitude || rawExif.lat || rawExif.gps_latitude || rawExif.gpsLatitude || 0)
    const longitude = Number(row.longitude || rawExif.longitude || rawExif.lng || rawExif.lon || rawExif.gps_longitude || rawExif.gpsLongitude || 0)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue
    }

    const current = {
      rowId: row.id,
      farmId,
      treeId,
      treeKey: getCompositeTreeKey(farmId, treeId),
      treeType: String(row.tree_type || rawExif.tree_type || rawExif.treeType || 'Unknown'),
      datePlanted: String(row.date_planted || rawExif.date_planted || rawExif.datePlanted || '-'),
      capturedAt,
      hasDisease,
      coordinate: { latitude, longitude },
      imageIds: extractImageIds(row, rawExif),
    }

    const mapKey = getCompositeTreeKey(farmId, treeId)
    const existing = latestByTree.get(mapKey)
    if (!existing || toDateTime(current.capturedAt) >= toDateTime(existing.capturedAt)) {
      latestByTree.set(mapKey, current)
    }
  }

  return Array.from(latestByTree.values()).sort((a, b) => toDateTime(b.capturedAt) - toDateTime(a.capturedAt))
}

function summarizeFarms(trees) {
  const summaryMap = new Map()

  for (const tree of trees || []) {
    const existing = summaryMap.get(tree.farmId) || {
      farmId: tree.farmId,
      farmName: `Farm-${tree.farmId}`,
      totalTrees: 0,
      healthyTrees: 0,
      diseasedTrees: 0,
    }

    existing.totalTrees += 1
    if (tree.hasDisease) {
      existing.diseasedTrees += 1
    } else {
      existing.healthyTrees += 1
    }

    summaryMap.set(tree.farmId, existing)
  }

  return Array.from(summaryMap.values()).sort((a, b) => a.farmId.localeCompare(b.farmId, undefined, { numeric: true, sensitivity: 'base' }))
}

async function fetchAnalysisRows(treeIds = []) {
  const { data, error } = await supabase
    .from('analysis_results')
    .select(ANALYSIS_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    const message = String(error.message || '')
    if (/does not exist|not found|analysis_results/i.test(message)) {
      return []
    }

    throw error
  }

  const rows = data || []
  if (!treeIds.length) {
    return rows
  }

  const treeIdSet = new Set(treeIds.map(String))
  return rows.filter((row) => treeIdSet.has(String(row.tree_id || '')))
}

function buildLatestAnalysisByTree(analysisRows) {
  const latestByTree = new Map()

  for (const row of analysisRows || []) {
    const treeId = String(row.tree_id || '')
    if (!treeId) {
      continue
    }

    const existing = latestByTree.get(treeId)
    if (!existing || toDateTime(row.created_at || row.inspection_date) >= toDateTime(existing.created_at || existing.inspection_date)) {
      latestByTree.set(treeId, row)
    }
  }

  return latestByTree
}

async function fetchImageUrls(imageIds = []) {
  const uniqueImageIds = Array.from(new Set((imageIds || []).filter(Boolean)))
  if (!uniqueImageIds.length) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('images')
    .select('id, file_path, uploaded_at')
    .in('id', uniqueImageIds)

  if (error) {
    throw error
  }

  return new Map((data || []).map((row) => [
    row.id,
    {
      file_path: row.file_path,
      uploaded_at: row.uploaded_at,
    },
  ]))
}

export async function loadDashboardData() {
  const geotagRows = await fetchGeotags()
  const latestTrees = buildLatestTrees(geotagRows)
  const analysisRows = await fetchAnalysisRows(latestTrees.map((tree) => tree.treeId))
  const latestAnalysisByTree = buildLatestAnalysisByTree(analysisRows)

  return {
    geotagRows,
    latestTrees,
    farmSummaries: summarizeFarms(latestTrees),
    latestAnalysisByTree,
    latestInspection: analysisRows[0] || null,
  }
}

export async function loadRecordsData() {
  const geotagRows = await fetchGeotags()
  const latestTrees = buildLatestTrees(geotagRows)
  const latestTreeById = new Map(latestTrees.map((tree) => [String(tree.treeId || ''), tree]))
  const analysisRows = await fetchAnalysisRows(latestTrees.map((tree) => tree.treeId))
  const latestAnalysisByTree = buildLatestAnalysisByTree(analysisRows)
  const analysisByGeotagId = new Map()
  const analysisByTreeId = new Map()

  for (const analysis of analysisRows || []) {
    if (analysis.geotag_id !== null && analysis.geotag_id !== undefined) {
      analysisByGeotagId.set(String(analysis.geotag_id), analysis)
    }

    const treeId = String(analysis.tree_id || '')
    if (!treeId) {
      continue
    }

    const current = analysisByTreeId.get(treeId) || []
    current.push(analysis)
    analysisByTreeId.set(treeId, current)
  }

  for (const [treeId, rows] of analysisByTreeId.entries()) {
    rows.sort((a, b) => toDateTime(b.created_at || b.inspection_date) - toDateTime(a.created_at || a.inspection_date))
    analysisByTreeId.set(treeId, rows)
  }

  const allImageIds = Array.from(new Set([
    ...geotagRows.flatMap((row) => {
      const rawExif = normalizeRawExif(row.raw_exif)
      return extractImageIds(row, rawExif)
    }).filter(Boolean),
    ...(analysisRows || []).flatMap((analysis) => Array.isArray(analysis?.image_ids) ? analysis.image_ids : []).filter(Boolean),
  ]))
  const imageById = await fetchImageUrls(allImageIds)

  const historyByTreeKey = new Map()
  for (const row of geotagRows) {
    const rawExif = normalizeRawExif(row.raw_exif)
    const farmId = String(row.farm_id || rawExif.farm_id || '01')
    const treeId = getTreeKey(row, rawExif)
    const treeKey = getCompositeTreeKey(farmId, treeId)

    const latitude = Number(row.latitude || rawExif.latitude || rawExif.lat || rawExif.gps_latitude || rawExif.gpsLatitude)
    const longitude = Number(row.longitude || rawExif.longitude || rawExif.lng || rawExif.lon || rawExif.gps_longitude || rawExif.gpsLongitude)
    const geotagImageIds = extractImageIds(row, rawExif)

    const linkedByGeotag = analysisByGeotagId.get(String(row.id)) || null
    const linkedByDate = (analysisByTreeId.get(treeId) || []).find((analysis) => {
      return toDateKey(analysis.inspection_date || analysis.created_at) === toDateKey(row.captured_at)
    }) || null
    const monitoringAnalysis = linkedByGeotag || linkedByDate || null

    // Match mobile behavior: display images from this monitoring's analysis.image_ids first.
    const eventImageIds = Array.isArray(monitoringAnalysis?.image_ids) && monitoringAnalysis.image_ids.length > 0
      ? monitoringAnalysis.image_ids
      : geotagImageIds
    const imageUrls = eventImageIds
      .map((imageId) => imageById.get(imageId))
      .filter((value) => Boolean(value?.file_path))
      .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl)

    const event = {
      id: row.id,
      capturedAt: row.captured_at || '',
      hasDisease: Boolean(rawExif.has_disease || rawExif.hasDisease || false),
      analysis: monitoringAnalysis,
      coordinate: {
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
      },
      imageUrls,
      imageCount: imageUrls.length,
    }

    const current = historyByTreeKey.get(treeKey) || []
    current.push(event)
    historyByTreeKey.set(treeKey, current)
  }

  for (const [treeKey, events] of historyByTreeKey.entries()) {
    events.sort((a, b) => toDateTime(b.capturedAt) - toDateTime(a.capturedAt))
    historyByTreeKey.set(treeKey, events)
  }

  // For update flows that only create analysis_results (no new geotag row),
  // add synthetic history events so the newest inspection still appears in Records.
  for (const [treeId, rows] of analysisByTreeId.entries()) {
    const tree = latestTreeById.get(String(treeId || ''))
    if (!tree) {
      continue
    }

    const treeHistory = historyByTreeKey.get(tree.treeKey) || []
    console.log(`Processing tree ${treeId}: has ${rows.length} analyses, history currently has ${treeHistory.length} events`)

    for (const analysis of rows) {
      console.log(`  Checking analysis ${analysis.id} (date: ${analysis.inspection_date || analysis.created_at})`)
      const alreadyLinked = treeHistory.some((event) => {
        // Check if analysis is already in history by ID
        if (String(event.analysis?.id || '') === String(analysis.id || '')) {
          console.log(`    -> Already linked by ID`)
          return true
        }

        // Check if analysis is linked via geotag_id
        if (analysis.geotag_id !== null && analysis.geotag_id !== undefined) {
          const matches = String(event.id) === String(analysis.geotag_id)
          if (matches) console.log(`    -> Already linked by geotag_id`)
          return matches
        }

        // Don't use date matching - multiple analyses can have the same date
        return false
      })

      if (alreadyLinked) {
        console.log(`    SKIPPED - already linked`)
        continue
      }
      console.log(`    ADDING as synthetic event`)

      const eventImageIds = Array.isArray(analysis?.image_ids) ? analysis.image_ids : []
      const imageUrls = eventImageIds
        .map((imageId) => imageById.get(imageId))
        .filter((value) => Boolean(value?.file_path))
        .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl)

      treeHistory.push({
        id: `analysis-${analysis.id}`,
        capturedAt: analysis.inspection_date || analysis.created_at || '',
        hasDisease: (Array.isArray(analysis?.diseases_detected) && analysis.diseases_detected.length > 0)
          || (Array.isArray(analysis?.pests_detected) && analysis.pests_detected.length > 0),
        analysis,
        coordinate: {
          latitude: tree.coordinate?.latitude ?? null,
          longitude: tree.coordinate?.longitude ?? null,
        },
        imageUrls,
        imageCount: imageUrls.length,
      })
      console.log(`    ADDED synthetic event for analysis ${analysis.id}`)
    }

    treeHistory.sort((a, b) => toDateTime(b.analysis?.created_at || b.analysis?.inspection_date || b.capturedAt) - toDateTime(a.analysis?.created_at || a.analysis?.inspection_date || a.capturedAt))
    historyByTreeKey.set(tree.treeKey, treeHistory)
    console.log(`  Final history for tree ${treeId}: ${treeHistory.length} events`)
  }

  console.log(`loadRecordsData: returning ${latestTrees.length} trees`)
  return latestTrees.map((tree) => ({
    ...(function resolveTreeRecord() {
      const treeHistory = historyByTreeKey.get(tree.treeKey) || []
      console.log(`  Tree ${tree.treeId}: history.length = ${treeHistory.length}`)
      const latestAnalysis = latestAnalysisByTree.get(tree.treeId) || null
      const latestImageIds = Array.isArray(latestAnalysis?.image_ids) && latestAnalysis.image_ids.length > 0
        ? latestAnalysis.image_ids
        : []
      const latestImages = latestImageIds.length > 0
        ? latestImageIds
          .map((imageId) => imageById.get(imageId))
          .filter((value) => Boolean(value?.file_path))
          .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl)
        : (treeHistory[0]?.imageUrls || [])

      return {
        ...tree,
        latestAnalysis,
        latestImages,
        history: treeHistory,
      }
    })(),
  }))
}

export async function loadMapMarkers() {
  const geotagRows = await fetchGeotags()
  const latestTrees = buildLatestTrees(geotagRows)
  const allImageIds = Array.from(new Set(latestTrees.flatMap((tree) => tree.imageIds).filter(Boolean)))
  const imageById = await fetchImageUrls(allImageIds)
  const analysisRows = await fetchAnalysisRows(latestTrees.map((tree) => tree.treeId))
  const latestAnalysisByTree = buildLatestAnalysisByTree(analysisRows)

  return latestTrees.map((tree) => {
    const latestImages = tree.imageIds
      .map((imageId) => imageById.get(imageId))
      .filter((value) => Boolean(value?.file_path))
      .sort((a, b) => toDateTime(b.uploaded_at || 0) - toDateTime(a.uploaded_at || 0))
      .map((image) => supabase.storage.from('leafImages').getPublicUrl(image.file_path).data.publicUrl)

    return {
      ...tree,
      title: tree.treeId ? `Tree ${tree.treeId}` : `Tree ${tree.rowId}`,
      latestAnalysis: latestAnalysisByTree.get(tree.treeId) || null,
      latestImages,
    }
  })
}

export function getTreeAge(datePlanted) {
  if (!datePlanted || datePlanted === '-') {
    return '-'
  }

  const parts = String(datePlanted).split('-')
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

export function formatDate(value) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString()
}