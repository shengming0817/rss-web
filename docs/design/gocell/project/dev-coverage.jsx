/* global React */
// Coverage matrix — gocell-web (Vue real) ↔ devboard (design)
// Single canonical source of truth for "what's actually built vs what's
// still on the design table". Renders as devboard route `coverage`.

(() => {
  const { useState, useMemo } = React;

  // ============================================================
  // Matrix data — keep aligned with ghbvf/gocell-web@develop router
  // and devboard's NAV_GROUPS in dev-shell.jsx.
  // ============================================================
  // status:
  //   matched       — both sides exist and align cleanly
  //   partial       — both sides exist but one is partial / approximate
  //   design-only   — devboard has it, no Vue impl yet (most planning UI)
  //   backend-only  — Vue impl exists, no devboard surface for it
  //   out-of-scope  — Vue example domain (orders / devices), not meant for devboard
  const MATRIX = [
    { section: 'Access · Identity', rows: [
      { id: 'login',         title: 'Login',
        sub: 'username/password → TokenPair (RS256). Bootstrap-aware.',
        web:  { path: '/login', files: 'LoginPage.vue + api/types', loc: '~4.6 KB' },
        dev:  { path: 'gocell first-run setup.html', note: 'Companion: first-run admin onboarding wizard (Phase 1).' },
        status: 'matched',
      },
      { id: 'users',         title: 'Users — list / create / edit',
        sub: 'CRUD admin for the users table. Bcrypt hash on the server.',
        web:  { path: '/access/users', files: 'UserListPage + UserCreateModal + UserEditModal + api/types', loc: '~10 KB' },
        dev:  { path: 'Operate · Users', note: 'Currently a PlaceholderRoute — points at gocell admin v1 linear.html. Needs to be wired to the actual list+modals.' },
        status: 'partial',
      },
      { id: 'rbac',          title: 'RBAC',
        sub: 'Role-permission viewer/editor.',
        web:  { path: '/access/rbac', files: 'RbacPage.vue (1 KB stub) + api/types' },
        dev:  { path: 'Operate · Users (no separate route)', note: 'RBAC has no dedicated devboard route — currently buried in the Users placeholder.' },
        status: 'partial',
      },
      { id: 'first-run',     title: 'First-run admin setup',
        sub: 'POST /api/v1/access/setup/admin — two-plane (env Basic Auth + body admin).',
        web:  { muted: true, path: '— no UI yet', note: 'Endpoint exists; ssobff has no Vue wizard. Operators use raw curl today.' },
        dev:  { path: 'gocell first-run setup.html', note: '5-step wizard (Preflight → Two planes → Operator → Admin → Submit → Done). New in Phase 1.' },
        status: 'design-only',
      },
    ]},

    { section: 'Audit', rows: [
      { id: 'audit-log',     title: 'Audit log',
        sub: 'Hash-chained append-only log; HMAC-SHA256 prevHash verification.',
        web:  { path: '/audit/logs', files: 'AuditLogPage + api/types', loc: '~3 KB' },
        dev:  { path: 'Operate · Audit log', note: 'PlaceholderRoute today. Real Vue page exists and could be embedded / styled to match the v1-linear shell.' },
        status: 'partial',
      },
    ]},

    { section: 'Config', rows: [
      { id: 'config-manage', title: 'Config — list / edit',
        sub: 'Versioned config entries with stage/publish workflow.',
        web:  { path: '/config/entries', files: 'ConfigListPage + ConfigEditModal + api/types', loc: '~6 KB' },
        dev:  { path: 'Operate · Configuration', note: 'PlaceholderRoute → admin v1 linear.html. Same pattern as Users.' },
        status: 'partial',
      },
      { id: 'feature-flag',  title: 'Feature flags',
        sub: 'Boolean / variant rollout evaluation.',
        web:  { path: '/config/flags', files: 'FeatureFlagPage + api/types', loc: '~2 KB' },
        dev:  { path: 'Operate · Feature flags', note: 'PlaceholderRoute today.' },
        status: 'partial',
      },
    ]},

    { section: 'Dashboard', rows: [
      { id: 'health',        title: 'Health overview',
        sub: 'Per-cell health composite + last deploy. Landing screen.',
        web:  { path: '/', files: 'HealthOverviewPage.vue (~1 KB stub)' },
        dev:  { muted: true, path: '— no devboard route', note: 'Devboard opens on Board / Backlog. A "Home" or "Health overview" landing route is missing.' },
        status: 'backend-only',
      },
    ]},

    { section: 'DevTools (devboard\'s real audience)', rows: [
      { id: 'topology',      title: 'Arch topology',
        sub: 'Cells + slices + contracts as a navigable graph.',
        web:  { path: '/devtools/topology', files: 'ArchTopologyPage.vue + cellSlice/contract types' },
        dev:  { path: 'Operate · Cells (CellsListPage / CellDetailPage)', note: 'Devboard\'s Cells facet is richer (Interfaces / Wiring / Slices tabs). Vue side could embed devboard or copy the structure.' },
        status: 'partial',
      },
      { id: 'contracts',     title: 'Contract explorer',
        sub: 'Browse 45 HTTP/event/command/projection contracts.',
        web:  { path: '/devtools/contracts', files: 'ContractExplorerPage + api/types' },
        dev:  { path: 'Build · Contracts (ContractFeaturesPage)', note: 'Devboard now has Typed Response Envelope per contract (PR #403). Vue page lacks that block — gap to close.' },
        status: 'partial',
      },
      { id: 'journeys',      title: 'Journey board',
        sub: 'End-to-end acceptance specs spanning cells/contracts.',
        web:  { path: '/devtools/journeys', files: 'JourneyBoardPage.vue + api/types' },
        dev:  { muted: true, path: '— no journey lane yet', note: 'Devboard Backlog/Board treats tasks only. Adding a Journey swim lane is Phase 3.' },
        status: 'backend-only',
      },
      { id: 'governance',    title: 'Governance report',
        sub: 'FMT-* / CH-* gates from gocell validate --strict.',
        web:  { path: '/devtools/governance', files: 'GovernanceReportPage.vue' },
        dev:  { path: 'Build · Contracts → Governance gates', note: 'Just-added GovernanceGatesBlock includes CH-06 (typed-response-set bijection). Vue side needs CH-06 row to match.' },
        status: 'partial',
      },
      { id: 'consistency',   title: 'Consistency demo',
        sub: 'L0–L4 pedagogical examples (LocalOnly → DeviceLatent).',
        web:  { path: '/devtools/consistency', files: 'ConsistencyDemoPage.vue' },
        dev:  { muted: true, path: '— no devboard surface', note: 'Devboard talks about consistency levels in chips/badges but has no pedagogical page. Out of scope or future Style guide section.' },
        status: 'backend-only',
      },
      { id: 'event-flow',    title: 'Event flow',
        sub: 'Outbox → broker → consumer trace, animated.',
        web:  { path: '/devtools/event-flow', files: 'EventFlowPage.vue' },
        dev:  { path: 'Reserved · Observability', note: 'Devboard Observability page has trace-bridge content; gocell-web Event Flow is a richer visualization. Should converge.' },
        status: 'partial',
      },
      { id: 'outbox',        title: 'Outbox monitor',
        sub: 'Pending / published / dead-letter rows with reclaim/cleanup.',
        web:  { path: '/devtools/outbox', files: 'OutboxMonitorPage.vue' },
        dev:  { path: 'Build · Workflows → Consumer composition card', note: 'Devboard explains WithConsumerBase + obs bridge. Vue monitor is the live data side. Two halves of one feature.' },
        status: 'partial',
      },
    ]},

    { section: 'Example domains (out of scope)', rows: [
      { id: 'orders',        title: 'Orders (todoorder example)',
        sub: 'Order list + detail. Lives in examples/todoorder.',
        web:  { path: '/orders, /orders/:id', files: 'OrderListPage + OrderDetailPage + types' },
        dev:  { muted: true, path: '— intentionally absent', note: 'Devboard is platform-level; example domain UIs ship with the example, not the platform.' },
        status: 'out-of-scope',
      },
      { id: 'devices',       title: 'Devices (iotdevice example)',
        sub: 'Device list + command queue (L4 DeviceLatent).',
        web:  { path: '/devices, /devices/:id/commands', files: 'DeviceListPage + DeviceCommandPage + types' },
        dev:  { muted: true, path: '— intentionally absent', note: 'Same as orders — example-local UI.' },
        status: 'out-of-scope',
      },
    ]},

    { section: 'PM / Planning (devboard-only surfaces)', rows: [
      { id: 'products',      title: 'Products',
        sub: 'Top-level product → epic → feature tree.',
        web:  { muted: true, path: '— no Vue impl', note: 'Planning surfaces are devboard concepts; live in design today.' },
        dev:  { path: 'Plan · Products', note: 'ProductsListPage + ProductDetailPage. Static design data.' },
        status: 'design-only',
      },
      { id: 'backlog',       title: 'Backlog',
        sub: 'Cross-feature task backlog with AI decompose modal.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Plan · Backlog', note: 'BacklogPage + DecomposeModal.' },
        status: 'design-only',
      },
      { id: 'inbox',         title: 'Inbox',
        sub: 'New work items: issues, bug reports, AI suggestions.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Plan · Inbox', note: 'InboxPage with IssueConvertModal.' },
        status: 'design-only',
      },
      { id: 'board',         title: 'Board',
        sub: 'Kanban / sprint view. Needs journey lane in Phase 3.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Plan · Board', note: 'BoardPage. Journey swim lane planned for Phase 3.' },
        status: 'design-only',
      },
      { id: 'sprint',        title: 'Sprint',
        sub: 'Iteration view: burndown, scope, capacity.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Plan · Sprint', note: 'SprintPage (DevWave3).' },
        status: 'design-only',
      },
      { id: 'workflow',      title: 'Workflows',
        sub: 'Per-task pipelines: scaffold → impl → review → deploy.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Build · Workflows', note: 'PipelinePage + ConsumerBase/Sweeper cards from develop@edafbb0b.' },
        status: 'design-only',
      },
      { id: 'dag',           title: 'Task DAG',
        sub: 'Step-level dependency graph per task.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Build · Task DAG', note: 'TaskDAGPage with DAGView visualization.' },
        status: 'design-only',
      },
      { id: 'ai',            title: 'AI Studio',
        sub: 'AI session shell pinned to a task.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Build · AI Studio', note: 'AIShellV2 (DevWave5) with SandboxesPanel.' },
        status: 'design-only',
      },
      { id: 'sandboxes',     title: 'Sandboxes',
        sub: 'Per-AI ephemeral build environments.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Build · Sandboxes', note: 'SandboxesPage + SandboxDetailPage (DevWave4).' },
        status: 'design-only',
      },
      { id: 'deps',          title: 'Dependencies',
        sub: 'Import explorer + cell-level dep graph.',
        web:  { muted: true, path: '— partial under /devtools/topology' },
        dev:  { path: 'Build · Dependencies', note: 'DepsExplorer.' },
        status: 'design-only',
      },
      { id: 'groups',        title: 'Smart Groups',
        sub: 'Saved queries over cells. Jamf-style.',
        web:  { muted: true, path: '— no Vue impl' },
        dev:  { path: 'Operate · Smart Groups', note: 'SmartGroupsPage. Status: preview.' },
        status: 'design-only',
      },
      { id: 'billing',       title: 'Billing (reserved)',
        sub: 'Usage metering + invoicing per tenant.',
        web:  { muted: true, path: '— no Vue impl', note: 'Contract sketched, not built.' },
        dev:  { path: 'Reserved · Billing', note: 'Reserved page; ObservabilityPage pattern.' },
        status: 'design-only',
      },
      { id: 'secrets',       title: 'Secrets vault (reserved)',
        sub: 'Centralized rotation + access.',
        web:  { muted: true, path: '— no Vue impl', note: 'Reserved for v0.4.' },
        dev:  { path: 'Reserved · Secrets vault', note: 'Reserved page.' },
        status: 'design-only',
      },
    ]},
  ];

  // Flatten + count
  const ALL_ROWS = MATRIX.flatMap(s => s.rows.map(r => ({ ...r, section: s.section })));
  const COUNTS = ALL_ROWS.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const TOTAL = ALL_ROWS.length;
  const IMPL = ALL_ROWS.filter(r => r.web && !r.web.muted).length;
  const DESIGN = ALL_ROWS.filter(r => r.dev && !r.dev.muted).length;

  const QUALITY_LABEL = {
    matched:      'matched',
    partial:      'partial',
    'design-only':  'design only',
    'backend-only': 'backend only',
    'out-of-scope': 'out of scope',
  };

  // ============================================================
  // Filter chips
  // ============================================================
  const FILTERS = [
    { k: 'all',           label: 'All',            count: TOTAL },
    { k: 'matched',       label: 'Matched',        count: COUNTS['matched']      || 0 },
    { k: 'partial',       label: 'Partial',        count: COUNTS['partial']      || 0 },
    { k: 'design-only',   label: 'Design-only',    count: COUNTS['design-only']  || 0 },
    { k: 'backend-only',  label: 'Backend-only',   count: COUNTS['backend-only'] || 0 },
    { k: 'out-of-scope',  label: 'Out of scope',   count: COUNTS['out-of-scope'] || 0 },
  ];

  const Mark = ({ q }) => {
    const map = { matched: 'y', partial: 'p', 'design-only': 'd',
                  'backend-only': 'x', 'out-of-scope': 'n' };
    const ch = { matched: '●', partial: '◐', 'design-only': '◇',
                 'backend-only': '✗', 'out-of-scope': '–' };
    return <span className={`cov-mark cov-mark-${map[q]}`}>{ch[q]}</span>;
  };

  // ============================================================
  // Page
  // ============================================================
  const CoveragePage = () => {
    const [filter, setFilter] = useState('all');
    const filteredMatrix = useMemo(() => {
      if (filter === 'all') return MATRIX;
      return MATRIX
        .map(s => ({ ...s, rows: s.rows.filter(r => r.status === filter) }))
        .filter(s => s.rows.length > 0);
    }, [filter]);

    return (
      <div className="cov-page">
        <div className="cov-head">
          <div>
            <div className="cov-h-eyebrow">META · COVERAGE</div>
            <h1 className="cov-h-title">gocell-web ↔ devboard coverage</h1>
            <p className="cov-h-sub">
              Single map of what's implemented in <span className="v1-mono">ghbvf/gocell-web@develop</span> (Vue) and
              what's still on the devboard (design-only). Use this to coordinate the next batch of frontend work
              and to remember that "the design has it" ≠ "the product has it".
            </p>
            <div className="cov-h-refs">
              <span>ghbvf/gocell-web@8c3a4b99</span>
              <span>15 Vue routes · 7 cells</span>
              <span>21 devboard routes</span>
              <span>updated 2026-05-23</span>
            </div>
          </div>
        </div>

        <div className="cov-kpis">
          <div className="cov-kpi cov-kpi-impl">
            <div className="cov-kpi-num">{IMPL}</div>
            <div className="cov-kpi-label">Vue routes shipped</div>
            <div className="cov-kpi-bar"><div style={{ width: `${(IMPL / TOTAL) * 100}%` }}/></div>
          </div>
          <div className="cov-kpi cov-kpi-design">
            <div className="cov-kpi-num">{DESIGN}</div>
            <div className="cov-kpi-label">Devboard routes drafted</div>
            <div className="cov-kpi-bar"><div style={{ width: `${(DESIGN / TOTAL) * 100}%` }}/></div>
          </div>
          <div className="cov-kpi cov-kpi-gap">
            <div className="cov-kpi-num">{(COUNTS['partial'] || 0) + (COUNTS['backend-only'] || 0)}</div>
            <div className="cov-kpi-label">Gaps to close</div>
            <div className="cov-kpi-bar">
              <div style={{ width: `${((COUNTS['partial'] || 0) + (COUNTS['backend-only'] || 0)) / TOTAL * 100}%` }}/>
            </div>
          </div>
          <div className="cov-kpi cov-kpi-out">
            <div className="cov-kpi-num">{COUNTS['out-of-scope'] || 0}</div>
            <div className="cov-kpi-label">Out of scope</div>
            <div className="cov-kpi-bar"><div style={{ width: `${(COUNTS['out-of-scope'] || 0) / TOTAL * 100}%` }}/></div>
          </div>
        </div>

        <div className="cov-legend">
          <div><Mark q="matched"/><b>matched</b><span className="cov-legend-text">— both sides aligned, no drift</span></div>
          <div><Mark q="partial"/><b>partial</b><span className="cov-legend-text">— exists on both sides, content drifts</span></div>
          <div><Mark q="design-only"/><b>design-only</b><span className="cov-legend-text">— devboard surface, no Vue impl</span></div>
          <div><Mark q="backend-only"/><b>backend-only</b><span className="cov-legend-text">— Vue page, no devboard surface</span></div>
          <div><Mark q="out-of-scope"/><b>out of scope</b><span className="cov-legend-text">— example domain, not platform</span></div>
        </div>

        <div className="cov-filters">
          {FILTERS.map(f => (
            <button key={f.k}
                    className="cov-filter"
                    data-on={filter === f.k || undefined}
                    onClick={() => setFilter(f.k)}>
              {f.label} <span className="v1-mono" style={{ opacity: 0.65, marginLeft: 4 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="cov-matrix">
          <div className="cov-col-h">
            <span>Capability</span>
            <span>gocell-web (Vue real)</span>
            <span>devboard (design)</span>
          </div>
          {filteredMatrix.map(section => (
            <React.Fragment key={section.section}>
              <div className="cov-section-h">
                <div className="cov-section-h-row">
                  <span className="cov-section-h-name">{section.section}</span>
                </div>
                <span className="cov-section-h-meta">
                  {section.rows.length} row{section.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              {section.rows.map(row => (
                <div key={row.id} className="cov-row" data-status={row.status}>
                  <div>
                    <div className="cov-row-title">
                      {row.title}
                      <span className="cov-row-q" data-q={row.status}>{QUALITY_LABEL[row.status]}</span>
                    </div>
                    <div className="cov-row-sub">{row.sub}</div>
                  </div>
                  <div className="cov-cell" data-axis="Vue">
                    <Mark q={row.web.muted ? 'design-only' : 'matched'}/>
                    <div className="cov-cell-text">
                      <div className="cov-cell-primary" data-muted={row.web.muted || undefined}>
                        {row.web.path}
                      </div>
                      {row.web.files && <div className="cov-cell-note">{row.web.files}{row.web.loc ? ` · ${row.web.loc}` : ''}</div>}
                      {row.web.note  && <div className="cov-cell-note">{row.web.note}</div>}
                    </div>
                  </div>
                  <div className="cov-cell" data-axis="Devboard">
                    <Mark q={row.dev.muted ? 'backend-only' : 'matched'}/>
                    <div className="cov-cell-text">
                      <div className="cov-cell-primary" data-muted={row.dev.muted || undefined}>
                        {row.dev.path}
                      </div>
                      {row.dev.note && <div className="cov-cell-note">{row.dev.note}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div className="cov-foot">
          <div className="cov-foot-card">
            <div className="cov-foot-h">Next batch · close partials</div>
            <ul className="cov-foot-list">
              <li><span className="v1-mono">users</span>     <span>Wire UserListPage into Operate · Users (replace PlaceholderRoute).</span></li>
              <li><span className="v1-mono">audit-log</span> <span>Same — embed AuditLogPage, keep v1-linear chrome.</span></li>
              <li><span className="v1-mono">config-manage / feature-flag</span> <span>Same pattern. 3 placeholders → 3 real pages.</span></li>
              <li><span className="v1-mono">contracts</span> <span>Ship the Typed Response Envelope block (PR #403) to the Vue ContractExplorerPage.</span></li>
              <li><span className="v1-mono">governance</span> <span>Add CH-06 to Vue GovernanceReportPage to match devboard.</span></li>
            </ul>
          </div>
          <div className="cov-foot-card">
            <div className="cov-foot-h">Open questions</div>
            <ul className="cov-foot-list">
              <li><span className="v1-mono">rbac</span>      <span>Promote to a top-level devboard route, or keep folded under Users?</span></li>
              <li><span className="v1-mono">health</span>    <span>Add a landing/Home route to devboard, or keep Board as default?</span></li>
              <li><span className="v1-mono">journeys</span>  <span>Phase 3 — Board swim lane vs separate route?</span></li>
              <li><span className="v1-mono">consistency</span> <span>Promote pedagogical content to Style guide?</span></li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  window.DevCoverage = { CoveragePage, MATRIX, COUNTS };
})();
