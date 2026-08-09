/* global React */
// Three new modules:
//   - DecomposeModal: AI breakdown of Epic/Feature → child tasks
//   - DAGView: Task → Steps DAG with parallel lanes
//   - ContractsPage: L1-L4 capability registry
// Reuses tokens.css + v1-linear.css + dev-pages.css.

(() => {
  const { useState, useEffect, useMemo } = React;

  const Ico = (d, w = 14) => (
    <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
  );
  const I = {
    sparkles: Ico("M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4z M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"),
    plus:     Ico("M12 5v14 M5 12h14"),
    close:    Ico("M18 6L6 18 M6 6l12 12"),
    check:    Ico("M20 6L9 17l-5-5"),
    play:     Ico("M5 3l14 9-14 9z"),
    dag:      Ico("M5 6h6 M13 6h6 M5 18h6 M13 18h6 M5 12h14 M9 4l-4 2 4 2 M19 4l-4 2 4 2 M9 16l-4 2 4 2 M19 16l-4 2 4 2"),
    contract: Ico("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4"),
    arrow:    Ico("M5 12h14 M13 5l7 7-7 7"),
  };

  // ============================================================
  // 1. AI decompose modal
  // ============================================================
  const SAMPLE_BREAKDOWN = {
    epic: [
      { id: 'F-12', kind: 'Feature', title: 'OIDC providers (Entra/Okta/Auth0)', points: 13, journey: 'auto', confidence: 0.92 },
      { id: 'F-13', kind: 'Feature', title: 'SAML 2.0 fallback', points: 8, journey: 'auto', confidence: 0.78 },
      { id: 'F-14', kind: 'Feature', title: 'Session + refresh token rotation', points: 5, journey: 'auto', confidence: 0.88 },
      { id: 'F-15', kind: 'Feature', title: 'Group claim → role mapping', points: 3, journey: 'auto', confidence: 0.95 },
      { id: 'F-16', kind: 'Feature', title: 'Audit hooks for auth events', points: 2, journey: 'auto', confidence: 0.97 },
    ],
    feature: [
      { id: 'T-A', kind: 'Task', title: 'Scaffold cells/accesscore/slices/sso', points: 1, journey: 'J-auto-1', confidence: 0.99,
        dependsOn: [], cell: 'accesscore' },
      { id: 'T-B', kind: 'Task', title: 'OIDC discovery + JWKS client', points: 3, journey: 'J-auto-2', confidence: 0.94,
        dependsOn: ['T-A'], cell: 'accesscore' },
      { id: 'T-C', kind: 'Task', title: 'Token exchange + claims map', points: 5, journey: 'J-auto-3', confidence: 0.91,
        dependsOn: ['T-B'], cell: 'accesscore' },
      { id: 'T-D', kind: 'Task', title: 'Session store + refresh rotation', points: 3, journey: 'J-auto-4', confidence: 0.86,
        dependsOn: ['T-A'], cell: 'accesscore' },
      { id: 'T-E', kind: 'Task', title: 'Audit hook integration', points: 2, journey: 'J-auto-5', confidence: 0.97,
        dependsOn: ['T-C'], cell: 'auditcore' },
      { id: 'T-F', kind: 'Task', title: 'Conformance + e2e tests', points: 3, journey: 'J-auto-6', confidence: 0.83,
        dependsOn: ['T-C', 'T-D', 'T-E'], cell: 'accesscore' },
    ],
  };

  const ConfDot = ({ v }) => {
    const cl = v >= 0.9 ? 'ok' : v >= 0.8 ? 'info' : 'warn';
    return <span className={`dec-conf dec-conf-${cl}`}>{Math.round(v*100)}%</span>;
  };

  const DecomposeModal = ({ open, target, onClose, onApply }) => {
    const [phase, setPhase] = useState('idle'); // idle | running | review
    const [items, setItems] = useState([]);
    const [keep, setKeep] = useState({});
    const [hint, setHint] = useState('');

    useEffect(() => { if (!open) { setPhase('idle'); setItems([]); setKeep({}); setHint(''); } }, [open]);
    if (!open) return null;

    const isFeature = target?.kind === 'Feature';
    const sample = isFeature ? SAMPLE_BREAKDOWN.feature : SAMPLE_BREAKDOWN.epic;

    const run = () => {
      setPhase('running');
      setTimeout(() => {
        setItems(sample);
        const k = {}; sample.forEach(s => k[s.id] = true);
        setKeep(k);
        setPhase('review');
      }, 1200);
    };

    const totalPts = items.filter(i => keep[i.id]).reduce((a, b) => a + b.points, 0);

    return (
      <div className="v1d-modal" onClick={onClose}>
        <div className="dec-panel" onClick={e => e.stopPropagation()}>
          <div className="dec-head">
            <div>
              <div className="v1-mono v1-mute" style={{fontSize:11}}>
                AI decompose · {target?.kind} {target?.id}
              </div>
              <h2 className="v1-h2" style={{margin:'2px 0 0'}}>{target?.title}</h2>
            </div>
            <button className="v1-ghost" onClick={onClose}>{I.close}</button>
          </div>

          {phase === 'idle' && (
            <div className="dec-body">
              <div className="dec-hint-card">
                <span style={{color:'var(--accent)'}}>{I.sparkles}</span>
                <div>
                  <div style={{fontWeight:500,marginBottom:4}}>
                    Decompose into {isFeature ? 'tasks + DAG' : 'features'}
                  </div>
                  <div className="v1-mute" style={{fontSize:12.5,lineHeight:1.55}}>
                    Claude will analyze the {target?.kind.toLowerCase()} description, look at related cells / journeys,
                    and propose a breakdown. You can edit, drop, or merge items before applying.
                  </div>
                </div>
              </div>

              <label className="v1d-field">
                <span>Optional hint or constraint</span>
                <input placeholder={isFeature
                  ? 'e.g. parallelize provider implementations, target Sprint 26'
                  : 'e.g. ship MVP with Entra only'}
                  value={hint} onChange={e=>setHint(e.target.value)}/>
              </label>

              <div className="dec-tools">
                <div className="dec-tool-on">
                  <span className="v1-mono" style={{fontSize:11}}>repo.read</span>
                  <span className="dev-stat dev-stat-ok">on</span>
                </div>
                <div className="dec-tool-on">
                  <span className="v1-mono" style={{fontSize:11}}>journey.search</span>
                  <span className="dev-stat dev-stat-ok">on</span>
                </div>
                <div className="dec-tool-on">
                  <span className="v1-mono" style={{fontSize:11}}>contracts.list</span>
                  <span className="dev-stat dev-stat-ok">on</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'running' && (
            <div className="dec-body dec-running">
              <div className="dec-spinner"/>
              <div style={{marginTop:14,fontSize:13}}>Analyzing scope, journeys, and contracts…</div>
              <div className="v1-mute v1-mono" style={{marginTop:6,fontSize:11}}>
                claude-sonnet-4-5 · ~3s
              </div>
            </div>
          )}

          {phase === 'review' && (
            <div className="dec-body" style={{padding:0}}>
              <div className="dec-list-head">
                <span className="dev-insp-label" style={{margin:0}}>PROPOSED · {items.length} {isFeature?'tasks':'features'}</span>
                <span className="v1-mute" style={{fontSize:12}}>
                  Total: <b className="v1-mono">{totalPts}</b> pts ·
                  Keep: <b className="v1-mono">{Object.values(keep).filter(Boolean).length}</b>
                </span>
              </div>
              <div className="dec-list">
                {items.map(it => (
                  <label key={it.id} className={`dec-row ${!keep[it.id]?'dec-row-off':''}`}>
                    <input type="checkbox" checked={!!keep[it.id]}
                           onChange={e => setKeep(k => ({...k, [it.id]: e.target.checked}))}/>
                    <span className={`dev-tag ${isFeature?'dev-tag-task':'dev-tag-feat'}`}>
                      {it.kind}
                    </span>
                    <span className="v1-mono v1-mute" style={{fontSize:11}}>{it.id}</span>
                    <span className="dec-row-title">{it.title}</span>
                    {it.dependsOn && it.dependsOn.length > 0 && (
                      <span className="dec-deps v1-mono" title={`Depends on: ${it.dependsOn.join(', ')}`}>
                        ← {it.dependsOn.join(',')}
                      </span>
                    )}
                    <span className="v1-chip">{it.points}p</span>
                    <ConfDot v={it.confidence}/>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="dec-foot">
            {phase === 'idle' && (
              <>
                <span className="v1-mute v1-mono" style={{fontSize:11}}>
                  Estimate: ~{isFeature ? 6 : 5} items, {isFeature ? '~17 pts' : '~31 pts'}
                </span>
                <div style={{display:'flex',gap:8}}>
                  <button className="v1-btn" onClick={onClose}>Cancel</button>
                  <button className="v1-btn v1-btn-primary" onClick={run}>
                    {I.sparkles}<span>Run breakdown</span>
                  </button>
                </div>
              </>
            )}
            {phase === 'review' && (
              <>
                <button className="v1-btn" onClick={() => setPhase('idle')}>← Re-run</button>
                <div style={{display:'flex',gap:8}}>
                  <button className="v1-btn" onClick={onClose}>Discard</button>
                  <button className="v1-btn v1-btn-primary"
                          onClick={() => { onApply(items.filter(i => keep[i.id])); onClose(); }}>
                    {I.check}<span>Apply {Object.values(keep).filter(Boolean).length} items</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // 2. DAG view for Task → Steps with parallel lanes
  // ============================================================
  const DAG_STEPS = [
    { id: 'A', name: 'Generate slice contract', cell: 'accesscore', deps: [], status: 'done', est: 0.5 },
    { id: 'B', name: 'JWKS verifier impl',     cell: 'accesscore', deps: ['A'], status: 'done', est: 1 },
    { id: 'C', name: 'Group claims mapper',    cell: 'accesscore', deps: ['A'], status: 'done', est: 0.5 },
    { id: 'D', name: 'OIDC handler',           cell: 'accesscore', deps: ['B','C'], status: 'doing', est: 1.5 },
    { id: 'E', name: 'Audit event hook',       cell: 'auditcore',  deps: ['A'], status: 'doing', est: 0.5 },
    { id: 'F', name: 'Config schema migration', cell: 'configcore', deps: ['A'], status: 'todo', est: 0.5 },
    { id: 'G', name: 'Conformance tests',      cell: 'accesscore', deps: ['D','E','F'], status: 'todo', est: 1 },
    { id: 'H', name: 'PR review + merge',      cell: 'accesscore', deps: ['G'], status: 'todo', est: 0.5 },
  ];

  const computeLayout = (nodes) => {
    const map = Object.fromEntries(nodes.map(n => [n.id, { ...n, depth: 0 }]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of Object.values(map)) {
        for (const d of n.deps) {
          const want = map[d].depth + 1;
          if (n.depth < want) { n.depth = want; changed = true; }
        }
      }
    }
    const cols = {};
    Object.values(map).forEach(n => {
      cols[n.depth] = cols[n.depth] || [];
      cols[n.depth].push(n);
    });
    return { map, cols };
  };

  const DAGView = () => {
    const { map, cols } = useMemo(() => computeLayout(DAG_STEPS), []);
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

    // Critical path through done/doing/todo by longest path
    const critical = new Set(['A','B','D','G','H']);

    const totalEst = DAG_STEPS.reduce((a, b) => a + b.est, 0);
    const criticalEst = DAG_STEPS.filter(s => critical.has(s.id)).reduce((a, b) => a + b.est, 0);
    const parallelism = (totalEst / criticalEst).toFixed(2);

    return (
      <div className="dag-wrap">
        <div className="dag-meta">
          <div className="dag-meta-block">
            <span className="dev-insp-label" style={{margin:0}}>SERIAL</span>
            <b className="v1-mono">{totalEst}d</b>
          </div>
          <div className="dag-meta-block">
            <span className="dev-insp-label" style={{margin:0}}>CRITICAL</span>
            <b className="v1-mono" style={{color:'var(--accent)'}}>{criticalEst}d</b>
          </div>
          <div className="dag-meta-block">
            <span className="dev-insp-label" style={{margin:0}}>PARALLELISM</span>
            <b className="v1-mono">×{parallelism}</b>
          </div>
          <div className="dag-meta-block">
            <span className="dev-insp-label" style={{margin:0}}>READY NOW</span>
            <b className="v1-mono">{DAG_STEPS.filter(s => s.status==='todo' && s.deps.every(d => map[d].status==='done')).length}</b>
          </div>
          <div style={{flex:1}}/>
          <button className="v1-btn">Replan</button>
          <button className="v1-btn v1-btn-primary">{I.play}<span>Dispatch ready steps</span></button>
        </div>
        <div className="dag-scroll">
          <svg width={W} height={H} className="dag-svg">
            {/* edges */}
            {DAG_STEPS.flatMap(n => n.deps.map(d => {
              const a = positions[d], b = positions[n.id];
              const x1 = a.x + 168, y1 = a.y + 28;
              const x2 = b.x, y2 = b.y + 28;
              const cx = (x1 + x2) / 2;
              const isCrit = critical.has(d) && critical.has(n.id);
              return (
                <path key={`${d}-${n.id}`}
                      d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={isCrit ? 'var(--accent)' : 'var(--line)'}
                      strokeWidth={isCrit ? 1.6 : 1.2}
                      opacity={hover && hover !== d && hover !== n.id ? 0.25 : 1}/>
              );
            }))}
            {/* nodes */}
            {DAG_STEPS.map(n => {
              const p = positions[n.id];
              const onCrit = critical.has(n.id);
              return (
                <g key={n.id}
                   transform={`translate(${p.x},${p.y})`}
                   onMouseEnter={() => setHover(n.id)}
                   onMouseLeave={() => setHover(null)}
                   style={{cursor:'pointer'}}>
                  <foreignObject width={168} height={80}>
                    <div className={`dag-node dag-node-${n.status} ${onCrit?'dag-node-crit':''}`}>
                      <div className="dag-node-head">
                        <span className="v1-mono dag-node-id">{n.id}</span>
                        <span className={`dag-stt dag-stt-${n.status}`}>
                          {n.status === 'done' ? '✓' : n.status === 'doing' ? '◐' : '○'}
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
  // 3. Contract registry (L1-L4)
  // ============================================================
  const TIERS = {
    L1: { name: 'L1 · Primitive', desc: 'Pure functions, no I/O. Hash, codec, validator.' },
    L2: { name: 'L2 · Cell-local', desc: 'In-process slice calls within one cell.' },
    L3: { name: 'L3 · Cross-cell', desc: 'RPC between cells, registered + versioned.' },
    L4: { name: 'L4 · External',   desc: 'Public API or SaaS surface, signed contracts.' },
  };

  const CONTRACTS = [
    { id: 'C-001', name: 'access.sso.AuthorizeOIDC',  tier: 'L3', cell: 'accesscore',  version: 'v2.1.0', status: 'Active',
      consumers: ['gateway','auditcore'], breaking: false, sla: '99.95%' },
    { id: 'C-002', name: 'access.sso.VerifyToken',    tier: 'L2', cell: 'accesscore',  version: 'v1.4.2', status: 'Active',
      consumers: ['accesscore/session'], breaking: false, sla: 'in-proc' },
    { id: 'C-003', name: 'audit.chain.Append',        tier: 'L3', cell: 'auditcore',   version: 'v3.0.0', status: 'Active',
      consumers: ['accesscore','configcore','gateway'], breaking: true, sla: '99.99%' },
    { id: 'C-004', name: 'audit.chain.MerkleProof',   tier: 'L4', cell: 'auditcore',   version: 'v1.0.0-rc.2', status: 'RC',
      consumers: ['public-api'], breaking: false, sla: '99.9%' },
    { id: 'C-005', name: 'config.publish.Stage',      tier: 'L3', cell: 'configcore',  version: 'v2.0.1', status: 'Active',
      consumers: ['admin-ui'], breaking: false, sla: '99.95%' },
    { id: 'C-006', name: 'config.flags.Evaluate',     tier: 'L2', cell: 'configcore',  version: 'v1.7.0', status: 'Active',
      consumers: ['configcore/sdk'], breaking: false, sla: 'in-proc' },
    { id: 'C-007', name: 'codec.hashchain.Sha256',    tier: 'L1', cell: 'auditcore',   version: 'v1.0.0', status: 'Active',
      consumers: ['auditcore/chain'], breaking: false, sla: 'pure' },
    { id: 'C-008', name: 'gateway.limits.SlidingWindow', tier: 'L1', cell: 'gateway',  version: 'v1.2.0', status: 'Active',
      consumers: ['gateway/limit'], breaking: false, sla: 'pure' },
    { id: 'C-009', name: 'public.api.AuditExport',    tier: 'L4', cell: 'auditcore',   version: 'v1.0.0', status: 'Active',
      consumers: ['SaaS · 3rd party'], breaking: false, sla: '99.9%' },
    { id: 'C-010', name: 'access.rbac.Resolve',       tier: 'L3', cell: 'accesscore',  version: 'v2.0.0', status: 'Draft',
      consumers: [], breaking: false, sla: '—' },
  ];

  const ContractsPage = () => {
    const [tier, setTier] = useState('all');
    const [picked, setPicked] = useState(CONTRACTS[0]);
    const filtered = tier === 'all' ? CONTRACTS : CONTRACTS.filter(c => c.tier === tier);
    const counts = { all: CONTRACTS.length };
    Object.keys(TIERS).forEach(t => counts[t] = CONTRACTS.filter(c => c.tier === t).length);

    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Contract registry <span className="v1-h1-count v1-mono">{CONTRACTS.length}</span></h1>
            <p className="v1-sub">Capabilities exposed by cells. Versioned, tiered, discoverable across the platform.</p>
          </div>
          <div className="v1-head-actions">
            <button className="v1-btn">Diff vs prod</button>
            <button className="v1-btn v1-btn-primary">{I.plus}<span>Register contract</span></button>
          </div>
        </div>

        <div className="ctr-tiers">
          {[['all','All'], ...Object.entries(TIERS).map(([k,v])=>[k,v.name])].map(([k,n]) => (
            <button key={k} className={`ctr-tier ${tier===k?'ctr-tier-on':''}`}
                    onClick={() => setTier(k)}>
              <span className={`ctr-tier-badge ctr-tier-${k}`}>{k==='all'?'·':k}</span>
              <span className="ctr-tier-name">{n}</span>
              <span className="v1-mono v1-mute">{counts[k]}</span>
              {k !== 'all' && tier === k && (
                <div className="ctr-tier-desc">{TIERS[k].desc}</div>
              )}
            </button>
          ))}
        </div>

        <div className="dev-backlog-body" style={{gridTemplateColumns: 'minmax(0,1fr) 380px'}}>
          <div style={{overflow:'auto', padding: '0 0 24px'}}>
            <div className="ctr-table">
              <div className="ctr-row ctr-row-head">
                <div>Tier</div>
                <div>Capability</div>
                <div>Cell</div>
                <div>Version</div>
                <div>Consumers</div>
                <div>SLA</div>
                <div>Status</div>
              </div>
              {filtered.map(c => (
                <button key={c.id} className={`ctr-row ${picked?.id===c.id?'ctr-row-on':''}`}
                        onClick={() => setPicked(c)}>
                  <div><span className={`ctr-tier-badge ctr-tier-${c.tier}`}>{c.tier}</span></div>
                  <div className="ctr-cap">
                    <span className="v1-mono">{c.name}</span>
                    {c.breaking && <span className="dev-stat dev-stat-err" style={{marginLeft:8,fontSize:9.5}}>BREAKING</span>}
                  </div>
                  <div className="v1-mono v1-mute">{c.cell}</div>
                  <div className="v1-mono">{c.version}</div>
                  <div className="v1-mono v1-mute">{c.consumers.length}</div>
                  <div className="v1-mono v1-mute">{c.sla}</div>
                  <div><span className={`dev-stat dev-stat-${c.status==='Active'?'ok':c.status==='RC'?'warn':'mute'}`}>{c.status}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="dev-insp">
            <div className="dev-insp-head">
              <div className="v1-mono v1-mute" style={{fontSize:11}}>{picked.id}</div>
              <h2 className="v1-h2 v1-mono" style={{margin:'2px 0 8px',fontSize:16}}>{picked.name}</h2>
              <div className="dev-insp-meta">
                <span className={`ctr-tier-badge ctr-tier-${picked.tier}`}>{picked.tier}</span>
                <span className="dev-stat dev-stat-ok">{picked.version}</span>
                <span className="dev-sprint v1-mono">{picked.cell}</span>
              </div>
            </div>

            <div className="dev-insp-section">
              <div className="dev-insp-label">SIGNATURE</div>
              <pre className="ctr-sig">{`func ${picked.name.split('.').pop()}(
  ctx context.Context,
  req *${picked.name.split('.').pop()}Request,
) (*${picked.name.split('.').pop()}Response, error)`}</pre>
            </div>

            <div className="dev-insp-section">
              <div className="dev-insp-label">CONSUMERS · {picked.consumers.length}</div>
              {picked.consumers.length === 0
                ? <div className="v1-mute" style={{fontSize:12}}>No consumers yet.</div>
                : <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {picked.consumers.map(c => (
                      <div key={c} className="ctr-consumer">
                        <span style={{color:'var(--fg-faint)'}}>{I.arrow}</span>
                        <span className="v1-mono">{c}</span>
                      </div>
                    ))}
                  </div>}
            </div>

            <div className="dev-insp-section">
              <div className="dev-insp-label">CHANGELOG</div>
              <div className="ctr-log">
                <div><span className="v1-mono">{picked.version}</span><span className="v1-mute">today</span></div>
                <div><span className="v1-mono">v{(parseFloat(picked.version.replace(/[^\d.]/g,''))-0.1).toFixed(1)}.0</span><span className="v1-mute">3d ago</span></div>
                <div><span className="v1-mono">v1.0.0</span><span className="v1-mute">last sprint</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  window.DevExtras = { DecomposeModal, DAGView, ContractsPage };
})();
