import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Map.css";

const FARM_CENTER = { lat: 14.1976, lng: 120.884357 };
const MAP_ZOOM = 23;
const containerStyle = { width: "100%", height: "100%" };

function getMarkerColor(marker) {
  if (!marker?.isAnalyzed) {
    return "9E9E9E";
  }

  return marker.hasDisease ? "FF6600" : "4CAF50";
}

function darkenHexColor(hexColor, amount = 0.2) {
  const normalized = hexColor.replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return hexColor;
  }

  const num = Number.parseInt(normalized, 16);
  const r = Math.max(
    0,
    Math.min(255, Math.floor(((num >> 16) & 0xff) * (1 - amount))),
  );
  const g = Math.max(
    0,
    Math.min(255, Math.floor(((num >> 8) & 0xff) * (1 - amount))),
  );
  const b = Math.max(0, Math.min(255, Math.floor((num & 0xff) * (1 - amount))));

  return [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function getMarkerIconDataUrl(hexColor) {
  const innerColor = darkenHexColor(hexColor, 0.25);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="54" viewBox="0 0 38 54">
      <path d="M19 2C11.27 2 5 8.27 5 16c0 11.13 14 34 14 34s14-22.87 14-34C33 8.27 26.73 2 19 2z" fill="#${hexColor}" stroke="#ffffff" stroke-width="1"/>
      <circle cx="19" cy="16" r="7.5" fill="#${innerColor}" />
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeRawExif(rawExif) {
  if (!rawExif) {
    return {};
  }

  if (typeof rawExif === "string") {
    try {
      return JSON.parse(rawExif);
    } catch {
      return {};
    }
  }

  if (typeof rawExif === "object") {
    return rawExif;
  }

  return {};
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

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatProbability(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0%";
  }

  return `${Math.round(numericValue * 100)}%`;
}

function getStageWinner(probabilities) {
  if (!probabilities || typeof probabilities !== "object") {
    return null;
  }

  const entries = Object.entries(probabilities);
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce((bestEntry, currentEntry) =>
    currentEntry[1] > bestEntry[1] ? currentEntry : bestEntry,
  )[0];
}

function InspectionResultCard({ item, thumbnailUrl, onPreviewImage }) {
  const stage2Winner = getStageWinner(item.stage_2);
  const showStage2 = item.stage_1_result === "Unhealthy" && item.stage_2;
  const showStage3 = item.stage_3 && stage2Winner === "BSL";

  return (
    <div className="inspection-card">
      <div className="inspection-card-header">
        <div className="inspection-card-title">Image {item.image_index}</div>
        {thumbnailUrl ? (
          <button
            type="button"
            className="inspection-card-thumbnail-button"
            onClick={() => onPreviewImage?.(thumbnailUrl, item.image_index)}
            aria-label={`Open inspection image ${item.image_index}`}
          >
            <img
              src={thumbnailUrl}
              alt={`Inspection image ${item.image_index}`}
              className="inspection-card-thumbnail"
            />
          </button>
        ) : (
          <div className="inspection-card-thumbnail inspection-card-thumbnail-empty">
            No image
          </div>
        )}
      </div>

      <div className="inspection-card-result">
        Final result: <strong>{item.final_label || "-"}</strong>
      </div>
      <div className="inspection-card-chlorosis">
        Chlorosis:{" "}
        {Number.isFinite(Number(item.chlorosis_pct))
          ? `${Number(item.chlorosis_pct).toFixed(1)}%`
          : "0.0%"}
      </div>

      <div className="inspection-card-section">
        <div className="inspection-card-section-title">Stage 1</div>
        <div className="inspection-card-stage-value">
          {item.stage_1_result || "-"}
        </div>
      </div>

      {showStage2 && (
        <div className="inspection-card-section">
          <div className="inspection-card-section-title">Stage 2</div>
          <div className="inspection-card-bars">
            {Object.entries(item.stage_2).map(([label, probability]) => (
              <div key={label} className="inspection-bar-row">
                <span className="inspection-bar-label">{label}</span>
                <div className="inspection-bar-track">
                  <div
                    className="inspection-bar-fill"
                    style={{ width: formatProbability(probability) }}
                  />
                </div>
                <span className="inspection-bar-value">
                  {formatProbability(probability)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showStage3 && (
        <div className="inspection-card-section">
          <div className="inspection-card-section-title">Stage 3</div>
          <div className="inspection-card-bars">
            {Object.entries(item.stage_3).map(([label, probability]) => (
              <div key={label} className="inspection-bar-row">
                <span className="inspection-bar-label">{label}</span>
                <div className="inspection-bar-track">
                  <div
                    className="inspection-bar-fill"
                    style={{ width: formatProbability(probability) }}
                  />
                </div>
                <span className="inspection-bar-value">
                  {formatProbability(probability)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getTreeAge(datePlanted) {
  if (!datePlanted || datePlanted === "-") {
    return "-";
  }

  const parts = datePlanted.split("-");
  if (parts.length !== 3) {
    return "-";
  }

  const [month, day, year] = parts.map(Number);
  const plantedDate = new Date(year, month - 1, day);
  if (Number.isNaN(plantedDate.getTime())) {
    return "-";
  }

  const now = new Date();
  let years = now.getFullYear() - plantedDate.getFullYear();
  let months = now.getMonth() - plantedDate.getMonth();

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) {
    return "Less than a month";
  }

  if (years <= 0) {
    return `${months} month${months > 1 ? "s" : ""}`;
  }

  return `${years} year${years > 1 ? "s" : ""}${months > 0 ? ` ${months} month${months > 1 ? "s" : ""}` : ""}`;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCoordinate(tree, rawExif) {
  const latitudeCandidates = [
    tree.latitude,
    rawExif.latitude,
    rawExif.lat,
    rawExif.gps_latitude,
    rawExif.gpsLatitude,
  ];
  const longitudeCandidates = [
    tree.longitude,
    rawExif.longitude,
    rawExif.lng,
    rawExif.lon,
    rawExif.gps_longitude,
    rawExif.gpsLongitude,
  ];

  const latitude = latitudeCandidates
    .map(toFiniteNumber)
    .find((value) => value !== null);
  const longitude = longitudeCandidates
    .map(toFiniteNumber)
    .find((value) => value !== null);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

export default function MapPage() {
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [selectedInspectionImages, setSelectedInspectionImages] = useState([]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(MAP_ZOOM);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined;
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
  });
  const googleMapRef = useRef(null);

  const mapCenter = useMemo(() => FARM_CENTER, []);
  const mapOptions = useMemo(
    () => ({
      mapTypeId: "satellite",
      mapId,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    }),
    [mapId],
  );
  const mapUnavailableReason = !apiKey
    ? "Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY in your .env.local file."
    : loadError
      ? "Google Maps failed to load. Check your API key restrictions and billing setup, then refresh."
      : "";

  useEffect(() => {
    if (!selectedImage) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedMarker?.treeId) {
      setSelectedAnalysis(null);
      setSelectedInspectionImages([]);
      setInspectionLoading(false);
      return undefined;
    }

    let isCancelled = false;

    const fetchSelectedAnalysis = async () => {
      setInspectionLoading(true);
      try {
        const { data: analysisData, error: analysisError } = await supabase
          .from("analysis_results")
          .select(
            "inspection_date, diseases_detected, pests_detected, chlorosis_readings, image_ids, per_image_results, created_at",
          )
          .eq("tree_id", selectedMarker.treeId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (isCancelled) {
          return;
        }

        if (analysisError || !analysisData) {
          setSelectedAnalysis(null);
          setSelectedInspectionImages(selectedMarker.latestImages || []);
          return;
        }

        setSelectedAnalysis(analysisData);

        const imageIds = Array.isArray(analysisData.image_ids)
          ? analysisData.image_ids
          : [];

        if (imageIds.length === 0) {
          setSelectedInspectionImages(selectedMarker.latestImages || []);
          return;
        }

        const { data: imageRows, error: imageError } = await supabase
          .from("images")
          .select("id, file_path")
          .in("id", imageIds);

        if (isCancelled) {
          return;
        }

        if (imageError || !imageRows) {
          setSelectedInspectionImages(selectedMarker.latestImages || []);
          return;
        }

        const urls = imageIds
          .map((id) => imageRows.find((row) => String(row.id) === String(id)))
          .filter(Boolean)
          .map(
            (row) =>
              supabase.storage.from("leafImages").getPublicUrl(row.file_path)
                .data.publicUrl,
          );

        setSelectedInspectionImages(urls);
      } catch (error) {
        if (!isCancelled) {
          setSelectedAnalysis(null);
          setSelectedInspectionImages(selectedMarker.latestImages || []);
        }
      } finally {
        if (!isCancelled) {
          setInspectionLoading(false);
        }
      }
    };

    fetchSelectedAnalysis();

    return () => {
      isCancelled = true;
    };
  }, [selectedMarker]);

  const fetchMarkers = useCallback(async (showLoader = true) => {
    try {
      setFetchError(null);
      if (showLoader) {
        setLoading(true);
      }

      const withTreeColumnsSelect =
        "id, latitude, longitude, raw_exif, farm_id, captured_at, image_id, tree_id, tree_type, date_planted";
      const legacySelect =
        "id, latitude, longitude, raw_exif, farm_id, captured_at, image_id";

      let data = null;
      let error = null;

      const attempts = [
        () =>
          supabase
            .from("geotags")
            .select(withTreeColumnsSelect)
            .order("captured_at", { ascending: false }),
        () =>
          supabase
            .from("geotags")
            .select(legacySelect)
            .order("captured_at", { ascending: false }),
        () => supabase.from("geotags").select(withTreeColumnsSelect),
        () => supabase.from("geotags").select(legacySelect),
      ];

      for (const runAttempt of attempts) {
        const result = await runAttempt();
        data = result.data;
        error = result.error;
        if (!error) {
          break;
        }
      }

      if (error) throw error;

      const groupedByTree = new globalThis.Map();
      for (const tree of data || []) {
        const rawExif = normalizeRawExif(tree.raw_exif);
        const coordinate = resolveCoordinate(tree, rawExif);
        if (!coordinate) {
          continue;
        }

        const resolvedTreeId =
          tree.tree_id || rawExif.tree_id || rawExif.treeId || tree.id;
        const resolvedTreeType =
          tree.tree_type || rawExif.tree_type || rawExif.treeType || "Unknown";
        const resolvedDatePlanted =
          tree.date_planted ||
          rawExif.date_planted ||
          rawExif.datePlanted ||
          "-";

        const imageIds = Array.isArray(rawExif.image_ids)
          ? rawExif.image_ids
          : Array.isArray(rawExif.imageIds)
            ? rawExif.imageIds
            : tree.image_id
              ? [tree.image_id]
              : [];

        const key = String(resolvedTreeId || tree.id);
        const current = groupedByTree.get(key) || [];
        const hasDiseaseRaw =
          rawExif.has_disease !== undefined
            ? rawExif.has_disease
            : rawExif.hasDisease;

        current.push({
          rowId: tree.id,
          coordinate,
          hasDisease: Boolean(hasDiseaseRaw),
          isAnalyzed: hasDiseaseRaw !== undefined,
          treeId: String(resolvedTreeId),
          treeType: String(resolvedTreeType),
          datePlanted: String(resolvedDatePlanted),
          capturedAt: tree.captured_at || "",
          farmId: tree.farm_id || "-",
          imageIds,
        });
        groupedByTree.set(key, current);
      }

      const treeMarkers = Array.from(groupedByTree.values()).map((rows) => {
        const sortedRows = [...rows].sort(
          (a, b) =>
            new Date(b.capturedAt || 0).getTime() -
            new Date(a.capturedAt || 0).getTime(),
        );

        const latest = sortedRows[0];

        return {
          id: latest.rowId,
          coordinate: latest.coordinate,
          hasDisease: latest.hasDisease,
          treeId: latest.treeId,
          treeType: latest.treeType,
          datePlanted: latest.datePlanted,
          capturedAt: latest.capturedAt,
          farmId: latest.farmId,
          imageIds: latest.imageIds,
          latestImages: [],
          monitoringCount: sortedRows.length,
        };
      });

      let analysisByTreeId = new globalThis.Map();
      try {
        const { data: analysisRows, error: analysisError } = await supabase
          .from("analysis_results")
          .select(
            "id, tree_id, diseases_detected, pests_detected, chlorosis_readings, inspection_date, created_at, image_ids",
          )
          .order("created_at", { ascending: false });

        if (!analysisError) {
          for (const analysis of analysisRows || []) {
            const treeId = String(analysis.tree_id || "");
            if (!treeId || analysisByTreeId.has(treeId)) {
              continue;
            }

            analysisByTreeId.set(treeId, analysis);
          }
        }
      } catch (analysisFetchError) {
        console.warn("Error fetching analysis results:", analysisFetchError);
      }

      // Match mobile behavior: latest card images come from latest analysis row image_ids.
      // Fallback to geotag imageIds only when latest analysis has no image_ids.
      const latestAnalysisImageIds = Array.from(
        new Set(
          Array.from(analysisByTreeId.values())
            .flatMap((analysis) =>
              Array.isArray(analysis?.image_ids) ? analysis.image_ids : [],
            )
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );
      const fallbackGeotagImageIds = Array.from(
        new Set(
          treeMarkers
            .flatMap((marker) => marker.imageIds)
            .filter(Boolean)
            .map((id) => String(id)),
        ),
      );

      const allCandidateImageIds = Array.from(
        new Set([...latestAnalysisImageIds, ...fallbackGeotagImageIds]),
      );

      let imageById = new globalThis.Map();
      if (allCandidateImageIds.length > 0) {
        try {
          const { data: imageRows, error: imageError } = await supabase
            .from("images")
            .select("id, file_path")
            .in("id", allCandidateImageIds);

          if (imageError) {
            console.warn("Error fetching images:", imageError);
          } else {
            imageById = new globalThis.Map(
              (imageRows || [])
                .filter((row) => Boolean(row?.id) && Boolean(row?.file_path))
                .map((row) => [String(row.id), { file_path: row.file_path }]),
            );
          }
        } catch (imageQueryError) {
          console.warn("Error fetching images:", imageQueryError);
        }
      }

      const markersWithAnalysis = treeMarkers.map((marker) => {
        const latestAnalysis =
          analysisByTreeId.get(String(marker.treeId)) || null;
        const orderedImageIds =
          Array.isArray(latestAnalysis?.image_ids) &&
          latestAnalysis.image_ids.length > 0
            ? latestAnalysis.image_ids
            : marker.imageIds;

        const latestImages = orderedImageIds
          .map((id) => imageById.get(String(id)))
          .filter((value) => Boolean(value?.file_path))
          .map(
            (image) =>
              supabase.storage.from("leafImages").getPublicUrl(image.file_path)
                .data.publicUrl,
          );

        const latestHasDisease =
          Boolean(latestAnalysis) &&
          ((Array.isArray(latestAnalysis.diseases_detected) &&
            latestAnalysis.diseases_detected.length > 0) ||
            (Array.isArray(latestAnalysis.pests_detected) &&
              latestAnalysis.pests_detected.length > 0));

        return {
          ...marker,
          latestAnalysis,
          latestImages,
          hasDisease: latestAnalysis ? latestHasDisease : marker.hasDisease,
          isAnalyzed: Boolean(latestAnalysis) || marker.isAnalyzed,
        };
      });

      setMarkers(markersWithAnalysis);

      setSelectedMarker((previousSelected) => {
        if (!previousSelected) {
          return previousSelected;
        }

        return (
          markersWithAnalysis.find(
            (marker) =>
              String(marker.treeId) === String(previousSelected.treeId),
          ) || null
        );
      });
    } catch (error) {
      console.error("Error fetching markers:", error);
      const message = String(error?.message || error || "Unknown error");
      const isNetworkError =
        /network request failed|failed to fetch|fetch/i.test(message);
      setFetchError(
        isNetworkError
          ? "Cannot reach the database right now. Check internet and Supabase config, then retry."
          : `Failed to load map trees: ${message}`,
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMarkers(true);

    const geotagsChannel = supabase
      .channel("web-geotags-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "geotags" },
        (payload) => {
          console.log("Geotags updated:", payload);
          fetchMarkers(false);
        },
      )
      .subscribe();

    const analysisChannel = supabase
      .channel("web-analysis-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_results" },
        (payload) => {
          console.log("Analysis results updated:", payload);
          fetchMarkers(false);
        },
      )
      .subscribe();

    const imagesChannel = supabase
      .channel("web-images-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "images" },
        (payload) => {
          console.log("Images updated:", payload);
          fetchMarkers(false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(geotagsChannel);
      supabase.removeChannel(analysisChannel);
      supabase.removeChannel(imagesChannel);
    };
  }, [fetchMarkers]);

  if (loading) {
    return <div className="page-content">Loading map...</div>;
  }

  const getMarkerSizeByZoom = (zoom) => {
    if (zoom >= 23) {
      return { width: 14, height: 20 };
    }
    if (zoom >= 21) {
      return { width: 16, height: 23 };
    }
    if (zoom >= 19) {
      return { width: 19, height: 27 };
    }
    return { width: 22, height: 31 };
  };

  return (
    <div className="page-content map-page">
      <div className="page-header">
        <h1>Farm Map</h1>
      </div>

      {fetchError && (
        <div className="map-fetch-error">
          <span>{fetchError}</span>
          <button className="map-retry-btn" onClick={fetchMarkers}>
            Retry
          </button>
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
                googleMapRef.current = map;
                const zoom = map.getZoom();
                if (Number.isFinite(zoom)) {
                  setCurrentZoom(zoom);
                }
              }}
              onZoomChanged={() => {
                const zoom = googleMapRef.current?.getZoom();
                if (Number.isFinite(zoom)) {
                  setCurrentZoom(zoom);
                }
              }}
              options={mapOptions}
            >
              {markers.map((marker) => {
                const markerColor = getMarkerColor(marker);
                const markerSize = getMarkerSizeByZoom(currentZoom);
                const icon = {
                  url: getMarkerIconDataUrl(markerColor),
                  scaledSize: new window.google.maps.Size(
                    markerSize.width,
                    markerSize.height,
                  ),
                  anchor: new window.google.maps.Point(
                    markerSize.width / 2,
                    markerSize.height,
                  ),
                };
                return (
                  <MarkerF
                    key={marker.id}
                    position={{
                      lat: marker.coordinate.latitude,
                      lng: marker.coordinate.longitude,
                    }}
                    onClick={() => setSelectedMarker(marker)}
                    icon={icon}
                  />
                );
              })}
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
              <span className="value">
                {markers.filter((marker) => !marker.hasDisease).length}
              </span>
            </div>
            <div className="stat">
              <span className="label status-label status-label-detected">
                <span className="status-dot" aria-hidden="true" />
                Detected Diseases/Pests:
              </span>
              <span className="value">
                {markers.filter((marker) => marker.hasDisease).length}
              </span>
            </div>
          </div>

          {selectedMarker && (
            <div className="tree-info">
              <h3>Coffee Tree Information</h3>
              <div className="info-row">
                <span className="label">Tree ID:</span>
                <span className="value">{selectedMarker.treeId || "-"}</span>
              </div>
              <div className="info-row">
                <span className="label">Farm ID:</span>
                <span className="value">{selectedMarker.farmId || "-"}</span>
              </div>
              <div className="info-row">
                <span className="label">Tree Type:</span>
                <span className="value">{selectedMarker.treeType || "-"}</span>
              </div>
              <div className="info-row">
                <span className="label">Date Planted:</span>
                <span className="value">
                  {selectedMarker.datePlanted || "-"}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Tree Age:</span>
                <span className="value">
                  {getTreeAge(selectedMarker.datePlanted)}
                </span>
              </div>
              <div className="info-row">
                <span className="label">GPS Coordinates:</span>
                <span className="value">
                  {selectedMarker.coordinate.latitude.toFixed(6)},{" "}
                  {selectedMarker.coordinate.longitude.toFixed(6)}
                </span>
              </div>

              <h3 style={{ marginTop: "16px" }}>
                Latest Inspection: {formatDate(selectedMarker.capturedAt)}
              </h3>
              {!inspectionLoading && !selectedMarker.isAnalyzed && (
                <div className="info-row info-row-not-analyzed">
                  <span className="label">Status:</span>
                  <span className="value">Not Yet Analyzed</span>
                </div>
              )}
              {inspectionLoading ? (
                <div className="image-placeholder">
                  Loading latest inspection...
                </div>
              ) : selectedAnalysis?.per_image_results &&
                selectedAnalysis.per_image_results.length > 0 ? (
                <>
                  <div className="analysis-cards">
                    {selectedAnalysis.per_image_results.map((item, idx) => {
                      const requestedIndex = Number(item.image_index) - 1;
                      let thumb = undefined;
                      if (Array.isArray(selectedInspectionImages)) {
                        if (
                          Number.isFinite(requestedIndex) &&
                          selectedInspectionImages[requestedIndex]
                        ) {
                          thumb = selectedInspectionImages[requestedIndex];
                        } else if (selectedInspectionImages[idx]) {
                          thumb = selectedInspectionImages[idx];
                        }
                      }

                      return (
                        <InspectionResultCard
                          key={`${selectedMarker.id}-img-${item.image_index}`}
                          item={item}
                          thumbnailUrl={thumb}
                          onPreviewImage={(src, imageIndex) =>
                            setSelectedImage({
                              src,
                              alt: `Inspection image ${imageIndex}`,
                            })
                          }
                        />
                      );
                    })}
                  </div>

                  {selectedInspectionImages &&
                    selectedInspectionImages.length > 0 && (
                      <>
                        <h3 style={{ marginTop: "16px" }}>Latest Images</h3>
                        <div className="image-grid latest-image-grid">
                          {selectedInspectionImages.map((imageUrl, index) => (
                            <button
                              key={`${selectedMarker.id}-${index}`}
                              type="button"
                              className="tree-image-button latest-image-button"
                              onClick={() =>
                                setSelectedImage({
                                  src: imageUrl,
                                  alt: `Leaf ${index + 1}`,
                                })
                              }
                            >
                              <img
                                src={imageUrl}
                                alt={`Leaf ${index + 1}`}
                                className="tree-image latest-image"
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                </>
              ) : selectedInspectionImages &&
                selectedInspectionImages.length > 0 ? (
                <div className="image-grid">
                  {selectedInspectionImages.map((imageUrl, index) => (
                    <button
                      key={`${selectedMarker.id}-${index}`}
                      type="button"
                      className="tree-image-button"
                      onClick={() =>
                        setSelectedImage({
                          src: imageUrl,
                          alt: `Leaf ${index + 1}`,
                        })
                      }
                    >
                      <img
                        src={imageUrl}
                        alt={`Leaf ${index + 1}`}
                        className="tree-image"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="image-placeholder">
                  No latest images available
                </div>
              )}
            </div>
          )}

          {!selectedMarker && (
            <div
              style={{ padding: "16px", color: "#999", textAlign: "center" }}
            >
              Click on a marker to view tree details
            </div>
          )}
        </div>
      </div>

      {selectedImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="image-lightbox-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setSelectedImage(null)}
            >
              Close
            </button>
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="image-lightbox-image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
