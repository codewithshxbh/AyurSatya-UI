"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileImage,
  History,
  Leaf,
  LogOut,
  Menu,
  Microscope,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const crops = [
  { name: "Ashwagandha", scientific: "Withania somnifera", color: "sage" },
  { name: "Tulsi", scientific: "Ocimum tenuiflorum", color: "mint" },
  { name: "Neem", scientific: "Azadirachta indica", color: "forest" },
  { name: "Aloe Vera", scientific: "Aloe barbadensis", color: "aqua" }
];

const recentAnalyses = [
  { crop: "Neem", date: "09 Oct 2026", status: "Healthy", confidence: "98.4%", color: "forest" },
  { crop: "Tulsi", date: "07 Oct 2026", status: "Needs review", confidence: "87.1%", color: "mint" },
  { crop: "Aloe Vera", date: "03 Oct 2026", status: "Healthy", confidence: "96.8%", color: "aqua" }
];

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
  const [selectedCrop, setSelectedCrop] = useState("Ashwagandha");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((response) => response.json()).then(({ user }) => {
      setSession(user ? { user } : null);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
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

  if (authLoading) return <div className="loading-screen">Loading your workspace...</div>;
  if (!session) {
    return (
      <main className="auth-page">
        <div className="auth-visual">
          <div className="auth-visual-inner">
            <span className="wordmark">Ayur<span>Satya</span></span>
            <div className="auth-visual-copy">
              <p className="overline">MEDICINAL CROP INTELLIGENCE</p>
              <h1>Better crop health starts with a closer look.</h1>
              <p>Bring together image intelligence and plant knowledge in one focused workspace.</p>
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
            <p className="setup-note">Your AyurSatya account is managed by our application. Supabase is used only for secure data storage.</p>
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
          <div className="sidebar-account"><div className="avatar">{name.slice(0, 2).toUpperCase()}</div><div><strong>{name}</strong><span>{session.user.email}</span></div></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="crumb">Workspace <span>/</span> <strong>{activeView === "analysis" ? "New analysis" : activeView[0].toUpperCase() + activeView.slice(1)}</strong></div><div className="topbar-actions"><button className="notification"><Bell size={17} /><i /></button><div className="top-avatar">{name.slice(0, 2).toUpperCase()}</div></div></header>
        {activeView === "overview" && <Overview firstName={firstName} setActiveView={setActiveView} setSelectedCrop={setSelectedCrop} />}
        {activeView === "analysis" && <Analysis selectedCrop={selectedCrop} setSelectedCrop={setSelectedCrop} file={file} preview={preview} chooseFile={chooseFile} uploadMessage={uploadMessage} setUploadMessage={setUploadMessage} analysisResult={analysisResult} setAnalysisResult={setAnalysisResult} analysisLoading={analysisLoading} setAnalysisLoading={setAnalysisLoading} userId={session.user.id} />}
        {activeView === "history" && <HistoryView userId={session.user.id} />}
        {activeView === "knowledge" && <Knowledge />}
        {activeView === "profile" && <Profile name={name} email={session.user.email} />}
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
  return <section className="page">
    <div className="page-heading"><div><p className="overline">THURSDAY, 09 OCTOBER 2026</p><h1>Good morning, {firstName}.</h1><p className="lead">A clear view of the work happening in your crop workspace.</p></div><button className="button button-primary" onClick={() => setActiveView("analysis")}><Plus size={17} /> New analysis</button></div>
    <div className="stats"><Stat label="Total analyses" value="24" detail="18% more than last month" icon={BarChart3} /><Stat label="Healthy crops" value="18" detail="75% of all analyses" icon={CheckCircle2} /><Stat label="Crop varieties" value="06" detail="Across your workspace" icon={Leaf} /></div>
    <div className="section-title"><div><h2>Start with a crop</h2><p>Select a crop to begin a new analysis.</p></div><button className="link-button" onClick={() => setActiveView("analysis")}>View all crops <ArrowRight size={15} /></button></div>
    <div className="crop-grid">{crops.map((crop) => <button key={crop.name} className="crop-card" onClick={() => { setSelectedCrop(crop.name); setActiveView("analysis"); }}><div className={`crop-image ${crop.color}`}><Leaf size={42} strokeWidth={1.2} /></div><span><strong>{crop.name}</strong><small>{crop.scientific}</small></span><ArrowRight size={16} /></button>)}</div>
    <div className="content-grid"><div className="panel"><div className="panel-heading"><div><h2>Recent analyses</h2><p>Your latest crop intelligence reports.</p></div><button className="link-button" onClick={() => setActiveView("history")}>See history <ArrowRight size={15} /></button></div>{recentAnalyses.map((item) => <AnalysisRow key={item.crop} item={item} />)}</div><div className="panel note-panel"><div className="note-icon"><Microscope size={22} /></div><p className="overline">FIELD NOTE</p><h2>Good images create better answers.</h2><p>Use natural light, a plain background, and show the whole leaf whenever possible.</p><button className="button button-secondary" onClick={() => setActiveView("analysis")}>Upload an image <ArrowRight size={15} /></button></div></div>
  </section>;
}

function Stat({ label, value, detail, icon: Icon }) {
  return <div className="stat"><div className="stat-icon"><Icon size={18} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function AnalysisRow({ item }) {
  return <div className="analysis-row"><div className={`row-thumb ${item.color}`}><Leaf size={19} /></div><div><strong>{item.crop} leaf</strong><small>{item.date}</small></div><span className={`status ${item.status === "Healthy" ? "healthy" : "review"}`}>{item.status}</span><b>{item.confidence}</b><ArrowRight size={15} /></div>;
}

function Analysis({ selectedCrop, setSelectedCrop, file, preview, chooseFile, uploadMessage, setUploadMessage, analysisResult, setAnalysisResult, analysisLoading, setAnalysisLoading, userId }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  async function runAnalysis() {
    if (!file) return;
    setAnalysisLoading(true);
    setUploadMessage("");
    const imageData = await fileToDataUrl(file);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cropName: selectedCrop, imageData, latitude, longitude })
    });
    const payload = await response.json();
    if (!response.ok) setUploadMessage(payload.error || "The analysis could not be completed.");
    else {
      setAnalysisResult(payload);
      if (supabaseConfigured) {
        await supabase.from("analyses").insert({ user_id: userId, crop_name: selectedCrop, result: payload });
      }
    }
    setAnalysisLoading(false);
  }
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">NEW ANALYSIS</p><h1>{analysisResult ? "Your crop report." : "Understand your crop."}</h1><p className="lead">{analysisResult ? "A combined image, knowledge, and field-context assessment." : "Upload a clear leaf image for a structured health assessment."}</p></div></div>{analysisResult ? <AnalysisResult result={analysisResult} preview={preview} onNew={() => setAnalysisResult(null)} /> : <div className="analysis-layout"><div className="panel upload-panel"><div className="analysis-steps"><span className="active">01 <b>Crop & image</b></span><span>02 <b>Validation</b></span><span>03 <b>Insight</b></span></div><label className="field"><span>Medicinal crop</span><select value={selectedCrop} onChange={(event) => setSelectedCrop(event.target.value)}>{crops.map((crop) => <option key={crop.name}>{crop.name}</option>)}</select></label><div className={`dropzone ${preview ? "has-preview" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}><input id="image-upload" type="file" accept="image/jpeg,image/png" onChange={(event) => chooseFile(event.target.files[0])} /><label htmlFor="image-upload">{preview ? <img src={preview} alt="Selected leaf preview" /> : <><UploadCloud size={29} /><strong>Drop a leaf image here</strong><span>or browse from your device</span><small>JPG or PNG, up to 10 MB</small></>}</label></div><div className="location-fields"><label className="field"><span>Field latitude <small>optional</small></span><input value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="e.g. 28.6139" /></label><label className="field"><span>Field longitude <small>optional</small></span><input value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="e.g. 77.2090" /></label></div>{uploadMessage && <p className="form-error">{uploadMessage}</p>}<button className="button button-primary full-button" disabled={!file || analysisLoading} onClick={runAnalysis}>{analysisLoading ? "Preparing report..." : "Run analysis"} {!analysisLoading && <ArrowRight size={16} />}</button><p className="privacy"><ShieldCheck size={13} /> Image analysis uses Gemini until the trained model is connected.</p></div><div className="panel process-panel"><div className="process-mark"><FileImage size={23} /></div><h2>One report, three sources</h2><p>The report clearly separates what came from the image, knowledge base, and satellite context.</p><div className="process-line"><span>01</span><div><strong>Gemini visual assessment</strong><small>Crop, visible symptoms, confidence, and limitations.</small></div></div><div className="process-line"><span>02</span><div><strong>Ayurvedic context</strong><small>Traditional information and references for the crop.</small></div></div><div className="process-line"><span>03</span><div><strong>Satellite context</strong><small>Sentinel-2 scene metadata and NDVI/NDWI when coordinates are supplied.</small></div></div></div></div>}</section>;
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
  return <div className="report"><div className="report-actions"><span className="status healthy">Analysis complete</span><button className="button button-secondary" onClick={onNew}><Plus size={15} /> New analysis</button></div><div className="report-grid"><div className="panel report-image">{preview && <img src={preview} alt="Analyzed leaf" />}<div><p className="overline">IMAGE REVIEW</p><h2>{visual.disease || "Visual assessment"}</h2><p>{visual.summary || "The image was reviewed by the configured Gemini vision provider."}</p></div></div><div className="panel result-card"><p className="overline">PREDICTION</p><h2>{visual.disease || "No confident result"}</h2><div className="confidence"><span>Confidence</span><strong>{visual.confidence || "—"}</strong></div><p>{visual.limitations || "This is a preliminary AI-assisted assessment and not a clinical or agronomic diagnosis."}</p></div></div><div className="report-sections"><section className="panel report-section"><div className="section-heading"><h2>Explainability</h2><span className="badge">Gemini preliminary</span></div><p>{visual.explanation || "Grad-CAM will be added when the EfficientNet service is connected. Gemini currently provides a textual explanation of visible evidence."}</p><div className="evidence-list">{(visual.evidence || []).map((item) => <div key={item}><CheckCircle2 size={15} /> {item}</div>)}</div></section><section className="panel report-section"><div className="section-heading"><h2>Ayurvedic knowledge</h2><BookOpen size={17} /></div><p>{knowledge.information || "Knowledge retrieval is ready for your validated crop and disease tables."}</p><p className="source">{knowledge.source || "Source references will be shown from the validated knowledge base."}</p></section><section className="panel report-section"><div className="section-heading"><h2>Field context</h2><Leaf size={17} /></div><p>{satellite.summary || "Add field coordinates to retrieve the latest Sentinel-2 context."}</p><div className="satellite-metrics"><Metric label="NDVI" value={satellite.ndvi || "Unavailable"} /><Metric label="NDWI" value={satellite.ndwi || "Unavailable"} /><Metric label="Scene" value={satellite.sceneDate || "Not queried"} /></div></section></div></div>;
}

