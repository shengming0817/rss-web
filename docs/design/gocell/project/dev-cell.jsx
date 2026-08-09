/* global React */
// Cell-centric design — Jamf "Computer" pattern adapted to gocell.
// Each Cell is the central object; all features hang off it as facets.
// Existing global routes stay (Backlog/Board/Pipelines/DAG/Deps/Contracts/AI),
// but every row in those routes can deep-link into a cell facet, and the
// Cell detail page can deep-link back out for full context.

(() => {
  const { useState, useMemo } = React;

  // ============================================================
  // Cell inventory — the single source of truth for the inspector
  // ============================================================
  const CELLS = [
    {
      id: 'accesscore', name: 'AccessCore',
      domain: 'Identity', tier: 'L3', kind: 'capability cell',
      durability: 'Durable',
      owner: '@li.wei', oncall: '@kim', team: 'Identity Platform',
      version: '2.4.1', status: 'healthy', health: 92,
      slices: ['sso.oidc', 'sso.saml', 'rbac', 'session', 'mfa', 'token', 'directory.sync', 'audit.bridge'],
      sloc: 4280, files: 32,
      runtime: { lastDeploy: '2d ago', deploys30d: 14, p95: '38ms', err: '0.04%', qps: 412, replicas: 6 },
      produces: [
        { id: 'auth.verify',     v: '1.4.0', tier: 'L3', status: 'stable',   feature: 'F-1' },
        { id: 'session.refresh', v: '1.4.0', tier: 'L3', status: 'stable',   feature: 'F-1' },
        { id: 'rbac.check',      v: '1.2.0', tier: 'L3', status: 'stable',   feature: 'F-1' },
      ],
      consumes: [
        { id: 'audit.append',  v: '2.0.1', cell: 'auditcore',  status: 'stable' },
        { id: 'config.read',   v: '1.0.0', cell: 'configcore', status: 'stable' },
        { id: 'flag.evaluate', v: '1.2.3', cell: 'configcore', status: 'stable' },
      ],
      imports: ['gc/cellrt', 'gc/slicebus', 'gc/contracts', 'gc/audit', 'gc/govern', 'ext/jose', 'ext/oauth2'],
      tasks: [
        { id: 'T-101', title: 'OIDC: Microsoft Entra integration', status: 'doing',  est: 5, feature: 'F-1' },
        { id: 'T-102', title: 'OIDC: Okta integration',           status: 'todo',   est: 3, feature: 'F-1' },
        { id: 'T-103', title: 'SAML 2.0 fallback',                status: 'todo',   est: 8, feature: 'F-1' },
      ],
      features: ['F-1'],
      config: [
        { k: 'token.ttl_min',         v: '60' },
        { k: 'session.idle_min',      v: '15' },
        { k: 'oidc.providers',        v: 'entra,okta' },
        { k: 'rbac.cache_ttl_s',      v: '30' },
      ],
      flags: [
        { k: 'access.entra_v2',  rollout: '15%' },
        { k: 'access.saml_off',  rollout: 'off' },
      ],
      groups: [
        { name: 'Identity domain',    kind: 'static' },
        { name: 'L3 capability',      kind: 'static' },
        { name: 'Cells with breaking changes in flight', kind: 'smart' },
        { name: 'High-traffic cells (qps > 300)', kind: 'smart' },
      ],
      activity: [
        { t: '2d ago',  who: '@li.wei', what: 'deploy', detail: 'v2.4.1 → 6 replicas, canary 100% in 14m' },
        { t: '3d ago',  who: '@kim',    what: 'review', detail: 'PR #4420 — JWKS verifier merged' },
        { t: '4d ago',  who: '@li.wei', what: 'contract', detail: 'auth.verify v1.3.5 → v1.4.0 (additive)' },
        { t: '5d ago',  who: '@li.wei', what: 'task',    detail: 'T-101 OIDC: Entra moved to doing' },
        { t: '8d ago',  who: '@kim',    what: 'incident', detail: 'INC-7714 cleared — token cache stampede on cold start' },
      ],
      ai: [
        { id: 'AI-882', task: 'T-101', status: 'review',   tokens: '14.2k' },
        { id: 'AI-871', task: 'T-090', status: 'merged',   tokens: '8.7k' },
      ],
    },
    {
      id: 'auditcore', name: 'AuditCore',
      domain: 'Platform', tier: 'L2', kind: 'capability cell',
      durability: 'Durable',
      owner: '@chen', oncall: '@chen', team: 'Platform Foundations',
      version: '3.1.0', status: 'healthy', health: 96,
      slices: ['append', 'chain', 'merkle.proof', 'query'],
      sloc: 2150, files: 18,
      runtime: { lastDeploy: '6h ago', deploys30d: 22, p95: '12ms', err: '0.01%', qps: 1840, replicas: 8 },
      produces: [
        { id: 'audit.append', v: '2.0.1', tier: 'L3', status: 'stable',  feature: 'F-2' },
        { id: 'audit.query',  v: '1.1.0', tier: 'L3', status: 'preview', feature: 'F-2' },
        { id: 'audit.proof',  v: '1.0.0', tier: 'L3', status: 'stable',  feature: 'F-2' },
      ],
      consumes: [],
      imports: ['gc/cellrt', 'gc/audit', 'ext/pgx'],
      tasks: [
        { id: 'T-090', title: 'Hash chain v2 schema',     status: 'done',   est: 3, feature: 'F-2' },
        { id: 'T-110', title: 'Merkle proof endpoint',    status: 'review', est: 5, feature: 'F-2' },
        { id: 'T-115', title: 'Audit query slice',        status: 'todo',   est: 4, feature: 'F-2' },
      ],
      features: ['F-2'],
      config: [
        { k: 'chain.algo',            v: 'sha256' },
        { k: 'retention.days',        v: '365' },
        { k: 'merkle.batch_size',     v: '1024' },
      ],
      flags: [{ k: 'audit.proof_v2', rollout: '100%' }],
      groups: [
        { name: 'Platform domain',  kind: 'static' },
        { name: 'L2 capability',    kind: 'static' },
        { name: 'High-traffic cells (qps > 300)', kind: 'smart' },
      ],
      activity: [
        { t: '6h ago', who: '@chen', what: 'deploy', detail: 'v3.1.0 — Merkle proof v1 GA' },
        { t: '1d ago', who: '@chen', what: 'review', detail: 'PR #4503 — verifier CLI merged' },
        { t: '3d ago', who: '@chen', what: 'contract', detail: 'audit.proof v1.0.0 published' },
      ],
      ai: [{ id: 'AI-877', task: 'T-110', status: 'merged', tokens: '11.2k' }],
    },
    {
      id: 'configcore', name: 'ConfigCore',
      domain: 'Platform', tier: 'L2', kind: 'capability cell',
      durability: 'Durable',
      owner: '@park', oncall: '@park', team: 'Platform Foundations',
      version: '1.8.2', status: 'breaking', health: 78,
      slices: ['kv', 'stage', 'publish', 'rollback', 'flags', 'audit.bridge'],
      sloc: 3840, files: 28,
      runtime: { lastDeploy: '14h ago', deploys30d: 9, p95: '4ms', err: '0.02%', qps: 2400, replicas: 4 },
      produces: [
        { id: 'config.read',   v: '1.0.0', tier: 'L3', status: 'stable',   feature: 'F-3' },
        { id: 'config.write',  v: '1.0.0', tier: 'L3', status: 'stable',   feature: 'F-3' },
        { id: 'flag.evaluate', v: '1.2.3', tier: 'L3', status: 'stable',   feature: 'F-3' },
        { id: 'config.diff',   v: '0.9.0', tier: 'L3', status: 'preview',  feature: 'F-3' },
      ],
      consumes: [
        { id: 'audit.append', v: '2.0.1', cell: 'auditcore', status: 'stable' },
      ],
      imports: ['gc/cellrt', 'gc/slicebus', 'gc/audit', 'ext/yaml', 'ext/pgx'],
      tasks: [
        { id: 'T-201', title: 'Stage / publish flow', status: 'doing', est: 5, feature: 'F-3' },
        { id: 'T-202', title: 'Flag rollout calc',    status: 'done',  est: 3, feature: 'F-3' },
      ],
      features: ['F-3'],
      config: [
        { k: 'stage.ttl_h',     v: '72' },
        { k: 'publish.gate',    v: 'two-person' },
        { k: 'flag.cache_s',    v: '5' },
      ],
      flags: [{ k: 'config.diff_v2', rollout: '20%' }],
      groups: [
        { name: 'Platform domain', kind: 'static' },
        { name: 'L2 capability',   kind: 'static' },
        { name: 'Cells with breaking changes in flight', kind: 'smart' },
      ],
      activity: [
        { t: '14h ago', who: '@park', what: 'deploy', detail: 'v1.8.2 — staged publish writepath' },
        { t: '2d ago',  who: '@park', what: 'contract', detail: 'config.diff v0.9.0 (preview)' },
        { t: '3d ago',  who: '@park', what: 'incident', detail: 'INC-7702 — stale flag cache after publish' },
      ],
      ai: [{ id: 'AI-869', task: 'T-201', status: 'doing', tokens: '6.3k' }],
    },
    {
      id: 'observecore', name: 'ObserveCore',
      domain: 'Platform', tier: 'L2', kind: 'capability cell',
      durability: 'Demo',
      owner: '@nakamura', oncall: '@nakamura', team: 'Platform Foundations',
      version: '0.7.0-rc.2', status: 'preview', health: 64,
      slices: ['otlp', 'metric', 'anomaly'],
      sloc: 920, files: 8,
      runtime: { lastDeploy: '2h ago', deploys30d: 6, p95: '—', err: '—', qps: 0, replicas: 2 },
      produces: [
        { id: 'metric.emit', v: '0.9.0', tier: 'L3', status: 'breaking', feature: 'F-4' },
        { id: 'trace.span',  v: '1.0.0', tier: 'L3', status: 'preview',  feature: 'F-4' },
      ],
      consumes: [
        { id: 'audit.append', v: '2.0.1', cell: 'auditcore', status: 'stable' },
      ],
      imports: ['gc/cellrt', 'gc/observe', 'ext/otel'],
      tasks: [
        { id: 'T-301', title: 'OTLP exporter slice', status: 'todo', est: 5, feature: 'F-4' },
      ],
      features: ['F-4'],
      config: [{ k: 'otlp.endpoint', v: 'tempo:4317' }],
      flags: [],
      groups: [
        { name: 'Platform domain', kind: 'static' },
        { name: 'Reserved capacity', kind: 'static' },
        { name: 'Cells with breaking changes in flight', kind: 'smart' },
      ],
      activity: [
        { t: '2h ago', who: '@nakamura', what: 'deploy', detail: 'v0.7.0-rc.2 — preview' },
        { t: '1d ago', who: '@nakamura', what: 'contract', detail: 'metric.emit v0.9.0 marked breaking' },
      ],
      ai: [],
    },
  ];

  const STATUS_META = {
    healthy:  { dot: 'oklch(0.65 0.15 150)', label: 'healthy' },
    degraded: { dot: 'oklch(0.70 0.15 70)',  label: 'degraded' },
    breaking: { dot: 'oklch(0.65 0.20 25)',  label: 'breaking changes in flight' },
    preview:  { dot: 'oklch(0.70 0.10 250)', label: 'preview' },
  };
  const TIER_BG = {
    L1: 'oklch(0.94 0.04 270)',
    L2: 'oklch(0.94 0.04 200)',
    L3: 'oklch(0.94 0.04 70)',
    L4: 'oklch(0.94 0.04 30)',
  };

  // ============================================================
  // Cells list — Jamf "Computers" search list
  // ============================================================
  const CellsListPage = ({ onOpen }) => {
    const [q, setQ] = useState('');
    const [domain, setDomain] = useState('all');
    const filtered = CELLS.filter(c =>
      (domain === 'all' || c.domain === domain) &&
      (!q || c.id.includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()))
    );
    const domains = ['all', ...new Set(CELLS.map(c => c.domain))];
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Cells <span className="v1-h1-count v1-mono">{CELLS.length}</span></h1>
            <p className="v1-sub">
              The central object. Every contract, dependency, task, config, and audit entry hangs off a cell.
              <br/>Pick one to open its full inventory.
            </p>
          </div>
          <div className="v1-head-actions">
            <input className="devg-scope v1-mono" style={{ width: 200 }}
                   placeholder="search id or name…"
                   value={q} onChange={e => setQ(e.target.value)}/>
            <div className="v1-seg">
              {domains.map(d => (
                <button key={d} data-active={domain===d || undefined} onClick={() => setDomain(d)}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table className="devg-table devcell-list">
            <thead><tr>
              <th>Cell</th><th>Domain</th><th>Tier</th><th>Owner</th><th>Version</th>
              <th>Status</th>
              <th style={{textAlign:'right'}}>Health</th>
              <th style={{textAlign:'right'}}>Slices</th>
              <th style={{textAlign:'right'}}>SLOC</th>
              <th style={{textAlign:'right'}}>QPS</th>
              <th style={{textAlign:'right'}}>p95</th>
              <th style={{textAlign:'right'}}>Open tasks</th>
              <th style={{textAlign:'right'}}>Produces / Consumes</th>
              <th>Last deploy</th>
            </tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => onOpen(c.id)}>
                  <td>
                    <div className="v1-mono" style={{ fontWeight: 500 }}>{c.id}</div>
                    <div className="v1-mute" style={{ fontSize: 11 }}>{c.name}</div>
                  </td>
                  <td>{c.domain}</td>
                  <td><span className="devc-tier" style={{ background: TIER_BG[c.tier] }}>{c.tier}</span></td>
                  <td className="v1-mono" style={{ fontSize: 12 }}>{c.owner}</td>
                  <td className="v1-mono">v{c.version}</td>
                  <td>
                    <span className="devcell-dot" style={{ background: STATUS_META[c.status].dot }}/>
                    <span style={{ fontSize: 12, marginLeft: 6 }}>{STATUS_META[c.status].label}</span>
                  </td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.health}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.slices.length}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.sloc}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.runtime.qps}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.runtime.p95}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.tasks.filter(t => t.status !== 'done').length}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{c.produces.length} / {c.consumes.length}</td>
                  <td className="v1-mono" style={{ fontSize: 12 }}>{c.runtime.lastDeploy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // Cell detail — Jamf-style multi-tab inspector
  // ============================================================
  const TABS = [
    'Overview', 'Interfaces', 'Wiring', 'Inventory', 'Slices', 'Contracts', 'Dependencies',
    'Tasks', 'Configuration', 'Audit', 'Groups', 'AI',
  ];

  const Pill = ({ kind, children }) => <span className={`devcell-pill devcell-pill-${kind}`}>{children}</span>;

  const OverviewTab = ({ c, nav }) => {
    const ProductChain = window.DevCell2 && window.DevCell2.ProductChain;
    const GitChip = window.DevCell3 && window.DevCell3.GitChip;
    return (
    <>
    {ProductChain && <ProductChain cellId={c.id}/>}
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-2">
        <div className="devcell-card-h">Identity</div>
        <div className="devcell-kv">
          <div><span>ID</span><b className="v1-mono">{c.id}</b></div>
          <div><span>Name</span><b>{c.name}</b></div>
          <div><span>Domain</span><b>{c.domain}</b></div>
          <div><span>Tier</span><b>{c.tier}</b></div>
          <div><span>Owner</span><b className="v1-mono">{c.owner}</b></div>
          <div><span>On-call</span><b className="v1-mono">{c.oncall}</b></div>
          <div><span>Team</span><b>{c.team}</b></div>
          <div><span>Version</span><b className="v1-mono">v{c.version}</b></div>
        </div>
        {GitChip && <GitChip cellId={c.id}/>}
      </div>
      <div className="devcell-card">
        <div className="devcell-card-h">Health</div>
        <div className="devcell-health">
          <div className="devcell-health-num">{c.health}</div>
          <div className="devcell-health-label">/ 100 · {STATUS_META[c.status].label}</div>
        </div>
        <div className="devcell-bar"><div style={{ width: c.health + '%', background: STATUS_META[c.status].dot }}/></div>
        <div className="v1-mute" style={{ fontSize: 11.5, marginTop: 10 }}>
          Composite of contract conformance, audit pass rate, SLO, and lint.
        </div>
      </div>
      <div className="devcell-card">
        <div className="devcell-card-h">Runtime</div>
        <div className="devcell-kv">
          <div><span>QPS</span><b className="v1-mono">{c.runtime.qps}</b></div>
          <div><span>p95</span><b className="v1-mono">{c.runtime.p95}</b></div>
          <div><span>Error</span><b className="v1-mono">{c.runtime.err}</b></div>
          <div><span>Replicas</span><b className="v1-mono">{c.runtime.replicas}</b></div>
          <div><span>Deploys 30d</span><b className="v1-mono">{c.runtime.deploys30d}</b></div>
          <div><span>Last deploy</span><b className="v1-mono">{c.runtime.lastDeploy}</b></div>
        </div>
      </div>
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">Recent activity</div>
        <ol className="devcell-timeline">
          {c.activity.map((a, i) => (
            <li key={i}>
              <span className={`devcell-act devcell-act-${a.what}`}>{a.what}</span>
              <span className="v1-mono" style={{ fontSize: 11.5 }}>{a.t}</span>
              <span className="v1-mute v1-mono" style={{ fontSize: 11.5 }}>{a.who}</span>
              <span style={{ flex: 1 }}>{a.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
    </>
    );
  };

  const InventoryTab = ({ c }) => {
    const rows = [
      ['Identity', [
        ['Cell ID', c.id], ['Name', c.name], ['Kind', c.kind],
        ['Domain', c.domain], ['Tier', c.tier],
      ]],
      ['Ownership', [
        ['Owner', c.owner], ['On-call rota', c.oncall], ['Team', c.team],
      ]],
      ['Version', [
        ['Current', `v${c.version}`], ['Last deploy', c.runtime.lastDeploy],
        ['Deploys (30d)', c.runtime.deploys30d],
      ]],
      ['Code metrics', [
        ['Slices', c.slices.length], ['SLOC', c.sloc], ['Files', c.files],
        ['Imports', c.imports.length],
      ]],
      ['Capability footprint', [
        ['Contracts produced', c.produces.length], ['Contracts consumed', c.consumes.length],
        ['Open tasks', c.tasks.filter(t => t.status !== 'done').length],
        ['Features in flight', c.features.length],
      ]],
      ['Runtime', [
        ['Replicas', c.runtime.replicas], ['QPS', c.runtime.qps],
        ['p95 latency', c.runtime.p95], ['Error rate', c.runtime.err],
      ]],
      ['Configuration', [
        ['Config keys', c.config.length], ['Feature flags', c.flags.length],
      ]],
    ];
    return (
      <div className="devcell-inv">
        {rows.map(([sec, kvs]) => (
          <div key={sec} className="devcell-inv-section">
            <div className="devcell-inv-head">{sec}</div>
            <table>
              <tbody>
                {kvs.map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="v1-mono">{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  const ContractsTab = ({ c, nav }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">
          Produces <span className="v1-mono v1-mute" style={{ marginLeft: 8 }}>{c.produces.length}</span>
          <button className="v1-link" onClick={() => nav('contracts')} style={{ marginLeft: 'auto' }}>Open in Contract registry →</button>
        </div>
        <table className="devg-table devcell-tbl">
          <thead><tr><th>Capability</th><th>Version</th><th>Tier</th><th>Status</th><th>Shipped by feature</th></tr></thead>
          <tbody>
            {c.produces.map(p => (
              <tr key={p.id}>
                <td className="v1-mono">{p.id}</td>
                <td className="v1-mono">v{p.v}</td>
                <td><span className="devc-tier" style={{ background: TIER_BG[p.tier] }}>{p.tier}</span></td>
                <td><span className={`devc-status devc-status-${p.status}`}>{p.status}</span></td>
                <td><span className="v1-chip">{p.feature}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">
          Consumes <span className="v1-mono v1-mute" style={{ marginLeft: 8 }}>{c.consumes.length}</span>
        </div>
        {c.consumes.length === 0
          ? <div className="v1-mute" style={{ fontSize: 12.5, padding: '6px 0' }}>This cell consumes no capabilities — it sits at the bottom of the dep graph.</div>
          : (
            <table className="devg-table devcell-tbl">
              <thead><tr><th>Capability</th><th>From cell</th><th>Pinned version</th><th>Status</th></tr></thead>
              <tbody>
                {c.consumes.map(d => (
                  <tr key={d.id} onClick={() => nav('cell:' + d.cell)} style={{ cursor: 'pointer' }}>
                    <td className="v1-mono">{d.id}</td>
                    <td className="v1-mono"><span className="v1-link">{d.cell}</span></td>
                    <td className="v1-mono">v{d.v}</td>
                    <td><span className={`devc-status devc-status-${d.status}`}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );

  const DependenciesTab = ({ c, nav }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">
          Direct package imports <span className="v1-mono v1-mute" style={{ marginLeft: 8 }}>{c.imports.length}</span>
          <button className="v1-link" onClick={() => nav('deps')} style={{ marginLeft: 'auto' }}>Open in dep explorer →</button>
        </div>
        <ul className="devcell-imports">
          {c.imports.map(i => (
            <li key={i}>
              <span className={`devg-kind devg-kind-${i.startsWith('gc/') ? 'gc' : i.startsWith('c/') ? 'cell' : 'ext'}`}>
                {i.startsWith('gc/') ? 'gc' : i.startsWith('c/') ? 'cell' : 'ext'}
              </span>
              <span className="v1-mono">{i}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">Cell-level dependencies</div>
        <div className="v1-mute" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Cells this one depends on (via consumed contracts).
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[...new Set(c.consumes.map(x => x.cell))].map(other => (
            <button key={other} className="v1-chip" onClick={() => nav('cell:' + other)}>
              <span className="v1-mono">{other}</span>
            </button>
          ))}
          {c.consumes.length === 0 && <span className="v1-mute" style={{ fontSize: 12.5 }}>None.</span>}
        </div>
      </div>
    </div>
  );

  const TasksTab = ({ c, nav }) => {
    const D3 = window.DevCell3 || {};
    const { PRChip, BranchChip, DeployModal } = D3;
    const [deployTarget, setDeployTarget] = useState(null);
    return (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">
          Tasks ({c.tasks.length})
          <span className="v1-mute" style={{ fontSize: 11.5, marginLeft: 10 }}>
            click a task to deploy an isolated AI sandbox
          </span>
          <button className="v1-link" onClick={() => nav('workflow')} style={{ marginLeft: 'auto' }}>Open in Pipelines →</button>
        </div>
        <table className="devg-table devcell-tbl">
          <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Branch / PR</th><th style={{textAlign:'right'}}>Estimate</th><th>Feature</th><th></th></tr></thead>
          <tbody>
            {c.tasks.map(t => (
              <tr key={t.id} className="devsbx-row-clickable" onClick={() => setDeployTarget(t)}>
                <td className="v1-mono">{t.id}</td>
                <td>{t.title}</td>
                <td>
                  <span className={`devc-status devc-status-${t.status === 'done' ? 'stable' : t.status === 'doing' ? 'preview' : 'breaking'}`}
                        style={{ textTransform: 'lowercase' }}>{t.status}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {BranchChip && <BranchChip taskId={t.id}/>}
                    {PRChip && <PRChip taskId={t.id}/>}
                  </div>
                </td>
                <td style={{textAlign:'right'}} className="v1-mono">{t.est}pt</td>
                <td><span className="v1-chip">{t.feature}</span></td>
                <td><button className="devsbx-deploy-btn" onClick={e => { e.stopPropagation(); setDeployTarget(t); }}>Deploy sandbox</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {DeployModal && <DeployModal task={deployTarget} cellId={c.id}
        open={!!deployTarget} onClose={() => setDeployTarget(null)}
        onDeploy={(opts) => { console.log('Deploy sandbox', opts); }}/>}
    </div>
    );
  };

  const ConfigurationTab = ({ c }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-2">
        <div className="devcell-card-h">Config keys ({c.config.length})</div>
        <table className="devg-table devcell-tbl">
          <thead><tr><th>Key</th><th>Value</th></tr></thead>
          <tbody>
            {c.config.map(({ k, v }) => (
              <tr key={k}><td className="v1-mono">{k}</td><td className="v1-mono">{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="devcell-card">
        <div className="devcell-card-h">Feature flags ({c.flags.length})</div>
        {c.flags.length === 0
          ? <div className="v1-mute" style={{ fontSize: 12.5 }}>No flags.</div>
          : (
            <table className="devg-table devcell-tbl">
              <thead><tr><th>Flag</th><th style={{textAlign:'right'}}>Rollout</th></tr></thead>
              <tbody>
                {c.flags.map(({ k, rollout }) => (
                  <tr key={k}><td className="v1-mono">{k}</td><td style={{textAlign:'right'}} className="v1-mono">{rollout}</td></tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );

  const AuditTab = ({ c }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">Activity timeline</div>
        <ol className="devcell-timeline">
          {c.activity.map((a, i) => (
            <li key={i}>
              <span className={`devcell-act devcell-act-${a.what}`}>{a.what}</span>
              <span className="v1-mono" style={{ fontSize: 11.5 }}>{a.t}</span>
              <span className="v1-mute v1-mono" style={{ fontSize: 11.5 }}>{a.who}</span>
              <span style={{ flex: 1 }}>{a.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  const MembersTab = ({ c }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">Slices ({c.slices.length})</div>
        <div className="v1-mute" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Vertical slices that compose this cell. Each slice owns a single capability path end-to-end.
        </div>
        <div className="devcell-slices">
          {c.slices.map(s => (
            <div key={s} className="devcell-slice">
              <div className="v1-mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{s}</div>
              <div className="v1-mute" style={{ fontSize: 11 }}>slice</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const GroupsTab = ({ c }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">Group memberships</div>
        <div className="v1-mute" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Static groups are taxonomy. Smart groups are saved queries. (Smart Groups feature reserved — placeholder data.)
        </div>
        <table className="devg-table devcell-tbl">
          <thead><tr><th>Group</th><th>Kind</th></tr></thead>
          <tbody>
            {c.groups.map(g => (
              <tr key={g.name}>
                <td>{g.name}</td>
                <td><Pill kind={g.kind}>{g.kind}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const AITab = ({ c, nav }) => (
    <div className="devcell-grid">
      <div className="devcell-card devcell-span-3">
        <div className="devcell-card-h">
          AI sessions ({c.ai.length})
          <button className="v1-link" onClick={() => nav('ai')} style={{ marginLeft: 'auto' }}>Open in AI Studio →</button>
        </div>
        {c.ai.length === 0
          ? <div className="v1-mute" style={{ fontSize: 12.5 }}>No AI sessions on this cell.</div>
          : (
            <table className="devg-table devcell-tbl">
              <thead><tr><th>Session</th><th>Task</th><th>Status</th><th style={{textAlign:'right'}}>Tokens</th></tr></thead>
              <tbody>
                {c.ai.map(s => (
                  <tr key={s.id}>
                    <td className="v1-mono">{s.id}</td>
                    <td className="v1-mono">{s.task}</td>
                    <td><span className={`devc-status devc-status-${s.status === 'merged' ? 'stable' : s.status === 'review' ? 'preview' : 'breaking'}`}>{s.status}</span></td>
                    <td style={{textAlign:'right'}} className="v1-mono">{s.tokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );

  // ============================================================
  // Interfaces — kernel/cell ISP split (CellIdentity / CellLifecycle /
  // CellStatus / CellInventory). New in develop@edafbb0b (ADR 202605101800).
  // ============================================================
  const InterfacesTab = ({ c }) => {
    const ISP = [
      { name: 'CellIdentity', why: 'Stable handle for logs, audit, RBAC, dep-graph.', methods: [
        ['ID()',          'string',         c.id],
        ['Type()',        'CellType',       c.kind === 'capability cell' ? 'core' : 'edge'],
        ['Metadata()',    'CellMetadata',   c.team + ' · ' + c.owner],
      ]},
      { name: 'CellLifecycle', why: 'What the runtime calls on Init/Start/Stop. Narrow surface for bootstrap.', methods: [
        ['Init(ctx,deps)',  'error',         'wired via cell_gen.go'],
        ['Start(ctx)',      'error',         'after BaseCell.Init'],
        ['Stop(ctx)',       'error',         'reverse-order shutdown'],
      ]},
      { name: 'CellStatus', why: 'For metrics middleware + health handler — does not need lifecycle.', methods: [
        ['Health()',  'HealthStatus',  c.status],
        ['Ready()',   'bool',          c.health >= 80 ? 'true' : 'false'],
        ['ConsistencyLevel()', 'Level', c.tier],
      ]},
      { name: 'CellInventory', why: 'For governance + composition graph — slices and contracts only.', methods: [
        ['OwnedSlices()',      '[]Slice',    c.slices.length + ' slices'],
        ['ProducedContracts()','[]Contract', c.produces.length + ' produced'],
        ['ConsumedContracts()','[]Contract', c.consumes.length + ' consumed'],
      ]},
    ];
    return (
      <>
        <div className="devc-isp-banner">
          <div className="devc-isp-banner-tag">develop @ edafbb0b</div>
          <div>
            <b>Cell is now a composite of 4 sub-interfaces.</b>
            <span className="v1-mute"> Callers can declare narrower deps (e.g. metrics middleware → <span className="v1-mono">CellStatus</span>).
              See ADR 202605101800 §D1/D2.</span>
          </div>
        </div>
        <div className="devc-isp-grid">
          {ISP.map(iface => (
            <div key={iface.name} className="devcell-card devc-isp-card">
              <div className="devc-isp-card-h">
                <span className="v1-mono devc-isp-name">{iface.name}</span>
                <span className="devc-isp-narrow">narrow dep ok</span>
              </div>
              <div className="v1-mute" style={{ fontSize: 12, marginBottom: 10 }}>{iface.why}</div>
              <table className="devc-isp-tbl">
                <tbody>
                  {iface.methods.map(([m, ret, sample]) => (
                    <tr key={m}>
                      <td className="v1-mono">{m}</td>
                      <td className="v1-mono v1-mute">{ret}</td>
                      <td className="v1-mono devc-isp-sample">{String(sample)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="devcell-card devc-isp-composite">
          <div className="devcell-card-h">Composite <span className="v1-mono v1-mute" style={{ marginLeft: 8 }}>kernel/cell.Cell</span></div>
          <pre className="devc-isp-code">{`type Cell interface {
    CellIdentity   // ID, Type, Metadata
    CellLifecycle  // Init, Start, Stop
    CellStatus     // Health, Ready, ConsistencyLevel
    CellInventory  // OwnedSlices, ProducedContracts, ConsumedContracts
}`}</pre>
          <div className="v1-mute" style={{ fontSize: 12 }}>
            io.ReadWriter pattern — the runtime needs all four; your dependent code should pick the
            narrowest sub-interface it actually uses. Archtest <span className="v1-mono">CELL-ISP-NARROWING-01</span> warns
            on dependents that declare the full <span className="v1-mono">Cell</span> for one-method use.
          </div>
        </div>
      </>
    );
  };

  // ============================================================
  // Wiring — sealed marker types (CellTxManager / CellPublisher /
  // CellWriter). New in develop@edafbb0b (PR #441, ADR 202605101900).
  // ============================================================
  const WiringTab = ({ c }) => {
    const needsTx = c.tier === 'L1' || c.tier === 'L2';
    const needsOutbox = c.tier === 'L2';
    return (
      <>
        <div className="devc-isp-banner devc-wire-banner">
          <div className="devc-isp-banner-tag">breaking · develop @ edafbb0b</div>
          <div>
            <b>Cell <span className="v1-mono">With*</span> options now require sealed markers.</b>
            <span className="v1-mute"> Composition roots must wrap raw infra via
              <span className="v1-mono"> persistence.WrapForCell(...)</span> /
              <span className="v1-mono"> outbox.WrapPublisherForCell(...)</span> /
              <span className="v1-mono"> outbox.WrapWriterForCell(...)</span>.
            </span>
          </div>
        </div>

        <div className="devc-wire-flow">
          <div className="devc-wire-col">
            <div className="devc-wire-col-h">1 · Raw infra</div>
            <div className="devc-wire-box devc-wire-box-raw">
              <span className="v1-mono">postgres.NewTxRunner(pool)</span>
              <span className="v1-mute v1-mono">persistence.TxRunner</span>
            </div>
            {needsOutbox && (
              <div className="devc-wire-box devc-wire-box-raw">
                <span className="v1-mono">rabbitmq.NewPublisher(...)</span>
                <span className="v1-mute v1-mono">outbox.Publisher</span>
              </div>
            )}
            {needsOutbox && (
              <div className="devc-wire-box devc-wire-box-raw">
                <span className="v1-mono">postgres.NewOutboxWriter()</span>
                <span className="v1-mute v1-mono">outbox.Writer</span>
              </div>
            )}
          </div>
          <div className="devc-wire-arrow">
            <svg width="32" height="80" viewBox="0 0 32 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 40 H 26 M 20 34 L 26 40 L 20 46"/>
            </svg>
            <div className="devc-wire-arrow-label v1-mono">WrapForCell</div>
          </div>
          <div className="devc-wire-col">
            <div className="devc-wire-col-h">2 · Sealed marker (cell boundary)</div>
            <div className="devc-wire-box devc-wire-box-sealed">
              <span className="v1-mono">persistence.CellTxManager</span>
              <span className="devc-wire-seal">sealed</span>
            </div>
            {needsOutbox && (
              <div className="devc-wire-box devc-wire-box-sealed">
                <span className="v1-mono">outbox.CellPublisher</span>
                <span className="devc-wire-seal">sealed</span>
              </div>
            )}
            {needsOutbox && (
              <div className="devc-wire-box devc-wire-box-sealed">
                <span className="v1-mono">outbox.CellWriter</span>
                <span className="devc-wire-seal">sealed</span>
              </div>
            )}
          </div>
          <div className="devc-wire-arrow">
            <svg width="32" height="80" viewBox="0 0 32 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 40 H 26 M 20 34 L 26 40 L 20 46"/>
            </svg>
          </div>
          <div className="devc-wire-col">
            <div className="devc-wire-col-h">3 · Cell consumes</div>
            <div className="devc-wire-box devc-wire-box-cell">
              <span className="v1-mono">{c.id}.WithTxManager(...)</span>
            </div>
            {needsOutbox && (
              <div className="devc-wire-box devc-wire-box-cell">
                <span className="v1-mono">{c.id}.WithOutboxDeps(...)</span>
              </div>
            )}
          </div>
        </div>

        <div className="devc-wire-defense">
          <div className="devcell-card devc-wire-card">
            <div className="devcell-card-h">Hard defense (type system)</div>
            <div className="v1-mute" style={{ fontSize: 12 }}>
              Sealed marker requires an unimplementable <span className="v1-mono">sealedXxx()</span> method
              that only the wrapper package provides. Raw infra is <b>unexpressible</b> at the field type.
            </div>
          </div>
          <div className="devcell-card devc-wire-card">
            <div className="devcell-card-h">Medium defense (archtest)</div>
            <div className="v1-mute" style={{ fontSize: 12 }}>
              Two archtests close type-system gaps:
              <ul className="devc-wire-rules">
                <li><span className="v1-mono">CELL-RAW-INFRA-PUBLIC-OPTION-PARAM-01</span> — walks <span className="v1-mono">*types.Interface</span> embedded types (catches inline interface embed).</li>
                <li><span className="v1-mono">CELL-RAW-INFRA-WRAPPER-LOCATION-01</span> — resolves both <span className="v1-mono">*ast.SelectorExpr</span> and <span className="v1-mono">*ast.Ident</span> call forms (catches dot-import).</li>
              </ul>
            </div>
          </div>
          <div className="devcell-card devc-wire-card">
            <div className="devcell-card-h">In-cell demo fallback</div>
            <div className="v1-mute" style={{ fontSize: 12 }}>
              For demo / unit-test wiring without a real DB, use
              <pre className="devc-isp-code" style={{ marginTop: 8 }}>{`cell.DemoCellTxManager()  // returns sealed persistence.CellTxManager
// ✗ DO NOT use cell.DemoTxRunner{} directly — won't compile against
//   the new sealed field types.`}</pre>
            </div>
          </div>
        </div>
      </>
    );
  };

  const TAB_RENDER = {
    Overview: OverviewTab,
    Interfaces: InterfacesTab,
    Wiring: WiringTab,
    Inventory: InventoryTab,
    Slices: (props) => {
      const SlicesTab = window.DevCell2 && window.DevCell2.SlicesTab;
      return SlicesTab ? <SlicesTab {...props}/> : <MembersTab {...props}/>;
    },
    Contracts: ContractsTab,
    Dependencies: DependenciesTab, Tasks: TasksTab,
    Configuration: (props) => { const V = window.DevWave6?.ConfigurationTabV2; return V ? <V {...props}/> : <ConfigurationTab {...props}/>; },
    Audit:         (props) => { const V = window.DevWave6?.AuditTabV2;         return V ? <V {...props}/> : <AuditTab {...props}/>; },
    Groups:        (props) => { const V = window.DevWave6?.GroupsTabV2;        return V ? <V {...props}/> : <GroupsTab {...props}/>; },
    AI:            (props) => { const V = window.DevWave6?.AITabV2;            return V ? <V {...props}/> : <AITab {...props}/>; },
  };

  const CellDetailPage = ({ cellId, onBack, nav }) => {
    const c = CELLS.find(x => x.id === cellId) || CELLS[0];
    const [tab, setTab] = useState('Overview');
    const [cfgOpen, setCfgOpen] = useState(false);
    const Renderer = TAB_RENDER[tab];
    const ConfigureDrawer = window.DevCell2 && window.DevCell2.ConfigureDrawer;

    return (
      <div className="devcell-detail">
        <div className="devcell-head">
          <button className="v1-link" onClick={onBack} style={{ marginBottom: 8 }}>← Cells</button>
          <div className="devcell-head-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <h1 className="v1-h1" style={{ margin: 0 }}>{c.name}</h1>
                <span className="v1-mono v1-mute" style={{ fontSize: 14 }}>{c.id}</span>
                <span className="devc-tier" style={{ background: TIER_BG[c.tier] }}>{c.tier}</span>
                <span className="v1-chip">{c.domain}</span>
                {c.durability && (
                  <span className={`devc-dur devc-dur-${c.durability.toLowerCase()}`}
                        title={c.durability === 'Durable'
                          ? 'DurabilityDurable — CheckNotNoop rejects noop writers at Init().'
                          : 'DurabilityDemo — noop tx + outbox accepted. Dev / examples only.'}>
                    <span className="devc-dur-dot"/>
                    {c.durability}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span className="devcell-dot" style={{ background: STATUS_META[c.status].dot }}/>
                  {STATUS_META[c.status].label}
                </span>
              </div>
              <p className="v1-sub" style={{ marginTop: 6 }}>
                v{c.version} · {c.team} · owner {c.owner} · {c.slices.length} slices · {c.sloc} sloc
              </p>
            </div>
            <div className="v1-head-actions">
              <button className="v1-btn">Deploy</button>
              <button className="v1-btn" onClick={() => setCfgOpen(true)}>Configure</button>
              <button className="v1-btn v1-btn-primary">Open in cellctl</button>
            </div>
          </div>
        </div>
        <div className="devcell-tabs">
          {TABS.map(t => (
            <button key={t} data-active={tab===t || undefined} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="devcell-body">
          <Renderer c={c} nav={nav}/>
        </div>
        {ConfigureDrawer && <ConfigureDrawer cell={c} open={cfgOpen} onClose={() => setCfgOpen(false)}/>}
      </div>
    );
  };

  // ============================================================
  // Smart Groups — saved queries over cells
  // ============================================================
  const SMART_GROUPS = [
    {
      id: 'sg-001', name: 'High-traffic cells', icon: '⚡',
      kind: 'smart', pinned: true, owner: '@chen',
      desc: 'Cells serving > 300 qps in prod. Used to scope canary rules and on-call rotas.',
      predicates: [{ field: 'runtime.qps', op: '>', value: 300 }],
      match: (c) => c.runtime.qps > 300,
      usedBy: [
        { kind: 'policy',   name: 'P-04 · two-person publish' },
        { kind: 'rollout',  name: 'Canary 5% → 25% → 100% (15 min)' },
        { kind: 'audit',    name: 'Weekly SLO review' },
      ],
      history: [
        { t: '2h ago', what: 'auditcore (1840 qps) — joined' },
        { t: '3d ago', what: 'configcore (2400 qps) — joined' },
        { t: '7d ago', what: 'observecore (0 qps) — left' },
      ],
    },
    {
      id: 'sg-002', name: 'Breaking changes in flight', icon: '◆',
      kind: 'smart', pinned: true, owner: '@li.wei',
      desc: 'Cells with at least one produced contract in `breaking` status. Blocks `flag.evaluate` GA promotion.',
      predicates: [{ field: 'produces.status', op: 'contains', value: 'breaking' }],
      match: (c) => c.produces.some(p => p.status === 'breaking') || c.status === 'breaking',
      usedBy: [
        { kind: 'policy',   name: 'P-09 · block downstream GA' },
        { kind: 'audit',    name: 'Daily contract-conformance scan' },
      ],
      history: [
        { t: '1d ago', what: 'observecore — joined (metric.emit v0.9.0 breaking)' },
        { t: '3d ago', what: 'configcore — joined (status=breaking)' },
      ],
    },
    {
      id: 'sg-003', name: 'Identity domain', icon: '◇',
      kind: 'static', pinned: false, owner: '@li.wei',
      desc: 'Static membership. All cells whose domain is Identity.',
      predicates: [{ field: 'domain', op: '=', value: 'Identity' }],
      match: (c) => c.domain === 'Identity',
      usedBy: [
        { kind: 'policy',  name: 'P-01 · RBAC review quarterly' },
        { kind: 'rota',    name: 'Identity Platform on-call' },
      ],
      history: [
        { t: '21d ago', what: 'accesscore — joined (initial)' },
      ],
    },
    {
      id: 'sg-004', name: 'L3 capability', icon: '▤',
      kind: 'static', pinned: false, owner: '@chen',
      desc: 'Cells published at tier L3 (capability layer). Used as deploy gating cohort.',
      predicates: [{ field: 'tier', op: '=', value: 'L3' }],
      match: (c) => c.tier === 'L3',
      usedBy: [
        { kind: 'rollout', name: 'L3 canary cohort' },
      ],
      history: [
        { t: '14d ago', what: 'accesscore, auditcore, configcore — joined' },
      ],
    },
    {
      id: 'sg-005', name: 'Needs attention', icon: '!',
      kind: 'smart', pinned: true, owner: '@park',
      desc: 'Cells with health < 80 OR with an open incident in the last 7d. Surfaced on the morning brief.',
      predicates: [
        { field: 'health',   op: '<', value: 80 },
        { field: 'activity', op: 'has', value: 'incident:7d' },
      ],
      match: (c) => c.health < 80 || c.activity.some(a => a.what === 'incident'),
      usedBy: [
        { kind: 'rota',  name: 'Morning brief — leadership' },
        { kind: 'audit', name: 'Health regressions weekly' },
      ],
      history: [
        { t: '14h ago', what: 'configcore (health 78) — joined' },
        { t: '2h ago',  what: 'observecore (health 64) — joined' },
      ],
    },
    {
      id: 'sg-006', name: 'Reserved capacity', icon: '◌',
      kind: 'smart', pinned: false, owner: '@nakamura',
      desc: 'Cells in preview / pre-GA state. Excluded from production SLO dashboards.',
      predicates: [{ field: 'status', op: '=', value: 'preview' }],
      match: (c) => c.status === 'preview',
      usedBy: [
        { kind: 'policy',  name: 'P-12 · exclude from prod SLO' },
      ],
      history: [
        { t: '5d ago', what: 'observecore — joined (status=preview)' },
      ],
    },
    {
      id: 'sg-007', name: 'Consumers of audit.append', icon: '→',
      kind: 'smart', pinned: false, owner: '@chen',
      desc: 'Every cell that calls audit.append (≥ v2). Used to coordinate the v2 → v3 migration.',
      predicates: [{ field: 'consumes.id', op: '=', value: 'audit.append' }],
      match: (c) => c.consumes.some(d => d.id === 'audit.append'),
      usedBy: [
        { kind: 'rollout', name: 'audit.append v3 staged migration' },
      ],
      history: [
        { t: '11d ago', what: 'accesscore, configcore, observecore — joined' },
      ],
    },
    {
      id: 'sg-008', name: 'Owner missing or stale', icon: '?',
      kind: 'smart', pinned: false, owner: 'system',
      desc: 'Cells where owner is unset, or last deploy > 30 days, or > 3000 SLOC with no on-call rota.',
      predicates: [
        { field: 'owner',           op: 'missing' },
        { field: 'lastDeploy.days', op: '>', value: 30 },
        { field: 'sloc',            op: '>', value: 3000, and: 'oncall.missing' },
      ],
      match: () => false,
      usedBy: [
        { kind: 'audit', name: 'Ownership hygiene · monthly' },
      ],
      history: [
        { t: '30d ago', what: 'Empty — last cleared after ownership sweep' },
      ],
    },
  ];

  const GroupBadge = ({ kind }) => (
    <span className={`devsg-kind devsg-kind-${kind}`}>{kind}</span>
  );

  const PredicateChip = ({ p, editable }) => {
    const label = p.field + (p.op ? ' ' + p.op : '') + (p.value !== undefined ? ' ' + JSON.stringify(p.value) : '');
    return (
      <span className="devsg-pred">
        <span className="v1-mono">{label}</span>
        {editable && <button className="devsg-pred-x" aria-label="remove">×</button>}
      </span>
    );
  };

  const SmartGroupsPage = ({ nav }) => {
    const [groups, setGroups] = useState(SMART_GROUPS);
    const [selId, setSelId] = useState(SMART_GROUPS[0].id);
    const [filter, setFilter] = useState('');
    const [editing, setEditing] = useState(false);
    const [draftPreds, setDraftPreds] = useState([]);
    const [draftName, setDraftName] = useState('');
    const [draftDesc, setDraftDesc] = useState('');
    const [addingPred, setAddingPred] = useState(false);
    const [newField, setNewField] = useState('runtime.qps');
    const [newOp, setNewOp] = useState('>');
    const [newValue, setNewValue] = useState('100');
    const [scopeMenu, setScopeMenu] = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);
    const [toast, setToast] = useState(null);

    const sel = groups.find(g => g.id === selId) || groups[0];

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(t => t === msg ? null : t), 2400);
    };

    // ----- generic predicate evaluator (for edited groups) -----
    const evalPred = (c, p) => {
      if (p.field === 'produces.status') return c.produces.some(x => x.status === p.value);
      if (p.field === 'consumes.id')     return c.consumes.some(x => x.id === p.value);
      if (p.field === 'activity' && p.op === 'has')
        return c.activity.some(a => a.what === String(p.value || '').split(':')[0]);
      const parts = p.field.split('.');
      let v = c; for (const k of parts) v = v == null ? v : v[k];
      const num = Number(v);
      switch (p.op) {
        case '=':        return String(v) === String(p.value);
        case '!=':       return String(v) !== String(p.value);
        case '>':        return num >  Number(p.value);
        case '<':        return num <  Number(p.value);
        case '>=':       return num >= Number(p.value);
        case '<=':       return num <= Number(p.value);
        case 'contains': return String(v ?? '').toLowerCase().includes(String(p.value ?? '').toLowerCase());
        case 'missing':  return v == null || v === '';
        default: return false;
      }
    };

    // membership: prefer hard-coded match() (curated demo), else evaluate draft preds
    const matched = useMemo(() => {
      if (sel.match && !sel._dirty) return CELLS.filter(c => sel.match(c));
      return CELLS.filter(c => sel.predicates.every(p => evalPred(c, p)));
    }, [selId, groups]);

    // ----- actions -----
    const togglePin = () => {
      setGroups(gs => gs.map(g => g.id === sel.id ? { ...g, pinned: !g.pinned } : g));
      flash(`${sel.name} ${sel.pinned ? 'unpinned' : 'pinned to sidebar'}`);
    };
    const startEdit = () => {
      setDraftPreds(sel.predicates.map(p => ({ ...p })));
      setDraftName(sel.name);
      setDraftDesc(sel.desc);
      setEditing(true);
    };
    const cancelEdit = () => { setEditing(false); setAddingPred(false); };
    const saveEdit = () => {
      setGroups(gs => gs.map(g => g.id === sel.id
        ? { ...g, name: draftName || g.name, desc: draftDesc, predicates: draftPreds, _dirty: true,
            history: [{ t: 'just now', what: `${draftPreds.length} predicate${draftPreds.length===1?'':'s'} · edited by @alex.chen` }, ...g.history] }
        : g));
      setEditing(false); setAddingPred(false);
      flash('Query saved · membership re-evaluated');
    };
    const addPredicate = () => {
      const v = ['>', '<', '>=', '<=' ].includes(newOp) ? Number(newValue) : newValue;
      setDraftPreds(ps => [...ps, { field: newField, op: newOp, value: v }]);
      setAddingPred(false);
      setNewValue('');
    };
    const removePredicate = (i) => setDraftPreds(ps => ps.filter((_, j) => j !== i));
    const newGroup = () => {
      const id = 'sg-' + Math.random().toString(36).slice(2, 7);
      const g = { id, name: 'Untitled group', icon: '◯', kind: 'smart', pinned: false,
                  owner: '@alex.chen', desc: 'Describe what this group is for.',
                  predicates: [], usedBy: [], history: [{ t: 'just now', what: 'Group created' }] };
      setGroups(gs => [...gs, g]);
      setSelId(id);
      setDraftPreds([]); setDraftName(g.name); setDraftDesc(g.desc);
      setEditing(true);
      flash('Group created — add predicates and save');
    };
    const deleteGroup = () => {
      setGroups(gs => gs.filter(g => g.id !== sel.id));
      setSelId(groups[0]?.id);
      setConfirmDel(null);
      flash('Group deleted');
    };
    const attachScope = (kind) => {
      const name = kind === 'policy'  ? 'P-' + Math.floor(10 + Math.random()*89) + ' · new draft policy'
                 : kind === 'rollout' ? 'Canary rollout · draft'
                 : kind === 'audit'   ? 'Audit query · draft'
                 :                      'On-call rota · draft';
      setGroups(gs => gs.map(g => g.id === sel.id
        ? { ...g, usedBy: [...g.usedBy, { kind, name }] }
        : g));
      setScopeMenu(false);
      flash(`Attached to ${kind} · draft saved`);
    };
    const exportCsv = () => {
      const rows = ['cell,domain,tier,health,qps,p95,owner'];
      matched.forEach(c => rows.push(`${c.id},${c.domain},${c.tier},${c.health},${c.runtime.qps},${c.runtime.p95},${c.owner}`));
      flash(`Exported ${matched.length} rows · CSV copied to clipboard`);
      try { navigator.clipboard?.writeText(rows.join('\n')); } catch (e) {}
    };

    const filtered = groups.filter(g =>
      !filter || g.name.toLowerCase().includes(filter.toLowerCase())
              || g.predicates.some(p => String(p.field).toLowerCase().includes(filter.toLowerCase())));

    // current preds (edit mode shows draft, else committed)
    const preds = editing ? draftPreds : sel.predicates;

    // available fields + ops
    const FIELDS = [
      ['domain','enum',['Identity','Platform','Runtime']],
      ['tier','enum',['L1','L2','L3','L4']],
      ['status','enum',['healthy','degraded','breaking','preview']],
      ['health','num'],
      ['sloc','num'],
      ['version','text'],
      ['owner','text'],
      ['runtime.qps','num'],
      ['runtime.p95','text'],
      ['runtime.err','text'],
      ['runtime.replicas','num'],
      ['produces.status','enum',['stable','preview','breaking']],
      ['consumes.id','text'],
    ];
    const fieldMeta = FIELDS.find(f => f[0] === newField) || ['','text'];
    const OPS = fieldMeta[1] === 'num'
      ? ['>','<','>=','<=','=','!=']
      : fieldMeta[1] === 'enum' ? ['=','!=']
      : ['=','!=','contains','missing'];

    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">
              Smart Groups
              <span className="v1-h1-count v1-mono">{groups.length}</span>
            </h1>
            <p className="v1-sub" style={{ maxWidth: 720 }}>
              Saved queries over cells. Smart groups run continuously and become scopes for policies,
              rollouts, audits, and on-call rotas. Pinned groups appear in every Cell's <span className="v1-mono">Groups</span> tab.
            </p>
          </div>
          <div className="v1-head-actions">
            <button className="v1-btn" onClick={() => flash('Paste JSON or GQL to import — modal stub')}>Import query</button>
            <button className="v1-btn v1-btn-primary" onClick={newGroup}>+ New group</button>
          </div>
        </div>

        <div className="devsg-layout">
          {/* LEFT: group list */}
          <aside className="devsg-list">
            <div className="devsg-list-head">
              <input className="devg-scope v1-mono" placeholder="filter groups…"
                     style={{ width: '100%' }}
                     value={filter} onChange={e => setFilter(e.target.value)}/>
            </div>
            {filtered.some(g => g.pinned) && (
              <div className="devsg-list-section">
                <div className="devsg-section-h">Pinned</div>
                {filtered.filter(g => g.pinned).map(g => (
                  <GroupRow key={g.id} g={g} active={selId === g.id}
                            onClick={() => { setSelId(g.id); setEditing(false); }}/>
                ))}
              </div>
            )}
            <div className="devsg-list-section">
              <div className="devsg-section-h">All groups</div>
              {filtered.filter(g => !g.pinned).map(g => (
                <GroupRow key={g.id} g={g} active={selId === g.id}
                          onClick={() => { setSelId(g.id); setEditing(false); }}/>
              ))}
              {filtered.length === 0 && (
                <div className="v1-mute" style={{ fontSize: 12, padding: '8px 16px' }}>
                  No groups match.
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT: group detail */}
          <section className="devsg-detail">
            <div className="devsg-detail-head">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0 }}>
                <span className="devsg-icon">{sel.icon}</span>
                {editing ? (
                  <input className="devsg-name-input" value={draftName}
                         onChange={e => setDraftName(e.target.value)}/>
                ) : (
                  <h2 className="v1-h2" style={{ margin: 0 }}>{sel.name}</h2>
                )}
                <GroupBadge kind={sel.kind}/>
                {sel.pinned && <span className="devsg-pin">pinned</span>}
              </div>
              <div className="v1-head-actions" style={{ position: 'relative' }}>
                {editing ? (
                  <>
                    <button className="v1-btn" onClick={cancelEdit}>Cancel</button>
                    <button className="v1-btn v1-btn-primary" onClick={saveEdit}>Save query</button>
                  </>
                ) : (
                  <>
                    <button className="v1-btn" onClick={startEdit}>Edit</button>
                    <button className="v1-btn" onClick={togglePin}>{sel.pinned ? 'Unpin' : 'Pin'}</button>
                    <button className="v1-btn" onClick={() => setScopeMenu(s => !s)}>Use as scope…</button>
                    <button className="v1-btn devsg-btn-danger" onClick={() => setConfirmDel(sel.id)}>Delete</button>
                    {scopeMenu && (
                      <div className="devsg-menu" onMouseLeave={() => setScopeMenu(false)}>
                        <div className="devsg-menu-h">Attach as scope to…</div>
                        <button onClick={() => attachScope('policy')}>
                          <span className="devsg-used-kind devsg-used-policy">policy</span>
                          <span>New governance policy</span>
                        </button>
                        <button onClick={() => attachScope('rollout')}>
                          <span className="devsg-used-kind devsg-used-rollout">rollout</span>
                          <span>Canary rollout cohort</span>
                        </button>
                        <button onClick={() => attachScope('audit')}>
                          <span className="devsg-used-kind devsg-used-audit">audit</span>
                          <span>Scheduled audit query</span>
                        </button>
                        <button onClick={() => attachScope('rota')}>
                          <span className="devsg-used-kind devsg-used-rota">rota</span>
                          <span>On-call rota assignment</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <textarea className="devsg-desc-input v1-sub" rows={2}
                        value={draftDesc} onChange={e => setDraftDesc(e.target.value)}
                        placeholder="Describe what this group is for…"/>
            ) : (
              <p className="v1-sub" style={{ margin: '4px 0 18px' }}>{sel.desc}</p>
            )}

            <div className="devsg-kv">
              <div><span>Owner</span><b className="v1-mono">{sel.owner}</b></div>
              <div><span>Membership</span><b className="v1-mono">{sel.kind === 'static' ? 'static · manual' : 'live · re-evaluates on cell change'}</b></div>
              <div><span>Current size</span><b className="v1-mono">{matched.length} of {CELLS.length} cells</b></div>
              <div><span>Used by</span><b className="v1-mono">{sel.usedBy.length} scope{sel.usedBy.length === 1 ? '' : 's'}</b></div>
            </div>

            <div className="devsg-card">
              <div className="devsg-card-h">
                Query {editing && <span className="v1-mute v1-mono" style={{ marginLeft: 6 }}>· editing</span>}
                {!editing && <button className="v1-link" style={{ marginLeft: 'auto' }} onClick={startEdit}>Edit query →</button>}
              </div>
              <div className="devsg-query">
                {preds.length === 0 && (
                  <span className="v1-mute" style={{ fontSize: 12.5 }}>No predicates — this group is empty.</span>
                )}
                {preds.map((p, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="devsg-and">AND</span>}
                    <span className="devsg-pred">
                      <span className="v1-mono">
                        {p.field}{p.op ? ' ' + p.op : ''}{p.value !== undefined ? ' ' + JSON.stringify(p.value) : ''}
                      </span>
                      {editing && <button className="devsg-pred-x" onClick={() => removePredicate(i)} aria-label="remove">×</button>}
                    </span>
                  </React.Fragment>
                ))}
                {editing && !addingPred && (
                  <button className="devsg-pred-add" onClick={() => setAddingPred(true)}>+ predicate</button>
                )}
              </div>
              {editing && addingPred && (
                <div className="devsg-pred-form">
                  <select value={newField} onChange={e => { setNewField(e.target.value); setNewOp('='); }}>
                    {FIELDS.map(f => <option key={f[0]} value={f[0]}>{f[0]}</option>)}
                  </select>
                  <select value={newOp} onChange={e => setNewOp(e.target.value)}>
                    {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {fieldMeta[1] === 'enum' && newOp !== 'missing' ? (
                    <select value={newValue} onChange={e => setNewValue(e.target.value)}>
                      <option value="">— choose —</option>
                      {fieldMeta[2].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : newOp !== 'missing' ? (
                    <input className="v1-mono" placeholder="value"
                           value={newValue} onChange={e => setNewValue(e.target.value)}/>
                  ) : <span className="v1-mute" style={{ fontSize: 11.5 }}>(no value needed)</span>}
                  <button className="v1-btn v1-btn-primary" onClick={addPredicate}>Add</button>
                  <button className="v1-btn" onClick={() => setAddingPred(false)}>Cancel</button>
                </div>
              )}
              {!editing && (
                <div className="devsg-query-add">
                  <span className="v1-mute" style={{ fontSize: 11.5 }}>
                    Supports <span className="v1-mono">domain</span>, <span className="v1-mono">tier</span>,
                    {' '}<span className="v1-mono">version</span>, <span className="v1-mono">health</span>,
                    {' '}<span className="v1-mono">runtime.*</span>, <span className="v1-mono">produces.*</span>,
                    {' '}<span className="v1-mono">consumes.*</span>, <span className="v1-mono">owner</span>,
                    {' '}<span className="v1-mono">activity</span>.
                  </span>
                </div>
              )}
            </div>

            <div className="devsg-card">
              <div className="devsg-card-h">
                Members
                <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{matched.length}</span>
                <button className="v1-link" style={{ marginLeft: 'auto' }} onClick={exportCsv}>Export CSV</button>
              </div>
              {matched.length === 0 ? (
                <div className="v1-mute" style={{ fontSize: 13, padding: '12px 2px' }}>
                  No cells match this query right now. Empty groups are still valid — they'll fill as cells change.
                </div>
              ) : (
                <table className="devg-table devcell-tbl">
                  <thead><tr>
                    <th>Cell</th><th>Domain</th><th>Tier</th>
                    <th style={{textAlign:'right'}}>Health</th>
                    <th style={{textAlign:'right'}}>QPS</th>
                    <th style={{textAlign:'right'}}>p95</th>
                    <th>Status</th>
                    <th>Owner</th>
                  </tr></thead>
                  <tbody>
                    {matched.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }}
                          onClick={() => nav && nav('cell:' + c.id)}>
                        <td>
                          <div className="v1-mono" style={{ fontWeight: 500 }}>{c.id}</div>
                          <div className="v1-mute" style={{ fontSize: 11 }}>{c.name}</div>
                        </td>
                        <td>{c.domain}</td>
                        <td><span className="devc-tier" style={{ background: TIER_BG[c.tier] }}>{c.tier}</span></td>
                        <td style={{textAlign:'right'}} className="v1-mono">{c.health}</td>
                        <td style={{textAlign:'right'}} className="v1-mono">{c.runtime.qps}</td>
                        <td style={{textAlign:'right'}} className="v1-mono">{c.runtime.p95}</td>
                        <td>
                          <span className="devcell-dot" style={{ background: STATUS_META[c.status].dot }}/>
                          <span style={{ fontSize: 12, marginLeft: 6 }}>{STATUS_META[c.status].label}</span>
                        </td>
                        <td className="v1-mono" style={{ fontSize: 12 }}>{c.owner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="devsg-row-2">
              <div className="devsg-card">
                <div className="devsg-card-h">
                  Used as scope by
                  <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{sel.usedBy.length}</span>
                </div>
                {sel.usedBy.length === 0 ? (
                  <div className="v1-mute" style={{ fontSize: 12.5, padding: '6px 0' }}>
                    Not used yet. Use “Use as scope…” to attach this group to a policy, rollout, audit, or rota.
                  </div>
                ) : (
                  <ul className="devsg-used">
                    {sel.usedBy.map((u, i) => (
                      <li key={i}>
                        <span className={`devsg-used-kind devsg-used-${u.kind}`}>{u.kind}</span>
                        <span>{u.name}</span>
                        <button className="v1-link" style={{ marginLeft: 'auto', fontSize: 11.5 }}
                                onClick={() => flash(`Opening ${u.kind} · ${u.name}`)}>open →</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="devsg-card">
                <div className="devsg-card-h">Membership changes</div>
                <ul className="devsg-hist">
                  {sel.history.map((h, i) => (
                    <li key={i}>
                      <span className="v1-mono v1-mute" style={{ fontSize: 11.5, width: 70, flexShrink: 0 }}>{h.t}</span>
                      <span style={{ fontSize: 12.5 }}>{h.what}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        {confirmDel && (
          <div className="devsg-modal-bg" onClick={() => setConfirmDel(null)}>
            <div className="devsg-modal" onClick={e => e.stopPropagation()}>
              <h3 className="v1-h2" style={{ margin: 0 }}>Delete this smart group?</h3>
              <p className="v1-sub" style={{ marginTop: 8 }}>
                <b>{sel.name}</b> will be removed. Anything scoped to it ({sel.usedBy.length} item{sel.usedBy.length===1?'':'s'})
                will lose its scope and need to be re-pointed.
              </p>
              <div className="devsg-modal-acts">
                <button className="v1-btn" onClick={() => setConfirmDel(null)}>Cancel</button>
                <button className="v1-btn devsg-btn-danger" onClick={deleteGroup}>Delete group</button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="devsg-toast"><span className="v1-mono">✓</span> {toast}</div>
        )}
      </div>
    );
  };

  const GroupRow = ({ g, active, onClick }) => (
    <button className="devsg-row" data-active={active || undefined} onClick={onClick}>
      <span className="devsg-row-icon">{g.icon}</span>
      <span className="devsg-row-body">
        <span className="devsg-row-name">{g.name}</span>
        <span className="devsg-row-meta">
          <span className={`devsg-kind devsg-kind-${g.kind}`}>{g.kind}</span>
          <span className="v1-mute v1-mono">{g.predicates.length} pred</span>
        </span>
      </span>
    </button>
  );

  window.DevCell = { CellsListPage, CellDetailPage, SmartGroupsPage, CELLS };
})();
