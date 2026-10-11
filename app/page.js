"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  Leaf,
  LogOut,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";

const crops = [
  { name: "Neem", scientific: "Azadirachta indica", color: "forest" },
  { name: "Tulsi", scientific: "Ocimum tenuiflorum", color: "mint" },
  { name: "Kalanchoe", scientific: "Kalanchoe pinnata", color: "sage" }
];

const recentAnalyses = [];

export default function Home() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState("Neem");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  const [loginHighlight, setLoginHighlight] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me").then((response) => response.json()).then(({ user }) => {
      setSession(user ? { user } : null);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
    fetch("/api/public/highlight", { cache: "no-store" }).then((response) => response.json()).then(({ highlight }) => {
      setLoginHighlight(highlight || null);
    }).catch(() => setLoginHighlight(null));
  }, []);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    setAuthMessage("");
    setNeedsConfirmation(false);
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    const fullName = form.get("fullName");
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, fullName }) });
    const result = await response.json();
    if (!response.ok) {
      setAuthError(result.error || "Authentication failed.");
    } else if (authMode === "signup") {
      setAuthEmail(email);
      setSession({ user: result.user });
      setActiveView("overview");
    } else {
      setSession({ user: result.user });
      setActiveView("overview");
    }
    setAuthLoading(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
  }

  function chooseFile(nextFile) {
    if (!nextFile) return;
    if (!["image/jpeg", "image/png"].includes(nextFile.type)) {
      setUploadMessage("Choose a JPG or PNG image.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setUploadMessage("Images must be smaller than 10 MB.");
      return;
    }
    setUploadMessage("");
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  if (authLoading) return <LoadingScreen />;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-visual">
          <div className="auth-visual-inner">
            <span className="wordmark">Ayur<span>Satya</span></span>
            <p className="overline auth-visual-overline">MEDICINAL CROP INTELLIGENCE</p>
            <div className="auth-visual-copy">
              <h1>Better crop health starts with a closer look.</h1>
              <p>Bring together image intelligence and plant knowledge in one focused workspace.</p>
              {loginHighlight && <aside className="login-highlight"><p className="overline">RESEARCH HIGHLIGHT</p><strong>{loginHighlight.cropName}</strong><p>{loginHighlight.summary}</p>{loginHighlight.sourceTitle && <small>{loginHighlight.sourceTitle}</small>}</aside>}
            </div>
            <div className="leaf-line"><span /><span /><span /></div>
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-panel-inner">
            <span className="mobile-wordmark wordmark">Ayur<span>Satya</span></span>
            <p className="overline">{authMode === "login" ? "WELCOME BACK" : "CREATE YOUR WORKSPACE"}</p>
            <h2>{authMode === "login" ? "Sign in to AyurSatya" : "Create your account"}</h2>
            <p className="auth-description">{authMode === "login" ? "Access your analyses, crop notes, and saved insights." : "Save your crop analyses and keep your research in one place."}</p>
            <form onSubmit={handleAuth} className="auth-form">
              {authMode === "signup" && <Field label="Full name" name="fullName" placeholder="Your name" />}
              <Field label="Email address" name="email" type="email" placeholder="you@example.com" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
              <Field label="Password" name="password" type="password" placeholder="At least 6 characters" />
              <button className="button button-primary auth-submit" disabled={authLoading}>{authLoading ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16} /></button>
              {authError && <p className="form-error">{authError}</p>}
              {needsConfirmation && <button className="text-action" type="button" onClick={resendConfirmation}>Resend confirmation email</button>}
              {authMessage && <p className="form-success">{authMessage}</p>}
            </form>
            <p className="auth-switch">{authMode === "login" ? "New to AyurSatya?" : "Already have an account?"} <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); setAuthMessage(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></p>
          </div>
        </div>
      </main>
    );
  }

  const name = session.user.full_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Researcher";
  const firstName = name.split(" ")[0];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-top"><span className="wordmark">Ayur<span>Satya</span></span><button className="sidebar-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="nav-list">
          <NavButton icon={BarChart3} label="Overview" active={activeView === "overview"} onClick={() => setActiveView("overview")} />
          <NavButton icon={Plus} label="New analysis" active={activeView === "analysis"} onClick={() => setActiveView("analysis")} />
          <NavButton icon={History} label="Analysis history" active={activeView === "history"} onClick={() => setActiveView("history")} />
          <NavButton icon={BookOpen} label="Knowledge base" active={activeView === "knowledge"} onClick={() => setActiveView("knowledge")} />
        </nav>
        <div className="sidebar-bottom">
          <NavButton icon={Settings} label="Profile & settings" active={activeView === "profile"} onClick={() => setActiveView("profile")} />
          <button className="nav-button" onClick={signOut}><LogOut size={17} /> Sign out</button>
          <div className="sidebar-account"><Avatar user={session.user} name={name} size="small" /><div><strong>{name}</strong><span>{session.user.email}</span></div></div>
        </div>
      </aside>
      <main className="main">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        {activeView === "overview" && <Overview firstName={firstName} setActiveView={setActiveView} setSelectedCrop={setSelectedCrop} />}
        {activeView === "analysis" &&         <Analysis selectedCrop={selectedCrop} setSelectedCrop={setSelectedCrop} file={file} preview={preview} chooseFile={chooseFile} uploadMessage={uploadMessage} setUploadMessage={setUploadMessage} analysisResult={analysisResult} setAnalysisResult={setAnalysisResult} analysisLoading={analysisLoading} setAnalysisLoading={setAnalysisLoading} userId={session.user.id} storageStatus={storageStatus} setStorageStatus={setStorageStatus} />}
        {activeView === "history" && <HistoryView userId={session.user.id} />}
        {activeView === "knowledge" && <Knowledge />}
        {activeView === "profile" && <Profile user={session.user} name={name} email={session.user.email} onProfileUpdated={(user) => setSession((current) => current ? { ...current, user: { ...current.user, ...user } } : current)} />}
      </main>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, value, onChange }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} required minLength={type === "password" ? 6 : undefined} /></label>;
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={17} /> {label}</button>;
}

