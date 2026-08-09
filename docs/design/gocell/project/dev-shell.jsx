/* global React */
// Shell that adds Backlog / Board / AI Studio routes to the existing V1 sidebar.
// Reuses Sidebar / TopBar from v1-deep via window.V1Deep is too coarse — easier:
// duplicate a minimal sidebar here that includes the new routes.

(() => {
  const { useState, useEffect, useRef } = React;
  const { BacklogPage, BoardPage, AIStudio } = window.DevPages;

  const Ico = (d) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
  );
  const I = {
    backlog: Ico("M3 6h13 M3 12h13 M3 18h9 M19 6v12 M16 9l3-3 3 3 M16 15l3 3 3-3"),
    board:   Ico("M3 4h6v16H3z M11 4h6v10h-6z M19 4h2v6h-2z"),
    ai:      Ico("M12 2v4 M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2 M9 14h.01 M15 14h.01 M9 17h6"),
    users:   Ico("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"),
    audit:   Ico("M4 4h16v4H4z M4 12h10v8H4z M18 14l3 3-3 3 M21 17h-7"),
    config:  Ico("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3l2 .9-.8 2.3 1.3 1.7-1.7 1.7.4 2.2-2.2.4-1.1 2-2.1-.9-2 1.4-1.6-1.6-2.2.3-.3-2.2L5 17.4l1.4-2-.9-2.1 2-1.1L7.2 10l2.2-.3.3-2.2 2 .4 1.6-1.5 1.6 1.6 2.2-.4.4 2.2 2 1.1-.8 2.2z"),
    flag:    Ico("M4 21V4h13l-2 4 2 4H4"),
    cell:    Ico("M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 3v18 M4 7.5l8 4.5 8-4.5"),
    search:  Ico("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35"),
    theme:   Ico("M12 3a9 9 0 1 0 9 9c-.7.1-1.5.2-2.3.2A7 7 0 0 1 11.8 5c0-.8.1-1.4.2-2z"),
    cmd:     Ico("M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6v12a3 3 0 1 0 0-6"),
  };

  const NAV_GROUPS = [
    { label: 'Meta', items: [
      { k: 'coverage', label: 'Coverage', i: I.backlog, status: 'new' },
    ]},
    { label: 'Plan', items: [
      { k: 'products', label: 'Products',  i: I.cell,    status: 'live' },
      { k: 'backlog',  label: 'Backlog',   i: I.backlog, status: 'live' },
      { k: 'inbox',    label: 'Inbox',     i: I.backlog, status: 'live' },
      { k: 'board',    label: 'Board',     i: I.board,   status: 'live' },
      { k: 'sprint',   label: 'Sprint',    i: I.board,   status: 'live' },
    ]},
    { label: 'Build', items: [
      { k: 'workflow', label: 'Workflows', i: I.ai,      status: 'live' },
      { k: 'dag',      label: 'Task DAG',  i: I.backlog, status: 'live' },
      { k: 'ai',       label: 'AI studio', i: I.ai,      status: 'live' },
      { k: 'sandboxes',label: 'Sandboxes', i: I.ai,      status: 'live' },
      { k: 'deps',     label: 'Dependencies', i: I.cell, status: 'live' },
      { k: 'contracts', label: 'Contracts', i: I.cell,   status: 'live' },
    ]},
    { label: 'Operate', items: [
      { k: 'users',  label: 'Users',         i: I.users,  status: 'live' },
      { k: 'audit',  label: 'Audit log',     i: I.audit,  status: 'live' },
      { k: 'config', label: 'Configuration', i: I.config, status: 'live' },
      { k: 'flags',  label: 'Feature flags', i: I.flag,   status: 'live' },
      { k: 'cells',  label: 'Cells',         i: I.cell,   status: 'live' },
      { k: 'groups', label: 'Smart Groups',  i: I.cell,   status: 'preview' },
    ]},
    { label: 'Reserved', items: [
      { k: 'observe', label: 'Observability', i: I.audit, status: 'live' },
      { k: 'billing', label: 'Billing',       i: I.config, status: 'preview' },
      { k: 'secrets', label: 'Secrets vault', i: I.flag,   status: 'preview' },
    ]},
  ];

  const Sidebar = ({ active, onNav, collapsed, onCollapse, onCmd }) => (
    <aside className="v1-side" data-collapsed={collapsed || undefined}>
      <div className="v1-side-top">
        <div className="v1-brand">
          <div className="v1-brand-mark"/>
          {!collapsed && <span className="v1-brand-name">gocell</span>}
          {!collapsed && <span className="v1-brand-env">prod</span>}
        </div>
        <button className="v1-side-collapse" onClick={onCollapse}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}/></svg>
        </button>
      </div>
      {!collapsed && (
        <button className="v1-cmd" onClick={onCmd}>
          <span className="v1-cmd-ico">{I.search}</span>
          <span>Search…</span>
          <span className="v1-kbd">⌘K</span>
        </button>
      )}
      <nav className="v1-nav">
        {NAV_GROUPS.map(g => (
          <div key={g.label} style={{display:'flex',flexDirection:'column'}}>
            {!collapsed && (
              <div className="dev-nav-group">{g.label}</div>
            )}
            {g.items.map(it => (
              <button key={it.k}
                      className="v1-nav-item"
                      data-active={active === it.k || undefined}
                      onClick={() => onNav(it.k)}>
                <span className="v1-nav-ico">{it.i}</span>
                {!collapsed && <span className="v1-nav-label">{it.label}</span>}
                {!collapsed && it.status && (
                  <span className="dev-nav-status" data-kind={it.status}>{it.status}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="v1-side-foot">
        {!collapsed && (
          <div className="v1-user">
            <div className="v1-avatar">AC</div>
            <div className="v1-user-meta">
              <div className="v1-user-name">Alex Chen</div>
              <div className="v1-user-role">Admin · gocell</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  const TopBar = ({ title, subtitle, onTheme, onCmd }) => (
    <header className="v1-top">
      <div className="v1-crumbs">
        <span className="v1-crumb-faint">gocell</span>
        <span className="v1-crumb-sep">/</span>
        <span>{title}</span>
        {subtitle && <>
          <span className="v1-crumb-sep">/</span>
          <span className="v1-crumb-faint">{subtitle}</span>
        </>}
      </div>
      <div className="v1-top-actions">
        <button className="v1-btn" onClick={onCmd} style={{ height: 28, fontSize: 12.5 }}>
          <span style={{ color: 'var(--fg-faint)' }}>{I.search}</span>
          <span className="v1-kbd" style={{ marginLeft: 6 }}>⌘K</span>
        </button>
        <button className="v1-ghost" onClick={onTheme}>{I.theme}</button>
      </div>
    </header>
  );

  // Reuse from v1-deep: we'll import via the shared bundle (the user's V1Deep file is loaded
  // together) — but to keep this self-contained we render simple placeholders for the
  // operate routes. They're not the focus of this build.

  const PlaceholderRoute = ({ label }) => (
    <div style={{padding:'40px 32px'}}>
      <h1 className="v1-h1">{label}</h1>
      <p className="v1-sub">Already designed in <span className="v1-mono">gocell admin v1 linear.html</span> — this entry focuses on the new dev-platform pages.</p>
    </div>
  );

  const DevShell = () => {
    const [route, setRoute] = useState('board');
    const [collapsed, setCollapsed] = useState(false);
    const [theme, setTheme] = useState('light');
    const [pinnedTask, setPinnedTask] = useState(null);
    const [selectedCell, setSelectedCell] = useState(null);

    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setCollapsed(c=>!c); }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setTheme(t=>t==='light'?'dark':'light'); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const titles = {
      coverage: ['Meta', 'gocell-web ↔ devboard coverage'],
      products: ['Plan', 'Products'], sprint: ['Plan', 'Sprint'],
      backlog: ['Plan', 'Backlog'], inbox: ['Plan', 'Inbox'], board: ['Plan', 'Board'],
      workflow: ['Build', 'Workflows'],
      dag: ['Build', 'Task DAG'], ai: ['Build', 'AI studio'],
      sandboxes: ['Build', 'Sandboxes'],
      deps: ['Build', 'Dependencies'],
      contracts: ['Build', 'Contract registry'],
      users: ['Operate', 'Users'], audit: ['Operate', 'Audit log'],
      config: ['Operate', 'Configuration'], flags: ['Operate', 'Feature flags'],
      cells: ['Operate', 'Cells'], groups: ['Operate', 'Smart Groups'],
      observe: ['Reserved', 'Observability'], billing: ['Reserved', 'Billing'], secrets: ['Reserved', 'Secrets vault'],
    };
    const [grp, ttl] = titles[route];

    const goToAI = (task) => { setPinnedTask(task); setRoute('ai'); };
    const goToCell = (id) => { setSelectedCell(id); setRoute('cells'); };
    const navFromCell = (target) => {
      if (target && target.startsWith('cell:')) { setSelectedCell(target.slice(5)); return; }
      setSelectedCell(null);
      setRoute(target);
    };
    const [decTarget, setDecTarget] = useState(null);
    const [productId, setProductId] = useState(null);
    const [openSbx, setOpenSbx] = useState(null);

    // ---------- cross-page navigation bus ----------
    // Any page can call window.gcNav({route, ...params}) to jump to another route
    // with intent. The new page subscribes to a 'gcNavIntent' window event to
    // pick up params (tab/traceId/incidentId/sandboxId/flagId/auditEntryId/etc).
    useEffect(() => {
      window.gcNav = (intent) => {
        if (!intent) return;
        if (intent.route) {
          if (intent.route === 'cells' && intent.cellId) setSelectedCell(intent.cellId);
          if (intent.route === 'sandboxes' && intent.sandboxId) setOpenSbx(intent.sandboxId);
          else if (intent.route === 'sandboxes') setOpenSbx(null);
          if (intent.route === 'products' && intent.productId) setProductId(intent.productId);
          if (intent.route !== route) setRoute(intent.route);
        }
        // dispatch on next tick so pages mounted by the route change can hear it
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gcNavIntent', { detail: intent }));
        }, 60);
      };
      return () => { try { delete window.gcNav; } catch (e) {} };
    }, [route]);
    const W3 = window.DevWave3 || {};
    const navFromW3 = (target) => {
      if (target && target.startsWith('cell:')) { setProductId(null); setSelectedCell(target.slice(5)); setRoute('cells'); return; }
      if (target && target.startsWith('journey:')) { /* stay on product */ return; }
      setRoute(target);
    };
    const { DecomposeModal, ContractsPage } = window.DevExtras || {};
    const { ReservedPage } = window.DevExtras2 || {};
    const { PipelinePage, TaskDAGPage, DepsExplorer, ContractFeaturesPage } = window.DevExtras3 || {};
    const { CellsListPage, CellDetailPage, SmartGroupsPage } = window.DevCell || {};
    const { AIBottomBar } = window.DevCell2 || {};
    const aiContext = selectedCell
      ? `cell:${selectedCell} · ${route}`
      : route === 'ai' ? 'AI Studio · all sessions'
      : `route:${route}`;

    const RESERVED_DOCS = {
      observe: { title: 'Observability', summary: 'Trace + metric pipeline. Contract sketched, slice not built. Reserved seat in the runtime; today only baseline OTLP export is on (under Operate / Cells).', items: [
        { h: 'Trace ingestion (OTLP)', d: 'Receive spans from cells via opentelemetry-go, persist to Tempo/Jaeger backend.' },
        { h: 'Metric aggregation', d: 'Per-cell, per-slice histograms exposed as /metrics + Prom federation.' },
        { h: 'Anomaly hooks', d: 'Stream anomalies to the audit log via the existing audit.append contract.' },
      ]},
      billing: { title: 'Billing', summary: 'Usage metering + invoicing for tenants. Capability registered (L4) but not implemented.', items: [
        { h: 'Meter ingestion', d: 'Slices emit usage events; meter cell aggregates per tenant per period.' },
        { h: 'Plan + entitlement', d: 'Tenant plan rows govern feature flags via configcore.flags.' },
        { h: 'Invoice draft', d: 'Monthly run produces drafts; integrates with Stripe via L4 contract.' },
      ]},
      secrets: { title: 'Secrets vault', summary: 'Centralized secret rotation + access. Currently delegated to env vars; vault cell reserved for v0.4.', items: [
        { h: 'Backend adapter', d: 'Pluggable: Vault, AWS SM, GCP SM, file-based for dev.' },
        { h: 'Rotation jobs', d: 'Slice-driven rotation with audit hooks on every read/write.' },
        { h: 'Slice helper', d: 'gocell/secrets package exposing Get/Watch with TTL caching.' },
      ]},
    };

    return (
      <div className="v1-root" data-theme={theme}>
        <Sidebar active={route} onNav={setRoute}
                 collapsed={collapsed} onCollapse={() => setCollapsed(c=>!c)}
                 onCmd={() => {}}/>
        <div className="v1-main">
          <TopBar title={grp} subtitle={ttl}
                  onTheme={() => setTheme(t=>t==='light'?'dark':'light')}
                  onCmd={() => {}}/>
          <div className="v1-content" style={{padding:0}}>
            {route === 'coverage' && window.DevCoverage && <window.DevCoverage.CoveragePage/>}
            {route === 'products' && W3.ProductsListPage && !productId && <W3.ProductsListPage onOpen={setProductId}/>}
            {route === 'products' && W3.ProductDetailPage && productId && (
              <W3.ProductDetailPage pid={productId}
                                    onBack={() => setProductId(null)}
                                    nav={navFromW3}/>
            )}
            {route === 'sprint'   && W3.SprintPage && <W3.SprintPage/>}
            {route === 'backlog' && <BacklogPage onDecompose={setDecTarget}/>}
            {route === 'inbox'   && window.DevInbox && <window.DevInbox.InboxPage onOpenCell={goToCell}/>}
            {route === 'board'   && <BoardPage onCard={goToAI}/>}
            {route === 'workflow'&& PipelinePage && <PipelinePage/>}
            {route === 'dag'     && TaskDAGPage && <TaskDAGPage/>}
            {route === 'ai'      && <>
              {window.DevCell3 && window.DevCell3.SandboxesPanel
                && <window.DevCell3.SandboxesPanel onOpenCell={goToCell}
                                                   onOpenSandbox={(id) => { setOpenSbx(id); setRoute('sandboxes'); }}/>}
              {window.DevWave5 && window.DevWave5.AIShellV2
                ? <window.DevWave5.AIShellV2 pinnedTask={pinnedTask}/>
                : <AIStudio pinnedTask={pinnedTask}/>}
            </>}
            {route === 'sandboxes' && window.DevWave4 && !openSbx
              && <window.DevWave4.SandboxesPage onOpen={setOpenSbx}/>}
            {route === 'sandboxes' && window.DevWave4 && openSbx
              && <window.DevWave4.SandboxDetailPage sbxId={openSbx}
                                                    onBack={() => setOpenSbx(null)}
                                                    nav={navFromW3}/>}
            {route === 'deps'    && DepsExplorer && <DepsExplorer onOpenCell={goToCell}/>}
            {route === 'contracts' && ContractFeaturesPage && <ContractFeaturesPage onOpenCell={goToCell}/>}
            {route === 'cells' && CellsListPage && !selectedCell && <CellsListPage onOpen={setSelectedCell}/>}
            {route === 'cells' && CellDetailPage && selectedCell && (
              <CellDetailPage cellId={selectedCell}
                              onBack={() => setSelectedCell(null)}
                              nav={navFromCell}/>
            )}
            {route === 'groups' && SmartGroupsPage && <SmartGroupsPage nav={(t) => {
              if (t && t.startsWith('cell:')) { setSelectedCell(t.slice(5)); setRoute('cells'); }
              else setRoute(t);
            }}/>}
            {['users','config','flags'].includes(route) && <PlaceholderRoute label={ttl}/>}
            {route === 'audit'   && window.DevAudit && <window.DevAudit.AuditPage/>}
            {route === 'observe' && window.DevReserved && <window.DevReserved.ObservabilityPage/>}
            {route === 'billing' && window.DevReserved && <window.DevReserved.BillingPage/>}
            {route === 'secrets' && window.DevReserved && <window.DevReserved.SecretsPage/>}
          </div>
        </div>
        {DecomposeModal && (
          <DecomposeModal open={!!decTarget} target={decTarget}
                          onClose={() => setDecTarget(null)}
                          onApply={(items) => { console.log('Apply', items); }}/>
        )}
        {AIBottomBar && <AIBottomBar context={aiContext}/>}
      </div>
    );
  };

  window.DevShell = DevShell;
})();
