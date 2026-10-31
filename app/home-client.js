"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  Menu,
  Search,
  Trash2,
  X
} from "lucide-react";
import { combineKnowledgeText, parseLabeledInformation } from "../lib/knowledge-filters.mjs";
import { analyzeSatelliteCoordinates } from "../lib/field-location";
import {
  CAMERA_FACING,
  captureVideoFrame,
  mapCameraError,
  nextCameraFacing,
  requestCameraStream,
  stopMediaStream
} from "../lib/camera-capture";
import { displayClassLabel, humanizeUserText, parsePredictedClass, SUPPORTED_CLASS_LABELS } from "../lib/prediction-result";
import {
  AnalysisCardSkeleton,
  AnalysisSkeleton,
  HistoryListSkeleton,
  KnowledgeCardSkeleton,
  KnowledgeSkeleton,
  StatSkeleton,
  OverviewSkeleton,
  ProfileSkeleton,
  ReportSkeleton
} from "./workspace-loading";

const FieldLocationPicker = dynamic(() => import("./components/FieldLocationPicker"), {
  ssr: false,
  loading: () => <p className="field-location-map-status">Loading map...</p>
});

const MIN_SKELETON_MS = 320;

function scrollWorkspaceToTop() {
  if (typeof window === "undefined") return;
  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  const run = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const main = document.querySelector("main.main");
    if (main) main.scrollTop = 0;
  };
  run();
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  window.setTimeout(run, 50);
}

function waitAtLeast(startedAt, minimumMs = MIN_SKELETON_MS) {
  const remaining = minimumMs - (Date.now() - startedAt);
  return remaining > 0 ? new Promise((resolve) => setTimeout(resolve, remaining)) : Promise.resolve();
}

const HISTORY_LIST_TIMEOUT_MS = 12000;
const HISTORY_DETAIL_TIMEOUT_MS = 25000;

async function fetchJson(url, { timeoutMs = HISTORY_LIST_TIMEOUT_MS, signal, method = "GET" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", onAbort);
  }
  try {
    const response = await fetch(url, { method, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      if (signal?.aborted) throw error;
      throw new Error("This is taking too long. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

function useReveal(minimumMs = MIN_SKELETON_MS) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    scrollWorkspaceToTop();
    const timer = setTimeout(() => setReady(true), minimumMs);
    return () => clearTimeout(timer);
  }, [minimumMs]);
  return ready;
}

const crops = [
  { name: "Neem", scientific: "Azadirachta indica", color: "forest", image: "/crops/neem.jpg" },
  { name: "Tulsi", scientific: "Ocimum tenuiflorum", color: "mint", image: "/crops/tulsi.jpg" },
  { name: "Kalanchoe", scientific: "Kalanchoe pinnata (PatharKuchi)", color: "sage", image: "/crops/kalanchoe.jpg" }
];

const supportedClasses = SUPPORTED_CLASS_LABELS.map((className) => {
  const parsed = parsePredictedClass(className);
  const crop = crops.find((item) => item.name === parsed?.crop);
  return {
    className,
    crop: parsed?.crop || className,
    condition: parsed?.condition || className,
    scientific: crop?.scientific || parsed?.scientific || "",
    color: crop?.color || "sage",
    image: `/crops/classes/${className}.jpg`
  };
});

export default function Home({ initialUser = null, initialHighlight = null, knowledgeCount = 0 }) {
  const [session, setSession] = useState(initialUser ? { user: initialUser } : null);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  const [loginHighlight, setLoginHighlight] = useState(initialHighlight);
  const [knowledgeRecordCount, setKnowledgeRecordCount] = useState(knowledgeCount);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  function changeView(view) {
    setMobileOpen(false);
    setActiveView(view);
  }

  useLayoutEffect(() => {
    scrollWorkspaceToTop();
  }, [activeView, selectedHistoryItem?.id]);

  useEffect(() => {
    if (initialUser) return undefined;
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then(({ user }) => {
      if (cancelled || !user) return;
      setSession({ user });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  useEffect(() => {
    if (session) return;
    if (initialHighlight || knowledgeCount > 0) return;
    fetch("/api/public/highlight", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      setLoginHighlight(payload.highlight || initialHighlight || null);
      setKnowledgeRecordCount(payload.knowledgeCount ?? knowledgeCount ?? 0);
    }).catch(() => {
      setLoginHighlight(initialHighlight || null);
    });
  }, [session, initialHighlight, knowledgeCount]);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const form = new FormData(event.currentTarget);
      const email = form.get("email");
      const password = form.get("password");
      const fullName = form.get("fullName");
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, fullName }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(result.error || "Authentication failed.");
        return;
      }
      if (!result.user?.id) {
        setAuthError("Sign-in succeeded, but the session could not be created. Try again.");
        return;
      }
      setAuthEmail(typeof email === "string" ? email : "");
      setSession({ user: result.user });
      setActiveView("overview");
    } catch (error) {
      console.error("Authentication failed", error);
      setAuthError("Sign-in could not be completed. Check your connection and try again.");
    } finally {
      setAuthLoading(false);
    }
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
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
  }

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
              <aside className="login-highlight">
                <p className="overline">RESEARCH HIGHLIGHT</p>
                {loginHighlight ? (
                  <>
                    <strong>{humanizeUserText(loginHighlight.cropName)}</strong>
                    <p>{humanizeUserText(loginHighlight.summary)}</p>
                    {loginHighlight.sourceTitle && <small>{humanizeUserText(loginHighlight.sourceTitle)}{loginHighlight.sourceInstitution ? ` · ${humanizeUserText(loginHighlight.sourceInstitution)}` : ""}</small>}
                  </>
                ) : (
                  <>
                    <strong>Sourced plant records</strong>
                    <p>This workspace reads botanical notes from the knowledge database when the sign-in screen loads.</p>
                  </>
                )}
                <small className="login-highlight-count">{knowledgeRecordCount ? `${knowledgeRecordCount} sourced records currently in the knowledge database.` : "Connecting to the knowledge database..."}</small>
              </aside>
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
              <Field label="Email address" name="email" type="email" placeholder="you@example.com" defaultValue={authEmail} />
              <Field label="Password" name="password" type="password" placeholder="At least 6 characters" />
              <button className="button button-primary auth-submit" disabled={authLoading}>{authLoading ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}</button>
              {authError && <p className="form-error">{authError}</p>}
            </form>
            <p className="auth-switch">{authMode === "login" ? "New to AyurSatya?" : "Already have an account?"} <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></p>
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
          <NavButton label="Overview" active={activeView === "overview"} onClick={() => changeView("overview")} />
          <NavButton label="Analysis" active={activeView === "analysis"} onClick={() => changeView("analysis")} />
          <NavButton label="Analysis history" active={activeView === "history"} onClick={() => { setSelectedHistoryItem(null); changeView("history"); }} />
          <NavButton label="Knowledge base" active={activeView === "knowledge"} onClick={() => changeView("knowledge")} />
        </nav>
        <div className="sidebar-bottom">
          <NavButton label="Profile & settings" active={activeView === "profile"} onClick={() => changeView("profile")} />
          <button className="nav-button" onClick={signOut}>Sign out</button>
          <div className="sidebar-account"><Avatar user={session.user} name={name} size="small" /><div><strong>{name}</strong><span>{session.user.email}</span></div></div>
        </div>
      </aside>
      <main className="main">
        <button className="mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={22} strokeWidth={2} /></button>
        {activeView === "overview" && <Overview firstName={firstName} setActiveView={changeView} onOpenHistoryItem={(item) => { scrollWorkspaceToTop(); setSelectedHistoryItem(item); changeView("history"); }} />}
        {activeView === "analysis" && <Analysis file={file} preview={preview} chooseFile={chooseFile} uploadMessage={uploadMessage} setUploadMessage={setUploadMessage} analysisResult={analysisResult} setAnalysisResult={setAnalysisResult} analysisLoading={analysisLoading} setAnalysisLoading={setAnalysisLoading} storageStatus={storageStatus} setStorageStatus={setStorageStatus} />}
        {activeView === "history" && <HistoryView userId={session.user.id} initialSelectedItem={selectedHistoryItem} onClearSelectedItem={() => setSelectedHistoryItem(null)} />}
        {activeView === "knowledge" && <Knowledge />}
        {activeView === "profile" && <Profile user={session.user} name={name} email={session.user.email} onProfileUpdated={(user) => setSession((current) => current ? { ...current, user: { ...current.user, ...user } } : current)} />}
      </main>
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, value, defaultValue, onChange }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} value={value} defaultValue={defaultValue} onChange={onChange} required minLength={type === "password" ? 6 : undefined} /></label>;
}

