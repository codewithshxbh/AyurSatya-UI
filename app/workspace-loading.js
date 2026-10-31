"use client";

function range(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function HeadingSkeleton({ compact = false, action = false }) {
  return (
    <div className={`page-heading${compact ? " compact-heading" : ""}`}>
      <div>
        <div className="skeleton skeleton-overline" />
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-lead" />
      </div>
      {action ? <div className="skeleton skeleton-action" /> : null}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="stat" aria-hidden="true">
      <span className="skeleton skeleton-line skeleton-line-sm" />
      <strong className="skeleton skeleton-line skeleton-line-lg" />
      <small className="skeleton skeleton-line skeleton-line-xs" />
    </div>
  );
}

export function AnalysisCardSkeleton() {
  return (
    <div className="analysis-card" aria-hidden="true">
      <div className="analysis-card-media"><span className="skeleton skeleton-fill" /></div>
      <div className="analysis-card-body">
        <span className="skeleton skeleton-line skeleton-line-md" />
        <span className="skeleton skeleton-line skeleton-line-sm" />
        <span className="skeleton skeleton-line skeleton-line-xs" />
        <b className="skeleton skeleton-line skeleton-line-sm" />
      </div>
    </div>
  );
}

export function KnowledgeCardSkeleton() {
  return (
    <article className="knowledge-card" aria-hidden="true">
      <p className="overline"><span className="skeleton skeleton-line skeleton-line-xs" /></p>
      <h2><span className="skeleton skeleton-line skeleton-line-title" /></h2>
      <div className="knowledge-card-body">
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line skeleton-line-sm" />
      </div>
      <div className="knowledge-source"><span className="skeleton skeleton-line skeleton-line-sm" /></div>
    </article>
  );
}

function ReportSectionSkeleton({ metrics = 0 }) {
  return (
    <section className="panel report-section" aria-hidden="true">
      <div className="section-heading">
        <span className="skeleton skeleton-line skeleton-line-title" />
        <span className="skeleton skeleton-badge" />
      </div>
      <div className="report-section-body">
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line skeleton-line-sm" />
      </div>
      {metrics > 0 ? (
        <div className="satellite-metrics">
          {range(metrics).map((item) => (
            <div key={item}>
              <span className="skeleton skeleton-line skeleton-line-xs" />
              <strong className="skeleton skeleton-line skeleton-line-sm" />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OverviewSkeleton() {
  return (
    <section className="page" aria-busy="true">
      <HeadingSkeleton action />
      <div className="stats">{range(3).map((item) => <StatSkeleton key={item} />)}</div>
      <div className="section-title">
        <div>
          <span className="skeleton skeleton-line skeleton-line-title" />
          <span className="skeleton skeleton-line skeleton-line-sm" />
        </div>
      </div>
      <div className="class-pill-row">{range(12).map((item) => (
        <span className="class-pill class-pill-loading" key={item}>
          <span className="class-pill-inner">
            <span className="skeleton class-pill-photo" />
            <span className="class-pill-copy">
              <span className="skeleton skeleton-line skeleton-line-sm" />
              <span className="skeleton skeleton-line skeleton-line-xs" />
            </span>
          </span>
        </span>
      ))}</div>
      <div className="section-title">
        <div>
          <span className="skeleton skeleton-line skeleton-line-title" />
          <span className="skeleton skeleton-line skeleton-line-sm" />
        </div>
        <span className="skeleton skeleton-line skeleton-line-xs" />
      </div>
      <div className="history-card-grid">{range(3).map((item) => <AnalysisCardSkeleton key={item} />)}</div>
      <div className="panel note-panel note-banner" aria-hidden="true">
        <div>
          <span className="skeleton skeleton-overline" />
          <span className="skeleton skeleton-line skeleton-line-title" />
          <span className="skeleton skeleton-line" />
        </div>
        <span className="skeleton skeleton-action" />
      </div>
    </section>
  );
}

export function HistoryListSkeleton() {
  return (
    <section className="page" aria-busy="true">
      <HeadingSkeleton compact />
      <div className="history-workspace">
        <div className="panel history-panel">
          <div className="history-tools">
            <span className="skeleton skeleton-search" />
            <span className="skeleton skeleton-filter" />
          </div>
        </div>
        <div className="history-card-grid">{range(6).map((item) => <AnalysisCardSkeleton key={item} />)}</div>
      </div>
    </section>
  );
}

export function ReportSkeleton({ onBack }) {
  return (
    <div className="history-detail" aria-busy="true">
      <div className="history-detail-actions">
        {onBack ? <button className="button button-secondary" type="button" onClick={onBack}>Back to history</button> : <span className="skeleton skeleton-action" />}
        <span className="skeleton skeleton-badge" />
      </div>
      <div className="assessment-stack">
        <div className="report-grid">
          <div className="panel report-image" aria-hidden="true">
            <span className="skeleton skeleton-report-image" />
            <div>
              <span className="skeleton skeleton-overline" />
              <span className="skeleton skeleton-line skeleton-line-title" />
              <span className="skeleton skeleton-line" />
            </div>
          </div>
          <div className="panel result-card" aria-hidden="true">
            <span className="skeleton skeleton-overline" />
            <span className="skeleton skeleton-line skeleton-line-title" />
            <span className="skeleton skeleton-line skeleton-line-sm" />
            <div className="confidence">
              <span className="skeleton skeleton-line skeleton-line-xs" />
              <strong className="skeleton skeleton-line skeleton-line-lg" />
            </div>
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line skeleton-line-sm" />
          </div>
        </div>
        <section className="panel report-section report-section-wide" aria-hidden="true">
          <div className="section-heading">
            <span className="skeleton skeleton-line skeleton-line-title" />
            <span className="skeleton skeleton-badge" />
          </div>
          <div className="gradcam-pair">
            <div className="gradcam-frame"><span className="skeleton skeleton-fill" /></div>
            <div className="gradcam-frame"><span className="skeleton skeleton-fill" /></div>
          </div>
          <p><span className="skeleton skeleton-line" /></p>
        </section>
        <div className="report-sections">
          <ReportSectionSkeleton />
          <ReportSectionSkeleton />
          <ReportSectionSkeleton />
        </div>
        <div className="report-sections report-sections-2">
          <ReportSectionSkeleton metrics={6} />
          <ReportSectionSkeleton />
        </div>
      </div>
    </div>
  );
}

export function AnalysisSkeleton() {
  return (
    <section className="page" aria-busy="true">
      <HeadingSkeleton compact />
      <div className="analysis-workspace">
        <div className="panel upload-panel">
          <div className="upload-grid">
            <div className="image-source">
              <div className="dropzone" aria-hidden="true"><span className="skeleton skeleton-fill" /></div>
            </div>
            <div className="upload-controls" aria-hidden="true">
              <span className="skeleton skeleton-line skeleton-line-xs" />
              <span className="skeleton skeleton-filter" />
              <span className="skeleton skeleton-line skeleton-line-xs" />
              <span className="skeleton skeleton-filter" />
              <span className="skeleton skeleton-action skeleton-run" />
              <span className="skeleton skeleton-line" />
            </div>
          </div>
        </div>
        <div className="panel process-panel" aria-hidden="true">
          <div className="process-heading">
            <div>
              <span className="skeleton skeleton-line skeleton-line-title" />
              <span className="skeleton skeleton-line skeleton-line-sm" />
            </div>
          </div>
          <div className="process-grid">
            {range(3).map((item) => (
              <div className="process-line" key={item}>
                <strong className="skeleton skeleton-line skeleton-line-md" />
                <small className="skeleton skeleton-line" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function KnowledgeSkeleton() {
  return (
    <section className="page" aria-busy="true">
      <div className="page-heading compact-heading">
        <div>
          <div className="skeleton skeleton-overline" />
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-lead" />
        </div>
        <span className="skeleton skeleton-badge" />
      </div>
      <div className="knowledge-intro panel" aria-hidden="true">
        <div>
          <span className="skeleton skeleton-line skeleton-line-md" />
          <span className="skeleton skeleton-line" />
        </div>
      </div>
      <div className="knowledge-filters panel" aria-hidden="true">
        <div className="field"><span className="skeleton skeleton-line skeleton-line-xs" /><span className="skeleton skeleton-filter" /></div>
        <div className="field"><span className="skeleton skeleton-line skeleton-line-xs" /><span className="skeleton skeleton-filter" /></div>
        <div className="field"><span className="skeleton skeleton-line skeleton-line-xs" /><span className="skeleton skeleton-filter" /></div>
      </div>
      <div className="knowledge-grid">{range(6).map((item) => <KnowledgeCardSkeleton key={item} />)}</div>
    </section>
  );
}

export function ProfileSkeleton() {
  return (
    <section className="page" aria-busy="true">
      <HeadingSkeleton compact />
      <div className="settings-grid">
        <div className="panel profile-panel settings-span" aria-hidden="true">
          <div className="profile-photo-column">
            <span className="skeleton skeleton-profile-photo" />
            <span className="skeleton skeleton-action" />
          </div>
          <div className="profile-details">
            <span className="skeleton skeleton-overline" />
            <span className="skeleton skeleton-line skeleton-line-title" />
            <span className="skeleton skeleton-line skeleton-line-sm" />
            <span className="skeleton skeleton-action" />
          </div>
        </div>
        <div className="panel settings-card" aria-hidden="true">
          <div className="settings-card-heading">
            <div>
              <span className="skeleton skeleton-overline" />
              <span className="skeleton skeleton-line skeleton-line-title" />
            </div>
          </div>
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-action" />
        </div>
        <div className="panel settings-card danger-card" aria-hidden="true">
          <div className="settings-card-heading">
            <div>
              <span className="skeleton skeleton-overline" />
              <span className="skeleton skeleton-line skeleton-line-title" />
            </div>
          </div>
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-action" />
        </div>
      </div>
    </section>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="app-shell" aria-busy="true">
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-top"><span className="wordmark">Ayur<span>Satya</span></span></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="nav-list">
          <span className="skeleton skeleton-nav-item" />
          <span className="skeleton skeleton-nav-item" />
          <span className="skeleton skeleton-nav-item" />
          <span className="skeleton skeleton-nav-item" />
        </nav>
        <div className="sidebar-bottom">
          <span className="skeleton skeleton-nav-item" />
          <span className="skeleton skeleton-nav-item" />
          <div className="sidebar-account">
            <span className="skeleton skeleton-avatar" />
            <div className="sidebar-account-copy">
              <span className="skeleton skeleton-line skeleton-line-sm" />
              <span className="skeleton skeleton-line skeleton-line-xs" />
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <OverviewSkeleton />
      </main>
    </div>
  );
}
