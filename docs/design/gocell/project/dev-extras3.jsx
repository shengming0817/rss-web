/* global React */
// Phase 3 — combined Workflow×DAG, cross-cell task DAG, goda-style Deps explorer,
// and Contract↔Feature linkage.

(() => {
  const { useState, useMemo, useRef } = React;

  // ============================================================
  // Shared task-DAG data (reused by Pipeline + cross-cell views)
  // ============================================================
  const STEP_DAGS = {
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

  // Cross-cell TASK DAG — task-to-task dependencies across cells.
  const TASK_NODES = [
    // accesscore
    { id: 'T-101', title: 'OIDC: Entra integration', cell: 'accesscore', status: 'doing',  est: 5,  deps: ['T-090', 'T-202'] },
    { id: 'T-102', title: 'OIDC: Okta integration',  cell: 'accesscore', status: 'todo',   est: 3,  deps: ['T-101'] },
    { id: 'T-103', title: 'SAML 2.0 fallback',       cell: 'accesscore', status: 'todo',   est: 8,  deps: ['T-101'] },
    // configcore
    { id: 'T-201', title: 'Stage / publish flow',    cell: 'configcore', status: 'doing',  est: 5,  deps: ['T-090'] },
    { id: 'T-202', title: 'Flag rollout calc',       cell: 'configcore', status: 'done',   est: 3,  deps: [] },
    // auditcore
    { id: 'T-110', title: 'Merkle proof endpoint',   cell: 'auditcore',  status: 'review', est: 5,  deps: ['T-090'] },
    { id: 'T-090', title: 'Hash chain v2 schema',    cell: 'auditcore',  status: 'done',   est: 3,  deps: [] },
    { id: 'T-115', title: 'Audit query slice',       cell: 'auditcore',  status: 'todo',   est: 4,  deps: ['T-110'] },
    // observecore
    { id: 'T-301', title: 'OTLP exporter slice',     cell: 'observecore',status: 'todo',   est: 5,  deps: ['T-201'] },
  ];

  const CELL_COLORS = {
    accesscore:  { bg: 'oklch(0.96 0.04 270)', bd: 'oklch(0.78 0.10 270)', fg: 'oklch(0.40 0.15 270)' },
    configcore:  { bg: 'oklch(0.96 0.04 70)',  bd: 'oklch(0.80 0.10 70)',  fg: 'oklch(0.42 0.13 70)'  },
    auditcore:   { bg: 'oklch(0.95 0.04 150)', bd: 'oklch(0.78 0.10 150)', fg: 'oklch(0.40 0.15 150)' },
    observecore: { bg: 'oklch(0.96 0.03 200)', bd: 'oklch(0.78 0.10 200)', fg: 'oklch(0.40 0.13 200)' },
  };

  // ============================================================
  // Layered DAG layout helpers
  // ============================================================
  const layout = (nodes) => {
    const map = Object.fromEntries(nodes.map(n => [n.id, { ...n, depth: 0 }]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of Object.values(map))
        for (const d of n.deps) {
          if (!map[d]) continue;
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

  // ============================================================
  // 1. WORKFLOW × DAG combined — Pipeline view
  // Stages bar across the top + DAG below; per-step status drives the stage states.
  // ============================================================
  const stageFromStatus = (steps) => {
    const stat = (s) => steps.filter(x => x.status === s).length;
    const total = steps.length;
    const done = stat('done'), doing = stat('doing'), todo = stat('todo');
    const reviewStep = steps.find(s => /review|PR/i.test(s.name));
    return [
      { k: 'plan',   label: 'Plan',      state: 'done', note: `${total} steps decomposed` },
      { k: 'impl',   label: 'Implement', state: doing > 0 ? 'running' : (done === total ? 'done' : 'waiting'),
        note: `${done}/${total} steps complete` },
      { k: 'review', label: 'Review',
        state: reviewStep ? (reviewStep.status === 'done' ? 'done' : reviewStep.status === 'doing' ? 'review' : 'idle') : 'idle',
        note: reviewStep ? reviewStep.name : '—' },
      { k: 'fix',    label: 'Fix',     state: 'idle' },
      { k: 'ship',   label: 'Ship',    state: done === total ? 'waiting' : 'idle' },
    ];
  };

  const PipelineDAG = ({ steps, height = 200 }) => {
    const { map, cols } = useMemo(() => layout(steps), [steps]);
    const colKeys = Object.keys(cols).sort((a, b) => +a - +b);
    const COL_W = 150, ROW_H = 60, PAD_X = 24, PAD_Y = 16;
    const positions = {};
    colKeys.forEach((c, ci) => cols[c].forEach((n, ri) => {
      positions[n.id] = { x: PAD_X + ci * COL_W, y: PAD_Y + ri * ROW_H };
    }));
    const W = PAD_X * 2 + colKeys.length * COL_W;
    const H = Math.max(height, PAD_Y * 2 + Math.max(...colKeys.map(c => cols[c].length)) * ROW_H);

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="dag-svg">
        <defs>
          <marker id="dpa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
          </marker>
        </defs>
        {steps.flatMap(n => n.deps.map(d => {
          const p1 = positions[d], p2 = positions[n.id];
          if (!p1 || !p2) return null;
          const cx = (p1.x + p2.x) / 2 + 60;
          return (
            <path key={`${d}-${n.id}`}
                  d={`M ${p1.x + 128} ${p1.y + 22} C ${cx} ${p1.y + 22}, ${cx} ${p2.y + 22}, ${p2.x} ${p2.y + 22}`}
                  fill="none" stroke="var(--fg-faint)" strokeWidth="1.2" markerEnd="url(#dpa)"/>
          );
        }))}
        {steps.map(n => {
          const p = positions[n.id];
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
              <foreignObject width={128} height={44}>
                <div className={`dag-node-mini dag-node-${n.status}`}>
                  <div className="dag-mini-head">
                    <span className="dag-node-id">{n.id}</span>
                    <span className={`dag-stt dag-stt-${n.status}`}>
                      {n.status === 'done' ? '✓' : n.status === 'doing' ? '●' : '○'}
                    </span>
                  </div>
                  <div className="dag-mini-name">{n.name}</div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    );
  };

  const stateMeta = {
    idle:    { dot: 'idle',    label: '–'        },
    waiting: { dot: 'waiting', label: 'waiting'  },
    running: { dot: 'running', label: 'running'  },
    review:  { dot: 'review',  label: 'review'   },
    done:    { dot: 'done',    label: 'done'     },
  };

  const PipelineCard = ({ taskId, title, cell, steps, onOpen }) => {
    const stages = stageFromStatus(steps);
    const done = steps.filter(s => s.status === 'done').length;
    const ready = steps.filter(s => s.status === 'todo' && s.deps.every(d => steps.find(x => x.id === d)?.status === 'done')).length;
    return (
      <div className="devp-card">
        <div className="devp-card-head">
          <div>
            <div className="devp-task-title">{title}</div>
            <div className="v1-mute v1-mono" style={{ fontSize: 11.5, marginTop: 2 }}>
              {taskId} · {cell} · {done}/{steps.length} steps · ready {ready}
            </div>
          </div>
          <button className="v1-btn" onClick={onOpen}>Open</button>
        </div>
        <div className="devw-stages">
          {stages.map(s => (
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
        <div className="devp-dag-wrap">
          <PipelineDAG steps={steps} height={180}/>
        </div>
      </div>
    );
  };

  const PipelinePage = () => {
    const [filter, setFilter] = useState('all');
    const items = Object.entries(STEP_DAGS).map(([id, steps]) => ({
      id, steps,
      title: { 'T-101': 'OIDC: Microsoft Entra integration', 'T-110': 'Merkle proof endpoint', 'T-201': 'Stage / publish workflow' }[id],
      cell:  { 'T-101': 'accesscore', 'T-110': 'auditcore', 'T-201': 'configcore' }[id],
    }));
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Pipelines <span className="v1-h1-count v1-mono">{items.length}</span></h1>
            <p className="v1-sub">Workflow stages and step DAG together — one card per active task.</p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              {['all','running','review','blocked'].map(f => (
                <button key={f} data-active={filter===f || undefined}
                        onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
        </div>
        {window.DevDevelop && (
          <div className="devr-build-cards">
            <window.DevDevelop.ConsumerBaseCard/>
            <window.DevDevelop.SweeperFactoryCard/>
          </div>
        )}
        <div className="devp-list">
          {items.map(it => (
            <PipelineCard key={it.id} taskId={it.id} title={it.title} cell={it.cell} steps={it.steps}/>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================
  // 2. CROSS-CELL TASK DAG
  // Same DAG layout but nodes are tasks colored by cell; cross-cell edges
  // highlighted to expose coordination boundaries.
  // ============================================================
  const CrossCellDAG = () => {
    const { map, cols } = useMemo(() => layout(TASK_NODES), []);
    const [hover, setHover] = useState(null);
    const colKeys = Object.keys(cols).sort((a, b) => +a - +b);
    const COL_W = 230, ROW_H = 96, PAD_X = 32, PAD_Y = 28;
    const positions = {};
    colKeys.forEach((c, ci) => cols[c].forEach((n, ri) => {
      positions[n.id] = { x: PAD_X + ci * COL_W, y: PAD_Y + ri * ROW_H };
    }));
    const W = PAD_X * 2 + colKeys.length * COL_W;
    const H = PAD_Y * 2 + Math.max(...colKeys.map(c => cols[c].length)) * ROW_H;

    const cellsInPlay = [...new Set(TASK_NODES.map(n => n.cell))];
    const crossCellEdges = TASK_NODES.flatMap(n => n.deps
      .filter(d => map[d] && map[d].cell !== n.cell)
      .map(d => [d, n.id]));

    return (
      <div>
        <div className="dag-metrics">
          <div className="dag-metric"><span className="v1-mute">Tasks</span><b>{TASK_NODES.length}</b></div>
          <div className="dag-metric"><span className="v1-mute">Cells</span><b>{cellsInPlay.length}</b></div>
          <div className="dag-metric"><span className="v1-mute">Cross-cell edges</span><b className="v1-mono" style={{ color: 'var(--accent)' }}>{crossCellEdges.length}</b></div>
          <div className="dag-metric"><span className="v1-mute">Blocked tasks</span><b className="v1-mono">{TASK_NODES.filter(n => n.status === 'todo' && n.deps.some(d => map[d]?.status !== 'done')).length}</b></div>
        </div>
        <div className="devp-cell-legend">
          {cellsInPlay.map(c => (
            <span key={c} className="devp-cell-chip"
                  style={{ background: CELL_COLORS[c]?.bg, borderColor: CELL_COLORS[c]?.bd, color: CELL_COLORS[c]?.fg }}>
              {c}
            </span>
          ))}
        </div>
        <div className="dag-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="dag-svg">
            <defs>
              <marker id="ccar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
              </marker>
            </defs>
            {TASK_NODES.flatMap(n => n.deps.map(d => {
              const p1 = positions[d], p2 = positions[n.id];
              if (!p1 || !p2) return null;
              const isCross = map[d].cell !== n.cell;
              const lit = !hover || hover === n.id || hover === d;
              const cx = (p1.x + p2.x) / 2 + 100;
              return (
                <path key={`${d}-${n.id}`}
                      d={`M ${p1.x + 200} ${p1.y + 36} C ${cx} ${p1.y + 36}, ${cx} ${p2.y + 36}, ${p2.x} ${p2.y + 36}`}
                      fill="none"
                      stroke={isCross ? 'var(--accent)' : 'var(--fg-faint)'}
                      strokeWidth={isCross ? 2 : 1.2}
                      strokeDasharray={isCross ? '' : ''}
                      opacity={lit ? 1 : 0.3}
                      markerEnd="url(#ccar)"/>
              );
            }))}
            {TASK_NODES.map(n => {
              const p = positions[n.id];
              const c = CELL_COLORS[n.cell] || { bg: 'var(--bg-raised)', bd: 'var(--line)', fg: 'var(--fg)' };
              return (
                <g key={n.id} transform={`translate(${p.x}, ${p.y})`}
                   onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                   style={{cursor:'pointer'}}>
                  <foreignObject width={200} height={84}>
                    <div className="devp-task-node"
                         style={{ background: c.bg, borderColor: c.bd, color: c.fg }}>
                      <div className="devp-task-node-head">
                        <span className="v1-mono" style={{ fontSize: 11, fontWeight: 600 }}>{n.id}</span>
                        <span className={`dag-stt dag-stt-${n.status}`}>
                          {n.status === 'done' ? '✓' : n.status === 'doing' ? '●' : n.status === 'review' ? '◐' : '○'}
                        </span>
                      </div>
                      <div className="devp-task-node-title">{n.title}</div>
                      <div className="devp-task-node-foot v1-mono">{n.cell} · {n.est}pt</div>
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

  // Combined Task DAG page with mode toggle: Step / Task (cross-cell)
  const TaskDAGPage = () => {
    const [mode, setMode] = useState('task');
    const { TaskStepDAG } = window.DevExtras2 || {};
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Task DAG</h1>
            <p className="v1-sub">{mode === 'task'
              ? 'Cross-cell task dependencies. Edges crossing cell boundaries are highlighted.'
              : 'Per-task step graph. Critical path = longest chain by estimate.'}</p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              <button data-active={mode==='task' || undefined}
                      onClick={() => setMode('task')}>Cross-cell tasks</button>
              <button data-active={mode==='step' || undefined}
                      onClick={() => setMode('step')}>Steps within task</button>
            </div>
          </div>
        </div>
        {mode === 'task'
          ? <div style={{ padding: '0 32px 32px' }}><CrossCellDAG/></div>
          : (TaskStepDAG ? <TaskStepDAG/> : <div style={{ padding: 32 }}>Step DAG unavailable.</div>)}
      </div>
    );
  };

  // ============================================================
  // 3. DEPENDENCIES — goda-style explorer
  // ============================================================
  // Package model with goda-style metrics: sloc, files, imports#, importers#
  const PKG = (id, name, kind, sloc, files, imports, desc) => ({
    id, name, kind, sloc, files, imports, importers: 0, desc,
  });
  const PACKAGES = [
    // gocell framework
    PKG('gc/cellrt',     'gocell/cellrt',     'gc', 2840, 18, 5, 'Cell runtime + lifecycle'),
    PKG('gc/slicebus',   'gocell/slicebus',   'gc', 1620, 12, 3, 'In-process slice dispatch'),
    PKG('gc/contracts',  'gocell/contracts',  'gc', 980,  8,  4, 'Capability registry'),
    PKG('gc/audit',      'gocell/audit',      'gc', 1240, 9,  3, 'Hash-chained event log'),
    PKG('gc/observe',    'gocell/observe',    'gc', 760,  6,  4, 'Tracing + metrics'),
    PKG('gc/govern',     'gocell/govern',     'gc', 540,  5,  3, 'Policy + RBAC kernel'),
    // cells
    PKG('c/accesscore',  'gocell/cells/accesscore',  'cell', 4280, 32, 8, '8 slices · sso, rbac, session'),
    PKG('c/auditcore',   'gocell/cells/auditcore',   'cell', 2150, 18, 6, '4 slices · chain, query'),
    PKG('c/configcore',  'gocell/cells/configcore',  'cell', 3840, 28, 7, '6 slices · publish, flags'),
    PKG('c/observecore', 'gocell/cells/observecore', 'cell', 920,  8,  5, '3 slices · trace, metric'),
    // external
    PKG('ext/zap',       'go.uber.org/zap',          'ext', 0, 0, 0, 'Structured logging'),
    PKG('ext/otel',      'go.opentelemetry.io/otel', 'ext', 0, 0, 0, 'OpenTelemetry SDK'),
    PKG('ext/prom',      'prometheus/client_golang', 'ext', 0, 0, 0, 'Prometheus client'),
    PKG('ext/grpc',      'google.golang.org/grpc',   'ext', 0, 0, 0, 'gRPC runtime'),
    PKG('ext/jose',      'go-jose/go-jose',          'ext', 0, 0, 0, 'JOSE / JWT'),
    PKG('ext/oauth2',    'golang.org/x/oauth2',      'ext', 0, 0, 0, 'OAuth2 client'),
    PKG('ext/pgx',       'jackc/pgx',                'ext', 0, 0, 0, 'Postgres driver'),
    PKG('ext/yaml',      'gopkg.in/yaml.v3',         'ext', 0, 0, 0, 'YAML codec'),
    PKG('ext/cobra',     'spf13/cobra',              'ext', 0, 0, 0, 'CLI framework'),
  ];
  const IMPORTS = [
    ['gc/cellrt','ext/zap'], ['gc/cellrt','ext/cobra'],
    ['gc/slicebus','ext/otel'],
    ['gc/contracts','ext/grpc'],
    ['gc/audit','ext/pgx'],
    ['gc/observe','ext/otel'], ['gc/observe','ext/prom'],
    ['gc/govern','ext/jose'],
    ['c/accesscore','gc/cellrt'],['c/accesscore','gc/slicebus'],['c/accesscore','gc/contracts'],
    ['c/accesscore','gc/audit'],['c/accesscore','gc/govern'],
    ['c/accesscore','ext/jose'],['c/accesscore','ext/oauth2'],
    ['c/auditcore','gc/cellrt'],['c/auditcore','gc/audit'],['c/auditcore','ext/pgx'],
    ['c/configcore','gc/cellrt'],['c/configcore','gc/slicebus'],['c/configcore','gc/audit'],
    ['c/configcore','ext/yaml'],['c/configcore','ext/pgx'],
    ['c/observecore','gc/cellrt'],['c/observecore','gc/observe'],['c/observecore','ext/otel'],
  ];
  // compute importers
  PACKAGES.forEach(p => p.importers = IMPORTS.filter(([_, b]) => b === p.id).length);

  const matchPkg = (p, expr) => {
    if (!expr || !expr.trim()) return true;
    const parts = expr.split(/\s+/).filter(Boolean);
    let inc = parts.filter(x => !x.startsWith('-'));
    let exc = parts.filter(x => x.startsWith('-')).map(x => x.slice(1));
    const matchOne = (pat) => {
      const stripped = pat.replace(/:.*$/, '').replace(/\.\.\./g, '');
      return p.name.includes(stripped) || p.id.includes(stripped);
    };
    if (inc.length && !inc.some(matchOne)) return false;
    if (exc.some(matchOne)) return false;
    return true;
  };

  const transitiveDeps = (rootId, depth = 99) => {
    const visited = new Set();
    const walk = (id, d) => {
      if (visited.has(id) || d > depth) return;
      visited.add(id);
      IMPORTS.filter(([a]) => a === id).forEach(([_, b]) => walk(b, d + 1));
    };
    walk(rootId, 0);
    return visited;
  };

  const exportFormats = {
    dot: () => {
      let s = 'digraph gocell {\n  rankdir=LR;\n  node [shape=box, fontsize=10];\n';
      PACKAGES.forEach(p => s += `  "${p.id}" [label="${p.name}", style=${p.kind === 'ext' ? 'dashed' : 'filled'}];\n`);
      IMPORTS.forEach(([a, b]) => s += `  "${a}" -> "${b}";\n`);
      return s + '}\n';
    },
    mermaid: () => {
      let s = 'graph LR\n';
      IMPORTS.forEach(([a, b]) => s += `  ${a.replace(/\//g, '_')}-->${b.replace(/\//g, '_')}\n`);
      return s;
    },
    json: () => JSON.stringify({
      nodes: PACKAGES.map(p => ({ id: p.id, name: p.name, kind: p.kind, sloc: p.sloc, files: p.files, imports: p.imports })),
      edges: IMPORTS.map(([a, b]) => ({ from: a, to: b })),
    }, null, 2),
  };

  const DepsExplorer = ({ onOpenCell }) => {
    const [view, setView] = useState('list');
    const [scope, setScope] = useState('gocell/...');
    const [transitive, setTransitive] = useState(true);
    const [selected, setSelected] = useState('c/accesscore');
    const [exportFmt, setExportFmt] = useState(null);

    const filtered = PACKAGES.filter(p => matchPkg(p, scope));

    const sel = PACKAGES.find(p => p.id === selected);
    const reach = sel ? transitiveDeps(sel.id, transitive ? 99 : 1) : new Set();
    reach.delete(selected);

    const importers = sel ? IMPORTS.filter(([_, b]) => b === sel.id).map(([a]) => PACKAGES.find(p => p.id === a)) : [];
    const importsList = sel ? IMPORTS.filter(([a]) => a === sel.id).map(([_, b]) => PACKAGES.find(p => p.id === b)) : [];

    const exportText = exportFmt ? exportFormats[exportFmt]() : '';

    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Dependencies</h1>
            <p className="v1-sub">
              <span className="v1-mono">goda</span>-style explorer · package import graph, metrics, transitive reach. Export DOT / Mermaid / JSON.
            </p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              {['list','graph','tree','matrix'].map(v => (
                <button key={v} data-active={view===v || undefined}
                        onClick={() => setView(v)}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="devg-toolbar">
          <div className="devg-tool-row">
            <label className="devg-label">Scope</label>
            <input className="devg-scope v1-mono"
                   value={scope} onChange={e => setScope(e.target.value)}
                   placeholder="gocell/... -gocell/internal/..."/>
            <span className="v1-mute" style={{ fontSize: 11 }}>{filtered.length} / {PACKAGES.length} pkg</span>
          </div>
          <div className="devg-tool-row">
            <label className="devg-toggle">
              <input type="checkbox" checked={transitive} onChange={e => setTransitive(e.target.checked)}/>
              <span>Transitive (default depth ∞ — uncheck for direct only)</span>
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="v1-btn" onClick={() => setExportFmt('dot')}>Export DOT</button>
              <button className="v1-btn" onClick={() => setExportFmt('mermaid')}>Mermaid</button>
              <button className="v1-btn" onClick={() => setExportFmt('json')}>JSON</button>
            </div>
          </div>
        </div>
        <div className="devg-body">
          <div className="devg-main">
            {view === 'list' && (
              <table className="devg-table">
                <thead><tr>
                  <th>Package</th><th>Kind</th>
                  <th style={{textAlign:'right'}}>SLOC</th>
                  <th style={{textAlign:'right'}}>Files</th>
                  <th style={{textAlign:'right'}}>Imports</th>
                  <th style={{textAlign:'right'}}>Importers</th>
                </tr></thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} data-active={p.id === selected || undefined}
                        onClick={() => setSelected(p.id)}>
                      <td>
                        <div className="v1-mono">
                          {p.kind === 'cell' && onOpenCell
                            ? <button className="v1-link" onClick={(e) => { e.stopPropagation(); onOpenCell(p.id.replace('c/','')); }}>{p.name}</button>
                            : p.name}
                        </div>
                        <div className="v1-mute" style={{ fontSize: 11 }}>{p.desc}</div>
                      </td>
                      <td><span className={`devg-kind devg-kind-${p.kind}`}>{p.kind}</span></td>
                      <td style={{textAlign:'right'}} className="v1-mono">{p.sloc || '—'}</td>
                      <td style={{textAlign:'right'}} className="v1-mono">{p.files || '—'}</td>
                      <td style={{textAlign:'right'}} className="v1-mono">{p.imports || '—'}</td>
                      <td style={{textAlign:'right'}} className="v1-mono">{p.importers || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === 'graph' && (
              <div className="devg-graph-wrap">
                <p className="v1-mute" style={{ fontSize: 12.5, padding: '0 0 12px' }}>
                  Reach of <span className="v1-mono">{sel?.name}</span> · {reach.size} packages, {transitive ? 'transitive' : 'direct only'}
                </p>
                <DepGraph rootId={selected} transitive={transitive} onSelect={setSelected}/>
              </div>
            )}
            {view === 'tree' && (
              <div className="devg-tree v1-mono">
                {sel && <DepTree rootId={sel.id} maxDepth={transitive ? 4 : 1}/>}
              </div>
            )}
            {view === 'matrix' && (
              <DepMatrix packages={filtered}/>
            )}
          </div>
          <aside className="devg-aside">
            {sel && (
              <>
                <div className="devg-aside-h">
                  <div className="v1-mono" style={{ fontSize: 13, fontWeight: 500 }}>{sel.name}</div>
                  <span className={`devg-kind devg-kind-${sel.kind}`}>{sel.kind}</span>
                </div>
                <div className="v1-mute" style={{ fontSize: 12.5, marginBottom: 14 }}>{sel.desc}</div>
                <div className="devg-aside-stats">
                  <div><span>SLOC</span><b className="v1-mono">{sel.sloc || '—'}</b></div>
                  <div><span>Files</span><b className="v1-mono">{sel.files || '—'}</b></div>
                  <div><span>Imports</span><b className="v1-mono">{sel.imports || '—'}</b></div>
                  <div><span>Importers</span><b className="v1-mono">{sel.importers || '—'}</b></div>
                  <div><span>Reach</span><b className="v1-mono">{reach.size}</b></div>
                </div>
                <div className="devg-aside-section">
                  <div className="devg-aside-label">IMPORTS ({importsList.length})</div>
                  {importsList.map(p => (
                    <div key={p.id} className="devg-aside-row" onClick={() => setSelected(p.id)}>
                      <span className="v1-mono">{p.name}</span>
                      <span className={`devg-kind devg-kind-${p.kind}`}>{p.kind}</span>
                    </div>
                  ))}
                </div>
                <div className="devg-aside-section">
                  <div className="devg-aside-label">IMPORTERS ({importers.length})</div>
                  {importers.map(p => (
                    <div key={p.id} className="devg-aside-row" onClick={() => setSelected(p.id)}>
                      <span className="v1-mono">{p.name}</span>
                      <span className={`devg-kind devg-kind-${p.kind}`}>{p.kind}</span>
                    </div>
                  ))}
                  {!importers.length && <div className="v1-mute" style={{ fontSize: 12 }}>No importers in current assembly.</div>}
                </div>
              </>
            )}
          </aside>
        </div>
        {exportFmt && (
          <div className="v1-drawer" onClick={() => setExportFmt(null)}>
            <div className="v1-drawer-panel" onClick={e => e.stopPropagation()} style={{ width: 640 }}>
              <div className="v1-drawer-head">
                <div>
                  <div className="v1-h2">Export · {exportFmt.toUpperCase()}</div>
                  <div className="v1-mute v1-mono">{filtered.length} packages · {IMPORTS.length} edges</div>
                </div>
                <button className="v1-ghost" onClick={() => setExportFmt(null)}>✕</button>
              </div>
              <pre className="devg-export v1-mono">{exportText}</pre>
              <div className="v1-drawer-acts">
                <button className="v1-btn" onClick={() => navigator.clipboard?.writeText(exportText)}>Copy</button>
                <button className="v1-btn v1-btn-primary" onClick={() => setExportFmt(null)}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const DepTree = ({ rootId, maxDepth = 4 }) => {
    const root = PACKAGES.find(p => p.id === rootId);
    const render = (id, depth, path = new Set()) => {
      if (path.has(id) || depth > maxDepth) return null;
      const p = PACKAGES.find(x => x.id === id);
      const children = IMPORTS.filter(([a]) => a === id).map(([_, b]) => b);
      const newPath = new Set(path); newPath.add(id);
      return (
        <div key={id + depth} className="devg-tree-node">
          <div className="devg-tree-row">
            <span className={`devg-kind devg-kind-${p.kind}`}>{p.kind}</span>
            <span>{p.name}</span>
            {p.sloc > 0 && <span className="v1-mute" style={{ marginLeft: 'auto', fontSize: 11 }}>{p.sloc} sloc</span>}
          </div>
          {children.length > 0 && depth < maxDepth && (
            <div className="devg-tree-kids">
              {children.map(c => render(c, depth + 1, newPath))}
            </div>
          )}
        </div>
      );
    };
    return render(rootId, 0);
  };

  const DepGraph = ({ rootId, transitive, onSelect }) => {
    const reach = transitiveDeps(rootId, transitive ? 99 : 1);
    const ids = [...reach];
    const positions = {};
    const colMap = {}; // BFS depth
    let frontier = [rootId];
    let depth = 0;
    while (frontier.length && depth < 6) {
      frontier.forEach(id => { if (colMap[id] === undefined) colMap[id] = depth; });
      const next = [];
      frontier.forEach(id => {
        IMPORTS.filter(([a]) => a === id).forEach(([_, b]) => {
          if (colMap[b] === undefined && reach.has(b)) next.push(b);
        });
      });
      frontier = next; depth++;
    }
    const cols = {};
    ids.forEach(id => {
      const d = colMap[id] ?? 0;
      cols[d] = cols[d] || []; cols[d].push(id);
    });
    const COL_W = 220, ROW_H = 56;
    Object.entries(cols).forEach(([d, items]) => {
      items.forEach((id, i) => positions[id] = { x: 30 + +d * COL_W, y: 30 + i * ROW_H });
    });
    const W = 30 * 2 + Math.max(1, Object.keys(cols).length) * COL_W;
    const H = 30 * 2 + Math.max(...Object.values(cols).map(c => c.length)) * ROW_H;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="devd-svg" style={{ minHeight: 240 }}>
        <defs>
          <marker id="dgar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
          </marker>
        </defs>
        {IMPORTS.filter(([a, b]) => reach.has(a) && reach.has(b)).map(([a, b], i) => {
          const p1 = positions[a], p2 = positions[b];
          if (!p1 || !p2) return null;
          const cx = (p1.x + p2.x) / 2;
          return (
            <path key={i} d={`M ${p1.x + 180} ${p1.y + 22} C ${cx} ${p1.y + 22}, ${cx} ${p2.y + 22}, ${p2.x} ${p2.y + 22}`}
                  fill="none" stroke="var(--fg-faint)" strokeWidth="1.2" markerEnd="url(#dgar)"/>
          );
        })}
        {ids.map(id => {
          const p = PACKAGES.find(x => x.id === id);
          const pos = positions[id];
          return (
            <g key={id} transform={`translate(${pos.x}, ${pos.y})`} style={{cursor:'pointer'}}
               onClick={() => onSelect && onSelect(id)}>
              <foreignObject width={180} height={44}>
                <div className={`devd-node devd-node-${p.kind}`}>
                  <div className="devd-node-label">{p.name}</div>
                  {p.sloc > 0 && <div className="devd-node-desc">{p.sloc} sloc · {p.files} files</div>}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    );
  };

  const DepMatrix = ({ packages }) => {
    const ids = packages.map(p => p.id);
    return (
      <div className="devg-matrix-wrap">
        <table className="devg-matrix">
          <thead>
            <tr>
              <th></th>
              {packages.map(p => (
                <th key={p.id}><span className="devg-matrix-h">{p.id.split('/').pop()}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {packages.map(row => (
              <tr key={row.id}>
                <td className="v1-mono devg-matrix-row-h">{row.name}</td>
                {packages.map(col => {
                  const has = IMPORTS.some(([a, b]) => a === row.id && b === col.id);
                  return <td key={col.id} className={has ? 'devg-cell-on' : ''}>{has ? '●' : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ============================================================
  // 4. CONTRACTS × FEATURES — extended contract registry
  // Each contract links to: producing feature, consuming features, related tasks.
  // ============================================================
  const CONTRACTS = [
    { id: 'audit.append',   tier: 'L3', cell: 'auditcore', version: '2.0.1',
      shippedBy: { feature: 'F-2', name: 'Audit chain v2', epic: 'Identity & RBAC' },
      consumers: ['accesscore', 'configcore', 'observecore'],
      consumedBy: [{feature:'F-1', name:'SSO providers'}, {feature:'F-3', name:'Versioned publishing'}],
      tasks: ['T-101', 'T-201'], sla: '99.9%', status: 'stable',
      sig: 'func Append(ctx, event Event) (Receipt, error)' },
    { id: 'auth.verify',    tier: 'L3', cell: 'accesscore', version: '1.4.0',
      shippedBy: { feature: 'F-1', name: 'SSO providers' },
      consumers: ['gateway'],
      consumedBy: [],
      tasks: ['T-101', 'T-102'], sla: '99.95%', status: 'stable',
      sig: 'func Verify(ctx, token string) (Subject, error)' },
    { id: 'config.read',    tier: 'L3', cell: 'configcore', version: '1.0.0',
      shippedBy: { feature: 'F-3', name: 'Versioned publishing' },
      consumers: ['accesscore', 'auditcore', 'gateway'],
      consumedBy: [{feature:'F-1', name:'SSO providers'}],
      tasks: ['T-201'], sla: '99.9%', status: 'stable',
      sig: 'func Get(ctx, key string) (Value, error)' },
    { id: 'flag.evaluate',  tier: 'L3', cell: 'configcore', version: '1.2.3',
      shippedBy: { feature: 'F-3', name: 'Versioned publishing' },
      consumers: ['gateway', 'accesscore'],
      consumedBy: [],
      tasks: ['T-202'], sla: '99.9%', status: 'stable',
      sig: 'func Eval(ctx, key, subject) (bool, error)' },
    { id: 'metric.emit',    tier: 'L3', cell: 'observecore', version: '0.9.0',
      shippedBy: { feature: 'F-4', name: 'Trace exporter' },
      consumers: ['auditcore'],
      consumedBy: [],
      tasks: ['T-301'], sla: '99.5%', status: 'breaking',
      sig: 'func Emit(ctx, name, val, labels) error' },
    { id: 'trace.span',     tier: 'L3', cell: 'observecore', version: '1.0.0',
      shippedBy: { feature: 'F-4', name: 'Trace exporter' },
      consumers: ['accesscore', 'configcore'],
      consumedBy: [],
      tasks: ['T-301'], sla: '99.5%', status: 'preview',
      sig: 'func Span(ctx, name string) (Span, error)' },
  ];

  const ContractFeaturesPage = ({ onOpenCell }) => {
    const [sel, setSel] = useState(CONTRACTS[0]);
    const TIER_COLORS = {
      L1: 'oklch(0.92 0.04 270)',
      L2: 'oklch(0.93 0.04 200)',
      L3: 'oklch(0.93 0.04 70)',
      L4: 'oklch(0.93 0.04 30)',
    };
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Contract registry <span className="v1-h1-count v1-mono">{CONTRACTS.length}</span></h1>
            <p className="v1-sub">Capabilities, tier, version, and feature linkage. Pick a contract to see which feature ships it and which consume it.</p>
          </div>
        </div>
        {window.DevDevelop && <window.DevDevelop.GovernanceGatesBlock/>}
        <div className="devc-body">
          <table className="devg-table">
            <thead><tr>
              <th>Contract</th><th>Tier</th><th>Cell</th>
              <th>Version</th><th>Shipped by</th><th>Consumers</th><th>Status</th>
            </tr></thead>
            <tbody>
              {CONTRACTS.map(c => (
                <tr key={c.id} data-active={c.id === sel.id || undefined} onClick={() => setSel(c)}>
                  <td><span className="v1-mono">{c.id}</span></td>
                  <td><span className="devc-tier" style={{ background: TIER_COLORS[c.tier] }}>{c.tier}</span></td>
                  <td className="v1-mono">
                    <button className="v1-link" onClick={(e) => { e.stopPropagation(); onOpenCell && onOpenCell(c.cell); }}>
                      {c.cell}
                    </button>
                  </td>
                  <td className="v1-mono">v{c.version}</td>
                  <td>
                    <span className="v1-chip">{c.shippedBy.feature}</span>{' '}
                    <span style={{ fontSize: 12 }}>{c.shippedBy.name}</span>
                  </td>
                  <td className="v1-mono">{c.consumers.join(', ')}</td>
                  <td>
                    <span className={`devc-status devc-status-${c.status}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <aside className="devg-aside">
            <div className="devg-aside-h">
              <div className="v1-mono" style={{ fontSize: 14, fontWeight: 500 }}>{sel.id}</div>
              <span className="devc-tier" style={{ background: TIER_COLORS[sel.tier] }}>{sel.tier}</span>
            </div>
            <div className="v1-mute" style={{ fontSize: 12, marginBottom: 14 }}>
              v{sel.version} · {sel.cell} · SLA {sel.sla}
            </div>
            <pre className="v1-mono devc-sig">{sel.sig}</pre>
            {window.DevDevelop && <window.DevDevelop.ResponseEnvelopeBlock contractId={sel.id}/>}
            <div className="devg-aside-section">
              <div className="devg-aside-label">SHIPPED BY</div>
              <div className="devc-link-row">
                <span className="v1-chip">{sel.shippedBy.feature}</span>
                <span>{sel.shippedBy.name}</span>
              </div>
              <div className="v1-mute" style={{ fontSize: 11.5, marginTop: 4 }}>
                Epic · {sel.shippedBy.epic}
              </div>
            </div>
            <div className="devg-aside-section">
              <div className="devg-aside-label">CONSUMED BY ({sel.consumedBy.length})</div>
              {sel.consumedBy.length === 0
                ? <div className="v1-mute" style={{ fontSize: 12 }}>No features currently depend on this capability.</div>
                : sel.consumedBy.map(f => (
                  <div key={f.feature} className="devc-link-row">
                    <span className="v1-chip">{f.feature}</span>
                    <span>{f.name}</span>
                  </div>
                ))}
            </div>
            <div className="devg-aside-section">
              <div className="devg-aside-label">RELATED TASKS ({sel.tasks.length})</div>
              {sel.tasks.map(t => (
                <div key={t} className="devc-link-row">
                  <span className="v1-mono" style={{ fontSize: 11.5 }}>{t}</span>
                </div>
              ))}
            </div>
            <div className="devg-aside-section">
              <div className="devg-aside-label">CONSUMER CELLS ({sel.consumers.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sel.consumers.map(c => <span key={c} className="v1-chip">{c}</span>)}
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  };

  window.DevExtras3 = { PipelinePage, TaskDAGPage, DepsExplorer, ContractFeaturesPage };
})();