function Overview({ firstName, setActiveView, setSelectedCrop }) {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(now).toUpperCase();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <section className="page">
    <div className="page-heading"><div><p className="overline">{dateLabel}</p><h1>{greeting}, {firstName}.</h1><p className="lead">A clear view of the work happening in your crop workspace.</p></div><button className="button button-primary" onClick={() => setActiveView("analysis")}><Plus size={17} /> New analysis</button></div>
    <div className="stats"><Stat label="Total analyses" value="0" detail="Run your first analysis" icon={BarChart3} /><Stat label="Validated results" value="0" detail="No saved model reports yet" icon={CheckCircle2} /><Stat label="Supported crops" value={crops.length} detail="Verified from the local dataset" icon={Leaf} /></div>
    <div className="section-title"><div><h2>Start with a crop</h2><p>Select a crop to begin a new analysis.</p></div><button className="link-button" onClick={() => setActiveView("analysis")}>View all crops <ArrowRight size={15} /></button></div>
    <div className="crop-grid">{crops.map((crop) => <button key={crop.name} className="crop-card" onClick={() => { setSelectedCrop(crop.name); setActiveView("analysis"); }}><div className={`crop-image ${crop.color}`}><Leaf size={42} strokeWidth={1.2} /></div><span><strong>{crop.name}</strong><small>{crop.scientific}</small></span><ArrowRight size={16} /></button>)}</div>
    <div className="content-grid"><div className="panel"><div className="panel-heading"><div><h2>Recent analyses</h2><p>Your saved crop intelligence reports.</p></div><button className="link-button" onClick={() => setActiveView("history")}>See history <ArrowRight size={15} /></button></div><div className="empty-state"><History size={20} /><strong>No analyses saved yet</strong><span>Run an image analysis to create your first report.</span></div></div><div className="panel note-panel"><p className="overline">FIELD NOTE</p><h2>Good images create better answers.</h2><p>Use natural light, a plain background, and show the whole leaf whenever possible.</p><button className="button button-secondary" onClick={() => setActiveView("analysis")}>Upload an image <ArrowRight size={15} /></button></div></div>
  </section>;
}

