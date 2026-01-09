import { useState, useEffect } from "react";
import Viewer from "./Viewer.jsx";
import TryOnView from "./tryon/TryOnView.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  const [activeTab, setActiveTab] = useState("finder");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [matchResult, setMatchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedModels, setSavedModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [tryOnModel, setTryOnModel] = useState(null); // Model being tried on

  // Load saved models from API
  useEffect(() => {
    fetchSavedModels();
  }, []);

  async function fetchSavedModels() {
    try {
      const response = await fetch(`${API}/saved-models`);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const models = await response.json();
          setSavedModels(models);
        }
      }
    } catch (err) {
      console.error("Failed to fetch saved models:", err);
      // Fallback to localStorage
      const saved = localStorage.getItem("savedGlassesModels");
      if (saved) {
        setSavedModels(JSON.parse(saved));
      }
    }
  }

  function generateId() {
    return "GL-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  }

  async function saveModel() {
    if (!matchResult) return;
    
    const newModel = {
      name: matchResult.best_model.replace(".glb", ""),
      glbUrl: matchResult.model_url,
      material: matchResult.frameMaterial || "plastic",
      colors: {
        lens: matchResult.lensColor || "#3b82f6",
        frame: matchResult.frameColor || "#1a1a1a"
      },
      tintOpacity: matchResult.tintOpacity || 0.5,
      frameMetalness: matchResult.frameMetalness || 0.1,
      confidence: matchResult.confidence,
      source_image: matchResult.source_image
    };
    
    try {
      const response = await fetch(`${API}/saved-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newModel)
      });
      
      const contentType = response.headers.get("content-type");
      if (response.ok && contentType && contentType.includes("application/json")) {
        const savedModel = await response.json();
        setSavedModels([savedModel, ...savedModels]);
        alert(`Saved as ${savedModel.id}`);
      } else if (contentType && contentType.includes("application/json")) {
        const err = await response.json();
        alert(err.error || "Failed to save model");
      } else {
        alert(`Failed to save model. Server returned status ${response.status}`);
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save model");
    }
  }

  async function deleteModel(id) {
    if (!confirm("Delete this saved model?")) return;
    
    try {
      const response = await fetch(`${API}/saved-models/${id}`, {
        method: "DELETE"
      });
      
      if (response.ok) {
        const updated = savedModels.filter(m => m.id !== id);
        setSavedModels(updated);
        if (selectedModel?.id === id) setSelectedModel(null);
      } else {
        alert("Failed to delete model");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete model");
    }
  }

  function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length > 4) {
      setError("Maximum 4 images allowed");
      return;
    }
    setFiles(selectedFiles);
    setError(null);
    setMatchResult(null);
    const previewUrls = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(previewUrls);
  }

  function removeImage(index) {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    URL.revokeObjectURL(previews[index]);
    setFiles(newFiles);
    setPreviews(newPreviews);
    if (newFiles.length === 0) setMatchResult(null);
  }

  async function handleMatch() {
    if (files.length === 0) {
      setError("Please upload at least 1 image");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    files.forEach(file => formData.append("images", file));
    try {
      const response = await fetch(`${API}/match-model`, { method: "POST", body: formData });
      
      // Check if response is OK before parsing JSON
      if (!response.ok) {
        // Try to get error message from response
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API failed with status ${response.status}`);
        } else {
          throw new Error(`API failed with status ${response.status}. Server may be down.`);
        }
      }
      
      const data = await response.json();
      setMatchResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    previews.forEach(url => URL.revokeObjectURL(url));
    setFiles([]);
    setPreviews([]);
    setMatchResult(null);
    setError(null);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="12" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="2"/>
              <rect x="20" y="12" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16h8M4 16h-2M30 16h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>AI Glasses Finder</span>
          </div>
          <div className="tabs">
            <button className={`tab ${activeTab === "finder" ? "active" : ""}`} onClick={() => setActiveTab("finder")}>
              🔍 Finder
            </button>
            <button className={`tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
              📊 Dashboard ({savedModels.length})
            </button>
          </div>
        </div>
      </header>

      {activeTab === "finder" ? (
        <div className="main-content">
          <div className="upload-section">
            <div className="section-header">
              <h2>Upload Glasses Images</h2>
              <p>Upload 1-4 images from different angles for best results</p>
            </div>
            <div className="upload-area">
              {previews.length === 0 ? (
                <label className="upload-dropzone">
                  <input type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
                  <div className="dropzone-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <div className="dropzone-text"><strong>Click to upload</strong> or drag and drop</div>
                    <div className="dropzone-hint">PNG, JPG, WEBP (max 4 images)</div>
                  </div>
                </label>
              ) : (
                <div className="preview-grid">
                  {previews.map((preview, index) => (
                    <div key={index} className="preview-item">
                      <img src={preview} alt={`Preview ${index + 1}`} />
                      <button className="remove-btn" onClick={() => removeImage(index)}>×</button>
                    </div>
                  ))}
                  {previews.length < 4 && (
                    <label className="add-more">
                      <input type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      <span>Add more</span>
                    </label>
                  )}
                </div>
              )}
            </div>
            {error && <div className="error-message">⚠️ {error}</div>}
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={handleMatch} disabled={loading || files.length === 0}>
                {loading ? <><span className="spinner"></span>Finding Match...</> : <>🔍 Find 3D Model</>}
              </button>
              {files.length > 0 && <button className="btn btn-secondary" onClick={reset}>Reset</button>}
            </div>
          </div>

          {matchResult && (
            <div className="results-section">
              <div className="match-info">
                <div className="match-header">
                  <h3>Best Match Found</h3>
                  <div className="confidence-badge">{Math.round((matchResult.confidence || 0) * 100)}% Match</div>
                </div>
                <div className="model-name">{matchResult.best_model}</div>
                <div className="match-details">Based on: {matchResult.source_image}</div>
                {matchResult.lensColor && (
                  <div className="extracted-properties">
                    <div className="property-row">
                      <div className="property-item">
                        <span className="property-label">Lens:</span>
                        <span className="color-swatch" style={{ backgroundColor: matchResult.lensColor }}></span>
                      </div>
                      <div className="property-item">
                        <span className="property-label">Frame:</span>
                        <span className="color-swatch" style={{ backgroundColor: matchResult.frameColor || "#1a1a1a" }}></span>
                      </div>
                      <div className="property-item">
                        <span className="property-label">Tint:</span>
                        <span className="property-value">{Math.round((matchResult.tintOpacity || 0.5) * 100)}%</span>
                      </div>
                      <div className="property-item">
                        <span className="property-label">Material:</span>
                        <span className="property-value material-badge">{matchResult.frameMaterial || "plastic"}</span>
                      </div>
                    </div>
                  </div>
                )}
                <button className="btn btn-save" onClick={saveModel}>💾 Save to Dashboard</button>
                <button 
                  className="btn btn-tryon" 
                  onClick={() => setTryOnModel({
                    url: matchResult.model_url,
                    style: {
                      lensColor: matchResult.lensColor || "#3b82f6",
                      frameColor: matchResult.frameColor || "#1a1a1a",
                      tintOpacity: matchResult.tintOpacity || 0.5
                    }
                  })}
                >
                  👓 Try On
                </button>
              </div>
              <div className="viewer-container">
                <Viewer 
                  modelUrl={matchResult.model_url}
                  lensColor={matchResult.lensColor || "#3b82f6"}
                  frameColor={matchResult.frameColor || "#1a1a1a"}
                  tintOpacity={matchResult.tintOpacity || 0.5}
                  frameScale={matchResult.frameScale || 1.0}
                  frameMaterial={matchResult.frameMaterial || "plastic"}
                  frameMetalness={matchResult.frameMetalness || 0.1}
                />
              </div>
              <div className="viewer-controls">
                <div className="control-hint">🖱️ Drag to rotate • Scroll to zoom • Right-click to pan</div>
              </div>
            </div>
          )}

          {!matchResult && files.length === 0 && (
            <div className="empty-state">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="7" height="6" rx="1"/><rect x="14" y="11" width="7" height="6" rx="1"/>
                <path d="M10 14h4M3 14h-1M22 14h-1"/><path d="M3 14v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/>
              </svg>
              <h3>No images uploaded yet</h3>
              <p>Upload glasses images to find matching 3D models using AI</p>
            </div>
          )}
        </div>
      ) : (
        <div className="dashboard-content">
          <div className="dashboard-header">
            <h2>📊 Saved Models Dashboard</h2>
            <p>{savedModels.length} models saved</p>
          </div>
          
          <div className="dashboard-layout">
            <div className="models-list">
              {savedModels.length === 0 ? (
                <div className="empty-dashboard">
                  <p>No saved models yet. Use the Finder tab to match and save glasses.</p>
                </div>
              ) : (
                savedModels.map(model => (
                  <div 
                    key={model.id} 
                    className={`model-card ${selectedModel?.id === model.id ? "selected" : ""}`}
                    onClick={() => setSelectedModel(model)}
                  >
                    <div className="model-card-header">
                      <span className="model-id">{model.id}</span>
                      <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }}>🗑️</button>
                    </div>
                    <div className="model-card-name">{model.name}</div>
                    <div className="model-card-meta">
                      <span className="color-dot" style={{ backgroundColor: model.colors?.frame || model.frameColor }}></span>
                      <span className="color-dot" style={{ backgroundColor: model.colors?.lens || model.lensColor }}></span>
                      <span className="material-tag">{model.material || model.frameMaterial}</span>
                    </div>
                    <div className="model-card-date">{new Date(model.savedAt).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
            
            <div className="model-detail">
              {selectedModel ? (
                <>
                  <div className="detail-header">
                    <h3>{selectedModel.id}</h3>
                    <span className="confidence-badge">{Math.round((selectedModel.confidence || 0) * 100)}%</span>
                  </div>
                  <div className="detail-info">
                    <div className="info-row"><span>Name:</span><strong>{selectedModel.name}</strong></div>
                    <div className="info-row"><span>Material:</span><strong>{selectedModel.material || selectedModel.frameMaterial}</strong></div>
                    <div className="info-row"><span>Tint:</span><strong>{Math.round((selectedModel.tintOpacity || 0.5) * 100)}%</strong></div>
                    <div className="info-row">
                      <span>Colors:</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span className="color-swatch" style={{ backgroundColor: selectedModel.colors?.frame || selectedModel.frameColor }}></span>
                        <span className="color-swatch" style={{ backgroundColor: selectedModel.colors?.lens || selectedModel.lensColor }}></span>
                      </div>
                    </div>
                    <div className="info-row"><span>Saved:</span><strong>{new Date(selectedModel.savedAt).toLocaleString()}</strong></div>
                  </div>
                  <button 
                    className="btn btn-tryon detail-tryon-btn" 
                    onClick={() => setTryOnModel({
                      url: selectedModel.glbUrl || selectedModel.model_url,
                      style: {
                        lensColor: selectedModel.colors?.lens || selectedModel.lensColor,
                        frameColor: selectedModel.colors?.frame || selectedModel.frameColor,
                        tintOpacity: selectedModel.tintOpacity
                      }
                    })}
                  >
                    👓 Try On
                  </button>
                  <div className="detail-viewer">
                    <Viewer 
                      modelUrl={selectedModel.glbUrl || selectedModel.model_url}
                      lensColor={selectedModel.colors?.lens || selectedModel.lensColor}
                      frameColor={selectedModel.colors?.frame || selectedModel.frameColor}
                      tintOpacity={selectedModel.tintOpacity}
                      frameMaterial={selectedModel.material || selectedModel.frameMaterial}
                      frameMetalness={selectedModel.frameMetalness}
                    />
                  </div>
                </>
              ) : (
                <div className="no-selection">
                  <p>Select a model from the list to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Try-On Modal */}
      {tryOnModel && (
        <div className="tryon-modal-overlay" onClick={() => setTryOnModel(null)}>
          <div className="tryon-modal" onClick={(e) => e.stopPropagation()}>
            <TryOnView
              glassesModelUrl={tryOnModel.url}
              glassesStyle={tryOnModel.style}
              onClose={() => setTryOnModel(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
