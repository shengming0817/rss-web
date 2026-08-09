/* global React */
// Fleshed-out implementations of the three "Reserved" capabilities
// (Observability, Billing, Secrets vault). Status is still pre-GA — they
// render a `preview` chip in the header — but the surface is real, with the
// data shape that maps to the contracts sketched in dev-shell's RESERVED_DOCS.

(() => {
  const { useState, useMemo } = React;

  // ---------- tiny shared helpers ----------
  const Spark = ({ data, w = 110, h = 32, accent = 'var(--fg-muted)', fill }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const area = `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`;
    const line = `M ${pts.join(' L ')}`;
    return (
      <svg width={w} height={h} className="devr-spark">
        {fill && <path d={area} fill={fill} opacity="0.18"/>}
        <path d={line} fill="none" stroke={accent} strokeWidth="1.3"/>
      </svg>
    );
  };

  const KpiCard = ({ label, value, unit, trend, data, accent }) => (
    <div className="devr-kpi">
      <div className="devr-kpi-label">{label}</div>
      <div className="devr-kpi-row">
        <div>
          <div className="devr-kpi-value">
            <span className="v1-mono">{value}</span>
            {unit && <span className="devr-kpi-unit"> {unit}</span>}
          </div>
          {trend && (
            <div className="devr-kpi-trend" data-dir={trend.dir}>
              {trend.dir === 'up' ? '▲' : trend.dir === 'down' ? '▼' : '◆'} {trend.label}
            </div>
          )}
        </div>
        {data && <Spark data={data} accent={accent} fill={accent}/>}
      </div>
    </div>
  );

  const PageHeader = ({ title, summary, actions }) => (
    <div className="dev-backlog-head">
      <div>
        <h1 className="v1-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {title}
          <span className="devs-badge devs-preview">preview</span>
        </h1>
        <p className="v1-sub" style={{ maxWidth: 760 }}>{summary}</p>
      </div>
      {actions && <div className="v1-head-actions">{actions}</div>}
    </div>
  );

  // ============================================================
  // 1. Observability
  // ============================================================
  const TRACES = [
    { id: '7f3a…b201', route: 'POST /v1/auth/verify',     cell: 'accesscore',  d: 142, status: 'ok',   spans: 9,  who: 'gateway → accesscore → auditcore' },
    { id: '7f3a…ab15', route: 'GET  /v1/config/flags',    cell: 'configcore',  d: 38,  status: 'ok',   spans: 4,  who: 'gateway → configcore' },
    { id: '7f3a…c044', route: 'POST /v1/audit/append',    cell: 'auditcore',   d: 71,  status: 'ok',   spans: 6,  who: 'accesscore → auditcore' },
    { id: '7f3a…d8e1', route: 'POST /v1/auth/verify',     cell: 'accesscore',  d: 1224,status: 'slow', spans: 11, who: 'gateway → accesscore → auditcore (jwks miss)' },
    { id: '7f3a…ff02', route: 'POST /v1/config/publish',  cell: 'configcore',  d: 286, status: 'ok',   spans: 8,  who: 'admin → configcore → auditcore' },
    { id: '7f3a…1190', route: 'POST /v1/audit/append',    cell: 'auditcore',   d: 9,   status: 'err',  spans: 3,  who: 'configcore → auditcore (pgx ECONNRESET)' },
    { id: '7f3a…2271', route: 'GET  /v1/sso/callback',    cell: 'accesscore',  d: 318, status: 'ok',   spans: 12, who: 'okta → gateway → accesscore' },
  ];

  const ANOMALIES = [
    { t: '12m ago', cell: 'accesscore',  what: 'p95 latency 4× baseline',  detail: 'jwks fetch from upstream Okta — circuit half-open', sev: 'warn' },
    { t: '38m ago', cell: 'auditcore',   what: 'error rate +0.4%',         detail: 'pgx pool churn after deploy v0.3.2',                 sev: 'warn' },
    { t: '2h ago',  cell: 'configcore',  what: 'metric flap',              detail: 'flag.evaluate qps oscillating 80→1.2k/s for 9 min',  sev: 'info' },
    { t: '5h ago',  cell: 'gateway',     what: 'span drop rate +12%',      detail: 'OTLP exporter timeouts to tempo:4317',               sev: 'warn' },
    { t: '1d ago',  cell: 'accesscore',  what: 'novel error fingerprint',  detail: '"jose: unsupported alg ES512" — 14 occurrences',     sev: 'info' },
  ];

  const CELL_SLO = [
    { cell: 'accesscore',  qps: 1820, p50: 8,  p95: 142, p99: 318, err: '0.04%', sat: 0.41, slo: 99.95, status: 'ok' },
    { cell: 'auditcore',   qps: 940,  p50: 6,  p95: 71,  p99: 240, err: '0.41%', sat: 0.62, slo: 99.7,  status: 'warn' },
    { cell: 'configcore',  qps: 320,  p50: 4,  p95: 38,  p99: 92,  err: '0.00%', sat: 0.18, slo: 99.99, status: 'ok' },
    { cell: 'observecore', qps: 12100,p50: 1,  p95: 8,   p99: 21,  err: '0.00%', sat: 0.34, slo: 99.99, status: 'ok' },
    { cell: 'gateway',     qps: 4310, p50: 11, p95: 96,  p99: 412, err: '0.12%', sat: 0.54, slo: 99.9,  status: 'ok' },
  ];

  const EXPORTERS = [
    { id: 'otlp-tempo',  kind: 'trace',  target: 'tempo:4317',           rate: '21k spans/s', drop: '0.0%',  state: 'healthy' },
    { id: 'otlp-loki',   kind: 'log',    target: 'loki:3100',            rate: '8.2k logs/s', drop: '0.0%',  state: 'healthy' },
    { id: 'prom-fed',    kind: 'metric', target: 'prom-fed:9090/federate',rate: '1820 srs/s', drop: '0.0%',  state: 'healthy' },
    { id: 'otlp-stage',  kind: 'trace',  target: 'tempo-stage:4317',     rate: '— (paused)',  drop: '—',    state: 'paused' },
    { id: 'audit-anom',  kind: 'event',  target: 'auditcore.audit.append', rate: '12 ev/min', drop: '0.0%',  state: 'healthy' },
  ];

  const ObservabilityPage = () => {
    const [range, setRange] = useState('1h');
    const sparkErr = [4,5,4,6,5,7,9,11,8,7,9,8,7,9,12,10];
    const sparkLat = [120,118,122,130,128,126,134,131,142,138,140,145,142,138,140,142];
    const sparkQps = [1200,1300,1280,1340,1410,1380,1420,1500,1620,1700,1680,1720,1810,1790,1820,1830];
    const sparkSat = [0.31,0.32,0.30,0.33,0.34,0.36,0.40,0.41,0.42,0.41,0.43,0.42,0.41,0.42,0.41,0.41];

    return (
      <div className="dev-backlog" style={{ overflow: 'auto' }}>
        <PageHeader
          title="Observability"
          summary="Trace + metric + log pipeline for every cell. Anomalies stream into the audit log via the existing audit.append contract."
          actions={
            <>
              <div className="v1-seg">
                {['15m','1h','6h','24h','7d'].map(r => (
                  <button key={r} data-active={range===r || undefined} onClick={() => setRange(r)}>{r}</button>
                ))}
              </div>
              <button className="v1-btn">Export view</button>
            </>
          }
        />

        <div style={{ padding: '0 32px 24px' }}>
          <div className="devr-kpis">
            <KpiCard label="Request rate" value="1.82k" unit="req/s"
                     trend={{ dir: 'up', label: '+8.4% vs 1h' }}
                     data={sparkQps} accent="var(--fg-muted)"/>
            <KpiCard label="p95 latency (accesscore)" value="142" unit="ms"
                     trend={{ dir: 'up', label: '+12 ms vs 1h' }}
                     data={sparkLat} accent="oklch(0.65 0.16 80)"/>
            <KpiCard label="Error rate" value="0.21" unit="%"
                     trend={{ dir: 'up', label: '+0.04% vs 1h' }}
                     data={sparkErr} accent="oklch(0.62 0.18 25)"/>
            <KpiCard label="Saturation (audit pool)" value="0.62" unit=""
                     trend={{ dir: 'flat', label: 'stable' }}
                     data={sparkSat} accent="var(--fg-muted)"/>
          </div>
        </div>

        <div className="devr-grid">
          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              SLO by cell
              <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{CELL_SLO.length} cells</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }}>Per-slice →</button>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Cell</th><th style={{textAlign:'right'}}>QPS</th>
                <th style={{textAlign:'right'}}>p50</th>
                <th style={{textAlign:'right'}}>p95</th>
                <th style={{textAlign:'right'}}>p99</th>
                <th style={{textAlign:'right'}}>Err</th>
                <th>Saturation</th>
                <th style={{textAlign:'right'}}>SLO</th>
              </tr></thead>
              <tbody>
                {CELL_SLO.map(c => (
                  <tr key={c.cell}>
                    <td>
                      <span className={`devr-dot devr-dot-${c.status}`}/>
                      <span className="v1-mono" style={{ marginLeft: 8 }}>{c.cell}</span>
                    </td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.qps}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.p50}ms</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.p95}ms</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.p99}ms</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.err}</td>
                    <td>
                      <div className="devr-bar">
                        <div className="devr-bar-fill" style={{ width: (c.sat*100)+'%' }}/>
                      </div>
                    </td>
                    <td style={{textAlign:'right'}} className="v1-mono">{c.slo}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">
              Anomalies <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{ANOMALIES.length}</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }}>Audit log →</button>
            </div>
            <ul className="devr-anom">
              {ANOMALIES.map((a, i) => (
                <li key={i} data-sev={a.sev}>
                  <span className="devr-anom-sev"/>
                  <div className="devr-anom-body">
                    <div className="devr-anom-head">
                      <span className="v1-mono">{a.cell}</span>
                      <span>{a.what}</span>
                      <span className="v1-mono v1-mute" style={{ marginLeft: 'auto' }}>{a.t}</span>
                    </div>
                    <div className="v1-mute" style={{ fontSize: 12 }}>{a.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              Recent traces
              <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>21k spans/s ingested</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }}>Tempo →</button>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Trace ID</th><th>Route</th><th>Root cell</th>
                <th style={{textAlign:'right'}}>Duration</th>
                <th style={{textAlign:'right'}}>Spans</th>
                <th>Status</th>
                <th>Span chain</th>
              </tr></thead>
              <tbody>
                {TRACES.map(t => (
                  <tr key={t.id}>
                    <td className="v1-mono" style={{ fontSize: 12 }}>{t.id}</td>
                    <td className="v1-mono" style={{ fontSize: 12 }}>{t.route}</td>
                    <td className="v1-mono">{t.cell}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{t.d}ms</td>
                    <td style={{textAlign:'right'}} className="v1-mono">{t.spans}</td>
                    <td><span className={`devr-trace-st devr-trace-${t.status}`}>{t.status}</span></td>
                    <td className="v1-mute" style={{ fontSize: 12 }}>{t.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">Exporters</div>
            <ul className="devr-exp">
              {EXPORTERS.map(e => (
                <li key={e.id}>
                  <span className={`devr-dot devr-dot-${e.state === 'healthy' ? 'ok' : 'idle'}`}/>
                  <div className="devr-exp-body">
                    <div className="devr-exp-head">
                      <span className="v1-mono">{e.id}</span>
                      <span className="v1-chip" style={{ fontSize: 10 }}>{e.kind}</span>
                    </div>
                    <div className="v1-mono v1-mute" style={{ fontSize: 11.5 }}>{e.target}</div>
                    <div className="devr-exp-foot">
                      <span className="v1-mono">{e.rate}</span>
                      <span className="v1-mute v1-mono">drop {e.drop}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="devr-note">
          <span className="v1-mono">Reserved · preview</span> · Implementation lives in
          <span className="v1-mono"> cells/observecore</span> (3 slices). Contracts <span className="v1-mono">trace.span</span>,
          <span className="v1-mono"> metric.emit</span>, <span className="v1-mono">anomaly.publish</span> are at L3.
          OTLP federation to external tempo/loki is opt-in per tenant — toggle from <span className="v1-mono">Operate / Configuration</span>.
        </div>
      </div>
    );
  };

  // ============================================================
  // 2. Billing
  // ============================================================
  const TENANTS = [
    { id: 'acme',      name: 'Acme Robotics',   plan: 'Scale',     mrr: 4800,  usage: 0.84, calls: '1.42M', overage: 240,  status: 'active' },
    { id: 'northwind', name: 'Northwind Trade', plan: 'Scale',     mrr: 4800,  usage: 0.51, calls: '0.86M', overage: 0,    status: 'active' },
    { id: 'globex',    name: 'Globex Energy',   plan: 'Enterprise',mrr: 12000, usage: 0.62, calls: '3.10M', overage: 0,    status: 'active' },
    { id: 'initech',   name: 'Initech',         plan: 'Team',      mrr: 1200,  usage: 0.94, calls: '0.31M', overage: 120,  status: 'overage' },
    { id: 'umbrella',  name: 'Umbrella Co',     plan: 'Team',      mrr: 1200,  usage: 0.21, calls: '0.07M', overage: 0,    status: 'active' },
    { id: 'wayne',     name: 'Wayne Industries',plan: 'Enterprise',mrr: 12000, usage: 0.38, calls: '1.91M', overage: 0,    status: 'active' },
    { id: 'stark',     name: 'Stark Labs',      plan: 'Trial',     mrr: 0,     usage: 0.12, calls: '0.02M', overage: 0,    status: 'trial' },
    { id: 'piedpiper', name: 'Pied Piper',      plan: 'Team',      mrr: 1200,  usage: 0.62, calls: '0.19M', overage: 0,    status: 'active' },
  ];

  const INVOICES = [
    { id: 'INV-2026-0418', tenant: 'globex',    period: '2026-04', amount: 12000, status: 'paid',    issued: '2026-05-01' },
    { id: 'INV-2026-0417', tenant: 'acme',      period: '2026-04', amount: 5040,  status: 'paid',    issued: '2026-05-01' },
    { id: 'INV-2026-0416', tenant: 'wayne',     period: '2026-04', amount: 12000, status: 'paid',    issued: '2026-05-01' },
    { id: 'INV-2026-0415', tenant: 'northwind', period: '2026-04', amount: 4800,  status: 'paid',    issued: '2026-05-01' },
    { id: 'INV-2026-0414', tenant: 'initech',   period: '2026-04', amount: 1320,  status: 'open',    issued: '2026-05-01' },
    { id: 'INV-2026-0413', tenant: 'piedpiper', period: '2026-04', amount: 1200,  status: 'paid',    issued: '2026-05-01' },
    { id: 'INV-2026-0412', tenant: 'umbrella',  period: '2026-04', amount: 1200,  status: 'overdue', issued: '2026-05-01' },
  ];

  const METERS = [
    { id: 'api.calls',         unit: 'request',  emitted: '4.2M / day', source: 'gateway',     state: 'live' },
    { id: 'compute.cell.hour', unit: 'cell-hr',  emitted: '12.4k / day',source: 'cellrt',      state: 'live' },
    { id: 'storage.audit.gb',  unit: 'GB-month', emitted: '128 GB',     source: 'auditcore',   state: 'live' },
    { id: 'storage.trace.gb',  unit: 'GB-month', emitted: '42 GB',      source: 'observecore', state: 'live' },
    { id: 'egress.bytes',      unit: 'GB',       emitted: '8.9 GB / day',source: 'gateway',    state: 'live' },
    { id: 'ai.tokens',         unit: 'token',    emitted: '24.1M / day',source: 'ai-studio',   state: 'live' },
  ];

  const PLAN_DIST = [
    { plan: 'Trial',      count: 14, mrr: 0 },
    { plan: 'Team',       count: 38, mrr: 45600 },
    { plan: 'Scale',      count: 21, mrr: 100800 },
    { plan: 'Enterprise', count: 7,  mrr: 84000 },
  ];

  const BillingPage = () => {
    const totalMrr = PLAN_DIST.reduce((s, p) => s + p.mrr, 0);
    const maxCount = Math.max(...PLAN_DIST.map(p => p.count));

    return (
      <div className="dev-backlog">
        <PageHeader
          title="Billing"
          summary="Usage metering + tenant invoicing. Meters drain into the meter cell every minute; invoices are drafted on period close and synced to Stripe through the L4 billing.charge contract."
          actions={
            <>
              <button className="v1-btn">Export CSV</button>
              <button className="v1-btn v1-btn-primary">Run invoice draft</button>
            </>
          }
        />

        <div style={{ padding: '0 32px 24px' }}>
          <div className="devr-kpis">
            <KpiCard label="MRR" value={'$' + (totalMrr/1000).toFixed(1) + 'k'} unit=""
                     trend={{ dir: 'up', label: '+$8.4k vs last month' }}
                     data={[180,185,192,198,205,212,218,224,228,230]} accent="oklch(0.55 0.16 150)"/>
            <KpiCard label="Active tenants" value="80" unit=""
                     trend={{ dir: 'up', label: '+6 this month' }}
                     data={[68,70,71,72,74,76,78,79,80,80]} accent="var(--fg-muted)"/>
            <KpiCard label="Overage MRR" value="$360" unit=""
                     trend={{ dir: 'up', label: '+$120 vs last' }}
                     data={[210,220,210,230,240,260,290,310,340,360]} accent="oklch(0.65 0.16 80)"/>
            <KpiCard label="Open invoices" value="2" unit=""
                     trend={{ dir: 'flat', label: '1 overdue' }}
                     data={[3,2,4,3,2,3,2,3,2,2]} accent="var(--fg-muted)"/>
          </div>
        </div>

        <div className="devr-grid">
          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              Top tenants by usage
              <button className="v1-link" style={{ marginLeft: 'auto' }}>All tenants →</button>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Tenant</th><th>Plan</th>
                <th>Usage of quota</th>
                <th style={{textAlign:'right'}}>API calls</th>
                <th style={{textAlign:'right'}}>MRR</th>
                <th style={{textAlign:'right'}}>Overage</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {TENANTS.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="v1-mono" style={{ fontWeight: 500 }}>{t.id}</div>
                      <div className="v1-mute" style={{ fontSize: 11 }}>{t.name}</div>
                    </td>
                    <td><span className={`devr-plan devr-plan-${t.plan.toLowerCase()}`}>{t.plan}</span></td>
                    <td style={{ width: 200 }}>
                      <div className="devr-bar">
                        <div className="devr-bar-fill" data-warn={t.usage >= 0.9 || undefined}
                             style={{ width: (t.usage*100)+'%' }}/>
                      </div>
                      <div className="v1-mono v1-mute" style={{ fontSize: 11, marginTop: 2 }}>
                        {(t.usage*100).toFixed(0)}%
                      </div>
                    </td>
                    <td style={{textAlign:'right'}} className="v1-mono">{t.calls}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">${t.mrr.toLocaleString()}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">
                      {t.overage ? <span style={{ color: 'oklch(0.55 0.18 25)' }}>${t.overage}</span> : '—'}
                    </td>
                    <td><span className={`devr-tenant-st devr-tenant-${t.status}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">Plans</div>
            <ul className="devr-plan-list">
              {PLAN_DIST.map(p => (
                <li key={p.plan}>
                  <div className="devr-plan-row">
                    <span className={`devr-plan devr-plan-${p.plan.toLowerCase()}`}>{p.plan}</span>
                    <span className="v1-mono" style={{ marginLeft: 'auto' }}>{p.count}</span>
                  </div>
                  <div className="devr-bar" style={{ marginTop: 8 }}>
                    <div className="devr-bar-fill" style={{ width: ((p.count/maxCount)*100)+'%' }}/>
                  </div>
                  <div className="v1-mono v1-mute" style={{ fontSize: 11, marginTop: 4 }}>
                    ${(p.mrr/1000).toFixed(1)}k MRR
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              Recent invoices <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{INVOICES.length}</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }}>Stripe sync →</button>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Invoice</th><th>Tenant</th><th>Period</th>
                <th style={{textAlign:'right'}}>Amount</th>
                <th>Status</th><th>Issued</th>
              </tr></thead>
              <tbody>
                {INVOICES.map(i => (
                  <tr key={i.id}>
                    <td className="v1-mono">{i.id}</td>
                    <td className="v1-mono">{i.tenant}</td>
                    <td className="v1-mono">{i.period}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">${i.amount.toLocaleString()}</td>
                    <td><span className={`devr-inv-st devr-inv-${i.status}`}>{i.status}</span></td>
                    <td className="v1-mono v1-mute">{i.issued}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">Meters</div>
            <ul className="devr-meter">
              {METERS.map(m => (
                <li key={m.id}>
                  <span className="devr-dot devr-dot-ok"/>
                  <div className="devr-meter-body">
                    <div className="devr-meter-head">
                      <span className="v1-mono">{m.id}</span>
                      <span className="v1-chip" style={{ fontSize: 10 }}>{m.unit}</span>
                    </div>
                    <div className="devr-meter-foot">
                      <span className="v1-mono">{m.emitted}</span>
                      <span className="v1-mute v1-mono">via {m.source}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="devr-note">
          <span className="v1-mono">Reserved · preview</span> · Meter cell aggregates per tenant per period
          and writes to <span className="v1-mono">billing.invoice.draft</span> on close. Stripe sync runs through
          the L4 <span className="v1-mono">billing.charge</span> contract — currently <b>off in prod</b>; drafts
          stay local until a finance reviewer presses Send.
        </div>
      </div>
    );
  };

  // ============================================================
  // 3. Secrets vault
  // ============================================================
  const SECRETS = [
    { id: 'access.oidc.okta.client_secret', cell: 'accesscore',  backend: 'vault',     rotated: '8d',  expires: '22d', readers: 2, writers: 1, status: 'ok' },
    { id: 'access.jwks.signing_key',         cell: 'accesscore', backend: 'vault',     rotated: '3d',  expires: '27d', readers: 4, writers: 0, status: 'ok' },
    { id: 'audit.pg.dsn',                    cell: 'auditcore',  backend: 'aws-sm',    rotated: '14d', expires: '16d', readers: 3, writers: 0, status: 'ok' },
    { id: 'audit.merkle.signing_key',        cell: 'auditcore',  backend: 'vault',     rotated: '1d',  expires: '29d', readers: 1, writers: 0, status: 'ok' },
    { id: 'config.pg.dsn',                   cell: 'configcore', backend: 'aws-sm',    rotated: '12d', expires: '18d', readers: 5, writers: 1, status: 'ok' },
    { id: 'gateway.tls.cert',                cell: 'gateway',    backend: 'vault',     rotated: '21d', expires: '6d',  readers: 1, writers: 1, status: 'expiring' },
    { id: 'observe.otlp.token',              cell: 'observecore',backend: 'vault',     rotated: '45d', expires: '−2d', readers: 1, writers: 0, status: 'expired' },
    { id: 'ai.openai.api_key',               cell: 'ai-studio',  backend: 'vault',     rotated: '30d', expires: '0d',  readers: 6, writers: 1, status: 'expiring' },
    { id: 'billing.stripe.sk',               cell: 'billing',    backend: 'aws-sm',    rotated: '90d', expires: 'never',readers: 2, writers: 1, status: 'static' },
  ];

  const ROTATIONS = [
    { id: 'gateway.tls.cert',     when: 'in 6 days',  who: 'auto · cert-manager',   policy: '14d rotation' },
    { id: 'ai.openai.api_key',    when: 'today 23:00',who: 'auto · vault-rotator',  policy: '30d rotation' },
    { id: 'access.jwks.signing_key',when: 'in 4 days',who: 'auto · vault-rotator',  policy: '7d rotation' },
    { id: 'audit.pg.dsn',         when: 'in 2 days',  who: 'manual · @park',        policy: '14d rotation' },
    { id: 'access.oidc.okta.client_secret', when: 'in 22 days', who: 'auto · okta-webhook', policy: 'on okta event' },
  ];

  const BACKENDS = [
    { id: 'vault',   url: 'vault.internal:8200',           kind: 'HashiCorp Vault',    secrets: 6, state: 'healthy' },
    { id: 'aws-sm',  url: 'secretsmanager.us-east-1',      kind: 'AWS Secrets Manager', secrets: 3, state: 'healthy' },
    { id: 'gcp-sm',  url: 'secretmanager.googleapis.com',  kind: 'GCP Secret Manager',  secrets: 0, state: 'configured' },
    { id: 'file',    url: '/etc/gocell/secrets',           kind: 'File (dev only)',     secrets: 0, state: 'dev only' },
  ];

  const ACCESS_LOG = [
    { t: '2m ago',  who: 'cell:accesscore',   what: 'read',  key: 'access.jwks.signing_key',         source: '10.4.2.18' },
    { t: '4m ago',  who: 'cell:gateway',      what: 'read',  key: 'gateway.tls.cert',                source: '10.4.2.4'  },
    { t: '11m ago', who: 'cell:auditcore',    what: 'read',  key: 'audit.pg.dsn',                    source: '10.4.2.9'  },
    { t: '38m ago', who: '@park (cli)',       what: 'write', key: 'audit.pg.dsn',                    source: '203.0.113.4' },
    { t: '2h ago',  who: 'auto · rotator',    what: 'rotate',key: 'access.jwks.signing_key',         source: 'vault-rotator' },
    { t: '5h ago',  who: 'cell:ai-studio',    what: 'read',  key: 'ai.openai.api_key',               source: '10.4.2.21' },
    { t: '1d ago',  who: '@li.wei (web)',     what: 'reveal',key: 'billing.stripe.sk',               source: '198.51.100.7' },
  ];

  const SecretsPage = () => {
    const [scope, setScope] = useState('all');
    const filtered = SECRETS.filter(s => scope === 'all' || s.status === scope);
    const counts = {
      total: SECRETS.length,
      expiring: SECRETS.filter(s => s.status === 'expiring').length,
      expired: SECRETS.filter(s => s.status === 'expired').length,
      static: SECRETS.filter(s => s.status === 'static').length,
    };

    return (
      <div className="dev-backlog">
        <PageHeader
          title="Secrets vault"
          summary="Centralized secret storage + rotation. Slices call the gocell/secrets helper; the vault cell brokers reads, audits every access, and runs scheduled rotations through pluggable backends."
          actions={
            <>
              <button className="v1-btn">Open audit trail</button>
              <button className="v1-btn v1-btn-primary">+ New secret</button>
            </>
          }
        />

        <div style={{ padding: '0 32px 24px' }}>
          <div className="devr-kpis">
            <KpiCard label="Secrets under management" value={counts.total} unit=""
                     trend={{ dir: 'up', label: '+2 this week' }}
                     data={[6,6,6,7,7,7,8,8,9,9]} accent="var(--fg-muted)"/>
            <KpiCard label="Rotations / 7d" value="11" unit=""
                     trend={{ dir: 'up', label: '+3 vs last week' }}
                     data={[1,2,1,3,2,1,2,2,3,2]} accent="oklch(0.55 0.16 150)"/>
            <KpiCard label="Expiring ≤ 7d" value={counts.expiring} unit=""
                     trend={{ dir: 'up', label: 'attention' }}
                     data={[0,0,1,1,1,2,2,2,2,2]} accent="oklch(0.65 0.16 80)"/>
            <KpiCard label="Expired / leaked" value={counts.expired} unit=""
                     trend={{ dir: 'flat', label: 'all under audit' }}
                     data={[0,0,0,0,1,1,1,1,1,1]} accent="oklch(0.62 0.18 25)"/>
          </div>
        </div>

        <div className="devr-grid">
          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              Secrets
              <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{filtered.length}/{SECRETS.length}</span>
              <div className="v1-seg" style={{ marginLeft: 'auto' }}>
                {['all','ok','expiring','expired','static'].map(s => (
                  <button key={s} data-active={scope===s || undefined} onClick={() => setScope(s)}>{s}</button>
                ))}
              </div>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Key</th><th>Cell</th><th>Backend</th>
                <th style={{textAlign:'right'}}>Rotated</th>
                <th style={{textAlign:'right'}}>Expires</th>
                <th style={{textAlign:'right'}}>R / W</th>
                <th>Status</th>
                <th style={{textAlign:'right'}}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td className="v1-mono" style={{ fontSize: 12 }}>{s.id}</td>
                    <td className="v1-mono">{s.cell}</td>
                    <td><span className="v1-chip" style={{ fontSize: 10.5 }}>{s.backend}</span></td>
                    <td style={{textAlign:'right'}} className="v1-mono v1-mute">{s.rotated}</td>
                    <td style={{textAlign:'right'}} className="v1-mono">
                      <span data-warn={s.status === 'expiring' || undefined}
                            data-err={s.status === 'expired' || undefined}
                            className="devr-expires">
                        {s.expires}
                      </span>
                    </td>
                    <td style={{textAlign:'right'}} className="v1-mono v1-mute">{s.readers} / {s.writers}</td>
                    <td><span className={`devr-sec-st devr-sec-${s.status}`}>{s.status}</span></td>
                    <td style={{textAlign:'right'}}>
                      <button className="v1-link" style={{ fontSize: 11 }}>rotate</button>
                      <span className="v1-mute"> · </span>
                      <button className="v1-link" style={{ fontSize: 11 }}>reveal</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">
              Rotation queue
              <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>{ROTATIONS.length}</span>
            </div>
            <ul className="devr-rot">
              {ROTATIONS.map((r, i) => (
                <li key={i}>
                  <div className="devr-rot-when v1-mono">{r.when}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="v1-mono" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id}</div>
                    <div className="v1-mute" style={{ fontSize: 11 }}>{r.who} · {r.policy}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="devcell-card">
            <div className="devcell-card-h">Backend adapters</div>
            <ul className="devr-be">
              {BACKENDS.map(b => (
                <li key={b.id}>
                  <span className={`devr-dot devr-dot-${b.state === 'healthy' ? 'ok' : 'idle'}`}/>
                  <div className="devr-be-body">
                    <div className="devr-be-head">
                      <span className="v1-mono">{b.id}</span>
                      <span className="v1-mute" style={{ fontSize: 11 }}>{b.kind}</span>
                    </div>
                    <div className="v1-mono v1-mute" style={{ fontSize: 11.5 }}>{b.url}</div>
                    <div className="devr-be-foot">
                      <span className="v1-mono">{b.secrets} secrets</span>
                      <span className="v1-mute v1-mono">{b.state}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="devcell-card devr-span-2">
            <div className="devcell-card-h">
              Access log <span className="v1-mute v1-mono" style={{ marginLeft: 8 }}>last 24h · 4.2k events</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }}>Operate / Audit →</button>
            </div>
            <table className="devg-table devcell-tbl">
              <thead><tr>
                <th>Time</th><th>Who</th><th>Op</th><th>Key</th><th>Source IP</th>
              </tr></thead>
              <tbody>
                {ACCESS_LOG.map((a, i) => (
                  <tr key={i}>
                    <td className="v1-mono v1-mute">{a.t}</td>
                    <td className="v1-mono">{a.who}</td>
                    <td><span className={`devr-op devr-op-${a.what}`}>{a.what}</span></td>
                    <td className="v1-mono" style={{ fontSize: 12 }}>{a.key}</td>
                    <td className="v1-mono v1-mute">{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="devr-note">
          <span className="v1-mono">Reserved · preview</span> · Slices use the
          <span className="v1-mono"> gocell/secrets </span> helper —
          <span className="v1-mono"> Get(ctx, key) </span> +
          <span className="v1-mono"> Watch(ctx, key) </span> with TTL cache. Every read/write/rotate is hashed
          into the audit chain via <span className="v1-mono">audit.append</span>. Backends are pluggable; the
          file adapter is dev-only and refuses to start with <span className="v1-mono">GO_ENV=prod</span>.
        </div>
      </div>
    );
  };

  window.DevReserved = { ObservabilityPage, BillingPage, SecretsPage };
})();