function Stat({ label, value, detail, icon: Icon }) {
  return <div className="stat"><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function AnalysisRow({ item, onOpen }) {
  return <button className="analysis-row" type="button" onClick={onOpen} aria-label={`Open ${item.crop} analysis from ${item.date}`}><div className={`row-thumb ${item.color}`}>{item.imageUrls?.[0] ? <img src={item.imageUrls[0]} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Leaf size={19} />}</div><div><strong>{item.crop} leaf</strong><small>{item.date}{item.imageUrls?.length > 1 ? ` · ${item.imageUrls.length} images` : ""}</small></div><span className={`status ${item.status === "Healthy" ? "healthy" : "review"}`}>{item.status}</span><b>{item.confidence}</b><ArrowRight size={15} /></button>;
}

function HistoryDetail({ item, onBack }) {
  const visual = item.result?.visual || {};
  const knowledge = item.result?.knowledge || {};
  const satellite = item.result?.satellite || {};
  return <div className="history-detail"><div className="history-detail-actions"><button className="button button-secondary" type="button" onClick={onBack}>Back to history</button><span className="status review">Saved analysis</span></div><div className="report-grid"><div className="panel report-image"><div className="analysis-image-gallery">{item.imageUrls?.length ? item.imageUrls.map((url, index) => <img key={`${url}-${index}`} src={url} alt={`${item.crop} leaf image ${index + 1}`} onError={(event) => { event.currentTarget.closest(".analysis-image-gallery").classList.add("has-broken-image"); event.currentTarget.remove(); }} />) : <div className={`history-image-fallback ${item.color}`}><Leaf size={42} /><span>No stored image</span></div>}{item.imageUrls?.length > 0 && <div className="image-load-note">If an image does not load, its stored media link may have expired.</div>}</div><div><p className="overline">IMAGE REVIEW</p><h2>{item.crop} leaf</h2><p>{item.date}{item.imageUrls?.length > 1 ? ` · ${item.imageUrls.length} images` : ""}</p></div></div><div className="panel result-card"><p className="overline">PREDICTION</p><h2>{visual.disease || "Model not configured"}</h2><div className="confidence"><span>Confidence</span><strong>{typeof visual.confidence === "number" ? `${(visual.confidence * 100).toFixed(1)}%` : "—"}</strong></div><p>{visual.summary || "No prediction was saved for this analysis."}</p></div></div><div className="report-sections"><section className="panel report-section"><div className="section-heading"><h2>Explainability</h2></div>{visual.explainability?.heatmap ? <div className="gradcam-placeholder"><img src={visual.explainability.heatmap} alt="Saved Grad-CAM visualization" /></div> : <p>No Grad-CAM visualization was saved.</p>}</section><section className="panel report-section knowledge-report-card"><div className="section-heading"><h2>Ayurvedic knowledge</h2></div><p className="knowledge-label">What this record tells you</p><p>{knowledge.information || "No validated knowledge record was saved."}</p>{knowledge.source && <div className="knowledge-source-box"><span className="knowledge-source-label">Source</span><strong>{knowledge.source}</strong>{knowledge.sourceUrl && <a className="knowledge-source-link" href={knowledge.sourceUrl} target="_blank" rel="noreferrer">Open source <ArrowRight size={14} /></a>}</div>}</section><section className="panel report-section"><div className="section-heading"><h2>Field context</h2></div><p>{satellite.summary || "No field context was saved for this analysis."}</p></section></div></div>;
}

function getAnalysisImageUrls(item) {
  const values = [item.image_path, item.result?.imageUrls, item.result?.images, item.result?.imageUrl].flat(Infinity);
  return [...new Set(values.flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) return [];
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter((url) => typeof url === "string") : [];
      } catch {
        return [];
      }
    }
    return [trimmed];
  }))];
}

