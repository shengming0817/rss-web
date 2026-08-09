/* global React */
// Wave 3:
//   - Products list + Product detail (Overview / Journeys / Assemblies / Cells)
//   - Sprint page (burndown + cross-Inbox sprint summary)

(() => {
  const { useState, useMemo } = React;
  const D2 = window.DevCell2 || {};
  const Inbox = window.DevInbox || {};
  const DEV = window.DEV_DATA || { sprints: [], flatTasks: [] };

  const PRODUCT_TREE = D2.PRODUCT_TREE || {};
  const CELL_PRODUCT = D2.CELL_PRODUCT || {};
  const SLICES       = D2.SLICES || {};
  const WORK_ITEMS   = Inbox.WORK_ITEMS || [];

  // ============================================================
  // Journey data — synthesized from product/epic + cells in feature
  // Each journey = epic, with cells, e2e verify, owners, KPIs.
  // ============================================================
  const JOURNEY_DETAIL = {
    'epic-sso': {
      e2e: [
        { name: 'idp.discovery → cells.accesscore.sso.oidc', pass: true },
        { name: 'token.exchange → session.mint',             pass: true },
        { name: 'group.claim → rbac.role.resolve',           pass: true },
        { name: 'login.event → audit.append',                pass: false, why: 'audit-bridge missing on Okta path' },
      ],
      kpi: [
        { k: 'Median sign-in latency',  v: '482 ms',  target: '< 800 ms', good: true },
        { k: 'IdP coverage',            v: '2 / 3',   target: 'Entra · Okta · custom OIDC', good: false },
        { k: 'Tenants onboarded',       v: '14',      target: '20 by EOQ', good: false },
      ],
    },
    'epic-audit': {
      e2e: [
        { name: 'event.append → chain.hash → persist',       pass: true },
        { name: 'merkle.proof.export → tenant.verify',       pass: true },
        { name: 'query.range → page (10k events)',           pass: true },
      ],
      kpi: [
        { k: 'Append throughput',  v: '14k/s',  target: '> 10k/s', good: true },
        { k: 'Proof gen p95',      v: '38 ms',  target: '< 50 ms', good: true },
        { k: 'Chain depth',        v: '21',     target: '< 32 (proof size budget)', good: true },
      ],
    },
    'epic-publish': {
      e2e: [
        { name: 'stage.write → diff.preview',                pass: true },
        { name: 'publish.atomic → flip → audit.append',      pass: false, why: 'rollback slice not wired' },
        { name: 'rollback.snapshot → restore',               pass: false, why: 'slice in todo' },
      ],
      kpi: [
        { k: 'Stage TTL',          v: '24 h',   target: '24 h', good: true },
        { k: 'Two-person review',  v: 'on',     target: 'on',   good: true },
        { k: 'Rollback receipt',   v: '—',      target: 'every publish', good: false },
      ],
    },
    'epic-observe': {
      e2e: [
        { name: 'otlp.span.recv → store.batch',              pass: false, why: 'OTLP slice in todo' },
        { name: 'metric.scrape → /metrics expose',           pass: true },
      ],
      kpi: [
        { k: 'Span ingest',     v: '—',      target: '5k spans/s', good: false },
        { k: 'Metric series',   v: '1.2k',   target: '10k', good: false },
      ],
    },
  };

  // Assemblies = pinned cell-version combos. Each product has 1+ assemblies.
  const ASSEMBLIES = {
    'gocell-identity': [
      { id: 'A-id-prod', name: 'identity / prod', state: 'live', region: 'us-east·eu-west', tenants: 14,
        pins: { accesscore: 'v1.4.2', auditcore: 'v2.1.0', configcore: 'v1.8.3' },
        last: '2025-05-01 14:22', deployer: '@release-bot' },
      { id: 'A-id-stage', name: 'identity / stage', state: 'staging', region: 'us-east', tenants: 0,
        pins: { accesscore: 'v1.5.0-rc.2', auditcore: 'v2.1.0', configcore: 'v1.9.0-rc.1' },
        last: '2025-05-04 09:11', deployer: '@li.wei' },
      { id: 'A-id-canary', name: 'identity / canary', state: 'canary', region: 'us-east', tenants: 1,
        pins: { accesscore: 'v1.5.0-rc.2', auditcore: 'v2.1.0', configcore: 'v1.8.3' },
        last: '2025-05-05 16:40', deployer: '@kim' },
    ],
    'gocell-platform': [
      { id: 'A-pf-prod', name: 'platform / prod', state: 'live', region: 'global', tenants: 47,
        pins: { auditcore: 'v2.1.0', configcore: 'v1.8.3', observecore: 'v0.3.1' },
        last: '2025-05-01 14:22', deployer: '@release-bot' },
      { id: 'A-pf-stage', name: 'platform / stage', state: 'staging', region: 'us-east', tenants: 0,
        pins: { auditcore: 'v2.2.0-rc.1', configcore: 'v1.9.0-rc.1', observecore: 'v0.4.0-dev' },
        last: '2025-05-06 11:03', deployer: '@chen' },
    ],
  };

  // ============================================================
  // ProductsListPage
  // ============================================================
  const ProductsListPage = ({ onOpen }) => {
    const products = Object.values(PRODUCT_TREE);
    return (
      <div className="devw3-page" data-screen-label="Products list">
        <div className="devw3-head">
          <div>
            <h1 className="v1-h1">Products <span className="v1-h1-count">{products.length}</span></h1>
            <p className="v1-sub">A product is a deployable line. Each owns 1+ Journeys (Epics), pins a set of Cells, and ships as one or more Assemblies.</p>
          </div>
        </div>
        <div className="devw3-prod-grid">
          {products.map(p => {
            const journeys = Object.values(p.epics);
            const cells = Array.from(new Set(journeys.flatMap(j => Object.values(j.features).flatMap(f => f.cells))));
            const asms = ASSEMBLIES[p.id] || [];
            const tenants = asms.reduce((a, x) => a + (x.tenants || 0), 0);
            return (
              <button key={p.id} className="devw3-prod-card" onClick={() => onOpen(p.id)}>
                <div className="devw3-prod-h">
                  <div>
                    <div className="devw3-prod-name">{p.name}</div>
                    <div className="devw3-prod-tag">{p.tagline}</div>
                  </div>
                  <span className="devw3-stage" data-stage={p.stage}>{p.stage}</span>
                </div>
                <div className="devw3-prod-stats">
                  <div><span>Journeys</span><b>{journeys.length}</b></div>
                  <div><span>Cells</span><b>{cells.length}</b></div>
                  <div><span>Assemblies</span><b>{asms.length}</b></div>
                  <div><span>Tenants</span><b>{tenants}</b></div>
                </div>
                <div className="devw3-prod-foot">
                  <span className="v1-mono">{p.owner}</span>
                  <span className="devw3-prod-cells">{cells.join(' · ')}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================
  // Tab — Overview
  // ============================================================
  const OverviewTab = ({ pid, p, onJump }) => {
    const journeys = Object.values(p.epics);
    const allCells = Array.from(new Set(journeys.flatMap(j => Object.values(j.features).flatMap(f => f.cells))));
    const slicesAll = allCells.flatMap(c => (SLICES[c] || []).map(s => ({ ...s, cell: c })));
    const stable = slicesAll.filter(s => s.status === 'stable').length;
    const inflight = slicesAll.filter(s => s.status === 'doing' || s.status === 'review').length;
    const todo = slicesAll.filter(s => s.status === 'todo').length;
    const items = WORK_ITEMS.filter(w =>
      (w.attached.level === 'product' && w.attached.ref === pid) ||
      (w.attached.level === 'cell' && allCells.includes(w.attached.ref)) ||
      (w.attached.level === 'slice' && allCells.some(c => w.attached.ref.startsWith(c + '/'))) ||
      (w.attached.level === 'journey' && journeys.some(j => 'J-' + j.id.replace('epic-', '') === w.attached.ref))
    );
    const bugs = items.filter(w => w.kind === 'bug').length;
    const issues = items.filter(w => w.kind === 'issue' && w.status === 'open').length;
    const tasks = items.filter(w => w.kind === 'task').length;

    return (
      <div className="devw3-grid">
        <section className="devw3-panel">
          <div className="devw3-panel-h">Health</div>
          <div className="devw3-stats4">
            <div><span>Slices stable</span><b>{stable}</b><i>of {slicesAll.length}</i></div>
            <div><span>In-flight</span><b className="devw3-warn">{inflight}</b><i>doing + review</i></div>
            <div><span>Open bugs</span><b className={bugs ? 'devw3-bad' : ''}>{bugs}</b><i>across journeys</i></div>
            <div><span>Open issues</span><b className={issues ? 'devw3-warn' : ''}>{issues}</b><i>impediment + risk</i></div>
          </div>
        </section>

        <section className="devw3-panel">
          <div className="devw3-panel-h">Composition</div>
          <div className="devw3-comp">
            <div className="devw3-comp-row">
              <div className="devw3-comp-k">Cells in this product</div>
              <div className="devw3-comp-v">
                {allCells.map(c => (
                  <button key={c} className="devw3-chip" onClick={() => onJump('cell:' + c)}>
                    <span className="devw3-chip-ico">⬡</span>{c}
                  </button>
                ))}
              </div>
            </div>
            <div className="devw3-comp-row">
              <div className="devw3-comp-k">Journeys</div>
              <div className="devw3-comp-v">
                {journeys.map(j => (
                  <button key={j.id} className="devw3-chip" onClick={() => onJump('journey:' + j.id)}>
                    <span className="devw3-chip-ico">◇</span>{j.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="devw3-comp-row">
              <div className="devw3-comp-k">Backlog summary</div>
              <div className="devw3-comp-v">
                <span className="devw3-pill">Tasks · {tasks}</span>
                <span className="devw3-pill" data-tone="bug">Bugs · {bugs}</span>
                <span className="devw3-pill" data-tone="issue">Issues · {issues}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="devw3-panel">
          <div className="devw3-panel-h">Recent activity (synthesized)</div>
          <ul className="devw3-feed">
            <li><span className="v1-mono devw3-feed-t">14:22</span> <b>{allCells[0] || 'cell'}</b> v{Math.floor(Math.random()*9)+1}.{Math.floor(Math.random()*9)}.{Math.floor(Math.random()*9)} pinned to <span className="v1-mono">{p.id}/prod</span></li>
            <li><span className="v1-mono devw3-feed-t">12:08</span> Journey <b>{journeys[0]?.name}</b> e2e verify <span className="devw3-good">passed</span> on <span className="v1-mono">stage</span></li>
            <li><span className="v1-mono devw3-feed-t">10:51</span> <b>BUG-12</b> opened against <span className="v1-mono">{allCells[0] || 'cell'}/sso.oidc</span></li>
            <li><span className="v1-mono devw3-feed-t">09:33</span> Sandbox <b>sb-104</b> review-ready (cell {allCells[0]}, slice sso.oidc)</li>
          </ul>
        </section>
      </div>
    );
  };

  // ============================================================
  // Tab — Journeys
  // ============================================================
  const JourneysTab = ({ p, onJump }) => {
    const journeys = Object.values(p.epics);
    const [open, setOpen] = useState(journeys[0]?.id);
    const cur = journeys.find(j => j.id === open) || journeys[0];
    const det = JOURNEY_DETAIL[cur?.id] || { e2e: [], kpi: [] };
    const cells = Object.values(cur?.features || {}).flatMap(f => f.cells);
    const passCount = det.e2e.filter(s => s.pass).length;
    const e2eState = det.e2e.length === 0 ? 'unknown' : (passCount === det.e2e.length ? 'green' : 'red');

    return (
      <div className="devw3-jrn">
        <aside className="devw3-jrn-list">
          {journeys.map(j => {
            const d = JOURNEY_DETAIL[j.id];
            const ok = d ? d.e2e.every(s => s.pass) : false;
            return (
              <button key={j.id} className="devw3-jrn-item" data-active={open === j.id || undefined}
                      onClick={() => setOpen(j.id)}>
                <div className="devw3-jrn-name">
                  <span className="devw3-jrn-mark" data-state={ok ? 'green' : 'red'}/>
                  {j.name}
                </div>
                <div className="devw3-jrn-sub">{j.desc}</div>
              </button>
            );
          })}
        </aside>
        <div className="devw3-jrn-body">
          {cur && (<>
            <div className="devw3-jrn-head">
              <div>
                <div className="devw3-jrn-h-row">
                  <span className="devw3-jrn-mark" data-state={e2eState}/>
                  <h2 className="devw3-jrn-title">{cur.name}</h2>
                  <span className="devw3-pill">{cells.length} cells</span>
                </div>
                <p className="devw3-jrn-desc">{cur.desc}</p>
              </div>
              <div className="devw3-jrn-actions">
                <button className="v1-btn">Run e2e verify</button>
              </div>
            </div>

            <div className="devw3-jrn-graph">
              <div className="devw3-jrn-graph-h">Cross-cell journey path</div>
              <div className="devw3-jrn-flow">
                {cells.map((c, i) => (
                  <React.Fragment key={c}>
                    <button className="devw3-jrn-node" onClick={() => onJump('cell:' + c)}>
                      <span className="devw3-jrn-node-ico">⬡</span>
                      <span>{c}</span>
                    </button>
                    {i < cells.length - 1 && <span className="devw3-jrn-arr">→</span>}
                  </React.Fragment>
                ))}
                {cells.length === 0 && <span className="v1-mute">No cells mapped to this journey.</span>}
              </div>
            </div>

            <div className="devw3-jrn-twocol">
              <section className="devw3-panel">
                <div className="devw3-panel-h">
                  <span>End-to-end verify</span>
                  <span className="devw3-pill" data-tone={e2eState === 'green' ? 'good' : 'bad'}>
                    {passCount}/{det.e2e.length} pass
                  </span>
                </div>
                <ul className="devw3-e2e">
                  {det.e2e.map((s, i) => (
                    <li key={i} data-pass={s.pass}>
                      <span className="devw3-e2e-dot" data-pass={s.pass}/>
                      <span className="v1-mono devw3-e2e-name">{s.name}</span>
                      {!s.pass && s.why && <span className="devw3-e2e-why">{s.why}</span>}
                    </li>
                  ))}
                  {det.e2e.length === 0 && <li className="v1-mute">No e2e contract for this journey yet.</li>}
                </ul>
              </section>

              <section className="devw3-panel">
                <div className="devw3-panel-h">KPIs</div>
                <ul className="devw3-kpi">
                  {det.kpi.map((k, i) => (
                    <li key={i}>
                      <div className="devw3-kpi-k">{k.k}</div>
                      <div className="devw3-kpi-v" data-good={k.good}>{k.v}</div>
                      <div className="devw3-kpi-t">target · {k.target}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>)}
        </div>
      </div>
    );
  };

  // ============================================================
  // Tab — Assemblies
  // ============================================================
  const AssembliesTab = ({ pid, onJump }) => {
    const asms = ASSEMBLIES[pid] || [];
    const [sel, setSel] = useState(asms[0]?.id);
    const cur = asms.find(a => a.id === sel) || asms[0];

    return (
      <div className="devw3-asm">
        <aside className="devw3-asm-list">
          <div className="devw3-asm-list-h">
            <span>Assemblies</span>
            <button className="v1-btn devw3-asm-new">+ Pin new</button>
          </div>
          {asms.map(a => (
            <button key={a.id} className="devw3-asm-item" data-active={sel === a.id || undefined}
                    onClick={() => setSel(a.id)}>
              <div className="devw3-asm-row1">
                <span className="devw3-asm-name">{a.name}</span>
                <span className="devw3-asm-state" data-state={a.state}>{a.state}</span>
              </div>
              <div className="devw3-asm-row2">
                <span className="v1-mono">{a.region}</span>
                <span>{a.tenants} tenant{a.tenants !== 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </aside>
        <div className="devw3-asm-body">
          {cur && (<>
            <div className="devw3-asm-head">
              <div>
                <div className="devw3-asm-title-row">
                  <h2 className="devw3-asm-title">{cur.name}</h2>
                  <span className="devw3-asm-state" data-state={cur.state}>{cur.state}</span>
                </div>
                <p className="v1-sub">An <b>assembly</b> is a pinned combination of cell versions deployed together. Promote it across stage → canary → prod.</p>
              </div>
              <div className="devw3-asm-actions">
                <button className="v1-ghost">Diff vs prod</button>
                <button className="v1-btn">Promote</button>
              </div>
            </div>

            <div className="devw3-asm-meta">
              <div><span>Region</span><b className="v1-mono">{cur.region}</b></div>
              <div><span>Tenants</span><b>{cur.tenants}</b></div>
              <div><span>Last deploy</span><b className="v1-mono">{cur.last}</b></div>
              <div><span>Deployer</span><b className="v1-mono">{cur.deployer}</b></div>
            </div>

            <section className="devw3-panel">
              <div className="devw3-panel-h">Pinned cell versions</div>
              <table className="devw3-asm-pins">
                <thead><tr><th>Cell</th><th>Version</th><th>Δ vs prod</th><th>Contracts produced</th><th></th></tr></thead>
                <tbody>
                  {Object.entries(cur.pins).map(([cell, ver]) => {
                    const slices = SLICES[cell] || [];
                    const produces = Array.from(new Set(slices.flatMap(s => s.produces || [])));
                    const drift = ver.includes('rc') || ver.includes('dev');
                    return (
                      <tr key={cell}>
                        <td><button className="devw3-link" onClick={() => onJump('cell:' + cell)}>⬡ {cell}</button></td>
                        <td className="v1-mono">{ver}</td>
                        <td>{drift
                          ? <span className="devw3-pill" data-tone="warn">+1 ahead</span>
                          : <span className="devw3-pill" data-tone="good">aligned</span>}</td>
                        <td className="v1-mono devw3-asm-contracts">{produces.slice(0,3).join(', ') || '—'}</td>
                        <td><button className="devw3-ghost-mini">unpin</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="devw3-panel">
              <div className="devw3-panel-h">Promotion lane</div>
              <div className="devw3-promote">
                {['staging', 'canary', 'live'].map((stage, i) => {
                  const asAt = asms.find(a => a.state === stage);
                  const isCur = cur.state === stage;
                  return (
                    <React.Fragment key={stage}>
                      <div className="devw3-prom-step" data-active={isCur || undefined}>
                        <div className="devw3-prom-stage">{stage}</div>
                        <div className="devw3-prom-name">{asAt ? asAt.name : '—'}</div>
                        <div className="devw3-prom-meta v1-mono">{asAt ? asAt.last : '—'}</div>
                      </div>
                      {i < 2 && <span className="devw3-prom-arr">→</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          </>)}
          {!cur && <div className="v1-mute" style={{padding:24}}>No assemblies pinned yet.</div>}
        </div>
      </div>
    );
  };

  // ============================================================
  // Tab — Cells (under product)
  // ============================================================
  const ProductCellsTab = ({ p, onJump }) => {
    const journeys = Object.values(p.epics);
    const cells = Array.from(new Set(journeys.flatMap(j => Object.values(j.features).flatMap(f => f.cells))));
    const rows = cells.map(c => {
      const slices = SLICES[c] || [];
      const stable = slices.filter(s => s.status === 'stable').length;
      const doing  = slices.filter(s => s.status === 'doing' || s.status === 'review').length;
      const todo   = slices.filter(s => s.status === 'todo').length;
      const sloc = slices.reduce((a, s) => a + (s.sloc || 0), 0);
      const produces = Array.from(new Set(slices.flatMap(s => s.produces || [])));
      const consumes = Array.from(new Set(slices.flatMap(s => s.consumes || [])));
      const journey = journeys.find(j => Object.values(j.features).some(f => f.cells.includes(c)));
      return { c, slices, stable, doing, todo, sloc, produces, consumes, journey };
    });
    return (
      <div>
        <table className="devw3-cells-tbl">
          <thead>
            <tr><th>Cell</th><th>Journey</th><th>Slices</th><th>SLoC</th><th>Produces</th><th>Consumes</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.c}>
                <td><button className="devw3-link" onClick={() => onJump('cell:' + r.c)}>⬡ {r.c}</button></td>
                <td>{r.journey?.name || '—'}</td>
                <td>
                  <span className="devw3-bar">
                    <span className="devw3-bar-seg devw3-bar-stable"  style={{flex: r.stable}} title={`${r.stable} stable`}/>
                    <span className="devw3-bar-seg devw3-bar-doing"   style={{flex: r.doing}}  title={`${r.doing} doing/review`}/>
                    <span className="devw3-bar-seg devw3-bar-todo"    style={{flex: r.todo || 0.3}} title={`${r.todo} todo`}/>
                  </span>
                  <span className="devw3-bar-legend">
                    {r.stable}<i> stable</i> · {r.doing}<i> live</i> · {r.todo}<i> todo</i>
                  </span>
                </td>
                <td className="v1-mono">{r.sloc.toLocaleString()}</td>
                <td className="v1-mono devw3-trunc" title={r.produces.join(', ')}>{r.produces.join(', ') || '—'}</td>
                <td className="v1-mono devw3-trunc" title={r.consumes.join(', ')}>{r.consumes.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ============================================================
  // ProductDetailPage — tabs shell
  // ============================================================
  const ProductDetailPage = ({ pid, onBack, nav }) => {
    const p = PRODUCT_TREE[pid];
    const [tab, setTab] = useState('overview');
    if (!p) return <div className="devw3-page"><p className="v1-mute">Product not found.</p></div>;

    const tabs = [
      { k: 'overview',   label: 'Overview' },
      { k: 'journeys',   label: 'Journeys' },
      { k: 'assemblies', label: 'Assemblies' },
      { k: 'cells',      label: 'Cells' },
    ];

    return (
      <div className="devw3-page" data-screen-label={`Product · ${p.name}`}>
        <div className="devw3-pd-head">
          <button className="devw3-back" onClick={onBack}>← All products</button>
          <div className="devw3-pd-title-row">
            <h1 className="v1-h1">{p.name}</h1>
            <span className="devw3-stage" data-stage={p.stage}>{p.stage}</span>
            <span className="v1-mono devw3-pd-owner">{p.owner}</span>
          </div>
          <p className="v1-sub">{p.tagline}</p>
        </div>
        <nav className="devw3-tabs">
          {tabs.map(t => (
            <button key={t.k} className="devw3-tab" data-active={tab === t.k || undefined}
                    onClick={() => setTab(t.k)}>{t.label}</button>
          ))}
        </nav>
        <div className="devw3-tab-body">
          {tab === 'overview'   && <OverviewTab    pid={pid} p={p} onJump={nav}/>}
          {tab === 'journeys'   && <JourneysTab    p={p} onJump={nav}/>}
          {tab === 'assemblies' && <AssembliesTab  pid={pid} onJump={nav}/>}
          {tab === 'cells'      && <ProductCellsTab p={p} onJump={nav}/>}
        </div>
      </div>
    );
  };

  // ============================================================
  // SprintPage — burndown + cross-Inbox sprint summary
  // ============================================================
  const SprintPage = () => {
    const sprints = DEV.sprints || [];
    const active = sprints.find(s => s.state === 'active') || sprints[0];
    const [sel, setSel] = useState(active?.id);
    const cur = sprints.find(s => s.id === sel) || active;

    const items = WORK_ITEMS.filter(w => w.sprint === sel);
    const tasks  = items.filter(w => w.kind === 'task');
    const bugs   = items.filter(w => w.kind === 'bug');
    const issues = items.filter(w => w.kind === 'issue');
    const done   = items.filter(w => w.status === 'resolved' || w.status === 'closed').length;
    const doing  = items.filter(w => w.status === 'doing' || w.status === 'active').length;
    const open   = items.length - done - doing;

    // Burndown — synth: 14-day sprint, ideal vs actual
    const days = 14;
    const total = items.length || cur?.total || 9;
    const ideal = Array.from({ length: days + 1 }, (_, i) => total * (1 - i / days));
    // Actual: starts flat, accelerates mid-sprint, ends near 'open'
    const today = 9;
    const actual = Array.from({ length: today + 1 }, (_, i) => {
      const t = i / today;
      return total - (total - (open + doing)) * (Math.sin(t * Math.PI / 2));
    });

    const w = 760, h = 220, pad = { l: 36, r: 12, t: 14, b: 28 };
    const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    const xAt = i => pad.l + (i / days) * innerW;
    const yAt = v => pad.t + (1 - v / total) * innerH;
    const idealPath = ideal.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(v)}`).join(' ');
    const actualPath = actual.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(v)}`).join(' ');

    return (
      <div className="devw3-page" data-screen-label="Sprint">
        <div className="devw3-head">
          <div>
            <h1 className="v1-h1">Sprint</h1>
            <p className="v1-sub">Time-boxed view across the Inbox. Sprint is orthogonal to the Cell/Slice structure — same items grouped by their sprint field.</p>
          </div>
          <div className="devw3-sp-picker">
            {sprints.map(s => (
              <button key={s.id} className="devw3-sp-tab" data-active={sel === s.id || undefined}
                      data-state={s.state} onClick={() => setSel(s.id)}>
                <div className="devw3-sp-name">{s.name}</div>
                <div className="devw3-sp-range">{s.range}</div>
              </button>
            ))}
          </div>
        </div>

        {cur && (<>
          <div className="devw3-sp-stats">
            <div><span>State</span><b data-state={cur.state}>{cur.state}</b></div>
            <div><span>Range</span><b className="v1-mono">{cur.range}</b></div>
            <div><span>Items</span><b>{items.length}</b><i>{tasks.length}T · {bugs.length}B · {issues.length}I</i></div>
            <div><span>Done</span><b className="devw3-good">{done}</b></div>
            <div><span>In progress</span><b className="devw3-warn">{doing}</b></div>
            <div><span>Open</span><b>{open}</b></div>
          </div>

          <div className="devw3-sp-twocol">
            <section className="devw3-panel">
              <div className="devw3-panel-h">
                <span>Burndown</span>
                <span className="devw3-legend">
                  <i className="devw3-legend-d devw3-legend-ideal"/> ideal
                  <i className="devw3-legend-d devw3-legend-actual"/> actual
                </span>
              </div>
              <svg className="devw3-burn" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
                {/* axes */}
                <line x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} stroke="var(--line)" />
                <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke="var(--line)" />
                {/* y ticks */}
                {[0, 0.5, 1].map(t => (
                  <g key={t}>
                    <line x1={pad.l} x2={w - pad.r} y1={pad.t + t * innerH} y2={pad.t + t * innerH}
                          stroke="var(--line-soft)" strokeDasharray="2 3"/>
                    <text x={pad.l - 6} y={pad.t + t * innerH + 4} fontSize="10" textAnchor="end" fill="var(--fg-muted)">
                      {Math.round(total * (1 - t))}
                    </text>
                  </g>
                ))}
                {/* x labels */}
                {[0, 7, 14].map(d => (
                  <text key={d} x={xAt(d)} y={h - pad.b + 16} fontSize="10" textAnchor="middle" fill="var(--fg-muted)">
                    day {d}
                  </text>
                ))}
                <path d={idealPath} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 4"/>
                <path d={actualPath} fill="none" stroke="var(--accent)" strokeWidth="2"/>
                {/* today marker */}
                <line x1={xAt(today)} x2={xAt(today)} y1={pad.t} y2={h - pad.b} stroke="var(--accent)" strokeOpacity="0.3" strokeDasharray="3 4"/>
                <text x={xAt(today)} y={pad.t - 2} fontSize="10" textAnchor="middle" fill="var(--accent)">today</text>
                <circle cx={xAt(today)} cy={yAt(actual[actual.length - 1])} r="3.5" fill="var(--accent)"/>
              </svg>
            </section>

            <section className="devw3-panel">
              <div className="devw3-panel-h">Composition</div>
              <div className="devw3-sp-comp">
                {[
                  { label: 'Tasks',  arr: tasks,  tone: 'task' },
                  { label: 'Bugs',   arr: bugs,   tone: 'bug' },
                  { label: 'Issues', arr: issues, tone: 'issue' },
                ].map(g => (
                  <div key={g.label} className="devw3-sp-comp-row">
                    <div className="devw3-sp-comp-h">
                      <span className="devw3-pill" data-tone={g.tone}>{g.label}</span>
                      <b>{g.arr.length}</b>
                    </div>
                    <ul className="devw3-sp-comp-list">
                      {g.arr.slice(0, 4).map(w => (
                        <li key={w.id}>
                          <span className="v1-mono devw3-sp-id">{w.id}</span>
                          <span className="devw3-sp-title">{w.title}</span>
                          <span className="v1-mono devw3-sp-attach">{w.attached.level}:{w.attached.ref.split('/').pop()}</span>
                        </li>
                      ))}
                      {g.arr.length === 0 && <li className="v1-mute">none</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="devw3-panel">
            <div className="devw3-panel-h">All items in {cur.name}</div>
            <table className="devw3-sp-tbl">
              <thead><tr><th>ID</th><th>Title</th><th>Kind</th><th>Status</th><th>Attached</th><th>Owner</th></tr></thead>
              <tbody>
                {items.map(w => (
                  <tr key={w.id}>
                    <td className="v1-mono">{w.id}</td>
                    <td>{w.title}</td>
                    <td><span className="devw3-pill" data-tone={w.kind}>{w.kind}</span></td>
                    <td><span className="v1-mono">{w.status}</span></td>
                    <td className="v1-mono">{w.attached.level} · {w.attached.ref}</td>
                    <td className="v1-mono">{w.owner}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan="6" className="v1-mute" style={{padding:14}}>No items in this sprint.</td></tr>}
              </tbody>
            </table>
          </section>
        </>)}
      </div>
    );
  };

  window.DevWave3 = { ProductsListPage, ProductDetailPage, SprintPage };
})();
