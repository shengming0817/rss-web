/* global React */
// Phase 2 modules: Workflow orchestration, Dependency graphs (pkg + contract),
// Task-level DAG with task picker, and a "Deployed / Preview / Reserved" status system.

(() => {
  const { useState, useMemo, useRef, useEffect } = React;

  // ============================================================
  // Status badge — capability-deployment state
  // live    = shipped, working
  // preview = built, behind a flag, not GA
  // reserved= placeholder, not built yet
  // ============================================================
  const StatusBadge = ({ kind, compact }) => {
    const map = {
      live:     { label: compact ? '●' : 'live',     cls: 'devs-live' },
      preview:  { label: compact ? '●' : 'preview',  cls: 'devs-preview' },
      reserved: { label: compact ? '●' : 'reserved', cls: 'devs-reserved' },
    };
    const m = map[kind] || map.reserved;
    return <span className={`devs-badge ${m.cls}`}>{m.label}</span>;
  };

  // ============================================================
  // 1. WORKFLOW — Task orchestration pipeline
  // Each task auto-generates a workflow from its dependency graph.
  // Stages: plan → implement → review → fix → ship
  // States: idle / waiting / running / review / blocked / done
  // ============================================================

  const WORKFLOWS = [
    {
      taskId: 'T-101', title: 'OIDC: Microsoft Entra integration',
      cell: 'accesscore', actor: 'ai/claude', startedAt: '2 days ago',
      eta: '4h remaining',
      stages: [
        { k: 'plan',    label: 'Plan',       state: 'done',    note: 'Decomposed into 8 steps · approved by alex' },
        { k: 'impl',    label: 'Implement',  state: 'running', note: 'Step 4/8 · OIDC handler in progress',
          activity: 'cells/accesscore/slices/sso/sso_handler.go · +24 lines' },
        { k: 'review',  label: 'Review',     state: 'waiting', note: 'Blocked on impl · auto-creates PR' },
        { k: 'fix',     label: 'Fix',        state: 'idle',    note: 'Triggered if reviewer requests changes' },
        { k: 'ship',    label: 'Ship',       state: 'idle',    note: 'Merge → prod after canary' },
      ]
    },
    {
      taskId: 'T-110', title: 'Merkle proof endpoint',
      cell: 'auditcore', actor: 'ai/claude', startedAt: '3 days ago',
      eta: 'Awaiting human review',
      stages: [
        { k: 'plan',    label: 'Plan',       state: 'done',    note: '4 steps' },
        { k: 'impl',    label: 'Implement',  state: 'done',    note: '3/3 steps · all green' },
        { k: 'review',  label: 'Review',     state: 'review',  note: 'PR #248 · 2 changes requested',
          activity: 'maria · "Use crypto/sha256 not SHA1, per security baseline"' },
        { k: 'fix',     label: 'Fix',        state: 'waiting', note: 'Awaiting reviewer feedback dispatch' },
        { k: 'ship',    label: 'Ship',       state: 'idle' },
      ]
    },
    {
      taskId: 'T-201', title: 'Stage / publish workflow',
      cell: 'configcore', actor: 'ai/claude', startedAt: '5h ago',
      eta: '1h remaining',
      stages: [
        { k: 'plan',    label: 'Plan',       state: 'done' },
        { k: 'impl',    label: 'Implement',  state: 'running', note: '2/3 steps' },
        { k: 'review',  label: 'Review',     state: 'idle' },
        { k: 'fix',     label: 'Fix',        state: 'idle' },
        { k: 'ship',    label: 'Ship',       state: 'idle' },
      ]
    },
    {
      taskId: 'T-102', title: 'OIDC: Okta integration',
      cell: 'accesscore', actor: 'unassigned', startedAt: 'queued',
      eta: 'Waiting for capacity',
      stages: [
        { k: 'plan',    label: 'Plan',       state: 'waiting', note: 'In queue · auto-decompose ready' },
        { k: 'impl',    label: 'Implement',  state: 'idle' },
        { k: 'review',  label: 'Review',     state: 'idle' },
        { k: 'fix',     label: 'Fix',        state: 'idle' },
        { k: 'ship',    label: 'Ship',       state: 'idle' },
      ]
    },
  ];

  const stateMeta = {
    idle:    { dot: 'idle',    label: '–'        },
    waiting: { dot: 'waiting', label: 'waiting'  },
    running: { dot: 'running', label: 'running'  },
    review:  { dot: 'review',  label: 'review'   },
    blocked: { dot: 'blocked', label: 'blocked'  },
    done:    { dot: 'done',    label: 'done'     },
  };

  const WorkflowCard = ({ wf, onSelect }) => (
    <div className="devw-card" onClick={() => onSelect(wf)}>
      <div className="devw-card-head">
        <div>
          <div className="devw-task-title">{wf.title}</div>
          <div className="v1-mute v1-mono" style={{ fontSize: 11.5, marginTop: 2 }}>
            {wf.taskId} · {wf.cell} · {wf.actor}
          </div>
        </div>
        <div className="devw-eta">{wf.eta}</div>
      </div>
      <div className="devw-stages">
        {wf.stages.map((s, i) => (
          <div key={s.k} className="devw-stage" data-state={s.state}>
            <div className="devw-stage-bar"/>
            <div className="devw-stage-label">{s.label}</div>
            <div className="devw-stage-state">
              <span className={`devw-dot devw-dot-${stateMeta[s.state].dot}`}/>
              {stateMeta[s.state].label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const WorkflowDetail = ({ wf, onClose }) => {
    if (!wf) return null;
    return (
      <div className="v1-drawer" onClick={onClose}>
        <div className="v1-drawer-panel" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
          <div className="v1-drawer-head">
            <div>
              <div className="v1-h2">{wf.title}</div>
              <div className="v1-mute v1-mono">{wf.taskId} · started {wf.startedAt}</div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devw-pipe">
            {wf.stages.map((s, i) => (
              <div key={s.k} className="devw-pipe-stage" data-state={s.state}>
                <div className="devw-pipe-marker">
                  <span className={`devw-dot devw-dot-${stateMeta[s.state].dot}`}/>
                  {i < wf.stages.length - 1 && <div className="devw-pipe-line"/>}
                </div>
                <div className="devw-pipe-body">
                  <div className="devw-pipe-head">
                    <span className="devw-pipe-label">{s.label}</span>
                    <span className="devw-pipe-state">{stateMeta[s.state].label}</span>
                  </div>
                  {s.note && <div className="devw-pipe-note">{s.note}</div>}
                  {s.activity && (
                    <div className="devw-pipe-act v1-mono">{s.activity}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="v1-drawer-acts" style={{ borderTop: '1px solid var(--line-soft)', marginTop: 'auto' }}>
            <button className="v1-btn">Pause</button>
            <button className="v1-btn">View artifacts</button>
            <button className="v1-btn v1-btn-primary">Open in AI studio</button>
          </div>
        </div>
      </div>
    );
  };

  const WorkflowPage = () => {
    const [selected, setSelected] = useState(null);
    const [filter, setFilter] = useState('all');
    const filtered = WORKFLOWS.filter(w => {
      if (filter === 'all') return true;
      return w.stages.some(s => s.state === filter);
    });
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Workflows <span className="v1-h1-count v1-mono">{WORKFLOWS.length}</span></h1>
            <p className="v1-sub">Auto-orchestrated pipelines per task — plan → implement → review → fix → ship.</p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              {['all', 'running', 'review', 'waiting'].map(f => (
                <button key={f} data-active={filter===f || undefined}
                        onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="devw-grid">
          {filtered.map(wf => (
            <WorkflowCard key={wf.taskId} wf={wf} onSelect={setSelected}/>
          ))}
        </div>
        {selected && <WorkflowDetail wf={selected} onClose={() => setSelected(null)}/>}
      </div>
    );
  };

  // ============================================================
  // 2. DEPENDENCIES — package + contract graphs (SVG)
  // ============================================================

  // ---- Framework → external packages ----
  const FRAMEWORK_PKGS = {
    nodes: [
      // gocell internal modules (left)
      { id: 'gc/cellrt',     label: 'cellrt',      kind: 'gc', col: 0, row: 0, desc: 'Cell runtime + lifecycle' },
      { id: 'gc/slicebus',   label: 'slicebus',    kind: 'gc', col: 0, row: 1, desc: 'In-process slice dispatch' },
      { id: 'gc/contracts',  label: 'contracts',   kind: 'gc', col: 0, row: 2, desc: 'Capability registry' },
      { id: 'gc/audit',      label: 'audit',       kind: 'gc', col: 0, row: 3, desc: 'Hash-chained event log' },
      { id: 'gc/observe',    label: 'observe',     kind: 'gc', col: 0, row: 4, desc: 'Tracing + metrics' },
      { id: 'gc/govern',     label: 'governance',  kind: 'gc', col: 0, row: 5, desc: 'Policy + RBAC kernel' },
      // external (right)
      { id: 'ext/zap',       label: 'go.uber.org/zap',          kind: 'ext', col: 1, row: 0 },
      { id: 'ext/otel',      label: 'go.opentelemetry.io/otel', kind: 'ext', col: 1, row: 1 },
      { id: 'ext/prom',      label: 'prometheus/client_golang', kind: 'ext', col: 1, row: 2 },
      { id: 'ext/grpc',      label: 'google.golang.org/grpc',   kind: 'ext', col: 1, row: 3 },
      { id: 'ext/jwt',       label: 'go-jose/go-jose',          kind: 'ext', col: 1, row: 4 },
      { id: 'ext/pgx',       label: 'jackc/pgx',                kind: 'ext', col: 1, row: 5 },
      { id: 'ext/spf13',     label: 'spf13/cobra',              kind: 'ext', col: 1, row: 6 },
    ],
    edges: [
      ['gc/cellrt', 'ext/zap'],
      ['gc/cellrt', 'ext/spf13'],
      ['gc/slicebus', 'ext/otel'],
      ['gc/observe', 'ext/otel'],
      ['gc/observe', 'ext/prom'],
      ['gc/contracts', 'ext/grpc'],
      ['gc/audit', 'ext/pgx'],
      ['gc/govern', 'ext/jwt'],
    ]
  };

  // ---- Cells → framework + external ----
  const CELL_PKGS = {
    nodes: [
      // cells (left)
      { id: 'c/accesscore',  label: 'accesscore',  kind: 'cell', col: 0, row: 0, desc: '8 slices · sso, rbac…' },
      { id: 'c/auditcore',   label: 'auditcore',   kind: 'cell', col: 0, row: 1, desc: '4 slices · chain, query…' },
      { id: 'c/configcore',  label: 'configcore',  kind: 'cell', col: 0, row: 2, desc: '6 slices · publish, flags…' },
      { id: 'c/observecore', label: 'observecore', kind: 'cell', col: 0, row: 3, desc: '3 slices · trace, metric…' },
      // gocell framework (middle)
      { id: 'gc/cellrt',     label: 'cellrt',      kind: 'gc', col: 1, row: 0 },
      { id: 'gc/slicebus',   label: 'slicebus',    kind: 'gc', col: 1, row: 1 },
      { id: 'gc/contracts',  label: 'contracts',   kind: 'gc', col: 1, row: 2 },
      { id: 'gc/audit',      label: 'audit',       kind: 'gc', col: 1, row: 3 },
      // external (right)
      { id: 'ext/jose',      label: 'go-jose',     kind: 'ext', col: 2, row: 0 },
      { id: 'ext/oauth2',    label: 'oauth2',      kind: 'ext', col: 2, row: 1 },
      { id: 'ext/pgx',       label: 'pgx',         kind: 'ext', col: 2, row: 2 },
      { id: 'ext/yaml',      label: 'yaml.v3',     kind: 'ext', col: 2, row: 3 },
      { id: 'ext/otel',      label: 'otel',        kind: 'ext', col: 2, row: 4 },
    ],
    edges: [
      ['c/accesscore', 'gc/cellrt'],   ['c/accesscore', 'gc/slicebus'], ['c/accesscore', 'gc/contracts'],
      ['c/accesscore', 'ext/jose'],    ['c/accesscore', 'ext/oauth2'],
      ['c/auditcore',  'gc/cellrt'],   ['c/auditcore',  'gc/audit'],
      ['c/auditcore',  'ext/pgx'],
      ['c/configcore', 'gc/cellrt'],   ['c/configcore', 'gc/slicebus'],
      ['c/configcore', 'ext/yaml'],    ['c/configcore', 'ext/pgx'],
      ['c/observecore','gc/cellrt'],   ['c/observecore','ext/otel'],
    ]
  };

  // ---- Contract graph: cell ↔ cell with capability label ----
  const CONTRACT_GRAPH = {
    nodes: [
      { id: 'accesscore',  cx: 200, cy: 140 },
      { id: 'auditcore',   cx: 560, cy: 100 },
      { id: 'configcore',  cx: 560, cy: 280 },
      { id: 'observecore', cx: 200, cy: 340 },
      { id: 'gateway',     cx: 920, cy: 200 },
    ],
    edges: [
      { from: 'accesscore', to: 'auditcore',   label: 'audit.append',   tier: 'L3', breaking: false },
      { from: 'accesscore', to: 'configcore',  label: 'config.read',    tier: 'L3', breaking: false },
      { from: 'accesscore', to: 'observecore', label: 'trace.span',     tier: 'L3', breaking: false },
      { from: 'gateway',    to: 'accesscore',  label: 'auth.verify',    tier: 'L3', breaking: false },
      { from: 'gateway',    to: 'configcore',  label: 'flag.evaluate',  tier: 'L3', breaking: false },
      { from: 'configcore', to: 'auditcore',   label: 'audit.append',   tier: 'L3', breaking: false },
      { from: 'configcore', to: 'observecore', label: 'trace.span',     tier: 'L3', breaking: false },
      { from: 'auditcore',  to: 'observecore', label: 'metric.emit',    tier: 'L3', breaking: true  },
    ]
  };

  // ---- Generic 2/3-column SVG layout ----
  const LayeredGraph = ({ data, height = 480 }) => {
    const COL_X = [100, 480, 860];
    const ROW_H = 56, PAD_Y = 30;
    const positions = {};
    data.nodes.forEach(n => {
      positions[n.id] = { x: COL_X[n.col], y: PAD_Y + n.row * ROW_H };
    });
    const W = 1040, H = Math.max(height, ...data.nodes.map(n => positions[n.id].y + 60));

    const [hover, setHover] = useState(null);
    const isLit = (id) => {
      if (!hover) return true;
      if (id === hover) return true;
      return data.edges.some(([a, b]) =>
        (a === hover && b === id) || (b === hover && a === id));
    };

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="devd-svg" style={{ width: '100%', height: H }}>
        <defs>
          <pattern id="devdgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.18"/>
          </pattern>
          <marker id="devdarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#devdgrid)" style={{ color: 'var(--fg-faint)' }}/>
        {data.edges.map(([a, b], i) => {
          const p1 = positions[a], p2 = positions[b];
          if (!p1 || !p2) return null;
          const lit = !hover || hover === a || hover === b;
          const cx1 = (p1.x + p2.x) / 2;
          return (
            <path key={i}
                  d={`M ${p1.x + 110} ${p1.y + 16} C ${cx1} ${p1.y + 16}, ${cx1} ${p2.y + 16}, ${p2.x - 6} ${p2.y + 16}`}
                  fill="none"
                  stroke={lit ? 'var(--fg-muted)' : 'var(--line)'}
                  strokeWidth={lit ? 1.4 : 1}
                  markerEnd="url(#devdarrow)"
                  style={{ color: lit ? 'var(--fg-muted)' : 'var(--line)', transition: 'all .15s' }}/>
          );
        })}
        {data.nodes.map(n => {
          const p = positions[n.id];
          const lit = isLit(n.id);
          return (
            <g key={n.id} transform={`translate(${p.x - 6}, ${p.y})`}
               onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
               style={{ cursor: 'pointer', opacity: lit ? 1 : 0.35, transition: 'opacity .15s' }}>
              <foreignObject width={170} height={44}>
                <div className={`devd-node devd-node-${n.kind}`}>
                  <div className="devd-node-label">{n.label}</div>
                  {n.desc && <div className="devd-node-desc">{n.desc}</div>}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    );
  };

  const ContractSpiderGraph = () => {
    const { nodes, edges } = CONTRACT_GRAPH;
    const W = 1080, H = 480;
    const pos = Object.fromEntries(nodes.map(n => [n.id, { x: n.cx, y: n.cy }]));
    const [hover, setHover] = useState(null);

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="devd-svg" style={{ width: '100%', height: H }}>
        <defs>
          <pattern id="devdgrid2" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.18"/>
          </pattern>
          <marker id="devdarrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#devdgrid2)" style={{ color: 'var(--fg-faint)' }}/>
        {edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          const lit = !hover || hover === e.from || hover === e.to;
          // bezier midpoint for label
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 12;
          const stroke = e.breaking ? 'var(--err)' : (lit ? 'var(--fg-muted)' : 'var(--line)');
          return (
            <g key={i} style={{ opacity: lit ? 1 : 0.3, transition: 'opacity .15s' }}>
              <path d={`M ${a.x} ${a.y + 18} Q ${mx} ${my} ${b.x} ${b.y + 18}`}                    fill="none" stroke={stroke}
                    strokeWidth={e.breaking ? 1.7 : (lit ? 1.4 : 1)}
                    strokeDasharray={e.breaking ? '4 3' : ''}
                    markerEnd={`url(#devdarrow2)`}/>
              <text x={mx} y={my + 4} textAnchor="middle"
                    className="devd-edge-label v1-mono"
                    fill={e.breaking ? 'var(--err)' : 'var(--fg-faint)'}>
                {e.label}{e.breaking ? ' · breaking' : ''}
              </text>
            </g>
          );
        })}
        {nodes.map(n => (
          <g key={n.id} transform={`translate(${n.cx - 80}, ${n.cy})`}
             onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
             style={{ cursor: 'pointer' }}>
            <foreignObject width={160} height={36}>
              <div className="devd-node devd-node-cell" style={{ textAlign: 'center' }}>
                <div className="devd-node-label">{n.id}</div>
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    );
  };

  const DepsPage = () => {
    const [view, setView] = useState('framework');
    const [cell, setCell] = useState('accesscore');
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Dependencies</h1>
            <p className="v1-sub">Package + contract relationships across the assembly. Hover a node to highlight its neighborhood.</p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              <button data-active={view==='framework' || undefined}
                      onClick={() => setView('framework')}>Framework</button>
              <button data-active={view==='cell' || undefined}
                      onClick={() => setView('cell')}>Cells</button>
              <button data-active={view==='contracts' || undefined}
                      onClick={() => setView('contracts')}>Contracts</button>
            </div>
          </div>
        </div>
        <div className="devd-canvas">
          {view === 'framework' && (
            <>
              <div className="devd-caption">
                <div className="devd-cap-title">gocell framework → external packages</div>
                <div className="v1-mute" style={{ fontSize: 12.5 }}>
                  6 framework modules · 7 external dependencies · all pinned in <span className="v1-mono">go.mod</span>
                </div>
              </div>
              <LayeredGraph data={FRAMEWORK_PKGS}/>
            </>
          )}
          {view === 'cell' && (
            <>
              <div className="devd-caption">
                <div className="devd-cap-title">Cells → framework + external packages</div>
                <div className="v1-mute" style={{ fontSize: 12.5 }}>
                  4 cells · 4 framework modules · 5 external dependencies
                </div>
              </div>
              <LayeredGraph data={CELL_PKGS}/>
            </>
          )}
          {view === 'contracts' && (
            <>
              <div className="devd-caption">
                <div className="devd-cap-title">Cell ↔ cell contract calls</div>
                <div className="v1-mute" style={{ fontSize: 12.5 }}>
                  Edges labeled by capability ID · dashed red = breaking change pending
                </div>
              </div>
              <ContractSpiderGraph/>
            </>
          )}
          <div className="devd-legend">
            <span><i className="devd-sw devd-sw-cell"/> Cell</span>
            <span><i className="devd-sw devd-sw-gc"/> gocell framework</span>
            <span><i className="devd-sw devd-sw-ext"/> External pkg</span>
            <span><i className="devd-sw devd-sw-break"/> Breaking</span>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // 3. Task-level Step DAG (replaces prior single-task DAG)
  // Lets the user pick any task; renders its steps as a DAG with
  // synthesized parallel lanes.
  // ============================================================

  // Curated DAG fragments per task (some tasks share the same template).
  const TASK_DAGS = {
    'T-101': [
      { id: 'A', name: 'Generate slice contract', cell: 'accesscore', deps: [],         status: 'done',  est: 0.5 },
      { id: 'B', name: 'JWKS verifier impl',      cell: 'accesscore', deps: ['A'],      status: 'done',  est: 1   },
      { id: 'C', name: 'Group claims mapper',     cell: 'accesscore', deps: ['A'],      status: 'done',  est: 0.5 },
      { id: 'D', name: 'OIDC handler',            cell: 'accesscore', deps: ['B','C'],  status: 'doing', est: 1.5 },
      { id: 'E', name: 'Audit event hook',        cell: 'auditcore',  deps: ['A'],      status: 'doing', est: 0.5 },
      { id: 'F', name: 'Config schema migration', cell: 'configcore', deps: ['A'],      status: 'todo',  est: 0.5 },
      { id: 'G', name: 'Conformance tests',       cell: 'accesscore', deps: ['D','E','F'], status: 'todo', est: 1 },
      { id: 'H', name: 'PR review + merge',       cell: 'accesscore', deps: ['G'],      status: 'todo',  est: 0.5 },
    ],
    'T-110': [
      { id: 'A', name: 'Hash tree builder',  cell: 'auditcore', deps: [],     status: 'done',  est: 1   },
      { id: 'B', name: 'Inclusion proof',    cell: 'auditcore', deps: ['A'],  status: 'done',  est: 1   },
      { id: 'C', name: '/proof handler',     cell: 'auditcore', deps: ['B'],  status: 'done',  est: 0.5 },
      { id: 'D', name: 'Verifier CLI',       cell: 'auditcore', deps: ['B'],  status: 'done',  est: 0.5 },
      { id: 'E', name: 'PR review',          cell: 'auditcore', deps: ['C','D'], status: 'doing', est: 0.5 },
    ],
    'T-201': [
      { id: 'A', name: 'Stage table schema',  cell: 'configcore', deps: [],         status: 'done',  est: 0.5 },
      { id: 'B', name: 'Stage write path',    cell: 'configcore', deps: ['A'],      status: 'done',  est: 1   },
      { id: 'C', name: 'Diff endpoint',       cell: 'configcore', deps: ['B'],      status: 'doing', est: 0.5 },
      { id: 'D', name: 'Publish + rollback',  cell: 'configcore', deps: ['B'],      status: 'todo',  est: 1   },
      { id: 'E', name: 'Audit hook',          cell: 'auditcore',  deps: ['B'],      status: 'todo',  est: 0.3 },
      { id: 'F', name: 'PR review',           cell: 'configcore', deps: ['C','D','E'], status: 'todo', est: 0.5 },
    ],
  };

  const computeLayout = (nodes) => {
    const map = Object.fromEntries(nodes.map(n => [n.id, { ...n, depth: 0 }]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of Object.values(map))
        for (const d of n.deps) {
          const want = map[d].depth + 1;
          if (n.depth < want) { n.depth = want; changed = true; }
        }
    }
    const cols = {};
    Object.values(map).forEach(n => {
      cols[n.depth] = cols[n.depth] || [];
      cols[n.depth].push(n);
    });
    return { map, cols };
  };

  const TaskStepDAG = () => {
    const taskIds = Object.keys(TASK_DAGS);
    const [taskId, setTaskId] = useState(taskIds[0]);
    const nodes = TASK_DAGS[taskId];
    const { map, cols } = useMemo(() => computeLayout(nodes), [taskId]);
    const [hover, setHover] = useState(null);

    const colKeys = Object.keys(cols).sort((a,b) => +a - +b);
    const COL_W = 200, ROW_H = 96, PAD_X = 32, PAD_Y = 28;
    const positions = {};
    colKeys.forEach((c, ci) => {
      cols[c].forEach((n, ri) => {
        positions[n.id] = { x: PAD_X + ci * COL_W, y: PAD_Y + ri * ROW_H };
      });
    });
    const W = PAD_X * 2 + colKeys.length * COL_W;
    const H = PAD_Y * 2 + Math.max(...colKeys.map(c => cols[c].length)) * ROW_H;

    // critical path = longest chain by est
    const longestTo = {};
    Object.values(map).forEach(() => {});
    const compute = (id) => {
      if (longestTo[id]) return longestTo[id];
      const n = map[id];
      if (!n.deps.length) return longestTo[id] = { len: n.est, prev: null };
      let best = { len: 0, prev: null };
      for (const d of n.deps) {
        const r = compute(d);
        if (r.len > best.len) best = { len: r.len, prev: d };
      }
      return longestTo[id] = { len: best.len + n.est, prev: best.prev };
    };
    nodes.forEach(n => compute(n.id));
    const endNode = nodes.reduce((a,b) => longestTo[a.id].len > longestTo[b.id].len ? a : b);
    const critPath = new Set();
    let cur = endNode.id;
    while (cur) { critPath.add(cur); cur = longestTo[cur].prev; }

    const totalEst = nodes.reduce((s, n) => s + n.est, 0);
    const critEst = longestTo[endNode.id].len;
    const ready = nodes.filter(n => n.status === 'todo' && n.deps.every(d => map[d].status === 'done')).length;

    const sample = WORKFLOWS.find(w => w.taskId === taskId);

    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Task DAG</h1>
            <p className="v1-sub">Per-task step graph. Critical path = longest chain by estimate.</p>
          </div>
          <div className="v1-head-actions">
            <select className="devd-select" value={taskId} onChange={e => setTaskId(e.target.value)}>
              {taskIds.map(id => (
                <option key={id} value={id}>{id} — {WORKFLOWS.find(w=>w.taskId===id)?.title || id}</option>
              ))}
            </select>
            <button className="v1-btn">Dispatch ready ({ready})</button>
          </div>
        </div>
        <div style={{ padding: '0 32px' }}>
          <div className="dag-metrics">
            <div className="dag-metric"><span className="v1-mute">Steps</span><b>{nodes.length}</b></div>
            <div className="dag-metric"><span className="v1-mute">Serial est.</span><b className="v1-mono">{totalEst.toFixed(1)}d</b></div>
            <div className="dag-metric"><span className="v1-mute">Critical path</span><b className="v1-mono">{critEst.toFixed(1)}d</b></div>
            <div className="dag-metric"><span className="v1-mute">Parallelism</span><b className="v1-mono">×{(totalEst/critEst).toFixed(2)}</b></div>
            <div className="dag-metric"><span className="v1-mute">Ready now</span><b style={{color:'var(--accent)'}}>{ready}</b></div>
          </div>
        </div>
        <div className="dag-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="dag-svg">
            <defs>
              <pattern id="dgr" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.2"/>
              </pattern>
              <marker id="dagar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
              </marker>
            </defs>
            <rect width={W} height={H} fill="url(#dgr)" style={{ color:'var(--fg-faint)' }}/>
            {nodes.flatMap(n => n.deps.map(d => {
              const p1 = positions[d], p2 = positions[n.id];
              const onCrit = critPath.has(n.id) && critPath.has(d);
              const lit = !hover || hover === n.id || hover === d;
              const cx = (p1.x + p2.x) / 2 + 80;
              return (
                <path key={`${d}-${n.id}`}
                      d={`M ${p1.x + 168} ${p1.y + 28} C ${cx} ${p1.y + 28}, ${cx} ${p2.y + 28}, ${p2.x} ${p2.y + 28}`}
                      fill="none"
                      stroke={onCrit ? 'var(--accent)' : (lit ? 'var(--fg-muted)' : 'var(--line)')}
                      strokeWidth={onCrit ? 2 : (lit ? 1.4 : 1)}
                      markerEnd="url(#dagar)"/>
              );
            }))}
            {nodes.map(n => {
              const p = positions[n.id];
              const onCrit = critPath.has(n.id);
              return (
                <g key={n.id} transform={`translate(${p.x}, ${p.y})`}
                   onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                   style={{cursor:'pointer'}}>
                  <foreignObject width={168} height={80}>
                    <div className={`dag-node dag-node-${n.status} ${onCrit ? 'dag-node-crit' : ''}`}>
                      <div className="dag-node-head">
                        <span className="dag-node-id">{n.id}</span>
                        <span className={`dag-stt dag-stt-${n.status}`}>
                          {n.status === 'done' ? '✓' : n.status === 'doing' ? '●' : '○'}
                        </span>
                      </div>
                      <div className="dag-node-name">{n.name}</div>
                      <div className="dag-node-foot">
                        <span className="v1-mono">{n.cell}</span>
                        <span className="v1-mono">{n.est}d</span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  // ============================================================
  // Reserved-capability landing page — short description only.
  // Used for routes that aren't fully built yet.
  // ============================================================
  const ReservedPage = ({ title, summary, items }) => (
    <div style={{ padding: '40px 32px', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
        <h1 className="v1-h1" style={{ margin: 0 }}>{title}</h1>
        <StatusBadge kind="reserved"/>
      </div>
      <p className="v1-sub" style={{ marginTop: 0 }}>{summary}</p>
      <ul className="devr-list">
        {items.map((it, i) => (
          <li key={i}>
            <span className="devr-num v1-mono">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="devr-h">{it.h}</div>
              <div className="v1-mute" style={{ fontSize: 12.5 }}>{it.d}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="devr-foot v1-mute">
        <span className="v1-mono">Reserved</span> capabilities are placeholders in the platform shell — the
        contract is sketched but the implementation isn't built yet. Tracked as <span className="v1-mono">E-3 Observability</span>
        and downstream epics in the backlog.
      </div>
    </div>
  );

  window.DevExtras2 = { StatusBadge, WorkflowPage, DepsPage, TaskStepDAG, ReservedPage };
})();