function Analysis({ selectedCrop, setSelectedCrop, file, preview, chooseFile, uploadMessage, setUploadMessage, analysisResult, setAnalysisResult, analysisLoading, setAnalysisLoading, userId, storageStatus, setStorageStatus }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [satelliteContext, setSatelliteContext] = useState("none");
  const [provider, setProvider] = useState("render");
  const [colabStatus, setColabStatus] = useState("");
  const [colabChecking, setColabChecking] = useState(false);
  async function checkColabStatus() {
    setColabChecking(true);
    try {
      const response = await fetch("/api/inference/colab-status", { cache: "no-store" });
      const payload = await response.json();
      setColabStatus(payload.status || "offline");
      return payload.status === "available";
    } catch {
      setColabStatus("offline");
      return false;
    } finally {
      setColabChecking(false);
    }
  }
  async function runAnalysis() {
    if (!file) return;
    if (satelliteContext === "coordinates") {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        setUploadMessage("Enter valid field coordinates: latitude -90 to 90 and longitude -180 to 180.");
        return;
      }
    }
    setAnalysisLoading(true);
    setUploadMessage("");
    try {
      if (provider === "colab" && !(await checkColabStatus())) {
        setUploadMessage("Google Colab is offline. Start the notebook runtime and tunnel, then use Check Colab again.");
        return;
      }
      const imageData = await fileToDataUrl(file);
      let imageUrl = null;
      setStorageStatus("Uploading original image...");
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadResponse = await fetch("/api/upload", { method: "POST", body: uploadForm });
      const uploadPayload = await uploadResponse.json();
      if (uploadResponse.ok && uploadPayload.secureUrl) {
        imageUrl = uploadPayload.secureUrl;
        setStorageStatus("Original image stored securely.");
      } else {
        setStorageStatus(uploadPayload.error || "Image storage is unavailable.");
        setUploadMessage("The image could not be stored, so this analysis was not saved. Check media storage configuration and try again.");
        return;
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cropName: selectedCrop, imageData, imageUrl, provider, latitude: satelliteContext === "coordinates" ? latitude : "", longitude: satelliteContext === "coordinates" ? longitude : "" })
      });
      const payload = await response.json();
      if (!response.ok) setUploadMessage(payload.error || "The analysis could not be completed.");
      else {
        setAnalysisResult(payload);
        const saveResponse = await fetch("/api/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cropName: selectedCrop, imagePath: payload.imageUrl, result: payload })
        });
        if (!saveResponse.ok) setUploadMessage("Analysis completed, but it could not be saved to history.");
      }
    } catch (error) {
      console.error("Analysis flow failed", error);
      setUploadMessage("The analysis could not be completed. Check your connection and try again.");
    } finally {
      setAnalysisLoading(false);
    }
  }
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">NEW ANALYSIS</p><h1>{analysisResult ? "Your crop report." : "Understand your crop."}</h1><p className="lead">{analysisResult ? "A combined image, knowledge, and field-context assessment." : "Upload a clear leaf image for a structured health assessment."}</p></div></div>{analysisResult ? <AnalysisResult result={analysisResult} preview={preview} onNew={() => setAnalysisResult(null)} /> : <div className="analysis-layout"><div className="panel upload-panel"><label className="field"><span>Inference provider</span><select value={provider} onChange={(event) => { setProvider(event.target.value); setColabStatus(""); }}><option value="render">Standard Analysis (Render)</option><option value="colab">Try with Google Colab</option></select></label>{provider === "colab" && <div className="provider-status"><span className={`status ${colabStatus === "available" ? "healthy" : "review"}`}>{colabChecking ? "Checking Colab..." : colabStatus === "available" ? "Colab available" : colabStatus === "unconfigured" ? "Colab not configured" : "Colab not checked"}</span><button type="button" className="link-button" onClick={checkColabStatus} disabled={colabChecking}>{colabChecking ? "Checking..." : "Check status"}</button></div>}<label className="field"><span>Medicinal crop</span><select value={selectedCrop} onChange={(event) => setSelectedCrop(event.target.value)}>{crops.map((crop) => <option key={crop.name}>{crop.name}</option>)}</select></label><div className={`dropzone ${preview ? "has-preview" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}><input id="image-upload" type="file" accept="image/jpeg,image/png" onChange={(event) => chooseFile(event.target.files[0])} /><label htmlFor="image-upload">{preview ? <img src={preview} alt="Selected leaf preview" /> : <><UploadCloud size={29} /><strong>Upload leaf image</strong><span>Choose a clear image from your device</span><small>JPG or PNG, up to 10 MB</small></>}</label></div><label className="field"><span>Satellite context</span><select value={satelliteContext} onChange={(event) => setSatelliteContext(event.target.value)}><option value="none">No, analyze the leaf image only</option><option value="coordinates">Yes, provide field coordinates</option></select></label>{satelliteContext === "coordinates" && <div className="location-fields"><label className="field"><span>Field latitude <small>optional</small></span><input value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="e.g. 28.6139" /></label><label className="field"><span>Field longitude <small>optional</small></span><input value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="e.g. 77.2090" /></label></div>}{storageStatus && <p className="privacy">{storageStatus}</p>}{uploadMessage && <p className="form-error">{uploadMessage}</p>}<button className="button button-primary full-button" disabled={!file || analysisLoading || colabChecking} onClick={runAnalysis}>{analysisLoading ? "Preparing report..." : "Run analysis"} {!analysisLoading && <ArrowRight size={16} />}</button><p className="privacy">{provider === "colab" ? "Colab works only while its notebook runtime and temporary tunnel are active." : "Disease prediction uses the configured Render inference service."}</p></div><div className="panel process-panel"><h2>One report, three sources</h2><p>The report clearly separates what came from the image, knowledge base, and satellite context.</p><div className="process-line"><div><strong>Visual assessment</strong><small>Available after validated model integration.</small></div></div><div className="process-line"><div><strong>Ayurvedic context</strong><small>Validated crop record with source metadata.</small></div></div><div className="process-line"><div><strong>Satellite context</strong><small>Sentinel-2 scene metadata and field indicators when coordinates are supplied.</small></div></div></div></div>}</section>;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AnalysisResult({ result, preview, onNew }) {
  const visual = result.visual || {};
  const knowledge = result.knowledge || {};
  const satellite = result.satellite || {};
  const heatmap = visual.explainability?.heatmap;
  const modelStatus = visual.model?.status;
  const statusLabel = visual.disease ? "Preliminary result" : modelStatus === "not_configured" ? "Inference unavailable" : modelStatus === "service_unavailable" ? "Service unavailable" : "No compatible prediction";
  const predictionTitle = visual.disease || (modelStatus === "not_configured" ? "Inference unavailable" : "No prediction available");
  return <div className="report"><div className="report-actions"><span className={`status ${visual.disease ? "healthy" : "review"}`}>{statusLabel}</span><button className="button button-secondary" onClick={onNew}><Plus size={15} /> New analysis</button></div><div className="report-grid"><div className="panel report-image">{preview && <img src={preview} alt="Analyzed leaf" />}<div><p className="overline">IMAGE REVIEW</p><h2>{predictionTitle}</h2><p>{visual.summary || "The uploaded image has not received a model prediction."}</p></div></div><div className="panel result-card"><p className="overline">PREDICTION</p><h2>{predictionTitle}</h2><div className="confidence"><span>Confidence</span><strong>{typeof visual.confidence === "number" ? `${(visual.confidence * 100).toFixed(1)}%` : "—"}</strong></div><p>{visual.limitations || "No disease or confidence is shown without real model inference."}</p></div></div><div className="report-sections"><section className="panel report-section"><div className="section-heading"><h2>Explainability</h2><span className="badge">{heatmap ? "Grad-CAM generated" : "Grad-CAM unavailable"}</span></div>{heatmap ? <div className="gradcam-placeholder"><img src={heatmap} alt="Grad-CAM visualization for the predicted class" /><span>Generated from the actual EfficientNet-B0 activation map for this prediction.</span></div> : <div className="gradcam-placeholder"><strong>Grad-CAM visualization not available</strong><span>No heatmap is fabricated when the inference runtime or checkpoint is unavailable.</span></div>}<p>{visual.explanation || "Connect the trained model to generate an explanation from the actual predicted class."}</p><div className="evidence-list">{(visual.evidence || []).map((item) => <div key={item}><CheckCircle2 size={15} /> {item}</div>)}</div></section><section className="panel report-section knowledge-report-card"><div className="section-heading"><h2>Ayurvedic knowledge</h2><BookOpen size={17} /></div><p className="knowledge-label">What this record tells you</p><p>{knowledge.information || "No validated knowledge record was returned."}</p><div className="knowledge-source-box"><span className="knowledge-source-label">Source</span>{knowledge.source ? <strong>{knowledge.source}</strong> : <strong>No source reference available.</strong>}{knowledge.sourceUrl && <a className="knowledge-source-link" href={knowledge.sourceUrl} target="_blank" rel="noreferrer">Open source <ArrowRight size={14} /></a>}</div></section><section className="panel report-section"><div className="section-heading"><h2>Field context</h2><Leaf size={17} /></div><p>{satellite.summary || "Add field coordinates to retrieve the latest Sentinel-2 context."}</p><div className="satellite-metrics"><Metric label="NDVI" value={satellite.ndvi || "Unavailable"} /><Metric label="NDWI" value={satellite.ndwi || "Unavailable"} /><Metric label="Scene" value={satellite.sceneDate || "Not queried"} /></div></section></div></div>;
}

