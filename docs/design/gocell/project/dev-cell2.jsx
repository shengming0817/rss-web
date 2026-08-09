/* global React */
// Phase 2 of cell-centric design:
//   1. Product / Epic / Feature attribution with progressive disclosure
//   2. Rich Slice tab (slice = real unit, with its own contracts/tasks/owner/sloc)
//   3. Configure drawer — every cell-editable thing in a right-side panel
//   4. AI Bottom Bar — Cloud Shell / VS Code terminal pattern, 3 states.
//      Old AIStudio page repurposed as the cross-cell session/task hub.

(() => {
  const { useState, useEffect, useRef } = React;

  // ============================================================
  // Product hierarchy — what business context does this cell serve?
  // Same data referenced by Backlog (features) and Cell.Overview.
  // ============================================================
  const PRODUCT_TREE = {
    'gocell-identity': {
      id: 'gocell-identity', name: 'GoCell Identity Suite',
      tagline: 'Federated identity for B2B platforms',
      owner: '@vp-platform', stage: 'GA',
      epics: {
        'epic-sso': {
          id: 'epic-sso', name: 'Federated SSO',
          desc: 'Bring enterprise IdPs (Entra, Okta, custom OIDC/SAML) under one verified subject model.',
          features: { 'F-1': { id: 'F-1', name: 'SSO providers', stage: 'in-build', cells: ['accesscore'] } },
        },
      },
    },
    'gocell-platform': {
      id: 'gocell-platform', name: 'GoCell Platform Foundations',
      tagline: 'Audit, config, observability — the substrate every cell depends on',
      owner: '@vp-platform', stage: 'GA',
      epics: {
        'epic-audit': {
          id: 'epic-audit', name: 'Tamper-evident audit',
          desc: 'Hash-chained event log every cell appends to, with Merkle proofs surfaced to tenants.',
          features: { 'F-2': { id: 'F-2', name: 'Audit chain v2', stage: 'GA', cells: ['auditcore'] } },
        },
        'epic-publish': {
          id: 'epic-publish', name: 'Versioned config publishing',
          desc: 'Stage → diff → publish → rollback flow for every config key and feature flag.',
          features: { 'F-3': { id: 'F-3', name: 'Versioned publishing', stage: 'in-build', cells: ['configcore'] } },
        },
        'epic-observe': {
          id: 'epic-observe', name: 'Trace + metric pipeline',
          desc: 'OTLP-native span ingestion and per-cell metric aggregation.',
          features: { 'F-4': { id: 'F-4', name: 'Trace exporter', stage: 'preview', cells: ['observecore'] } },
        },
      },
    },
  };

  // Reverse map: cellId → product/epic/feature path
  const CELL_PRODUCT = {
    accesscore:  { product: 'gocell-identity', epic: 'epic-sso',     feature: 'F-1' },
    auditcore:   { product: 'gocell-platform', epic: 'epic-audit',   feature: 'F-2' },
    configcore:  { product: 'gocell-platform', epic: 'epic-publish', feature: 'F-3' },
    observecore: { product: 'gocell-platform', epic: 'epic-observe', feature: 'F-4' },
  };

  // ============================================================
  // Rich slice data — slice IS the real unit. Each owns specific
  // contracts, tasks, code, and has its own status.
  // ============================================================
  const SLICES = {
    accesscore: [
      { name: 'sso.oidc', kind: 'transport+contract', owner: '@li.wei',
        sloc: 820, files: 6, status: 'doing', tests: '94%',
        produces: ['auth.verify', 'session.refresh'], consumes: ['audit.append', 'config.read'],
        tasks: ['T-101', 'T-102'],
        desc: 'OIDC discovery → token verify → session mint, end to end.' },
      { name: 'sso.saml', kind: 'transport+contract', owner: '@kim',
        sloc: 510, files: 4, status: 'todo', tests: '—',
        produces: ['auth.verify'], consumes: ['audit.append'], tasks: ['T-103'],
        desc: 'SAML 2.0 fallback for legacy IdPs.' },
      { name: 'rbac', kind: 'contract', owner: '@li.wei',
        sloc: 640, files: 5, status: 'stable', tests: '98%',
        produces: ['rbac.check'], consumes: ['audit.append', 'config.read'], tasks: [],
        desc: 'Group → role → permission resolver with cached evaluation.' },
      { name: 'session', kind: 'storage+contract', owner: '@kim',
        sloc: 480, files: 4, status: 'stable', tests: '96%',
        produces: ['session.refresh'], consumes: ['flag.evaluate'], tasks: [],
        desc: 'Session lifecycle, idle timeout, refresh-token rotation.' },
      { name: 'mfa', kind: 'contract', owner: '@kim',
        sloc: 320, files: 3, status: 'stable', tests: '92%',
        produces: [], consumes: ['audit.append'], tasks: [],
        desc: 'TOTP + WebAuthn step-up.' },
      { name: 'token', kind: 'crypto', owner: '@li.wei',
        sloc: 410, files: 3, status: 'stable', tests: '99%',
        produces: [], consumes: [], tasks: [],
        desc: 'JWT/JWS signing keys, JWKS publication, rotation.' },
      { name: 'directory.sync', kind: 'job', owner: '@kim',
        sloc: 580, files: 5, status: 'stable', tests: '88%',
        produces: [], consumes: ['audit.append', 'config.read'], tasks: [],
        desc: 'SCIM 2.0 inbound provisioning.' },
      { name: 'audit.bridge', kind: 'adapter', owner: '@li.wei',
        sloc: 120, files: 2, status: 'stable', tests: '100%',
        produces: [], consumes: ['audit.append'], tasks: [],
        desc: 'Local hooks → audit.append. One per write path.' },
    ],
    auditcore: [
      { name: 'append', kind: 'transport+contract', owner: '@chen',
        sloc: 540, files: 5, status: 'stable', tests: '98%',
        produces: ['audit.append'], consumes: [], tasks: ['T-090'],
        desc: 'Receive event, validate, hash, persist.' },
      { name: 'chain', kind: 'crypto', owner: '@chen',
        sloc: 620, files: 5, status: 'stable', tests: '99%',
        produces: [], consumes: [], tasks: ['T-090'],
        desc: 'Hash-chain construction + verification.' },
      { name: 'merkle.proof', kind: 'contract', owner: '@chen',
        sloc: 680, files: 5, status: 'review', tests: '95%',
        produces: ['audit.proof'], consumes: [], tasks: ['T-110'],
        desc: 'Inclusion proofs for tenant-side verifier.' },
      { name: 'query', kind: 'contract', owner: '@chen',
        sloc: 310, files: 3, status: 'doing', tests: '70%',
        produces: ['audit.query'], consumes: [], tasks: ['T-115'],
        desc: 'Filtered + paginated reads.' },
    ],
    configcore: [
      { name: 'kv', kind: 'storage', owner: '@park',
        sloc: 460, files: 4, status: 'stable', tests: '97%',
        produces: ['config.read', 'config.write'], consumes: [], tasks: [],
        desc: 'Versioned key-value store.' },
      { name: 'stage', kind: 'storage', owner: '@park',
        sloc: 590, files: 4, status: 'doing', tests: '78%',
        produces: [], consumes: ['audit.append'], tasks: ['T-201'],
        desc: 'Pending-changes table, TTL, two-person review.' },
      { name: 'publish', kind: 'job', owner: '@park',
        sloc: 480, files: 3, status: 'doing', tests: '72%',
        produces: [], consumes: ['audit.append'], tasks: ['T-201'],
        desc: 'Atomic stage→active flip with rollback receipt.' },
      { name: 'rollback', kind: 'job', owner: '@park',
        sloc: 230, files: 2, status: 'todo', tests: '—',
        produces: [], consumes: ['audit.append'], tasks: ['T-201'],
        desc: 'Snapshot revert, single command.' },
      { name: 'flags', kind: 'contract', owner: '@park',
        sloc: 720, files: 6, status: 'stable', tests: '94%',
        produces: ['flag.evaluate'], consumes: [], tasks: ['T-202'],
        desc: 'Targeted rollout, percentage + segment rules.' },
      { name: 'audit.bridge', kind: 'adapter', owner: '@park',
        sloc: 100, files: 1, status: 'stable', tests: '100%',
        produces: [], consumes: ['audit.append'], tasks: [],
        desc: 'Hooks every write path into audit.append.' },
    ],
    observecore: [
      { name: 'otlp', kind: 'transport', owner: '@nakamura',
        sloc: 380, files: 4, status: 'todo', tests: '20%',
        produces: ['trace.span'], consumes: [], tasks: ['T-301'],
        desc: 'OTLP gRPC + HTTP receiver.' },
      { name: 'metric', kind: 'storage+contract', owner: '@nakamura',
        sloc: 320, files: 3, status: 'preview', tests: '40%',
        produces: ['metric.emit'], consumes: [], tasks: [],
        desc: 'Prometheus-compatible metric registry.' },
      { name: 'anomaly', kind: 'job', owner: '@nakamura',
        sloc: 220, files: 1, status: 'todo', tests: '—',
        produces: [], consumes: ['audit.append'], tasks: [],
        desc: 'Stream anomalies to audit.append.' },
    ],
  };

  // ============================================================
  // ProductChain — progressive disclosure for product / epic / feature
  // ============================================================
  const ProductChain = ({ cellId }) => {
    const map = CELL_PRODUCT[cellId];
    const [open, setOpen] = useState('cell');
    if (!map) return null;
    const product = PRODUCT_TREE[map.product];
    const epic = product?.epics[map.epic];
    const feat = epic?.features[map.feature];
    const levels = [
      { k: 'product', icon: '◧', label: product.name, sub: product.tagline,
        body: <>
          <div className="devp-meta"><span>Stage</span><b>{product.stage}</b></div>
          <div className="devp-meta"><span>Owner</span><b className="v1-mono">{product.owner}</b></div>
          <div className="devp-meta"><span>Journeys</span><b>{Object.keys(product.epics).length}</b></div>
        </> },
      { k: 'journey', icon: '◇', label: epic.name, sub: epic.desc,
        body: <>
          <div className="devp-meta"><span>Cells in journey</span><b>{Object.values(epic.features).flatMap(f => f.cells).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</b></div>
          <div className="devp-meta"><span>End-to-end verify</span><b>—</b></div>
        </> },
      { k: 'cell', icon: '⬡', label: <>{cellId}<span className="devp-feat-tag v1-mono" title="Engineering-side Feature ID">≡ {feat.id}</span></>, sub: `Cell ≡ Feature (1:1). 工程侧仍可用 Feature ID 检索。`,
        body: <>
          <div className="devp-meta"><span>Stage</span><b>{feat.stage}</b></div>
          <div className="devp-meta"><span>Feature alias</span><b className="v1-mono">{feat.id} · {feat.name}</b></div>
        </> },
    ];
    return (
      <div className="devp-chain">
        <div className="devp-chain-crumbs">
          {levels.map((lv, i) => (
            <React.Fragment key={lv.k}>
              <button className={`devp-crumb${open === lv.k ? ' devp-crumb-open' : ''}`}
                      onClick={() => setOpen(o => o === lv.k ? null : lv.k)}>
                <span className="devp-crumb-icon">{lv.icon}</span>
                <span className="devp-crumb-label">{lv.label}</span>
              </button>
              {i < levels.length - 1 && <span className="devp-crumb-sep">›</span>}
            </React.Fragment>
          ))}
        </div>
        {open && (() => {
          const lv = levels.find(x => x.k === open);
          return (
            <div className="devp-chain-detail">
              <div className="devp-chain-d-h">
                <span className="devp-crumb-icon">{lv.icon}</span>
                <span style={{ fontWeight: 500 }}>{lv.label}</span>
              </div>
              <div className="v1-mute" style={{ fontSize: 12.5, marginBottom: 10 }}>{lv.sub}</div>
              <div className="devp-chain-meta">{lv.body}</div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ============================================================
  // SlicesTab — replaces MembersTab. Each slice = card with its own
  // contracts (in/out), tasks, owner, code metrics, status, tests.
  // ============================================================
  const SLICE_DOD = {
    'sso.oidc': {
      allowedFiles: ['cells/accesscore/sso/oidc/**', 'cells/accesscore/sso/oidc_test.go', 'docs/sso/entra-mapping.md'],
      verifyUnit:     [{ name: 'TestOIDCEntraClaims',  pass: false }, { name: 'TestOIDCRefresh', pass: true }, { name: 'TestOIDCDiscovery', pass: true }],
      verifyContract: [{ name: 'auth.verify@v3', pass: true }, { name: 'audit.append.bridge', pass: true }],
    },
    'merkle.proof': {
      allowedFiles: ['cells/auditcore/merkle/**'],
      verifyUnit:     [{ name: 'TestMerkleInclusion', pass: true }, { name: 'TestProofDepthCap', pass: true }],
      verifyContract: [{ name: 'audit.proof@v1', pass: true }],
    },
    'stage': {
      allowedFiles: ['cells/configcore/stage/**', 'cells/configcore/_migrations/stage*.sql'],
      verifyUnit:     [{ name: 'TestStageTTL', pass: false }, { name: 'TestStagePublish', pass: true }],
      verifyContract: [{ name: 'audit.append.bridge', pass: true }],
    },
  };

  const SliceDoDDrawer = ({ slice, open, onClose }) => {
    if (!open || !slice) return null;
    const dod = SLICE_DOD[slice.name] || { allowedFiles: ['cells/**'], verifyUnit: [], verifyContract: [] };
    const totalV = dod.verifyUnit.length + dod.verifyContract.length;
    const passV  = [...dod.verifyUnit, ...dod.verifyContract].filter(v => v.pass).length;
    return (
      <div className="devcfg-veil" onClick={onClose}>
        <aside className="devcfg-drawer" onClick={e => e.stopPropagation()}>
          <div className="devcfg-h">
            <div>
              <div className="v1-h2" style={{ margin: 0 }}>Slice DoD</div>
              <div className="v1-mute v1-mono" style={{ fontSize: 12 }}>{slice.name}</div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devcfg-body">
            <div className="devsl-meta">
              <div><span>Verify pass</span><b className="v1-mono">{passV}/{totalV}</b></div>
              <div><span>Files locked</span><b className="v1-mono">{dod.allowedFiles.length}</b></div>
              <div><span>Status</span><b>{slice.status}</b></div>
              <div><span>Owner</span><b className="v1-mono">{slice.owner}</b></div>
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Allowed files (PR 文件锁)</div>
              {dod.allowedFiles.map(f => (
                <div key={f} className="v1-mono" style={{ fontSize: 11.5, padding: '3px 8px', background: 'var(--bg-sunken)', border: '1px solid var(--line-soft)', borderRadius: 4, marginBottom: 4 }}>{f}</div>
              ))}
              <div className="v1-mute" style={{ fontSize: 11, marginTop: 4 }}>越界 commit CI 直接红，沙盒写入也会被拒。</div>
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Verify · unit ({dod.verifyUnit.filter(v => v.pass).length}/{dod.verifyUnit.length})</div>
              {dod.verifyUnit.map(v => (
                <div key={v.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 12 }}>
                  <span className="v1-mono">{v.name}</span>
                  <span style={{ color: v.pass ? 'oklch(0.55 0.15 145)' : 'oklch(0.55 0.20 25)' }}>{v.pass ? '✓ pass' : '✕ fail'}</span>
                </div>
              ))}
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Verify · contract ({dod.verifyContract.filter(v => v.pass).length}/{dod.verifyContract.length})</div>
              {dod.verifyContract.map(v => (
                <div key={v.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 12 }}>
                  <span className="v1-mono">{v.name}</span>
                  <span style={{ color: v.pass ? 'oklch(0.55 0.15 145)' : 'oklch(0.55 0.20 25)' }}>{v.pass ? '✓ pass' : '✕ fail'}</span>
                </div>
              ))}
            </div>
            <div className="devcfg-warn">
              Slice 完成的判定 = allowedFiles 内 + 全部 verify 绿。AI 沙盒自循环模式以此为停机条件。
            </div>
          </div>
        </aside>
      </div>
    );
  };

  const SlicesTab = ({ c, nav }) => {
    const slices = SLICES[c.id] || [];
    const [dodSlice, setDodSlice] = useState(null);
    return (
      <div>
      <div className="devsl-grid">
        {slices.map(s => (
          <div key={s.name} className="devsl-card" data-status={s.status} onClick={() => setDodSlice(s)} style={{ cursor: 'pointer' }}>
            <div className="devsl-h">
              <div>
                <div className="devsl-name v1-mono">{s.name}</div>
                <div className="v1-mute" style={{ fontSize: 11.5 }}>{s.kind}</div>
              </div>
              <span className={`devc-status devc-status-${
                s.status === 'stable' ? 'stable'
                : s.status === 'review' || s.status === 'doing' ? 'preview'
                : s.status === 'todo' || s.status === 'preview' ? 'breaking' : 'preview'}`}>{s.status}</span>
            </div>
            <p className="devsl-desc">{s.desc}</p>
            <div className="devsl-meta">
              <div><span>Owner</span><b className="v1-mono">{s.owner}</b></div>
              <div><span>SLOC</span><b className="v1-mono">{s.sloc}</b></div>
              <div><span>Files</span><b className="v1-mono">{s.files}</b></div>
              <div><span>Tests</span><b className="v1-mono">{s.tests}</b></div>
            </div>
            <div className="devsl-section">
              <div className="devsl-label">PRODUCES</div>
              {s.produces.length === 0
                ? <span className="v1-mute" style={{ fontSize: 11.5 }}>—</span>
                : s.produces.map(p => <span key={p} className="v1-mono devsl-tag devsl-tag-out">{p}</span>)}
            </div>
            <div className="devsl-section">
              <div className="devsl-label">CONSUMES</div>
              {s.consumes.length === 0
                ? <span className="v1-mute" style={{ fontSize: 11.5 }}>—</span>
                : s.consumes.map(d => <span key={d} className="v1-mono devsl-tag devsl-tag-in">{d}</span>)}
            </div>
            {s.tasks.length > 0 && (
              <div className="devsl-section">
                <div className="devsl-label">TASKS</div>
                {s.tasks.map(t => <span key={t} className="v1-mono devsl-tag">{t}</span>)}
              </div>
            )}
            <div className="v1-mute" style={{ fontSize: 11, marginTop: 4 }}>Click for DoD →</div>
          </div>
        ))}
      </div>
      <SliceDoDDrawer slice={dodSlice} open={!!dodSlice} onClose={() => setDodSlice(null)}/>
      </div>
    );
  };

  // ============================================================
  // Configure drawer — every editable cell attribute lives here.
  // Right-side pop-out, sectioned form. Apply / Cancel.
  // ============================================================
  const ConfigureDrawer = ({ cell, open, onClose }) => {
    const [draft, setDraft] = useState(null);
    useEffect(() => {
      if (open && cell) setDraft(JSON.parse(JSON.stringify({
        owner: cell.owner, oncall: cell.oncall, team: cell.team,
        version: cell.version, replicas: cell.runtime.replicas,
        config: [...cell.config], flags: [...cell.flags],
      })));
    }, [open, cell?.id]);
    if (!open || !cell || !draft) return null;
    const upd = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    return (
      <div className="devcfg-veil" onClick={onClose}>
        <aside className="devcfg-drawer" onClick={e => e.stopPropagation()}>
          <div className="devcfg-h">
            <div>
              <div className="v1-h2" style={{ margin: 0 }}>Configure</div>
              <div className="v1-mute v1-mono" style={{ fontSize: 12 }}>{cell.id}</div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devcfg-body">
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Ownership</div>
              <div className="devcfg-row">
                <label>Owner</label>
                <input className="devcfg-in v1-mono" value={draft.owner}
                       onChange={e => upd('owner', e.target.value)}/>
              </div>
              <div className="devcfg-row">
                <label>On-call rota</label>
                <input className="devcfg-in v1-mono" value={draft.oncall}
                       onChange={e => upd('oncall', e.target.value)}/>
              </div>
              <div className="devcfg-row">
                <label>Team</label>
                <input className="devcfg-in" value={draft.team}
                       onChange={e => upd('team', e.target.value)}/>
              </div>
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Runtime</div>
              <div className="devcfg-row">
                <label>Pinned version</label>
                <input className="devcfg-in v1-mono" value={'v' + draft.version}
                       onChange={e => upd('version', e.target.value.replace(/^v/, ''))}/>
              </div>
              <div className="devcfg-row">
                <label>Replicas</label>
                <input type="number" className="devcfg-in v1-mono" value={draft.replicas}
                       onChange={e => upd('replicas', +e.target.value)}/>
              </div>
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Config keys ({draft.config.length})</div>
              {draft.config.map((kv, i) => (
                <div key={i} className="devcfg-row devcfg-row-double">
                  <input className="devcfg-in v1-mono" value={kv.k} readOnly/>
                  <input className="devcfg-in v1-mono" value={kv.v}
                         onChange={e => {
                           const next = [...draft.config];
                           next[i] = { ...next[i], v: e.target.value };
                           upd('config', next);
                         }}/>
                </div>
              ))}
            </div>
            <div className="devcfg-sec">
              <div className="devcfg-sec-h">Feature flags ({draft.flags.length})</div>
              {draft.flags.length === 0
                ? <div className="v1-mute" style={{ fontSize: 12.5 }}>No flags on this cell.</div>
                : draft.flags.map((kv, i) => (
                  <div key={i} className="devcfg-row devcfg-row-double">
                    <input className="devcfg-in v1-mono" value={kv.k} readOnly/>
                    <input className="devcfg-in v1-mono" value={kv.rollout}
                           onChange={e => {
                             const next = [...draft.flags];
                             next[i] = { ...next[i], rollout: e.target.value };
                             upd('flags', next);
                           }}/>
                  </div>
                ))}
            </div>
            <div className="devcfg-warn">
              Apply will create a staged change. Two-person review and audit entry are mandatory before
              the new state goes live.
            </div>
          </div>
          <div className="devcfg-foot">
            <button className="v1-btn" onClick={onClose}>Cancel</button>
            <button className="v1-btn v1-btn-primary" onClick={onClose}>Stage change</button>
          </div>
        </aside>
      </div>
    );
  };

  // ============================================================
  // AI Bottom Bar — Cloud Shell / VS Code terminal pattern.
  // Three states: minimized strip → docked panel → fullscreen.
  // Persists across pages. ⌘K toggles dock.
  // ============================================================
  const SAMPLE_AI = [
    { who: 'system', t: 'Connected to AccessCore · pinned task T-101 · feature F-1' },
    { who: 'you',    t: 'Why is OIDC handler failing on the Entra path?' },
    { who: 'ai',     t: 'Group claims mapper expects `groups` claim; Entra issues `roles`. See cells/accesscore/sso/oidc/claims.go:142. Suggest adding a configurable claim-name fallback.' },
  ];

  const AIBottomBar = ({ context }) => {
    const [state, setState] = useState(() => localStorage.getItem('gocell.ai.state') || 'min');
    const [draft, setDraft] = useState('');
    const [history, setHistory] = useState(SAMPLE_AI);
    // Self-loop verify state — mock progression
    const [loop, setLoop] = useState({ active: true, mode: 'autonomous', iter: 3, step: 'run',
      verify: { unit: { pass: 2, total: 3 }, contract: { pass: 2, total: 2 } } });
    const totalV = loop.verify.unit.total + loop.verify.contract.total;
    const passV  = loop.verify.unit.pass  + loop.verify.contract.pass;
    const halted = passV === totalV;
    const inputRef = useRef(null);

    useEffect(() => { localStorage.setItem('gocell.ai.state', state); }, [state]);
    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setState(s => s === 'min' ? 'dock' : 'min');
        }
        if (e.key === 'Escape' && state === 'full') { setState('dock'); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [state]);
    useEffect(() => {
      if (state !== 'min' && inputRef.current) inputRef.current.focus();
    }, [state]);
    // External entry-points (e.g. Sandbox detail "Start session") can open the shell
    const [pinCtx, setPinCtx] = useState(null);
    useEffect(() => {
      const onOpen = (e) => {
        setState('dock');
        if (e.detail && e.detail.context) setPinCtx(e.detail.context);
        if (e.detail && e.detail.seed) {
          setHistory(h => [...h, { who: 'system', t: e.detail.seed }]);
        }
      };
      window.addEventListener('gocell.ai.open', onOpen);
      return () => window.removeEventListener('gocell.ai.open', onOpen);
    }, []);
    const ctx = pinCtx || context;

    const send = () => {
      if (!draft.trim()) return;
      const q = draft.trim();
      setHistory(h => [...h, { who: 'you', t: q }, { who: 'ai', t: 'Working on it… (mock)' }]);
      setDraft('');
    };

    if (state === 'min') {
      return (
        <button className="devai-strip" onClick={() => setState('dock')}>
          <span className="devai-strip-icon">▲</span>
          <span className="devai-strip-label">AI Shell</span>
          <span className="devai-strip-ctx v1-mono">{ctx}</span>
          <span className="devai-strip-hint v1-mono">⌘K</span>
        </button>
      );
    }
    return (
      <div className={`devai-shell devai-shell-${state}`}>
        <div className="devai-shell-h">
          <div className="devai-shell-tabs">
            <button data-active>AI Shell</button>
            <button>Logs</button>
            <button>Trace</button>
            <button>Slice tests</button>
          </div>
          {window.DevCell3 && window.DevCell3.ShellSandboxBadge && <window.DevCell3.ShellSandboxBadge/>}
          <div className="devai-shell-meta v1-mono">{ctx}</div>
          <div className="devai-shell-actions">
            <button className="v1-ghost" title="Toggle full screen"
                    onClick={() => setState(s => s === 'full' ? 'dock' : 'full')}>
              {state === 'full' ? '↓' : '↑'}
            </button>
            <button className="v1-ghost" title="Minimize" onClick={() => setState('min')}>—</button>
          </div>
        </div>
        <div className="devai-shell-body">
          {history.map((m, i) => (
            <div key={i} className={`devai-msg devai-msg-${m.who}`}>
              <span className="devai-who">{m.who === 'system' ? 'sys' : m.who === 'you' ? '› you' : '◆ ai'}</span>
              <span>{m.t}</span>
            </div>
          ))}
        </div>
        {loop.active && loop.mode === 'autonomous' && (
          <div className={`devai-loop ${halted ? 'devai-loop-halt' : ''}`}>
            <span className="devai-loop-dot"/>
            <span className="devai-loop-label">self-loop · iter {loop.iter}</span>
            <span className="devai-loop-step v1-mono">{loop.step}</span>
            <span className="devai-loop-verify">
              <span className="v1-mute">verify</span>
              <span className={loop.verify.unit.pass === loop.verify.unit.total ? 'devai-loop-ok' : 'devai-loop-bad'}>
                unit {loop.verify.unit.pass}/{loop.verify.unit.total}
              </span>
              <span className={loop.verify.contract.pass === loop.verify.contract.total ? 'devai-loop-ok' : 'devai-loop-bad'}>
                contract {loop.verify.contract.pass}/{loop.verify.contract.total}
              </span>
            </span>
            <span className="devai-loop-halt-cond v1-mute">
              {halted ? '✓ all green — halted, ready for PR' : `halt @ ${totalV}/${totalV} green or budget`}
            </span>
            <button className="v1-link" onClick={() => setLoop(l => ({ ...l, active: false }))}>stop</button>
          </div>
        )}
        <div className="devai-shell-input">
          <span className="devai-prompt v1-mono">›</span>
          <input ref={inputRef} className="devai-in" value={draft}
                 placeholder="Ask AI about this cell…"
                 onChange={e => setDraft(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && send()}/>
          <button className="v1-btn v1-btn-primary" onClick={send}>Send</button>
        </div>
      </div>
    );
  };

  // Find which slice owns a given task within a cell
  const findSliceForTask = (cellId, taskId) => {
    const arr = SLICES[cellId] || [];
    return arr.find(s => (s.tasks || []).includes(taskId)) || null;
  };

  window.DevCell2 = { PRODUCT_TREE, CELL_PRODUCT, SLICES, SLICE_DOD, findSliceForTask, ProductChain, SlicesTab, ConfigureDrawer, AIBottomBar };
})();