function Metric({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function HistoryView({ userId }) {
  const [items, setItems] = useState(recentAnalyses);
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from("analyses").select("id,crop_name,created_at,result").eq("user_id", userId).order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      if (data?.length) setItems(data.map((item) => ({ crop: item.crop_name, date: new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), status: item.result?.visual?.disease || "Analyzed", confidence: item.result?.visual?.confidence || "—", color: crops.find((crop) => crop.name === item.crop_name)?.color || "sage" })));
    });
  }, [userId]);
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">YOUR WORKSPACE</p><h1>Analysis history.</h1><p className="lead">Review previous results and keep your research connected.</p></div></div><div className="panel history-panel"><div className="history-tools"><div className="search-box"><Search size={16} /><input placeholder="Search analyses" /></div><button className="button button-secondary">Last 30 days <ChevronDown size={15} /></button></div>{items.map((item, index) => <AnalysisRow key={`${item.crop}-${index}`} item={item} />)}</div></section>;
}

function Knowledge() {
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">AYURVEDIC KNOWLEDGE BASE</p><h1>Context for every result.</h1><p className="lead">Explore concise notes about the medicinal crops in your workspace.</p></div></div><div className="knowledge-grid">{crops.slice(0, 3).map((crop) => <article className="knowledge-card" key={crop.name}><div className={`knowledge-mark ${crop.color}`}><Leaf size={26} /></div><p className="overline">{crop.name}</p><h2>{crop.scientific}</h2><p>Growing conditions, visual cues, and traditional context for this medicinal crop.</p><button className="link-button">Read overview <ArrowRight size={15} /></button></article>)}</div></section>;
}

function Profile({ name, email }) {
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">ACCOUNT</p><h1>Profile & settings.</h1><p className="lead">Your personal workspace details.</p></div></div><div className="panel profile-panel"><div className="profile-avatar">{name.slice(0, 2).toUpperCase()}</div><div><p className="overline">SIGNED IN AS</p><h2>{name}</h2><p>{email}</p><button className="button button-secondary">Account settings <ArrowRight size={15} /></button></div></div></section>;
}