function Metric({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LoadingScreen() {
  return <div className="loading-workspace">
    <aside className="loading-sidebar">
      <div className="skeleton skeleton-brand" />
      <div className="skeleton skeleton-nav-label" />
      <div className="loading-nav">{[1, 2, 3, 4].map((item) => <div className="skeleton skeleton-nav-item" key={item} />)}</div>
      <div className="loading-nav loading-nav-bottom"><div className="skeleton skeleton-nav-item" /><div className="skeleton skeleton-nav-item" /><div className="skeleton skeleton-account" /></div>
    </aside>
    <main className="loading-main">
      <div className="loading-heading"><div><div className="skeleton skeleton-overline" /><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-lead" /></div><div className="skeleton skeleton-action" /></div>
      <div className="loading-stats">{[1, 2, 3].map((item) => <div className="skeleton skeleton-stat" key={item} />)}</div>
      <div className="skeleton skeleton-section-title" />
      <div className="loading-crops">{[1, 2, 3].map((item) => <div className="skeleton skeleton-crop" key={item} />)}</div>
      <div className="loading-bottom"><div className="skeleton skeleton-recent" /><div className="skeleton skeleton-note" /></div>
    </main>
  </div>;
}

function HistoryView({ userId }) {
  const [items, setItems] = useState(recentAnalyses);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("30");
  useEffect(() => {
    fetch("/api/analyses").then((response) => response.json()).then(({ analyses }) => {
      if (analyses?.length) setItems(analyses.map((item) => ({
        id: item.id,
        crop: item.crop_name,
        createdAt: item.created_at,
        date: new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        status: item.result?.visual?.disease || "Analyzed",
        confidence: typeof item.result?.visual?.confidence === "number" ? `${(item.result.visual.confidence * 100).toFixed(1)}%` : "—",
        color: crops.find((crop) => crop.name === item.crop_name)?.color || "sage",
        imageUrls: getAnalysisImageUrls(item),
        result: item.result || {}
      })));
    }).finally(() => setLoading(false));
  }, [userId]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const cutoff = dateRange === "all" ? 0 : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedQuery || `${item.crop} ${item.status}`.toLowerCase().includes(normalizedQuery);
    const matchesDate = dateRange === "all" || new Date(item.createdAt).getTime() >= cutoff;
    return matchesSearch && matchesDate;
  });
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">YOUR WORKSPACE</p><h1>Analysis history.</h1><p className="lead">Review previous results and keep your research connected.</p></div></div>{selectedItem ? <HistoryDetail item={selectedItem} onBack={() => setSelectedItem(null)} /> : <div className="panel history-panel"><div className="history-tools"><label className="search-box" aria-label="Search analyses"><Search size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by crop or result" /></label><label className="history-range"><span>Showing</span><span className="history-range-value">{dateRange === "all" ? "All time" : `Last ${dateRange} days`}</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value)} aria-label="Filter analyses by date"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select><ChevronDown size={15} /></label></div>{loading ? <div className="skeleton-list"><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div> : filteredItems.length ? <div className="history-results">{filteredItems.map((item, index) => <AnalysisRow key={item.id || `${item.crop}-${index}`} item={item} onOpen={() => setSelectedItem(item)} />)}</div> : <div className="empty-state"><strong>{items.length ? "No matching analyses" : "No analyses yet"}</strong><span>{items.length ? "Try a different search or date range." : "Run your first crop analysis to see it here."}</span></div>}</div>}</section>;
}

