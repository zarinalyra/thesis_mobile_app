import { useEffect, useState } from "react";
import { formatDate, getTreeAge, loadRecordsData } from "../lib/coffeeData";
import { supabase } from "../lib/supabase";
import "./Records.css";

function renderDetectedList(values) {
  return Array.isArray(values) && values.length > 0
    ? values.join(", ")
    : "None";
}

function getOrdinalLabel(index) {
  const number = index + 1;
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${number}th`;
  }

  const mod10 = number % 10;
  if (mod10 === 1) return `${number}st`;
  if (mod10 === 2) return `${number}nd`;
  if (mod10 === 3) return `${number}rd`;
  return `${number}th`;
}

function getChlorosisLines(analysis) {
  const readings = analysis?.chlorosis_readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    return [];
  }

  return readings.map((reading, index) => {
    const imageNumber = Number(reading?.image_id);
    const label =
      Number.isFinite(imageNumber) && imageNumber > 0 ? imageNumber : index + 1;
    const value = Number(reading?.chlorosis_percentage);
    const percentage = Number.isFinite(value) ? `${value.toFixed(2)}%` : "N/A";
    return `Image ${label}: ${percentage}`;
  });
}

export default function Records() {
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTree, setSelectedTree] = useState(null);
  const [selectedMonitoring, setSelectedMonitoring] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    try {
      const treeRecords = await loadRecordsData();
      setRecords(treeRecords);

      setSelectedTree((previousTree) => {
        if (!previousTree) {
          return previousTree;
        }

        const updatedTree =
          treeRecords.find(
            (record) => String(record.treeId) === String(previousTree.treeId),
          ) || null;

        setSelectedMonitoring((previousMonitoring) => {
          if (!previousMonitoring || !updatedTree) {
            return previousMonitoring && !updatedTree
              ? null
              : previousMonitoring;
          }

          return (
            updatedTree.history?.find(
              (item) => String(item.id) === String(previousMonitoring.id),
            ) || null
          );
        });

        return updatedTree;
      });
    } catch (error) {
      console.error("Error fetching records:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();

    const geotagsChannel = supabase
      .channel("web-records-geotags")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "geotags" },
        (payload) => {
          console.log("Geotags updated - refreshing records:", payload);
          fetchRecords();
        },
      )
      .subscribe();

    const analysisChannel = supabase
      .channel("web-records-analysis")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_results" },
        (payload) => {
          console.log(
            "Analysis results updated - refreshing records:",
            payload,
          );
          fetchRecords();
        },
      )
      .subscribe();

    const imagesChannel = supabase
      .channel("web-records-images")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "images" },
        (payload) => {
          console.log("Images updated - refreshing records:", payload);
          fetchRecords();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(geotagsChannel);
      supabase.removeChannel(analysisChannel);
      supabase.removeChannel(imagesChannel);
    };
  }, []);

  const filteredRecords = records.filter((record) =>
    (record.treeId || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  useEffect(() => {
    if (selectedTree) {
      console.log(`Selected Tree: ${selectedTree.treeId}`);
      console.log(`History length: ${selectedTree.history?.length || 0}`);
      console.log(`Full history:`, selectedTree.history);
    }
  }, [selectedTree]);

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

  if (loading) {
    return <div className="page-content">Loading...</div>;
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
                    key={record.rowId}
                    onClick={() => {
                      setSelectedTree(record);
                      setSelectedMonitoring(null);
                    }}
                    className={
                      selectedTree?.rowId === record.rowId ? "active" : ""
                    }
                  >
                    <td>{record.treeId || "-"}</td>
                    <td>{record.farmId || "-"}</td>
                    <td>{record.treeType || "-"}</td>
                    <td>{record.datePlanted || "-"}</td>
                    <td>{getTreeAge(record.datePlanted)}</td>
                    <td>
                      {record.coordinate.latitude.toFixed(4)},{" "}
                      {record.coordinate.longitude.toFixed(4)}
                    </td>
                    <td>
                      <button className="view-btn">View</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="no-data">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedTree && (
          <div className="tree-details-panel">
            <h3>Tree ID: {selectedTree.treeId || "-"}</h3>

            <div className="details-section">
              <h4>Monitoring History</h4>
              {selectedTree.history?.length ? (
                <div className="monitoring-table-wrap">
                  <table className="monitoring-table">
                    <thead>
                      <tr>
                        <th>Record</th>
                        <th>Inspection Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTree.history.map((item, index) => {
                        const totalRecords = selectedTree.history.length;
                        const recordNumber = totalRecords - index;
                        return (
                          <tr
                            key={`${selectedTree.rowId}-history-${item.id}`}
                            className={
                              selectedMonitoring?.id === item.id ? "active" : ""
                            }
                          >
                            <td>{getOrdinalLabel(recordNumber - 1)} Record</td>
                            <td>
                              <button
                                className="history-date-btn"
                                onClick={() => setSelectedMonitoring(item)}
                              >
                                {formatDate(
                                  item.analysis?.inspection_date ||
                                    item.analysis?.created_at ||
                                    item.capturedAt,
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="history-empty">No monitoring history yet.</div>
              )}
            </div>

            {selectedMonitoring && (
              <>
                <div className="details-section">
                  <h4>Coffee Tree Information</h4>
                  <div className="detail-row">
                    <span className="label">Tree ID:</span>
                    <span className="value">{selectedTree.treeId || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Farm ID:</span>
                    <span className="value">{selectedTree.farmId || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Tree Type:</span>
                    <span className="value">
                      {selectedTree.treeType || "-"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Date Planted:</span>
                    <span className="value">
                      {selectedTree.datePlanted || "-"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Tree Age:</span>
                    <span className="value">
                      {getTreeAge(selectedTree.datePlanted)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">GPS Coordinates:</span>
                    <span className="value">
                      {selectedMonitoring.coordinate?.latitude !== null &&
                      selectedMonitoring.coordinate?.longitude !== null
                        ? `${selectedMonitoring.coordinate.latitude.toFixed(6)}, ${selectedMonitoring.coordinate.longitude.toFixed(6)}`
                        : `${selectedTree.coordinate.latitude.toFixed(6)}, ${selectedTree.coordinate.longitude.toFixed(6)}`}
                    </span>
                  </div>
                </div>

                <div className="details-section">
                  <h4>Inspection Result</h4>
                  <div className="detail-row">
                    <span className="label">Disease/s Detected:</span>
                    <span className="value">
                      {renderDetectedList(
                        selectedMonitoring.analysis?.diseases_detected,
                      )}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Pest/s Detected:</span>
                    <span className="value">
                      {renderDetectedList(
                        selectedMonitoring.analysis?.pests_detected,
                      )}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Leaf Chlorosis:</span>
                    <span className="value value-multiline">
                      {getChlorosisLines(selectedMonitoring.analysis).length > 0
                        ? getChlorosisLines(selectedMonitoring.analysis).map(
                            (line) => (
                              <span
                                key={`detail-${selectedMonitoring.id}-${line}`}
                                className="chlorosis-line"
                              >
                                {line}
                              </span>
                            ),
                          )
                        : "None"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Date of Last Inspection:</span>
                    <span className="value">
                      {formatDate(
                        selectedMonitoring.analysis?.inspection_date ||
                          selectedMonitoring.analysis?.created_at ||
                          selectedMonitoring.capturedAt,
                      )}
                    </span>
                  </div>
                </div>

                <div className="details-section">
                  <h4>Uploaded Images</h4>
                  {selectedMonitoring.imageUrls?.length ? (
                    <div className="record-image-grid">
                      {selectedMonitoring.imageUrls.map((imageUrl, index) => (
                        <button
                          key={`${selectedMonitoring.id}-image-${index}`}
                          type="button"
                          className="record-tree-image-button"
                          onClick={() =>
                            setSelectedImage({
                              src: imageUrl,
                              alt: `Tree ${selectedTree.treeId} upload ${index + 1}`,
                            })
                          }
                        >
                          <img
                            src={imageUrl}
                            alt={`Tree ${selectedTree.treeId} upload ${index + 1}`}
                            className="record-tree-image"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="history-empty">
                      No uploaded images for this monitoring record.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
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