function NavButton({ label, active, onClick }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{label}</button>;
}

function toHistoryItem(item) {
  return {
    id: item.id,
    crop: item.result?.visual?.crop || item.crop_name,
    createdAt: item.created_at,
    date: new Date(item.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    status: item.result?.visual?.condition || item.result?.visual?.disease || "Analyzed",
    confidence: typeof item.result?.visual?.confidence === "number" ? `${(item.result.visual.confidence * 100).toFixed(1)}%` : "—",
    color: crops.find((crop) => crop.name === item.crop_name)?.color || "sage",
    imageUrls: getAnalysisImageUrls(item),
    result: item.result || {}
  };
}

function Overview({ firstName, setActiveView, onOpenHistoryItem }) {
  const ready = useReveal();
  const [analyses, setAnalyses] = useState([]);
  const [totalAnalyses, setTotalAnalyses] = useState(0);
  const [validatedAnalyses, setValidatedAnalyses] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    setHistoryLoading(true);
    setHistoryError("");
    fetchJson("/api/analyses", { timeoutMs: HISTORY_LIST_TIMEOUT_MS, signal: controller.signal })
      .then((payload) => {
        if (cancelled) return;
        setAnalyses(payload.analyses || []);
        setTotalAnalyses(payload.total ?? payload.analyses?.length ?? 0);
        setValidatedAnalyses(payload.validated ?? 0);
      })
      .catch((error) => {
        if (cancelled || error?.name === "AbortError") return;
        console.error("Overview analysis lookup failed", error);
        setHistoryError(error.message || "Analysis activity is temporarily unavailable.");
      })
      .finally(async () => {
        await waitAtLeast(startedAt);
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
  const deleteOverviewAnalysis = useCallback(async (item) => {
    if (!item?.id) return;
    setDeletingId(item.id);
    setDeleteError("");
    try {
      await fetchJson(`/api/analyses/${item.id}`, { method: "DELETE", timeoutMs: HISTORY_LIST_TIMEOUT_MS });
      setAnalyses((current) => current.filter((row) => row.id !== item.id));
      setTotalAnalyses((current) => Math.max(0, current - 1));
      setValidatedAnalyses((current) => Math.max(0, current - 1));
    } catch (error) {
      console.error("Overview analysis delete failed", error);
      setDeleteError(error.message || "Unable to delete this analysis.");
    } finally {
      setDeletingId("");
    }
  }, []);
  const retryOverview = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError("");
    const startedAt = Date.now();
    fetchJson("/api/analyses", { timeoutMs: HISTORY_LIST_TIMEOUT_MS })
      .then((payload) => {
        setAnalyses(payload.analyses || []);
        setTotalAnalyses(payload.total ?? payload.analyses?.length ?? 0);
        setValidatedAnalyses(payload.validated ?? 0);
      })
      .catch((error) => {
        console.error("Overview analysis lookup failed", error);
        setHistoryError(error.message || "Analysis activity is temporarily unavailable.");
      })
      .finally(async () => {
        await waitAtLeast(startedAt);
        setHistoryLoading(false);
      });
  }, []);
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(now).toUpperCase();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (!ready) return <OverviewSkeleton />;
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="overline">{dateLabel}</p>
          <h1>{greeting}, {firstName}.</h1>
          <p className="lead">A clear view of the work happening in your crop workspace.</p>
        </div>
        <button className="button button-primary" onClick={() => setActiveView("analysis")}>New analysis</button>
      </div>
      <div className="stats">
        {historyLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <Stat label="Total analyses" value={totalAnalyses} detail={totalAnalyses ? "Saved crop reports" : "Run your first analysis"} />
            <Stat label="Validated results" value={validatedAnalyses} detail={validatedAnalyses ? "Reports with model results" : "No saved model reports yet"} />
            <Stat label="Supported classes" value={supportedClasses.length} detail="12 labels from the local dataset" />
          </>
        )}
      </div>
      <div className="section-title">
        <div>
          <h2>Supported classes</h2>
          <p>Automatic identification currently supports 12 classes across Neem, Tulsi, and Kalanchoe (PatharKuchi, Kalanchoe pinnata).</p>
        </div>
      </div>
      <div className="class-pill-row" aria-label="Supported classes">
        {supportedClasses.map((item, index) => (
          <span key={item.className} className="class-pill" style={{ "--pill-delay": `${index * 0.35}s` }}>
            <span className="class-pill-glow" aria-hidden="true" />
            <span className="class-pill-inner">
              {/* Class-pill thumbs are 36px local assets; next/image wrappers change wrap across viewports. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="class-pill-photo" src={item.image} alt="" title={`${displayClassLabel(item.className)} from Ahmmed et al., Medicinal Plant Leaf Disease Dataset (CC BY 4.0)`} width={36} height={36} />
              <span className="class-pill-copy">
                <strong>{item.crop}</strong>
                <small>{item.condition}</small>
                <em>{item.scientific}</em>
              </span>
            </span>
          </span>
        ))}
      </div>
      <div className="section-title">
        <div>
          <h2>Recent analyses</h2>
          <p>Your latest saved crop intelligence reports.</p>
        </div>
        <button className="link-button" onClick={() => setActiveView("history")}>See history</button>
      </div>
      {historyLoading ? (
        <div className="history-card-grid">{[1, 2, 3].map((item) => <AnalysisCardSkeleton key={item} />)}</div>
      ) : historyError ? (
        <div className="panel empty-state"><strong>Unable to load recent analyses</strong><span>{historyError}</span><button className="button button-secondary" onClick={retryOverview}>Retry</button></div>
      ) : analyses.length ? (
        <>
          {deleteError && <p className="form-error">{deleteError}</p>}
          <div className="history-card-grid">
            {analyses.slice(0, 3).map((item, index) => {
              const historyItem = toHistoryItem(item);
              return (
                <AnalysisRow
                  key={historyItem.id || `${historyItem.crop}-${index}`}
                  item={historyItem}
                  deleting={deletingId === historyItem.id}
                  onOpen={() => onOpenHistoryItem(historyItem)}
                  onDelete={() => deleteOverviewAnalysis(historyItem)}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="panel empty-state"><strong>No analyses saved yet</strong><span>Run an image analysis to create your first report.</span></div>
      )}
      <div className="panel note-panel note-banner">
        <div>
          <p className="overline">FIELD NOTE</p>
          <h2>Good images create better answers.</h2>
          <p>Use natural light, a plain background, and show the whole leaf whenever possible.</p>
        </div>
        <button className="button button-secondary" onClick={() => setActiveView("analysis")}>Upload an image</button>
      </div>
    </section>
  );
}

function Stat({ label, value, detail }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AnalysisRow({ item, onOpen, onDelete, deleting = false }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="analysis-card">
      <button className="analysis-card-open" type="button" onClick={onOpen} aria-label={`Open ${item.crop} analysis from ${item.date}`}>
        <div className={`analysis-card-media ${item.color}`}>
          {item.imageUrls?.[0] ? (
            // History thumbs are Cloudinary or other stored URLs, not static public paths.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrls[0]} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          ) : <span>No image</span>}
        </div>
        <div className="analysis-card-body">
          <strong>{item.crop}</strong>
          <small>{item.status}</small>
          <span>{item.date}{item.imageUrls?.length > 1 ? ` · ${item.imageUrls.length} images` : ""}</span>
          <b>{item.confidence}</b>
        </div>
      </button>
      {confirming ? (
        <div className="analysis-card-confirm">
          <button type="button" className="analysis-card-delete" onClick={() => onDelete(item)} disabled={deleting} aria-label={deleting ? "Deleting analysis" : `Confirm delete ${item.crop} analysis`}><Trash2 size={16} strokeWidth={2} /></button>
          <button type="button" className="analysis-card-keep" onClick={() => setConfirming(false)} disabled={deleting}>Keep</button>
        </div>
      ) : (
        <button type="button" className="analysis-card-delete" onClick={() => setConfirming(true)} disabled={deleting} aria-label={`Delete ${item.crop} analysis from ${item.date}`}><Trash2 size={16} strokeWidth={2} /></button>
      )}
    </article>
  );
}

function HistoryDetail({ item, onBack, loading, error, deleteError, onRetry, onDelete, deleting = false }) {
  const [confirming, setConfirming] = useState(false);
  if (loading) return <ReportSkeleton onBack={onBack} />;
  if (error) {
    return (
      <div className="history-detail">
        <div className="history-detail-actions">
          <button className="button button-secondary" type="button" onClick={onBack}>Back to history</button>
        </div>
        <div className="panel empty-state">
          <strong>Unable to load this analysis</strong>
          <span>{error}</span>
          <button className="button button-secondary" type="button" onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  }
  return (
    <div className="history-detail">
      <div className="history-detail-actions">
        <button className="button button-secondary" type="button" onClick={onBack}>Back to history</button>
        <div className="history-detail-tools">
          {confirming ? (
            <>
              <button className="analysis-card-keep" type="button" onClick={() => setConfirming(false)} disabled={deleting}>Keep</button>
              <button className="analysis-card-delete history-detail-delete" type="button" onClick={() => onDelete(item)} disabled={deleting} aria-label={deleting ? "Deleting analysis" : "Confirm delete this analysis"}><Trash2 size={16} strokeWidth={2} /></button>
            </>
          ) : (
            <button className="analysis-card-delete history-detail-delete" type="button" onClick={() => setConfirming(true)} disabled={deleting} aria-label="Delete this analysis"><Trash2 size={16} strokeWidth={2} /></button>
          )}
          <span className="status review">Saved analysis</span>
        </div>
      </div>
      {deleteError && <p className="form-error">{deleteError}</p>}
      <AssessmentReport result={item.result || {}} preview={item.imageUrls?.[0] || ""} imageFallback={item} />
    </div>
  );
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

function Analysis({ file, preview, chooseFile, uploadMessage, setUploadMessage, analysisResult, setAnalysisResult, analysisLoading, setAnalysisLoading, storageStatus, setStorageStatus }) {
  const ready = useReveal();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [facingMode, setFacingMode] = useState(CAMERA_FACING.ENVIRONMENT);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [satelliteContext, setSatelliteContext] = useState("none");
  const [provider, setProvider] = useState("colab");
  const [colabStatus, setColabStatus] = useState("");
  const [colabChecking, setColabChecking] = useState(false);
  function closeCamera() {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraBusy(false);
  }
  function takeFile(nextFile) {
    closeCamera();
    chooseFile(nextFile);
  }
  async function startCamera(nextFacing = facingMode) {
    setUploadMessage("");
    setCameraBusy(true);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    try {
      const stream = await requestCameraStream(undefined, nextFacing);
      streamRef.current = stream;
      setFacingMode(nextFacing);
      setCameraActive(true);
    } catch (error) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setUploadMessage(mapCameraError(error));
    } finally {
      setCameraBusy(false);
    }
  }
  async function capturePhoto() {
    setCameraBusy(true);
    try {
      const captured = await captureVideoFrame(videoRef.current);
      takeFile(captured);
    } catch (error) {
      setUploadMessage(mapCameraError(error));
      setCameraBusy(false);
    }
  }
  useLayoutEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !cameraActive || !stream) return undefined;
    video.srcObject = stream;
    video.play().catch(() => {});
    return undefined;
  }, [cameraActive, facingMode]);
  useEffect(() => () => stopMediaStream(streamRef.current), []);
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
    const satelliteCoordinates = analyzeSatelliteCoordinates(satelliteContext, latitude, longitude, locationConfirmed);
    if (satelliteContext === "coordinates" && !satelliteCoordinates.latitude) {
      setUploadMessage("Select and confirm a field location before including satellite context.");
      return;
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
      let storageWarning = "";
      if (uploadResponse.ok && uploadPayload.secureUrl) {
        imageUrl = uploadPayload.secureUrl;
        setStorageStatus("Original image stored securely.");
      } else {
        storageWarning = "The original image was not stored, so history may not keep a photo. Analysis continued from the image in memory.";
        setStorageStatus(storageWarning);
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, imageUrl, provider, latitude: satelliteCoordinates.latitude, longitude: satelliteCoordinates.longitude })
      });
      const payload = await response.json();
      if (!response.ok) setUploadMessage(payload.error || "The analysis could not be completed.");
      else {
        setAnalysisResult(payload);
        const saveResponse = await fetch("/api/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagePath: payload.imageUrl, result: payload })
        });
        if (!saveResponse.ok) setUploadMessage("Analysis completed, but it could not be saved to history.");
        else if (storageWarning) setUploadMessage(storageWarning);
      }
    } catch (error) {
      console.error("Analysis flow failed", error);
      setUploadMessage("The analysis could not be completed. Check your connection and try again.");
    } finally {
      setAnalysisLoading(false);
    }
  }
  useLayoutEffect(() => {
    if (analysisResult) scrollWorkspaceToTop();
  }, [analysisResult]);
  if (!ready) return <AnalysisSkeleton />;
  return (
    <section className="page">
      <div className="page-heading compact-heading">
        <div>
          <p className="overline">NEW ANALYSIS</p>
          <h1>{analysisResult ? "Leaf assessment." : "Add a leaf image."}</h1>
          <p className="lead">{analysisResult ? "Image classification, botanical references, and satellite observations are shown as separate evidence." : "Upload a photo or capture one with the camera. Automatic identification currently supports 12 classes across Neem, Tulsi, and Kalanchoe (PatharKuchi, Kalanchoe pinnata)."}</p>
        </div>
      </div>
      {analysisResult ? (
        <AnalysisResult result={analysisResult} preview={preview} onNew={() => setAnalysisResult(null)} />
      ) : (
        <div className="analysis-workspace">
          <div className="panel upload-panel">
            <div className="upload-grid">
              <div className="image-source">
                <div
                  className={`dropzone ${preview && !cameraActive ? "has-preview" : ""} ${cameraActive ? "is-camera" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); takeFile(event.dataTransfer.files[0]); }}
                >
                  <input id="image-upload" type="file" accept="image/jpeg,image/png" onChange={(event) => { takeFile(event.target.files[0]); event.target.value = ""; }} />
                  {cameraActive ? (
                    <>
                      <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
                      <div className="camera-toolbar">
                        <button className="button button-primary" type="button" onClick={capturePhoto} disabled={cameraBusy}>{cameraBusy ? "Capturing..." : "Capture photo"}</button>
                        <button className="button button-secondary" type="button" onClick={() => startCamera(nextCameraFacing(facingMode))} disabled={cameraBusy}>Switch camera</button>
                        <button className="button button-ghost" type="button" onClick={closeCamera} disabled={cameraBusy}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div className="dropzone-empty">
                      {preview ? (
                        <label htmlFor="image-upload">
                          {/* File-picker preview uses a blob: object URL that next/image cannot load. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={preview} alt="Selected leaf preview" />
                        </label>
                      ) : (
                        <>
                          <strong>{cameraBusy ? "Opening camera..." : "Add a leaf image"}</strong>
                          <span>The model will detect Neem, Tulsi, or Kalanchoe from the image</span>
                        </>
                      )}
                      <p className="dropzone-choice">
                        <label htmlFor="image-upload">Upload image</label>
                        <span> or </span>
                        <button type="button" onClick={() => startCamera()} disabled={cameraBusy || analysisLoading}>{cameraBusy ? "Opening camera..." : "Use camera"}</button>
                      </p>
                      {!preview && <small>JPG or PNG, up to 10 MB</small>}
                    </div>
                  )}
                </div>
              </div>
              <div className="upload-controls">
                <FilterSelect
                  label="Inference provider"
                  value={provider}
                  options={[{ value: "colab", label: "Google Colab (primary)" }, { value: "render", label: "Render (optional)" }]}
                  onChange={(value) => { setProvider(value); setColabStatus(""); }}
                />
                {provider === "colab" && (
                  <div className="provider-status">
                    <span className={`status ${colabStatus === "available" ? "healthy" : "review"}`}>{colabChecking ? "Checking Colab..." : colabStatus === "available" ? "Colab available" : colabStatus === "unconfigured" ? "Colab not configured" : colabStatus === "offline" ? "Colab offline" : "Colab not checked"}</span>
                    <button type="button" className="link-button" onClick={checkColabStatus} disabled={colabChecking}>{colabChecking ? "Checking..." : "Check status"}</button>
                  </div>
                )}
                <FilterSelect
                  label="Satellite context"
                  value={satelliteContext}
                  options={[{ value: "none", label: "No, analyze the leaf image only" }, { value: "coordinates", label: "Yes, select a field location" }]}
                  onChange={setSatelliteContext}
                />
                {satelliteContext === "coordinates" && (
                  <p className="privacy">Use the map below to search or click the field. Confirm the point before running analysis.</p>
                )}
                {storageStatus && <p className="privacy">{storageStatus}</p>}
                {uploadMessage && <p className="form-error">{uploadMessage}</p>}
                <button className="button button-primary full-button" disabled={!file || analysisLoading || colabChecking} onClick={runAnalysis}>{analysisLoading ? "Preparing report..." : "Run analysis"}</button>
                <p className="privacy">{provider === "colab" ? "Colab is the primary inference runtime and works only while its notebook and tunnel are active." : "Render is an optional inference provider. Disease prediction uses the configured Render service when selected."}</p>
              </div>
            </div>
            {satelliteContext === "coordinates" && (
              <FieldLocationPicker
                latitude={latitude}
                longitude={longitude}
                confirmed={locationConfirmed}
                onConfirm={(location) => {
                  setLatitude(String(location.latitude));
                  setLongitude(String(location.longitude));
                  setLocationConfirmed(true);
                }}
                onClear={() => {
                  setLatitude("");
                  setLongitude("");
                  setLocationConfirmed(false);
                }}
              />
            )}
          </div>
          <div className="panel process-panel">
            <div className="process-heading">
              <div>
                <h2>Separated evidence</h2>
                <p>The report does not mix image classification with botanical, disease, traditional, or satellite sources.</p>
              </div>
            </div>
            <div className="process-grid">
              <div className="process-line"><strong>Image classification</strong><small>EfficientNet-B0 predicts one of 12 supported crop and condition labels.</small></div>
              <div className="process-line"><strong>Plant, disease, and traditional records</strong><small>Shown only when a matching sourced knowledge record exists.</small></div>
              <div className="process-line"><strong>Satellite field context</strong><small>Sentinel-2 NDVI and McFeeters NDWI when coordinates and bands are available.</small></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
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
  const modelStatus = visual.model?.status;
  const statusLabel = visual.condition ? "Preliminary result" : modelStatus === "not_configured" ? "Inference unavailable" : modelStatus === "service_unavailable" ? "Service unavailable" : modelStatus === "invalid_image" ? "Invalid image" : "No compatible prediction";
  const statusClass = visual.healthy ? "healthy" : "review";
  return <div className="report"><div className="report-actions"><span className={`status ${statusClass}`}>{statusLabel}</span><button className="button button-secondary" onClick={onNew}>New analysis</button></div><AssessmentReport result={result} preview={preview} /></div>;
}

function formatIndex(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "Unavailable";
}

function satelliteStatusLabel(satellite) {
  if (satellite?.status === "available") return "Available";
  if (satellite?.status === "requires_coordinates") return "Requires coordinates";
  if (satellite?.status === "processing_failed") return "Processing failed";
  return "Not available";
}

function knowledgeStatusLabel(record) {
  if (record?.status === "available") return "Available";
  if (record?.status === "not_applicable") return "Not applicable";
  return "Not available";
}

function SourceBox({ record }) {
  if (!record?.source) return null;
  return (
    <footer className="knowledge-source-footer">
      <span className="knowledge-source-label">Source</span>
      <strong>{record.source}{record.sourceInstitution ? ` · ${record.sourceInstitution}` : ""}{record.sourceLocator ? ` · ${record.sourceLocator}` : ""}</strong>
      {record.sourceUrl && <a className="knowledge-source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}
    </footer>
  );
}

function LabeledKnowledge({ record, fallback, extraFields }) {
  const parsed = parseLabeledInformation(humanizeUserText(combineKnowledgeText(record) || record?.information || ""));
  const fields = { ...(extraFields || {}), ...parsed.fields };
  const entries = Object.entries(fields);
  const description = parsed.description || (!entries.length ? record?.information : "");
  if (!entries.length && !description) return <p>{fallback}</p>;
  return (
    <>
      {entries.length > 0 && <div className="profile-fields">{entries.map(([label, value]) => <div key={label}><span>{label}</span><strong>{humanizeUserText(value)}</strong></div>)}</div>}
      {description && <p>{humanizeUserText(description)}</p>}
    </>
  );
}

function AssessmentReport({ result, preview, imageFallback }) {
  useLayoutEffect(() => {
    scrollWorkspaceToTop();
  }, []);
  const visual = result.visual || {};
  const knowledge = result.knowledge || {};
  const plantProfile = knowledge.plantProfile || {};
  const disease = knowledge.disease || {};
  const traditional = knowledge.traditional || {};
  const satellite = result.satellite || {};
  const heatmap = visual.explainability?.status === "available" && typeof visual.explainability?.heatmap === "string" && visual.explainability.heatmap.startsWith("data:image/")
    ? visual.explainability.heatmap
    : null;
  const detectedTitle = visual.crop && visual.condition ? `${visual.crop} / ${visual.condition}` : "No prediction available";
  return <div className="assessment-stack">
    <div className="report-grid">
      <div className="panel report-image">
        {preview ? (
          // Report leaf may be a blob: preview or a stored remote URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Analyzed leaf" />
        ) : imageFallback?.imageUrls?.length ? imageFallback.imageUrls.map((url, index) => (
          // Stored report images are Cloudinary or other remote URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${url}-${index}`} src={url} alt={`${visual.crop || "Leaf"} image ${index + 1}`} onError={(event) => { event.currentTarget.remove(); }} />
        )) : <div className="history-image-fallback sage"><span>No stored image</span></div>}
        <div><p className="overline">UPLOADED LEAF</p><h2>{detectedTitle}</h2><p>{visual.summary || "The uploaded image has not received a model prediction."}</p></div>
      </div>
      <div className="panel result-card">
        <p className="overline">DETECTED PLANT</p>
        <h2>{visual.crop || "Not detected"}</h2>
        <p>{visual.scientificName ? `${visual.scientificName}${visual.family ? ` · ${visual.family}` : ""}` : "Scientific name is shown only for the three supported plants."}</p>
        <div className="confidence"><span>Model confidence (uncalibrated softmax)</span><strong>{typeof visual.confidence === "number" ? `${(visual.confidence * 100).toFixed(1)}%` : "—"}</strong></div>
        <p>{visual.limitations}</p>
        <p className="assessment-note">If this leaf does not look like Neem, Tulsi, or Kalanchoe (PatharKuchi, Kalanchoe pinnata), treat the result as outside the 12 supported classes. A user correction is not stored in place of the model prediction.</p>
      </div>
    </div>
    <section className="panel report-section report-section-wide">
      <div className="section-heading"><h2>Grad-CAM explainability</h2><span className="badge">{heatmap ? "Available" : "Not available"}</span></div>
      {heatmap ? <div className="gradcam-pair">{preview ? <div className="gradcam-frame">{/* Original leaf may be a blob: upload preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Original leaf" />
        </div> : null}<div className="gradcam-frame">{/* Grad-CAM overlays are data:image heatmaps; next/image cannot load them. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heatmap} alt="Grad-CAM overlay for the predicted class" />
        </div></div> : <p>No heatmap is shown because Grad-CAM was not returned for this inference.</p>}
      <p>{heatmap ? "The overlay marks image regions that influenced the predicted class. It does not prove a causal diagnosis." : visual.explainability?.message}</p>
    </section>
    <div className="report-sections">
      <section className="panel report-section">
        <div className="section-heading"><h2>Plant profile</h2><span className="badge">{knowledgeStatusLabel(plantProfile)}</span></div>
        <div className="report-section-body">
          {plantProfile.status === "available" ? <LabeledKnowledge record={plantProfile} extraFields={visual.crop ? { "Common name": visual.crop, ...(visual.scientificName ? { "Scientific name": visual.scientificName } : {}), ...(visual.family ? { Family: visual.family } : {}) } : undefined} fallback="No botanical plant profile is currently stored for this detected plant." /> : <p>{humanizeUserText(plantProfile.information) || "No botanical plant profile is currently stored for this detected plant."}</p>}
        </div>
        <SourceBox record={plantProfile} />
      </section>
      <section className="panel report-section">
        <div className="section-heading"><h2>Disease information</h2><span className="badge">{knowledgeStatusLabel(disease)}</span></div>
        <div className="report-section-body">
          {disease.status === "available" ? <LabeledKnowledge record={disease} fallback="Detailed disease information is not currently available." /> : <p>{humanizeUserText(disease.information) || "Detailed disease information is not currently available."}</p>}
        </div>
        <SourceBox record={disease} />
      </section>
      <section className="panel report-section">
        <div className="section-heading"><h2>Traditional references</h2><span className="badge">{knowledgeStatusLabel(traditional)}</span></div>
        <div className="report-section-body">
          {traditional.status === "available" ? <LabeledKnowledge record={traditional} fallback="No verified traditional reference available." /> : <p>{humanizeUserText(traditional.information) || "No verified traditional reference available."}</p>}
        </div>
        <SourceBox record={traditional} />
      </section>
    </div>
    <div className="report-sections report-sections-2">
      <section className="panel report-section">
        <div className="section-heading"><h2>Satellite field context</h2><span className="badge">{satelliteStatusLabel(satellite)}</span></div>
        <div className="report-section-body">
          <p>{satellite.summary || "Field context requires a location."}</p>
          <div className="satellite-metrics">
            <Metric label="NDVI" value={formatIndex(satellite.ndvi)} />
            <Metric label="NDWI (McFeeters)" value={formatIndex(satellite.ndwi)} />
            <Metric label="NDMI" value={formatIndex(satellite.ndmi)} />
            <Metric label="Scene date" value={satellite.sceneDate || "Not queried"} />
            <Metric label="Cloud cover" value={typeof satellite.cloudCover === "number" ? `${satellite.cloudCover.toFixed(1)}%` : "Unavailable"} />
            <Metric label="Coordinates" value={Number.isFinite(satellite.latitude) && Number.isFinite(satellite.longitude) ? `${satellite.latitude.toFixed(4)}, ${satellite.longitude.toFixed(4)}` : "Not supplied"} />
          </div>
        </div>
        <p className="source">{[satellite.ndviDefinition, satellite.ndwiDefinition, satellite.ndmiDefinition, satellite.source].filter(Boolean).join(" ")} These indices describe field vegetation and water contrast, not a confirmed leaf disease.</p>
      </section>
      <section className="panel report-section">
        <div className="section-heading"><h2>Sources and limitations</h2></div>
        <div className="report-section-body">
          <p>These evidence sources stay separate. They are not interchangeable, and this report is not a medical or agronomic confirmation.</p>
          <div className="limitation-grid">
            <div className="limitation-item"><strong>Image model</strong><small>Leaf classification only.</small></div>
            <div className="limitation-item"><strong>Botanical records</strong><small>Sourced plant identity.</small></div>
            <div className="limitation-item"><strong>Disease records</strong><small>Literature context.</small></div>
            <div className="limitation-item"><strong>Traditional notes</strong><small>Historical references.</small></div>
            <div className="limitation-item"><strong>Satellite indices</strong><small>Field vegetation contrast.</small></div>
          </div>
        </div>
      </section>
    </div>
  </div>;
}

function Metric({ label, value }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function HistoryView({ userId, initialSelectedItem, onClearSelectedItem }) {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(initialSelectedItem);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialSelectedItem?.id));
  const [detailError, setDetailError] = useState("");
  const [detailTick, setDetailTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [listTick, setListTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [deletingId, setDeletingId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  async function deleteHistoryItem(item) {
    if (!item?.id) return;
    setDeletingId(item.id);
    setDeleteError("");
    try {
      await fetchJson(`/api/analyses/${item.id}`, { method: "DELETE", timeoutMs: HISTORY_LIST_TIMEOUT_MS });
      setItems((current) => current.filter((row) => row.id !== item.id));
      if (selectedItem?.id === item.id) {
        scrollWorkspaceToTop();
        setSelectedItem(null);
        setDetailError("");
        onClearSelectedItem();
      }
    } catch (error) {
      setDeleteError(error.message || "Unable to delete this analysis.");
    } finally {
      setDeletingId("");
    }
  }
  useEffect(() => {
    setSelectedItem(initialSelectedItem);
    if (initialSelectedItem?.id) {
      setDetailLoading(true);
      setDetailError("");
    }
  }, [initialSelectedItem]);
  useLayoutEffect(() => {
    scrollWorkspaceToTop();
  }, [selectedItem?.id, detailLoading]);
  useEffect(() => {
    const id = selectedItem?.id;
    if (!id) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    setDetailLoading(true);
    setDetailError("");
    fetchJson(`/api/analyses/${id}`, { timeoutMs: HISTORY_DETAIL_TIMEOUT_MS, signal: controller.signal })
      .then(async (payload) => {
        await waitAtLeast(startedAt);
        if (cancelled || !payload.analysis) return;
        setSelectedItem(toHistoryItem(payload.analysis));
      })
      .catch(async (error) => {
        await waitAtLeast(startedAt);
        if (cancelled || error?.name === "AbortError") return;
        setDetailError(error.message || "Unable to load this analysis.");
      })
      .finally(async () => {
        await waitAtLeast(startedAt);
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedItem?.id, detailTick]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    setLoading(true);
    setListError("");
    fetchJson("/api/analyses", { timeoutMs: HISTORY_LIST_TIMEOUT_MS, signal: controller.signal })
      .then(async (payload) => {
        await waitAtLeast(startedAt);
        if (cancelled) return;
        setItems((payload.analyses || []).map(toHistoryItem));
      })
      .catch(async (error) => {
        await waitAtLeast(startedAt);
        if (cancelled || error?.name === "AbortError") return;
        setItems([]);
        setListError(error.message || "Unable to load analysis history.");
      })
      .finally(async () => {
        await waitAtLeast(startedAt);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [userId, listTick]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const cutoff = dateRange === "all" ? 0 : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
  const filteredItems = items.filter((item) => {
    const matchesSearch = !normalizedQuery || `${item.crop} ${item.status}`.toLowerCase().includes(normalizedQuery);
    const matchesDate = dateRange === "all" || new Date(item.createdAt).getTime() >= cutoff;
    return matchesSearch && matchesDate;
  });
  if (!selectedItem && loading) return <HistoryListSkeleton />;
  return (
    <section className="page">
      {!selectedItem && (
        <div className="page-heading compact-heading">
          <div>
            <p className="overline">YOUR WORKSPACE</p>
            <h1>Analysis history.</h1>
            <p className="lead">Review previous results and keep your research connected.</p>
          </div>
        </div>
      )}
      {selectedItem ? (
        <HistoryDetail
          key={selectedItem.id}
          item={selectedItem}
          loading={detailLoading}
          error={detailError}
          deleteError={deleteError}
          deleting={deletingId === selectedItem.id}
          onDelete={deleteHistoryItem}
          onRetry={() => setDetailTick((value) => value + 1)}
          onBack={() => { scrollWorkspaceToTop(); setSelectedItem(null); setDetailError(""); setDeleteError(""); onClearSelectedItem(); }}
        />
      ) : (
        <div className="history-workspace">
          <div className="panel history-panel">
            <div className="history-tools">
              <label className="search-box" aria-label="Search analyses"><Search size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by crop or result" /></label>
              <HistoryFilterSelect value={dateRange} onChange={setDateRange} />
            </div>
          </div>
          {loading ? (
            <div className="history-card-grid">{[1, 2, 3, 4, 5, 6].map((item) => <AnalysisCardSkeleton key={item} />)}</div>
          ) : listError ? (
            <div className="panel empty-state"><strong>Unable to load analysis history</strong><span>{listError}</span><button className="button button-secondary" type="button" onClick={() => setListTick((value) => value + 1)}>Retry</button></div>
          ) : filteredItems.length ? (
            <>
              {deleteError && <p className="form-error">{deleteError}</p>}
              <div className="history-card-grid">{filteredItems.map((item, index) => <AnalysisRow key={item.id || `${item.crop}-${index}`} item={item} deleting={deletingId === item.id} onDelete={deleteHistoryItem} onOpen={() => { scrollWorkspaceToTop(); setDetailLoading(true); setDetailError(""); setDeleteError(""); setSelectedItem(item); }} />)}</div>
            </>
          ) : (
            <div className="panel empty-state"><strong>{items.length ? "No matching analyses" : "No analyses yet"}</strong><span>{items.length ? "Try a different search or date range." : "Run your first crop analysis to see it here."}</span></div>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryFilterSelect({ value, onChange }) {
  const options = [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "all", label: "All time" }];
  return <div className="history-range filter-select-wrap"><span>Showing</span><FilterSelect value={value} options={options} onChange={onChange} ariaLabel="Filter analyses by date" compact /></div>;
}

function Knowledge() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [diseaseFilter, setDiseaseFilter] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState("");
  const loadKnowledge = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (cropFilter) params.set("crop", cropFilter);
    if (diseaseFilter.trim()) params.set("disease", diseaseFilter.trim());
    if (recordTypeFilter) params.set("recordType", recordTypeFilter);
    try {
      const response = await fetch(`/api/knowledge?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load knowledge records.");
      setRecords(payload.records || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      await waitAtLeast(startedAt);
      setLoading(false);
    }
  }, [cropFilter, diseaseFilter, recordTypeFilter]);
  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);
  if (loading && records.length === 0 && !error) return <KnowledgeSkeleton />;
  return (
    <section className="page">
      <div className="page-heading compact-heading">
        <div>
          <p className="overline">KNOWLEDGE BASE</p>
          <h1>Sourced plant and disease records.</h1>
          <p className="lead">Botanical, disease, and traditional records are stored separately and are not a substitute for the image model.</p>
        </div>
        <span className="knowledge-count">{records.length} records</span>
      </div>
      <div className="knowledge-intro panel">
        <div>
          <strong>Read the evidence around the image.</strong>
          <p>Botanical identity, disease context, and traditional references are stored as separate record types. They do not replace the image model or field verification.</p>
        </div>
      </div>
      <div className="knowledge-filters panel">
        <FilterSelect label="Crop" value={cropFilter} placeholder="All crops" options={crops.map((crop) => ({ value: crop.name, label: crop.name }))} onChange={setCropFilter} />
        <label className="field"><span>Disease or condition</span><input value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)} placeholder="Exact record condition" /></label>
        <FilterSelect label="Record type" value={recordTypeFilter} placeholder="All types" options={[{ value: "general_crop", label: "General crop" }, { value: "botanical", label: "Botanical" }, { value: "traditional_reference", label: "Traditional reference" }, { value: "disease_context", label: "Disease context" }]} onChange={setRecordTypeFilter} />
      </div>
      {loading ? (
        <div className="knowledge-grid"><KnowledgeCardSkeleton /><KnowledgeCardSkeleton /><KnowledgeCardSkeleton /><KnowledgeCardSkeleton /><KnowledgeCardSkeleton /><KnowledgeCardSkeleton /></div>
      ) : error ? (
        <div className="panel empty-state"><strong>Knowledge base unavailable</strong><span>{error}</span><button className="button button-secondary" onClick={loadKnowledge}>Retry</button></div>
      ) : records.length ? (
        <div className="knowledge-grid">
          {records.map((item) => (
            <article className="knowledge-card" key={item.id}>
              <p className="overline">{humanizeUserText(item.crop_name)} · {humanizeUserText(item.record_type)}</p>
              <h2>{humanizeUserText(item.matched_disease)}</h2>
              <div className="knowledge-card-body"><p>{humanizeUserText(item.summary || item.information)}</p></div>
              <div className="knowledge-source"><span>{item.source_title}{item.source_institution ? ` · ${item.source_institution}` : ""}{item.source_locator ? ` · ${item.source_locator}` : ""}</span></div>
              {item.source_url && <a className="link-button" href={item.source_url} target="_blank" rel="noreferrer">Open source reference</a>}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty-state"><strong>No knowledge records</strong><span>Add source-backed crop records to the knowledge table.</span></div>
      )}
    </section>
  );
}

function FilterSelect({ label, value, placeholder, options, onChange, ariaLabel, compact = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedLabel = options.find((option) => option.value === value)?.label || placeholder;
  useEffect(() => {
    function closeOnOutside(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);
  const menuOptions = placeholder ? [{ value: "", label: placeholder }, ...options] : options;
  return <div className={`${compact ? "filter-select filter-select-compact" : "field filter-select"} ${open ? "is-open" : ""}`} ref={containerRef}>{label && <span>{label}</span>}<button type="button" className="filter-select-trigger" aria-label={ariaLabel || label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span className={!value ? "is-placeholder" : ""}>{selectedLabel}</span><ChevronDown size={16} /></button>{open && <div className="filter-select-menu" role="listbox" aria-label={ariaLabel || label}>{menuOptions.map((option) => <button type="button" role="option" aria-selected={value === option.value} className={value === option.value ? "is-selected" : ""} key={option.value || "all"} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}</div>;
}

function Avatar({ user, name, size = "large" }) {
  return user?.avatar_url
    ? (
      // Avatars are remote Cloudinary URLs, not static public paths.
      // eslint-disable-next-line @next/next/no-img-element
      <img className={`user-avatar user-avatar-${size}`} src={user.avatar_url} alt={`${name} profile`} />
    )
    : <div className={`avatar-fallback avatar-fallback-${size}`}>{name.slice(0, 2).toUpperCase()}</div>;
}

function Profile({ user, name, email, onProfileUpdated }) {
  const ready = useReveal();
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

  if (!ready) return <ProfileSkeleton />;
  return <section className="page"><div className="page-heading compact-heading"><div><p className="overline">ACCOUNT</p><h1>Profile & settings.</h1><p className="lead">Manage your identity and account security.</p></div></div><div className="settings-grid"><div className="panel profile-panel settings-span"><div className="profile-photo-column"><Avatar user={user} name={name} /><label className="button button-secondary avatar-upload">{avatarBusy ? "Saving..." : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={avatarBusy} /></label>{user.avatar_url && <button className="avatar-remove" type="button" onClick={removeAvatar} disabled={avatarBusy}>Remove photo</button>}{avatarError && <p className="form-error">{avatarError}</p>}</div><div className="profile-details"><p className="overline">SIGNED IN AS</p><h2>{name}</h2><p>{email}</p>{editing ? <form className="profile-edit-form" onSubmit={saveProfile}><label className="field"><span>Display name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={80} required autoFocus /></label><div className="profile-actions"><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button><button className="button button-secondary" type="button" onClick={() => { setEditing(false); setFullName(name); setError(""); }}>Cancel</button></div></form> : <button className="button button-secondary" onClick={() => { setEditing(true); setMessage(""); setError(""); }}>Edit profile</button>}{message && <p className="form-success">{message}</p>}{error && <p className="form-error">{error}</p>}</div></div><div className="panel settings-card"><div className="settings-card-heading"><div><p className="overline">SECURITY</p><h2>Password</h2></div></div><p>Change your password without exposing it to the browser or database logs.</p>{passwordOpen ? <form className="settings-form" onSubmit={changePassword}><label className="field"><span>Current password</span><input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required /></label><label className="field"><span>New password</span><input type="password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required /></label><label className="field"><span>Confirm new password</span><input type="password" minLength={8} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required /></label><div className="profile-actions"><button className="button button-primary" disabled={saving}>{saving ? "Updating..." : "Update password"}</button><button className="button button-secondary" type="button" onClick={() => { setPasswordOpen(false); setPasswordError(""); }}>Cancel</button></div></form> : <button className="button button-secondary" onClick={() => { setPasswordOpen(true); setPasswordMessage(""); setPasswordError(""); }}>Change password</button>}{passwordMessage && <p className="form-success">{passwordMessage}</p>}{passwordError && <p className="form-error">{passwordError}</p>}</div><div className="panel settings-card danger-card"><div className="settings-card-heading"><div><p className="overline">DANGER ZONE</p><h2>Delete account</h2></div></div><p>Remove your account, saved analyses, and active sessions permanently.</p>{deleteOpen ? <form className="settings-form" onSubmit={deleteAccount}><label className="field"><span>Current password</span><input type="password" value={deleteForm.password} onChange={(event) => setDeleteForm({ ...deleteForm, password: event.target.value })} required /></label><label className="field"><span>Type DELETE to confirm</span><input value={deleteForm.confirmation} onChange={(event) => setDeleteForm({ ...deleteForm, confirmation: event.target.value })} required /></label><div className="profile-actions"><button className="button button-danger" disabled={deleting}>{deleting ? "Deleting..." : "Delete permanently"}</button><button className="button button-secondary" type="button" onClick={() => { setDeleteOpen(false); setDeleteError(""); }}>Cancel</button></div></form> : <button className="button button-danger-outline" onClick={() => { setDeleteOpen(true); setDeleteError(""); }}>Delete account</button>}{deleteError && <p className="form-error">{deleteError}</p>}</div></div></section>;
}