function Knowledge() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [diseaseFilter, setDiseaseFilter] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("verified");
  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (cropFilter) params.set("crop", cropFilter);
    if (diseaseFilter.trim()) params.set("disease", diseaseFilter.trim());
    if (recordTypeFilter) params.set("recordType", recordTypeFilter);
    if (statusFilter) params.set("verificationStatus", statusFilter);
    try {
      const response = await fetch(`/api/knowledge?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load knowledge records.");
      setRecords(payload.records || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [cropFilter, diseaseFilter, recordTypeFilter, statusFilter]);
  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">AYURVEDIC KNOWLEDGE BASE</p><h1>Context for every result.</h1><p className="lead">Curated crop notes from the configured Supabase knowledge records.</p></div><span className="knowledge-count">{records.length} records</span></div><div className="knowledge-intro panel"><div><strong>Read the evidence around the image.</strong><p>These references provide botanical and traditional context. They do not replace a trained disease model or field verification.</p></div></div><div className="knowledge-filters panel"><label className="field"><span>Crop</span><select value={cropFilter} onChange={(event) => setCropFilter(event.target.value)}><option value="">All crops</option>{crops.map((crop) => <option key={crop.name}>{crop.name}</option>)}</select></label><label className="field"><span>Disease or condition</span><input value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)} placeholder="Exact record condition" /></label><label className="field"><span>Record type</span><select value={recordTypeFilter} onChange={(event) => setRecordTypeFilter(event.target.value)}><option value="">All types</option><option value="general_crop">General crop</option><option value="botanical">Botanical</option><option value="traditional_reference">Traditional reference</option><option value="disease_context">Disease context</option></select></label><label className="field"><span>Verification</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="verified">Curated records</option><option value="needs_review">Needs review</option></select></label></div>{loading ? <div className="knowledge-grid"><div className="skeleton skeleton-crop" /><div className="skeleton skeleton-crop" /><div className="skeleton skeleton-crop" /></div> : error ? <div className="panel empty-state"><strong>Knowledge base unavailable</strong><span>{error}</span><button className="button button-secondary" onClick={loadKnowledge}>Retry</button></div> : records.length ? <div className="knowledge-grid">{records.map((item) => <article className="knowledge-card" key={item.id}><p className="overline">{item.crop_name} · {item.record_type.replaceAll("_", " ")}</p><h2>{item.matched_disease}</h2><p>{item.summary || item.information}</p><div className="knowledge-source"><span>{item.source_title}{item.source_institution ? ` · ${item.source_institution}` : ""}{item.source_locator ? ` · ${item.source_locator}` : ""}</span></div>{item.source_url && <a className="link-button" href={item.source_url} target="_blank" rel="noreferrer">Open source reference <ArrowRight size={15} /></a>}</article>)}</div> : <div className="panel empty-state"><strong>No curated knowledge records</strong><span>Apply the database migration and seed reviewed source records.</span></div>}</section>;
}

function Avatar({ user, name, size = "large" }) {
  return user?.avatar_url
    ? <img className={`user-avatar user-avatar-${size}`} src={user.avatar_url} alt={`${name} profile`} />
    : <div className={`avatar-fallback avatar-fallback-${size}`}>{name.slice(0, 2).toUpperCase()}</div>;
}

function Profile({ user, name, email, onProfileUpdated }) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirmation: "" });
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setAvatarError("Choose a JPG, PNG, or WebP image up to 5 MB.");
      return;
    }
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/auth/avatar", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The profile photo could not be uploaded.");
      onProfileUpdated(payload.user);
    } catch (requestError) {
      setAvatarError(requestError.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const response = await fetch("/api/auth/avatar", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The profile photo could not be removed.");
      onProfileUpdated(payload.user);
    } catch (requestError) {
      setAvatarError(requestError.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Your profile could not be updated.");
      onProfileUpdated(payload.user);
      setFullName(payload.user.full_name);
      setEditing(false);
      setMessage("Profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwordForm) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Your password could not be changed.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordOpen(false);
      setPasswordMessage("Password changed. Other sessions were signed out.");
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const response = await fetch("/api/auth/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deleteForm) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Your account could not be deleted.");
      window.location.reload();
    } catch (requestError) {
      setDeleteError(requestError.message);
      setDeleting(false);
    }
  }

  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">ACCOUNT</p><h1>Profile & settings.</h1><p className="lead">Manage your identity and account security.</p></div></div><div className="settings-grid"><div className="panel profile-panel"><div className="profile-photo-column"><Avatar user={user} name={name} /><label className="button button-secondary avatar-upload">{avatarBusy ? "Saving..." : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy} /></label>{user.avatar_url && <button className="avatar-remove" type="button" onClick={removeAvatar} disabled={avatarBusy}>Remove photo</button>}{avatarError && <p className="form-error">{avatarError}</p>}</div><div className="profile-details"><p className="overline">SIGNED IN AS</p><h2>{name}</h2><p>{email}</p>{editing ? <form className="profile-edit-form" onSubmit={saveProfile}><label className="field"><span>Display name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={80} required autoFocus /></label><div className="profile-actions"><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button><button className="button button-secondary" type="button" onClick={() => { setEditing(false); setFullName(name); setError(""); }}>Cancel</button></div></form> : <button className="button button-secondary" onClick={() => { setEditing(true); setMessage(""); setError(""); }}>Edit profile <ArrowRight size={15} /></button>}{message && <p className="form-success">{message}</p>}{error && <p className="form-error">{error}</p>}</div></div><div className="panel settings-card"><div className="settings-card-heading"><div><p className="overline">SECURITY</p><h2>Password</h2></div><ShieldCheck size={20} /></div><p>Change your password without exposing it to the browser or database logs.</p>{passwordOpen ? <form className="settings-form" onSubmit={changePassword}><label className="field"><span>Current password</span><input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required /></label><label className="field"><span>New password</span><input type="password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required /></label><label className="field"><span>Confirm new password</span><input type="password" minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required /></label><div className="profile-actions"><button className="button button-primary" disabled={saving}>{saving ? "Updating..." : "Update password"}</button><button className="button button-secondary" type="button" onClick={() => { setPasswordOpen(false); setPasswordError(""); }}>Cancel</button></div></form> : <button className="button button-secondary" onClick={() => { setPasswordOpen(true); setPasswordMessage(""); setPasswordError(""); }}>Change password <ArrowRight size={15} /></button>}{passwordMessage && <p className="form-success">{passwordMessage}</p>}{passwordError && <p className="form-error">{passwordError}</p>}</div><div className="panel settings-card danger-card"><div className="settings-card-heading"><div><p className="overline">DANGER ZONE</p><h2>Delete account</h2></div></div><p>Remove your account, saved analyses, and active sessions permanently.</p>{deleteOpen ? <form className="settings-form" onSubmit={deleteAccount}><label className="field"><span>Current password</span><input type="password" value={deleteForm.password} onChange={(event) => setDeleteForm({ ...deleteForm, password: event.target.value })} required /></label><label className="field"><span>Type DELETE to confirm</span><input value={deleteForm.confirmation} onChange={(event) => setDeleteForm({ ...deleteForm, confirmation: event.target.value })} required /></label><div className="profile-actions"><button className="button button-danger" disabled={deleting}>{deleting ? "Deleting..." : "Delete permanently"}</button><button className="button button-secondary" type="button" onClick={() => { setDeleteOpen(false); setDeleteError(""); }}>Cancel</button></div></form> : <button className="button button-danger-outline" onClick={() => { setDeleteOpen(true); setDeleteError(""); }}>Delete account <ArrowRight size={15} /></button>}{deleteError && <p className="form-error">{deleteError}</p>}</div></div></section>;
}
