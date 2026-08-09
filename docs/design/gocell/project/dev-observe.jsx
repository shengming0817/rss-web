/* global React */
// ============================================================
// Observability v2 — overrides window.DevReserved.ObservabilityPage
// Six tabs: Overview / Anomalies / What changed / Traces / Service / Slice health
// ============================================================

(() => {
  const { useState, useMemo } = React;

  // ----------- shared atoms -----------
  const Spark = ({ data, w = 110, h = 28, accent = 'var(--fg-muted)', fill, dots, marks }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return [x, y];
    });
    const lineD = 'M ' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ');
    const areaD = `M 0,${h} L ${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ')} L ${w},${h} Z`;
    return (
      <svg width={w} height={h} className="dvo-spark">
        {fill && <path d={areaD} fill={fill} opacity="0.14"/>}
        <path d={lineD} fill="none" stroke={accent} strokeWidth="1.4"/>
        {(marks || []).map((m, i) => (
          <line key={i} x1={(m / (data.length - 1)) * w} x2={(m / (data.length - 1)) * w}
                y1="0" y2={h} stroke="oklch(0.55 0.15 250)" strokeWidth="1" opacity="0.5"/>
        ))}
        {dots && pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="1.4" fill={accent}/>
        ))}
      </svg>
    );
  };

  const Tab = ({ id, label, count, active, onClick, pulse }) => (
    <button className="dvo-tab" data-active={active || undefined} data-pulse={pulse || undefined}
            onClick={() => onClick(id)}>
      {pulse && <span className="dvo-tab-dot"/>}
      <span>{label}</span>
      {count != null && <span className="dvo-tab-count">{count}</span>}
    </button>
  );

  // ============================================================
  // DATA — all mock, but structured to mirror the contracts
  // gocell would actually emit (trace.span, metric.emit, anomaly.publish).
  // ============================================================
  const TIME_LABELS = ['−24h','−18h','−12h','−6h','now'];
  const RANGES = ['15m','1h','6h','24h','7d'];

  const KPIS = [
    { k: 'qps',   label: 'Request rate',          v: '1.82k', u: 'rps',  sub: 'Δ +8.4% vs 1h',  trend: [1200,1300,1280,1340,1410,1380,1420,1500,1620,1700,1680,1720,1810,1790,1820,1830] },
    { k: 'p95',   label: 'p95 latency · global',  v: '142',   u: 'ms',   sub: 'Δ +12 ms vs 1h', trend: [120,118,122,130,128,126,134,131,142,138,140,145,142,138,140,142] },
    { k: 'err',   label: 'Error rate',            v: '0.21',  u: '%',    sub: 'Δ +0.04% vs 1h', trend: [4,5,4,6,5,7,9,11,8,7,9,8,7,9,12,10] },
    { k: 'burn',  label: 'SLO budget burn (24h)', v: '1.6×',  u: '',     sub: '14d budget @ 99.9 → 9d left', trend: [0.6,0.7,0.8,0.9,1.0,1.1,1.3,1.4,1.6,1.7,1.6,1.5,1.6,1.7,1.6,1.6] },
  ];

  // contract-level SLO table — the unit that matters in gocell.
  const CONTRACTS = [
    { id: 'access.auth.verify',     cell: 'accesscore',  qps: 1820, p95: 142, p99: 318, err: 0.04, slo: 99.95, budget: 0.42, burn1h: 1.6, burn6h: 1.1, st: 'warn' },
    { id: 'access.sso.callback',    cell: 'accesscore',  qps: 90,   p95: 318, p99: 612, err: 0.00, slo: 99.9,  budget: 0.88, burn1h: 0.3, burn6h: 0.4, st: 'ok' },
    { id: 'audit.append',           cell: 'auditcore',   qps: 940,  p95: 71,  p99: 240, err: 0.41, slo: 99.9,  budget: 0.18, burn1h: 4.1, burn6h: 2.6, st: 'err' },
    { id: 'audit.query',            cell: 'auditcore',   qps: 12,   p95: 220, p99: 540, err: 0.00, slo: 99.5,  budget: 0.99, burn1h: 0.0, burn6h: 0.1, st: 'ok' },
    { id: 'config.flag.evaluate',   cell: 'configcore',  qps: 320,  p95: 38,  p99: 92,  err: 0.00, slo: 99.99, budget: 0.93, burn1h: 0.2, burn6h: 0.3, st: 'ok' },
    { id: 'config.publish',         cell: 'configcore',  qps: 4,    p95: 286, p99: 410, err: 0.00, slo: 99.5,  budget: 0.95, burn1h: 0.0, burn6h: 0.1, st: 'ok' },
    { id: 'observe.metric.emit',    cell: 'observecore', qps: 12100,p95: 8,   p99: 21,  err: 0.00, slo: 99.99, budget: 0.97, burn1h: 0.1, burn6h: 0.1, st: 'ok' },
    { id: 'observe.trace.span',     cell: 'observecore', qps: 21000,p95: 4,   p99: 11,  err: 0.00, slo: 99.99, budget: 0.98, burn1h: 0.0, burn6h: 0.1, st: 'ok' },
    { id: 'gateway.http.route',     cell: 'gateway',     qps: 4310, p95: 96,  p99: 412, err: 0.12, slo: 99.95, budget: 0.62, burn1h: 0.9, burn6h: 0.8, st: 'ok' },
  ];

  const INCIDENTS = [
    { id: 'inc-204', sev: 'err',  state: 'open',
      title: 'audit.append error rate exceeds SLO budget burn',
      contract: 'audit.append', cell: 'auditcore',
      opened: '12m ago', owner: 'auditcore-team',
      affected: '4 tenants · 1.2% of req',
      detail: 'pgx pool churn after slice merge. ECONNRESET on 0.41% of writes; burn rate 4.1× over the 1h window.',
      sparkErr: [0.05,0.04,0.05,0.06,0.07,0.10,0.12,0.18,0.22,0.28,0.34,0.41,0.42,0.40,0.39,0.41],
      suspects: [
        { score: 0.78, name: 'auditcore/persist@a7f3', sev: 'hot',  why: 'merged 14m before incident · touches pgx pool config · contract audit.append L2' },
        { score: 0.34, name: 'configcore/db-pool@9c11', sev: 'warm', why: 'rolled out shared pgx settings via config.publish · same backend tenant' },
        { score: 0.12, name: 'observecore/exporter@4b80', sev: '',  why: 'unrelated cell but shares OTLP buffer — keep on suspect list' },
      ],
      changes: [
        { t: '−14m', k: 'deploy',  label: 'slice auditcore/persist@a7f3', susp: true },
        { t: '−42m', k: 'flag',    label: 'flag.audit.batch on → 100% rollout' },
        { t: '−2h',  k: 'config',  label: 'config.publish v0.3.2 — pgx_pool_size 20→32' },
      ],
      actions: ['Ack', 'Snooze 1h', 'Open AI sandbox (seeded)', 'Roll back slice', 'Kill flag.audit.batch']
    },
    { id: 'inc-203', sev: 'warn', state: 'ack',
      title: 'access.auth.verify p95 4× baseline',
      contract: 'access.auth.verify', cell: 'accesscore', opened: '38m ago', owner: 'access-team',
      affected: '— (synthetic SLO only)',
      detail: 'JWKS fetch from upstream Okta timing out. Circuit breaker half-open. 0.4% of verifies still served from stale cache.',
      sparkErr: [0.04,0.04,0.04,0.04,0.05,0.06,0.05,0.06,0.07,0.06,0.05,0.05,0.06,0.05,0.05,0.05],
      suspects: [
        { score: 0.42, name: 'accesscore/jwks-cache@e201', sev: 'warm', why: 'merged 6h ago · changed cache TTL 5m → 30s' },
      ],
      changes: [
        { t: '−6h',  k: 'deploy',  label: 'slice accesscore/jwks-cache@e201', susp: true },
        { t: '−40m', k: 'traffic', label: 'Okta upstream latency p95 1.2s → 4.1s' },
      ],
      actions: ['Open AI sandbox (seeded)', 'Revert TTL via flag', 'Close incident']
    },
    { id: 'inc-202', sev: 'warn', state: 'open',
      title: 'gateway span drop rate +12%',
      contract: 'observe.trace.span', cell: 'gateway', opened: '5h ago', owner: 'platform',
      affected: 'observability only — no end-user impact',
      detail: 'OTLP exporter timing out to tempo:4317 between 11:02 and 11:18. 12% of spans dropped; metrics still flowing.',
      sparkErr: [0.0,0.0,0.0,0.0,0.02,0.05,0.08,0.11,0.12,0.10,0.08,0.05,0.03,0.02,0.01,0.0],
      suspects: [
        { score: 0.61, name: 'observecore/tempo-batcher@e88a', sev: 'warm', why: 'merged 7h ago · changed batch flush 5s → 30s' },
      ],
      changes: [
        { t: '−7h', k: 'deploy', label: 'slice observecore/tempo-batcher@e88a', susp: true },
      ],
      actions: ['Open AI sandbox (seeded)', 'Roll back slice', 'Close incident']
    },
    { id: 'inc-201', sev: 'info', state: 'snoozed',
      title: 'configcore qps flap (80 → 1.2k/s)',
      contract: 'config.flag.evaluate', cell: 'configcore', opened: '2h ago', owner: 'platform',
      affected: '—',
      detail: 'Caller-side polling loop in gateway oscillating. Throughput within budget; investigate after current incident.',
      sparkErr: [0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],
      suspects: [],
      changes: [],
      actions: ['Resume', 'Close']
    },
    { id: 'inc-199', sev: 'info', state: 'closed',
      title: 'novel error fingerprint: jose unsupported alg ES512',
      contract: 'access.auth.verify', cell: 'accesscore', opened: '1d ago', owner: 'access-team',
      affected: '14 occurrences · 1 tenant',
      detail: 'Customer rolled their JWT signing alg to ES512; we only support ES256/RS256. Added clearer 400 in slice access/jwt-validate@2f1e.',
      sparkErr: [], suspects: [],
      changes: [{ t: 'fix', k: 'deploy', label: 'access/jwt-validate@2f1e' }],
      actions: ['Reopen', 'Postmortem draft']
    },
  ];

  // What-changed events for the timeline. x is 0..1 of last 24h.
  const TL_EVENTS = [
    { x: 0.06, k: 'deploy',  label: 'auditcore/cache-warm@8a1c'  },
    { x: 0.12, k: 'config',  label: 'config.publish v0.3.1'      },
    { x: 0.18, k: 'flag',    label: 'flag.exp.new-router → 5%'   },
    { x: 0.28, k: 'sandbox', label: 'AI sandbox merged sb-771'   },
    { x: 0.34, k: 'deploy',  label: 'observecore/tempo-batcher@e88a', susp: true },
    { x: 0.42, k: 'flag',    label: 'flag.exp.new-router → 25%'  },
    { x: 0.48, k: 'traffic', label: 'Okta upstream latency spike'},
    { x: 0.52, k: 'anomaly', label: 'access.auth.verify p95 ↑'   },
    { x: 0.61, k: 'config',  label: 'config.publish v0.3.2 (pgx 20→32)' },
    { x: 0.71, k: 'deploy',  label: 'configcore/db-pool@9c11'    },
    { x: 0.78, k: 'flag',    label: 'flag.audit.batch on → 100%' },
    { x: 0.86, k: 'deploy',  label: 'auditcore/persist@a7f3',    susp: true },
    { x: 0.92, k: 'anomaly', label: 'audit.append err ↑ → inc-204' },
    { x: 0.96, k: 'sandbox', label: 'sb-790 opened (auto-seeded by inc-204)' },
  ];
  const LANES = [
    { k: 'deploy',  label: 'Slice merges'  },
    { k: 'flag',    label: 'Flag flips'    },
    { k: 'config',  label: 'Config rollout'},
    { k: 'sandbox', label: 'AI sandbox'    },
    { k: 'traffic', label: 'Traffic / 3rd-party'},
    { k: 'anomaly', label: 'Anomalies'     },
  ];

  // Traces — aggregate buckets (endpoint × latency bucket grid)
  const TRACE_GROUPS = [
    { route: 'POST /v1/audit/append',    cell: 'auditcore',   n: 8421, p50: 6,   p95: 71,  p99: 240, err: 0.41 },
    { route: 'POST /v1/auth/verify',     cell: 'accesscore',  n: 6230, p50: 8,   p95: 142, p99: 318, err: 0.04 },
    { route: 'GET  /v1/config/flags',    cell: 'configcore',  n: 4180, p50: 4,   p95: 38,  p99: 92,  err: 0.00 },
    { route: 'GET  /v1/sso/callback',    cell: 'accesscore',  n: 92,   p50: 124, p95: 318, p99: 612, err: 0.00 },
    { route: 'POST /v1/config/publish',  cell: 'configcore',  n: 8,    p50: 198, p95: 286, p99: 410, err: 0.00 },
  ];

  // span waterfalls for diff (fast / slow). depth ↦ indent
  const SPAN_FAST = [
    { name: 'POST /v1/audit/append', slice: 'gateway/route@v0.3', start: 0,  dur: 12, depth: 0, flag: 'ok' },
    { name: 'auth.middleware',       slice: 'gateway/auth@2.1',   start: 1,  dur: 2,  depth: 1, flag: 'ok' },
    { name: 'audit.append.handle',   slice: 'auditcore/persist@8a1c', start: 3, dur: 8, depth: 1, flag: 'ok' },
    { name: 'pgx.exec',              slice: 'auditcore/persist@8a1c', start: 4, dur: 5, depth: 2, flag: 'ok' },
    { name: 'observe.span.emit',     slice: 'observecore/exporter@3.1', start: 9, dur: 1, depth: 2, flag: 'ok' },
  ];
  const SPAN_SLOW = [
    { name: 'POST /v1/audit/append', slice: 'gateway/route@v0.3',          start: 0,  dur: 142, depth: 0, flag: 'slow' },
    { name: 'auth.middleware',       slice: 'gateway/auth@2.1',            start: 1,  dur: 2,   depth: 1, flag: 'ok' },
    { name: 'audit.append.handle',   slice: 'auditcore/persist@a7f3',      start: 3,  dur: 136, depth: 1, flag: 'hot' },
    { name: 'pgx.acquire',           slice: 'auditcore/persist@a7f3',      start: 4,  dur: 118, depth: 2, flag: 'hot' },
    { name: 'pgx.exec',              slice: 'auditcore/persist@a7f3',      start: 122, dur: 14, depth: 2, flag: 'ok' },
    { name: 'observe.span.emit',     slice: 'observecore/exporter@3.1',    start: 138, dur: 4,  depth: 2, flag: 'ok' },
  ];

  // Service graph nodes + edges (positions tuned by hand)
  const NODES = [
    { id: 'gateway',     x: 90,  y: 230, rps: 4310, p95: 96,  err: 0.12, slo: 99.9,  status: 'ok'   },
    { id: 'accesscore',  x: 320, y: 120, rps: 1820, p95: 142, err: 0.04, slo: 99.95, status: 'warn' },
    { id: 'configcore',  x: 320, y: 230, rps: 320,  p95: 38,  err: 0.00, slo: 99.99, status: 'ok'   },
    { id: 'auditcore',   x: 560, y: 230, rps: 940,  p95: 71,  err: 0.41, slo: 99.9,  status: 'err'  },
    { id: 'observecore', x: 320, y: 350, rps: 33000,p95: 8,   err: 0.00, slo: 99.99, status: 'ok'   },
    { id: 'okta (3p)',   x: 540, y: 60,  rps: 90,   p95: 4100,err: 1.20, slo: '—',   status: 'warn', ext: true },
    { id: 'pg-primary',  x: 780, y: 230, rps: 1380, p95: 9,   err: 0.41, slo: 99.95, status: 'err',  ext: true },
    { id: 'tempo',       x: 540, y: 410, rps: 21000,p95: 2,   err: 0.00, slo: 99.9,  status: 'ok',   ext: true },
  ];
  const EDGES = [
    { from: 'gateway', to: 'accesscore',  rps: 1820,  status: 'warn' },
    { from: 'gateway', to: 'configcore',  rps: 320,   status: 'ok'   },
    { from: 'gateway', to: 'auditcore',   rps: 50,    status: 'err'  },
    { from: 'accesscore', to: 'okta (3p)', rps: 90,   status: 'warn' },
    { from: 'accesscore', to: 'auditcore', rps: 890,  status: 'err'  },
    { from: 'configcore', to: 'auditcore', rps: 8,    status: 'ok'   },
    { from: 'auditcore', to: 'pg-primary', rps: 1380, status: 'err'  },
    { from: 'configcore', to: 'pg-primary', rps: 4,   status: 'ok'   },
    { from: 'observecore', to: 'tempo',     rps: 21000,status: 'ok'   },
    { from: 'accesscore', to: 'observecore',rps: 3640, status: 'ok' },
    { from: 'auditcore', to: 'observecore', rps: 1880, status: 'ok' },
    { from: 'configcore', to: 'observecore',rps: 640,  status: 'ok' },
    { from: 'gateway',    to: 'observecore',rps: 8620, status: 'ok' },
  ];

  // Slice health
  const DRIFT = [
    { id: 'audit.append',         contract: 'auditcore.audit.append',         change: '+1 required field (idem_key)', sev: 'major', callers: 3, since: '2d', state: 'unannounced' },
    { id: 'access.auth.verify',   contract: 'accesscore.access.auth.verify',  change: 'response.code 401 → 403 on alg mismatch', sev: 'minor', callers: 1, since: '6h', state: 'doc-pending' },
    { id: 'config.flag.evaluate', contract: 'configcore.config.flag.evaluate',change: 'new optional input ctx.region',           sev: 'info',  callers: 4, since: '12h', state: 'compatible' },
  ];
  const FLAKE = [
    // r = red, g = green, . = unrun
    { name: 'auditcore/persist',   runs: 'ggggggrgggrrggggggrggggrgggggg', last: '14m', flake: 0.18 },
    { name: 'accesscore/jwks',     runs: 'gggggggggggggggggggggggrgggggg', last: '38m', flake: 0.03 },
    { name: 'observecore/batcher', runs: 'gggggggggrgggggggggggggggggggg', last: '5h',  flake: 0.04 },
    { name: 'configcore/db-pool',  runs: '..............ggggggggggggggg', last: '2d',  flake: 0.00 },
    { name: 'gateway/route',       runs: 'gggggggggggggggggggggggggggggg', last: '12m', flake: 0.00 },
  ];
  const CONV = [
    { bucket: '1',     n: 41 },
    { bucket: '2',     n: 28 },
    { bucket: '3',     n: 18 },
    { bucket: '4',     n: 9  },
    { bucket: '5',     n: 3  },
    { bucket: '6+',    n: 4  },
    { bucket: 'fail',  n: 2  },
  ];
  const FAN_OUT = [
    { caller: 'audit.append', callee: 'pg.exec',           n: '5.2 /req',  pattern: 'N+1', fp: '/v1/audit/append' },
    { caller: 'accesscore.session.load', callee: 'pg.exec',n: '3.1 /req',  pattern: 'N+1', fp: '/v1/auth/verify' },
    { caller: 'config.publish', callee: 'audit.append',    n: '12 /req',  pattern: 'fan-out', fp: '/v1/config/publish' },
  ];

  // ----- LOGS data -----
  // structured log entries; field shape mirrors what observecore would ingest
  // from cells via the standard gocell/log package.
  const LOG_LINES = [
    { t: '12:48:21.402', rel: 'just now',  lev: 'error', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pgx.acquire timeout',                fields: { pool_size: 32, in_use: 32, wait_ms: 142, err: 'context deadline exceeded' }, trace: '7f3a…d8e1' },
    { t: '12:48:21.218', rel: 'just now',  lev: 'warn',  cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pgx pool saturation',                fields: { pool_size: 32, in_use: 31, queued: 8 }, trace: '7f3a…d8e1' },
    { t: '12:48:20.901', rel: '2s ago',    lev: 'info',  cell: 'gateway',     slice: 'route@v0.3',    msg: 'POST /v1/audit/append',              fields: { status: 200, dur_ms: 142, tenant: 'acme' }, trace: '7f3a…d8e1' },
    { t: '12:48:19.554', rel: '3s ago',    lev: 'error', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'audit append failed',                fields: { contract: 'audit.append', err: 'ECONNRESET', retry: 1 }, trace: '7f3a…1190' },
    { t: '12:48:18.220', rel: '5s ago',    lev: 'warn',  cell: 'accesscore',  slice: 'jwks-cache@e201', msg: 'jwks fetch timeout, serving stale',fields: { upstream: 'okta', age_s: 41, ttl_s: 30 }, trace: '7f3a…2271' },
    { t: '12:48:17.013', rel: '6s ago',    lev: 'info',  cell: 'observecore', slice: 'exporter@3.1',  msg: 'batch flushed',                       fields: { spans: 4120, bytes: 318240, dur_ms: 14 } },
    { t: '12:48:15.882', rel: '8s ago',    lev: 'error', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pgx.acquire timeout',                fields: { pool_size: 32, in_use: 32, wait_ms: 156, err: 'context deadline exceeded' }, trace: '7f3a…d8e1' },
    { t: '12:48:14.090', rel: '9s ago',    lev: 'debug', cell: 'gateway',     slice: 'auth@2.1',      msg: 'jwt verified',                        fields: { alg: 'RS256', sub: 'u-9920', tenant: 'acme' }, trace: '7f3a…b201' },
    { t: '12:48:12.554', rel: '11s ago',   lev: 'info',  cell: 'gateway',     slice: 'route@v0.3',    msg: 'POST /v1/auth/verify',                fields: { status: 200, dur_ms: 14, tenant: 'acme' }, trace: '7f3a…b201' },
    { t: '12:48:11.012', rel: '12s ago',   lev: 'warn',  cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'retrying after ECONNRESET',          fields: { attempt: 2, backoff_ms: 80 }, trace: '7f3a…1190' },
    { t: '12:48:08.330', rel: '15s ago',   lev: 'error', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'audit append exhausted retries',     fields: { contract: 'audit.append', attempts: 3, err: 'context deadline exceeded' }, trace: '7f3a…1190' },
    { t: '12:48:04.910', rel: '18s ago',   lev: 'info',  cell: 'configcore',  slice: 'flag-eval@1.0', msg: 'flag evaluated',                      fields: { flag: 'audit.batch', value: true, tenant: 'acme' } },
    { t: '12:47:58.402', rel: '24s ago',   lev: 'debug', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pg.exec',                              fields: { query: 'INSERT INTO audit_event ...', rows: 1, dur_ms: 9 }, trace: '7f3a…c044' },
    { t: '12:47:51.110', rel: '32s ago',   lev: 'info',  cell: 'gateway',     slice: 'route@v0.3',    msg: 'GET /v1/config/flags',                fields: { status: 200, dur_ms: 4 }, trace: '7f3a…ab15' },
    { t: '12:47:48.870', rel: '34s ago',   lev: 'warn',  cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pgx pool saturation',                fields: { pool_size: 32, in_use: 29, queued: 3 }, trace: '7f3a…0042' },
    { t: '12:47:42.305', rel: '40s ago',   lev: 'info',  cell: 'observecore', slice: 'aggregator@1.2',msg: 'metric window closed',                fields: { window_s: 60, points: 1820, dropped: 0 } },
    { t: '12:47:30.108', rel: '52s ago',   lev: 'error', cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'pgx.acquire timeout',                fields: { pool_size: 32, in_use: 32, wait_ms: 121, err: 'context deadline exceeded' }, trace: '7f3a…d8e1' },
    { t: '12:47:18.420', rel: '1m ago',    lev: 'info',  cell: 'gateway',     slice: 'route@v0.3',    msg: 'POST /v1/audit/append',              fields: { status: 503, dur_ms: 138, tenant: 'acme' }, trace: '7f3a…1190' },
    { t: '12:46:55.220', rel: '2m ago',    lev: 'info',  cell: 'configcore',  slice: 'publish@1.0',   msg: 'config.publish v0.3.2 applied',      fields: { keys_changed: 1, by: 'sa:platform-bot' } },
    { t: '12:45:02.001', rel: '4m ago',    lev: 'info',  cell: 'auditcore',   slice: 'persist@a7f3',  msg: 'slice loaded',                        fields: { version: 'a7f3', commit: 'd91e2c0' } },
  ];

  const SAVED_QUERIES = [
    { id: 'inc',      label: 'inc-204 context',        q: 'cell:auditcore level:error,warn' },
    { id: 'audit5xx', label: 'audit.append 5xx',       q: 'contract:audit.append status:>=500' },
    { id: 'sandbox',  label: 'AI sandbox writes',      q: 'actor:sandbox kind:write' },
    { id: 'pgxsat',   label: 'pgx saturation events',  q: 'msg:"pgx pool saturation"' },
  ];

  // ============================================================
  // SHARED chrome
  // ============================================================
  const PageHead = ({ range, setRange, onExport }) => (
    <div className="dev-backlog-head">
      <div>
        <h1 className="v1-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Observability
          <span className="devs-badge devs-preview">v2 · preview</span>
        </h1>
        <p className="v1-sub" style={{ maxWidth: 760 }}>
          Detect → triage → locate → resolve. Signals are pinned to contracts; every span carries its
          slice tag, and "what changed" is reconstructed from the slice / flag / config pipeline so
          you can blame the change, not just the symptom.
        </p>
      </div>
      <div className="v1-head-actions">
        <div className="v1-seg">
          {RANGES.map(r => (
            <button key={r} data-active={range === r || undefined} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <button className="v1-btn" onClick={onExport}>Export view</button>
      </div>
    </div>
  );

  // ============================================================
  // TAB 1 — OVERVIEW
  // ============================================================
  const Overview = ({ onOpenIncident, goTab }) => (
    <div className="dvo-scroll">
      <div className="dvo-section">
        <div className="dvo-ov-kpis">
          {KPIS.map(k => {
            const last = k.trend[k.trend.length - 1];
            const burnSev = k.k === 'burn' ? (last >= 2 ? 'err' : last >= 1 ? 'warn' : '') : '';
            return (
              <div key={k.k} className="dvo-kpi">
                <div className="dvo-kpi-label">{k.label}</div>
                <div className="dvo-kpi-v">
                  <span className="v1-mono">{k.v}</span>
                  {k.u && <span className="u">{k.u}</span>}
                </div>
                <div className="dvo-kpi-sub">{k.sub}</div>
                <Spark data={k.trend} w={210} h={36}
                       accent={k.k === 'err' || (k.k === 'burn' && last >= 1) ? 'oklch(0.62 0.18 25)' :
                               k.k === 'p95' ? 'oklch(0.65 0.16 80)' : 'var(--fg-muted)'}
                       fill={k.k === 'err' || (k.k === 'burn' && last >= 1) ? 'oklch(0.62 0.18 25)' :
                             k.k === 'p95' ? 'oklch(0.65 0.16 80)' : 'var(--fg-muted)'}/>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dvo-section">
        <div className="dvo-h">
          Contract SLO · live
          <span className="v1-mute v1-mono">{CONTRACTS.length} contracts</span>
          <div className="dvo-h-actions">
            <button className="v1-btn" onClick={() => goTab('traces')}>Trace explorer →</button>
          </div>
        </div>
        <div className="dvo-card"><div className="dvo-card-body tight">
          <table className="dvo-tbl">
            <thead><tr>
              <th>Contract</th><th>Owner cell</th>
              <th className="num">QPS</th><th className="num">p95</th><th className="num">p99</th>
              <th className="num">Err</th>
              <th>SLO target</th><th>Budget left</th><th>Burn 1h / 6h</th>
            </tr></thead>
            <tbody>
              {CONTRACTS.map(c => {
                const budgetSev = c.budget < 0.25 ? 'err' : c.budget < 0.6 ? 'warn' : '';
                const burnSev = c.burn1h >= 2 ? 'hot' : c.burn1h >= 1 ? 'warm' : 'cool';
                return (
                  <tr key={c.id}>
                    <td>
                      <span className={`devr-dot devr-dot-${c.st === 'err' ? 'err' : c.st === 'warn' ? 'warn' : 'ok'}`}/>
                      <span className="v1-mono" style={{ marginLeft: 8 }}>{c.id}</span>
                    </td>
                    <td className="mono">{c.cell}</td>
                    <td className="num">{c.qps.toLocaleString()}</td>
                    <td className="num">{c.p95}ms</td>
                    <td className="num">{c.p99}ms</td>
                    <td className="num">{c.err.toFixed(2)}%</td>
                    <td className="mono">{c.slo}%</td>
                    <td>
                      <div className="dvo-budget">
                        <div className="dvo-budget-fill" data-warn={budgetSev === 'warn' || undefined}
                             data-err={budgetSev === 'err' || undefined}
                             style={{ width: (c.budget * 100).toFixed(0) + '%' }}/>
                      </div>
                      <span className="v1-mono" style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                        {(c.budget * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <span className="dvo-burn" data-sev={burnSev}>{c.burn1h.toFixed(1)}× / {c.burn6h.toFixed(1)}×</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      </div>

      <div className="dvo-section">
        <div className="dvo-two">
          <div className="dvo-card">
            <div className="dvo-card-h">
              Top open incidents
              <span className="v1-mute v1-mono">{INCIDENTS.filter(i => i.state === 'open' || i.state === 'ack').length} open</span>
              <button className="v1-link" style={{ marginLeft: 'auto' }} onClick={() => goTab('incidents')}>All incidents →</button>
            </div>
            <div className="dvo-card-body tight">
              {INCIDENTS.filter(i => i.state === 'open' || i.state === 'ack').map(i => (
                <button key={i.id} className="dvo-inc-row" data-sev={i.sev}
                        onClick={() => { onOpenIncident(i.id); goTab('incidents'); }}>
                  <div className="dvo-inc-sev"/>
                  <div>
                    <div className="dvo-inc-title">{i.title}</div>
                    <div className="dvo-inc-meta">
                      <span>{i.contract}</span><span>·</span><span>{i.opened}</span><span>·</span><span>{i.affected}</span>
                    </div>
                  </div>
                  <div className="dvo-inc-state" data-st={i.state}>{i.state}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="dvo-card">
            <div className="dvo-card-h">
              SLO budget tracker · 14d
              <span className="v1-mute v1-mono">5 contracts under watch</span>
            </div>
            <div className="dvo-card-body">
              {CONTRACTS.filter(c => c.budget < 0.7).map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px dashed var(--line-soft)' }}>
                  <div>
                    <div className="v1-mono" style={{ fontSize: 12.5 }}>{c.id}</div>
                    <div className="v1-mute" style={{ fontSize: 11 }}>SLO {c.slo}% · {Math.round(c.budget * 14)}d budget left</div>
                  </div>
                  <div className="dvo-budget" style={{ width: 90 }}>
                    <div className="dvo-budget-fill"
                         data-warn={c.budget < 0.6 && c.budget >= 0.25 || undefined}
                         data-err={c.budget < 0.25 || undefined}
                         style={{ width: (c.budget * 100).toFixed(0) + '%' }}/>
                  </div>
                  <span className="dvo-burn" data-sev={c.burn1h >= 2 ? 'hot' : c.burn1h >= 1 ? 'warm' : 'cool'}>{c.burn1h.toFixed(1)}×</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // TAB 2 — INCIDENTS / ANOMALIES
  // ============================================================
  const BlastMini = ({ focus }) => {
    // tiny 3-node + edges, focus highlights the cell at the center
    const n = {
      gateway:    { x: 50,  y: 80, label: 'gateway' },
      accesscore: { x: 200, y: 40, label: 'accesscore' },
      auditcore:  { x: 200, y: 100,label: 'auditcore' },
      pg:         { x: 350, y: 100, label: 'pg-primary' },
    };
    const edges = [
      ['gateway','accesscore','ok'],
      ['gateway','auditcore','err'],
      ['accesscore','auditcore','err'],
      ['auditcore','pg','err'],
    ];
    return (
      <svg viewBox="0 0 400 160">
        {edges.map(([a,b,s], i) => (
          <line key={i} x1={n[a].x + 30} y1={n[a].y} x2={n[b].x - 30} y2={n[b].y}
                stroke={s === 'err' ? 'oklch(0.62 0.18 25)' : 'var(--line)'} strokeWidth={s === 'err' ? 2 : 1}/>
        ))}
        {Object.entries(n).map(([id, pt]) => {
          const isFocus = id === focus;
          return (
            <g key={id}>
              <rect x={pt.x - 32} y={pt.y - 12} width={64} height={24} rx="3"
                    fill="var(--bg-raised)"
                    stroke={isFocus ? 'var(--accent)' : 'var(--line)'}
                    strokeWidth={isFocus ? 2 : 1}/>
              <text x={pt.x} y={pt.y + 4} textAnchor="middle" className="node-name">{pt.label}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  const Incidents = ({ selected, setSelected, onSeed }) => {
    const [filter, setFilter] = useState('open');
    const filters = [
      { k: 'open', label: 'Open' },
      { k: 'ack',  label: 'Acked' },
      { k: 'snoozed', label: 'Snoozed' },
      { k: 'closed', label: 'Closed' },
      { k: 'all',  label: 'All' },
    ];
    const list = INCIDENTS.filter(i => filter === 'all' ? true : i.state === filter);
    const inc = INCIDENTS.find(i => i.id === selected) || list[0] || INCIDENTS[0];

    return (
      <div className="dvo-scroll">
        <div className="dvo-section">
          <div className="dvo-inc-layout">
            <div className="dvo-inc-list">
              <div className="dvo-inc-filters">
                {filters.map(f => (
                  <button key={f.k} className="dvo-chip" data-active={filter === f.k || undefined}
                          onClick={() => setFilter(f.k)}>{f.label}</button>
                ))}
              </div>
              <div className="dvo-inc-rows">
                {list.length === 0 && <div className="dvo-empty">No incidents in this view.</div>}
                {list.map(i => (
                  <button key={i.id} className="dvo-inc-row" data-sev={i.sev}
                          data-active={inc.id === i.id || undefined}
                          onClick={() => setSelected(i.id)}>
                    <div className="dvo-inc-sev"/>
                    <div>
                      <div className="dvo-inc-title">{i.title}</div>
                      <div className="dvo-inc-meta">
                        <span>{i.id}</span><span>·</span><span>{i.cell}</span><span>·</span><span>{i.opened}</span>
                      </div>
                    </div>
                    <div className="dvo-inc-state" data-st={i.state}>{i.state}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="dvo-inc-detail">
              <h2 className="dvo-inc-d-title">
                {inc.title}
                <span className="dvo-inc-state" data-st={inc.state}>{inc.state}</span>
              </h2>
              <p className="dvo-inc-d-sub">{inc.detail}</p>

              <div className="dvo-inc-d-acts">
                {inc.actions.map((a, i) => {
                  const isSeed = a.includes('AI sandbox');
                  const isDanger = a.includes('Roll back') || a.includes('Kill');
                  const isPrimary = isSeed || (i === 0 && !isDanger && a !== 'Close' && a !== 'Resume' && a !== 'Reopen');
                  return (
                    <button key={i}
                            className={`v1-btn ${isPrimary ? 'dvo-btn-primary' : ''} ${isDanger ? 'dvo-btn-danger' : ''}`}
                            onClick={() => {
                              if (isSeed && onSeed) onSeed(inc);
                              else if (a === 'Postmortem draft') window.gcNav && window.gcNav({ route: 'observe', tab: 'incidents', incidentId: inc.id, postmortem: true });
                            }}>
                      {a}
                    </button>
                  );
                })}
              </div>

              <div className="dvo-inc-kv">
                <div><span>Contract</span><b className="v1-mono">{inc.contract}</b></div>
                <div><span>Owner cell</span><b className="v1-mono">{inc.cell}</b></div>
                <div><span>Owner team</span><b className="v1-mono">{inc.owner}</b></div>
                <div><span>Affected</span><b>{inc.affected}</b></div>
              </div>

              {inc.sparkErr.length > 0 && (
                <div className="dvo-inc-section">
                  <div className="dvo-inc-section-h">Signal · error rate (last 1h)</div>
                  <div style={{ background: 'var(--bg-sunken)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
                    <Spark data={inc.sparkErr} w={640} h={70}
                           accent="oklch(0.62 0.18 25)" fill="oklch(0.62 0.18 25)" dots/>
                  </div>
                </div>
              )}

              <div className="dvo-inc-section">
                <div className="dvo-inc-section-h">Suspect slices · auto-blamed</div>
                {inc.suspects.length === 0
                  ? <div className="dvo-empty" style={{ background: 'var(--bg-sunken)', borderRadius: 'var(--r)' }}>No recent slice activity in the contract's blast radius.</div>
                  : <ul className="dvo-suspect">
                      {inc.suspects.map((s, i) => (
                        <li key={i}>
                          <span className="dvo-suspect-score" data-sev={s.sev}>{(s.score * 100).toFixed(0)}%</span>
                          <div>
                            <div className="dvo-suspect-name">{s.name}</div>
                            <div className="dvo-suspect-why">{s.why}</div>
                          </div>
                          <button className="v1-btn">Open diff</button>
                        </li>
                      ))}
                    </ul>
                }
              </div>

              <div className="dvo-inc-section">
                <div className="dvo-inc-section-h">Recent changes in this contract's blast radius</div>
                {inc.changes.length === 0
                  ? <div className="dvo-empty" style={{ background: 'var(--bg-sunken)', borderRadius: 'var(--r)' }}>No relevant changes.</div>
                  : <ul className="devr-anom" style={{ background: 'var(--bg-sunken)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r)', padding: '4px 14px' }}>
                      {inc.changes.map((c, i) => (
                        <li key={i} data-sev={c.susp ? 'warn' : 'info'}>
                          <span className="devr-anom-sev"/>
                          <div className="devr-anom-body">
                            <div className="devr-anom-head">
                              <span className="v1-mono" style={{ minWidth: 60, color: 'var(--fg-faint)' }}>{c.t}</span>
                              <span className="dvo-chip" style={{ cursor: 'default' }}>{c.k}</span>
                              <span>{c.label}</span>
                              {c.susp && <span className="dvo-burn" data-sev="hot" style={{ marginLeft: 'auto' }}>suspect</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                }
              </div>

              <div className="dvo-inc-section">
                <div className="dvo-inc-section-h">Blast radius</div>
                <div className="dvo-blast"><BlastMini focus={inc.cell}/></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // TAB 3 — WHAT CHANGED (timeline)
  // ============================================================
  const WhatChanged = () => {
    const [hover, setHover] = useState(null);
    const [filters, setFilters] = useState({ deploy: true, flag: true, config: true, sandbox: true, traffic: true, anomaly: true });

    return (
      <div className="dvo-scroll">
        <div className="dvo-section">
          <div className="dvo-h">
            What changed in the last 24h
            <span className="v1-mute v1-mono">{TL_EVENTS.length} events</span>
            <div className="dvo-h-actions">
              {Object.keys(filters).map(k => (
                <button key={k} className="dvo-chip" data-active={filters[k] || undefined}
                        onClick={() => setFilters(f => ({ ...f, [k]: !f[k] }))}>{k}</button>
              ))}
            </div>
          </div>

          <div className="dvo-tl-wrap">
            <div className="dvo-tl-axis">
              {TIME_LABELS.map(l => <span key={l} className="v1-mono">{l}</span>)}
            </div>

            {LANES.map(lane => {
              const evs = TL_EVENTS.filter(e => e.k === lane.k && filters[e.k]);
              return (
                <div key={lane.k} className="dvo-tl-lane">
                  <div className="dvo-tl-lane-label">{lane.label}</div>
                  <div className="dvo-tl-track">
                    {/* incident vertical line at x≈0.92 */}
                    <div className="dvo-tl-anomaly-line" style={{ left: '92%' }}/>
                    {evs.map((e, i) => (
                      <div key={i} className="dvo-tl-ev" data-kind={e.k} data-suspect={e.susp || undefined}
                           style={{ left: (e.x * 100) + '%' }}
                           onMouseEnter={() => setHover({ ...e, lane: lane.label })}
                           onMouseLeave={() => setHover(null)}>
                        {hover && hover.x === e.x && hover.k === e.k && (
                          <div className="dvo-tl-ev-pop">{e.label}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="dvo-tl-legend">
              <span><span className="sw" style={{ background: 'oklch(0.55 0.15 250)' }}/> deploy (slice merge)</span>
              <span><span className="sw" style={{ background: 'oklch(0.62 0.16 290)' }}/> flag flip</span>
              <span><span className="sw" style={{ background: 'oklch(0.62 0.13 150)', borderRadius: '50%' }}/> config rollout</span>
              <span><span className="sw" style={{ background: 'oklch(0.55 0.13 200)', transform: 'rotate(45deg)' }}/> AI sandbox</span>
              <span><span className="sw" style={{ background: 'oklch(0.7 0.16 80)',  borderRadius: '50%' }}/> traffic / 3p</span>
              <span><span className="sw" style={{ background: 'oklch(0.62 0.18 25)', borderRadius: '50%' }}/> anomaly</span>
              <span style={{ marginLeft: 'auto', color: 'var(--fg-faint)' }}>highlighted = suspected cause</span>
            </div>
          </div>
        </div>

        <div className="dvo-section">
          <div className="dvo-two">
            <div className="dvo-card">
              <div className="dvo-card-h">Event log (most recent first)</div>
              <div className="dvo-card-body" style={{ padding: '4px 16px' }}>
                <ul className="devr-anom">
                  {[...TL_EVENTS].reverse().map((e, i) => (
                    <li key={i} data-sev={e.susp ? 'warn' : e.k === 'anomaly' ? 'err' : 'info'}>
                      <span className="devr-anom-sev"/>
                      <div className="devr-anom-body">
                        <div className="devr-anom-head">
                          <span className="v1-mono" style={{ minWidth: 50, color: 'var(--fg-faint)' }}>{(e.x * 24).toFixed(1)}h ago</span>
                          <span className="dvo-chip" style={{ cursor: 'default' }}>{e.k}</span>
                          <span>{e.label}</span>
                          {e.susp && <span className="dvo-burn" data-sev="hot" style={{ marginLeft: 'auto' }}>suspect</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="dvo-card">
              <div className="dvo-card-h">How to read this</div>
              <div className="dvo-card-body" style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                <p style={{ marginTop: 0 }}>
                  Every event on the timeline is sourced from a gocell pipeline event —
                  not screen-scraped from a generic deploy feed. That means we always know
                  which <span className="v1-mono">slice</span>, which <span className="v1-mono">flag</span>,
                  which <span className="v1-mono">config publish</span> a change came from.
                </p>
                <p>
                  When a contract's burn rate crosses 1×, the timeline auto-shortlists events that
                  touch that contract or its dependencies in the previous deploy window, and marks
                  them <span className="v1-mono">suspect</span>. Clicking one opens the diff
                  + opens an AI sandbox seeded with the failing trace.
                </p>
                <p style={{ marginBottom: 0 }}>
                  The vertical red line marks the moment an SLO budget burn was first detected.
                  Visual scanning rule: <b>suspect dots to the left of the line are your prime
                  suspects.</b>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // TAB 4 — TRACES
  // ============================================================
  const Traces = ({ selectedTrace, setSelectedTrace }) => {
    const [picked, setPicked] = useState({ fast: true, slow: true });

    // Build a 20x10 grid representing latency buckets (cols) x time buckets (rows).
    // For audit.append, simulate a slight spike in last 4 cols.
    const cells = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 20; c++) {
        let v = Math.max(0, 10 - c) + (Math.random() * 3);
        if (c >= 14 && r >= 7) v += 15; // tail spike
        cells.push({ r, c, v });
      }
    }
    const maxV = Math.max(...cells.map(c => c.v));
    const color = (v) => {
      const t = v / maxV;
      if (t < 0.05) return 'var(--bg-sunken)';
      if (t < 0.25) return 'oklch(0.93 0.03 250)';
      if (t < 0.55) return 'oklch(0.78 0.10 250)';
      if (t < 0.80) return 'oklch(0.65 0.16 80)';
      return 'oklch(0.6 0.18 25)';
    };

    return (
      <div className="dvo-scroll">
        {selectedTrace && (
          <div className="dvo-section" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <div style={{
              padding: '10px 14px',
              border: '1px solid var(--line)', borderRadius: 'var(--r)',
              background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13
            }}>
              <span className="v1-mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>focused on</span>
              <span className="v1-mono">trace {selectedTrace}</span>
              <span className="v1-mute" style={{ fontSize: 12 }}>· diff below auto-loaded with this trace as "slow"</span>
              <button className="v1-btn" style={{ marginLeft: 'auto' }} onClick={() => setSelectedTrace(null)}>Clear</button>
            </div>
          </div>
        )}
        <div className="dvo-section">
          <div className="dvo-h">
            Trace explorer · grouped by route
            <span className="v1-mute v1-mono">{TRACE_GROUPS.reduce((s,g) => s+g.n, 0).toLocaleString()} spans · 1h</span>
          </div>

          <div className="dvo-card"><div className="dvo-card-body tight">
            <table className="dvo-tbl">
              <thead><tr>
                <th>Route</th><th>Root cell</th>
                <th className="num">Count</th><th className="num">p50</th>
                <th className="num">p95</th><th className="num">p99</th>
                <th className="num">Err %</th>
                <th>Latency × time heat</th>
              </tr></thead>
              <tbody>
                {TRACE_GROUPS.map(g => (
                  <tr key={g.route}>
                    <td className="mono" style={{ fontSize: 12 }}>{g.route}</td>
                    <td className="mono">{g.cell}</td>
                    <td className="num">{g.n.toLocaleString()}</td>
                    <td className="num">{g.p50}ms</td>
                    <td className="num">{g.p95}ms</td>
                    <td className="num">{g.p99}ms</td>
                    <td className="num" style={{ color: g.err > 0.1 ? 'oklch(0.5 0.16 25)' : 'var(--fg-muted)' }}>{g.err.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 4px)', gap: 1 }}>
                        {Array.from({ length: 60 }).map((_, i) => {
                          const v = Math.max(0, 8 - (i % 20)) + Math.random() * 2 + (g.cell === 'auditcore' && i % 20 > 15 ? 8 : 0);
                          return <div key={i} style={{ width: 4, height: 8, background: color(v) }}/>;
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>

        <div className="dvo-section">
          <div className="dvo-h">
            BubbleUp · POST /v1/audit/append latency × time
            <span className="v1-mute v1-mono">click a hot cell to drill into matching traces</span>
          </div>
          <div className="dvo-card"><div className="dvo-card-body">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-faint)',
                            letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                latency bucket (low → high)
              </div>
              <div className="dvo-tr-hex" style={{ flex: 1 }}>
                {cells.map((c, i) => (
                  <div key={i} className="dvo-tr-cell"
                       style={{ background: color(c.v) }}
                       title={`bucket ${c.c} · t${c.r} · ${c.v.toFixed(1)} traces`}/>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)',
                          fontSize: 10.5, color: 'var(--fg-faint)', marginTop: 8, paddingLeft: 24 }}>
              <span>−1h</span><span>−45m</span><span>−30m</span><span>−15m</span><span>now</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>
              The dense red cluster in the last 15 minutes is the audit.append regression. Clicking
              that block would pull traces with <span className="v1-mono">p95 &gt; 100ms</span> and
              auto-diff one against the fast median trace below.
            </div>
          </div></div>
        </div>

        <div className="dvo-section">
          <div className="dvo-h">Trace diff · fast vs slow</div>
          <div className="dvo-card">
            <div className="dvo-diff">
              <div>
                <div className="dvo-diff-h">
                  <span className="devr-trace-st devr-trace-ok">fast</span>
                  <span className="v1-mono">trace 7f3a…0042 · 12ms · audit.append</span>
                </div>
                <Waterfall spans={SPAN_FAST} total={142}/>
              </div>
              <div>
                <div className="dvo-diff-h">
                  <span className="devr-trace-st devr-trace-err">slow</span>
                  <span className="v1-mono">trace 7f3a…d8e1 · 142ms · audit.append</span>
                  <span className="dvo-burn" data-sev="hot" style={{ marginLeft: 'auto' }}>+130ms in pgx.acquire</span>
                </div>
                <Waterfall spans={SPAN_SLOW} total={142}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Waterfall = ({ spans, total }) => (
    <div className="dvo-wf">
      {spans.map((s, i) => (
        <div key={i} className="dvo-wf-row">
          <div className="dvo-wf-name">
            <span className="indent">{'│ '.repeat(s.depth)}</span>{s.name}
            <span className="slice">{s.slice}</span>
          </div>
          <div className="dvo-wf-bar">
            <div className="dvo-wf-fill" data-flag={s.flag}
                 style={{ left: (s.start / total * 100) + '%', width: (s.dur / total * 100) + '%' }}/>
          </div>
          <div className="dvo-wf-dur" data-flag={s.flag}>{s.dur}ms</div>
        </div>
      ))}
    </div>
  );

  // ============================================================
  // TAB — LOGS
  // ============================================================
  const Logs = ({ traceFilter, setTraceFilter, onPivotTrace }) => {
    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState({ debug: false, info: true, warn: true, error: true });
    const [cellFilter, setCellFilter] = useState('all');
    const [selected, setSelected] = useState(LOG_LINES[0].t);

    const cells = ['all', ...Array.from(new Set(LOG_LINES.map(l => l.cell)))];

    const filtered = LOG_LINES.filter(l => {
      if (!levelFilter[l.lev]) return false;
      if (cellFilter !== 'all' && l.cell !== cellFilter) return false;
      if (traceFilter && l.trace !== traceFilter) return false;
      if (query) {
        const hay = `${l.msg} ${l.cell} ${l.slice} ${JSON.stringify(l.fields)}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });

    const sel = filtered.find(l => l.t === selected) || filtered[0];

    // build histogram: 60 buckets over the visible time, segmented by level
    const histBuckets = Array.from({ length: 60 }, () => ({ debug: 0, info: 0, warn: 0, error: 0, total: 0 }));
    // distribute log lines into a synthetic 5min window (60 × 5s buckets)
    LOG_LINES.forEach((l, idx) => {
      // approximate bucket: more recent -> further right; cluster errors near right
      const isErrCluster = l.lev === 'error' || l.lev === 'warn';
      const b = isErrCluster ? Math.min(59, 50 + (idx % 10)) : Math.max(0, 59 - (idx * 2) - Math.floor(Math.random() * 5));
      if (b >= 0 && b < 60) {
        histBuckets[b][l.lev] += 1;
        histBuckets[b].total += 1;
      }
    });
    // add background traffic to make histogram look populated
    for (let i = 0; i < 60; i++) {
      const baseline = 4 + Math.floor(Math.sin(i / 3) * 2 + Math.random() * 3);
      histBuckets[i].info += baseline;
      histBuckets[i].total += baseline;
      if (i > 48 && Math.random() > 0.5) {
        const e = 1 + Math.floor(Math.random() * 3);
        histBuckets[i].error += e;
        histBuckets[i].total += e;
      }
    }
    const histMax = Math.max(...histBuckets.map(b => b.total));

    return (
      <div className="dvo-scroll">
        <div className="dvo-section">
          {traceFilter && (
            <div style={{
              padding: '10px 14px', marginBottom: 14,
              border: '1px solid var(--line)', borderRadius: 'var(--r)',
              background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13
            }}>
              <span className="v1-mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>in context of</span>
              <span className="v1-mono">trace {traceFilter}</span>
              <button className="v1-btn" style={{ marginLeft: 'auto' }} onClick={() => setTraceFilter(null)}>Clear trace filter</button>
            </div>
          )}

          <div className="dvo-log-search">
            <input className="dvo-log-input"
                   placeholder='filter logs · e.g.  level:error cell:auditcore  ·  msg:"pgx"  ·  trace:7f3a…'
                   value={query} onChange={e => setQuery(e.target.value)}/>
            <select className="dvo-log-input" style={{ width: 180 }}
                    value={cellFilter} onChange={e => setCellFilter(e.target.value)}>
              {cells.map(c => <option key={c} value={c}>{c === 'all' ? 'all cells' : c}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {['debug','info','warn','error'].map(l => (
                <button key={l} className="dvo-chip" data-active={levelFilter[l] || undefined}
                        onClick={() => setLevelFilter(f => ({ ...f, [l]: !f[l] }))}>{l}</button>
              ))}
            </div>
          </div>

          <div className="dvo-log-saved">
            <span className="v1-mono" style={{ fontSize: 11, color: 'var(--fg-faint)', alignSelf: 'center', marginRight: 4 }}>saved:</span>
            {SAVED_QUERIES.map(q => (
              <button key={q.id} className="dvo-chip"
                      onClick={() => setQuery(q.q.includes(':') ? '' : q.q)}>{q.label}</button>
            ))}
            <button className="dvo-chip" style={{ borderStyle: 'dashed' }}>+ Save current</button>
          </div>

          <div className="dvo-log-hist">
            <div className="dvo-log-hist-h">
              Volume · last 5 min
              <span style={{ marginLeft: 8 }}>{filtered.length} matching · {LOG_LINES.length} total visible</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'oklch(0.62 0.18 25)', borderRadius: 2 }}/>error
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'oklch(0.68 0.16 80)', borderRadius: 2 }}/>warn
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'var(--fg-muted)', borderRadius: 2 }}/>info
                </span>
              </span>
            </div>
            <div className="dvo-log-hist-bars">
              {histBuckets.map((b, i) => (
                <div key={i} className="dvo-log-hist-bar" title={`t-${(60-i)*5}s · ${b.total} entries`}>
                  {['error','warn','info','debug'].map(l => b[l] > 0 && (
                    <div key={l} className="dvo-log-hist-seg" data-l={l}
                         style={{ height: (b[l] / histMax * 64) + 'px' }}/>
                  ))}
                </div>
              ))}
            </div>
            <div className="dvo-log-hist-axis">
              <span>−5m</span><span>−4m</span><span>−3m</span><span>−2m</span><span>−1m</span><span>now</span>
            </div>
          </div>

          <div className="dvo-log-layout">
            <div className="dvo-log-list">
              {filtered.length === 0 && <div className="dvo-empty">No log lines match this filter.</div>}
              {filtered.map(l => (
                <div key={l.t} className="dvo-log-row" data-active={sel && sel.t === l.t || undefined}
                     onClick={() => setSelected(l.t)}>
                  <span className="dvo-log-t">{l.t.slice(0,8)}</span>
                  <span className="dvo-log-lev" data-l={l.lev}>{l.lev}</span>
                  <span className="dvo-log-src">{l.cell}<span className="v1-mute"> · {l.slice}</span></span>
                  <span className="dvo-log-msg">
                    {l.msg}
                    {' '}
                    {Object.entries(l.fields).slice(0, 3).map(([k,v]) => (
                      <React.Fragment key={k}><span className="k">{k}=</span><span className="v">{typeof v === 'string' ? `"${v}"` : String(v)}</span>{' '}</React.Fragment>
                    ))}
                  </span>
                  <span className="dvo-log-tr">
                    {l.trace && <span className="dvo-log-tr-pill">{l.trace}</span>}
                  </span>
                </div>
              ))}
            </div>

            {sel && (
              <div className="dvo-log-detail">
                <div className="dvo-log-detail-h">
                  <span className="dvo-log-lev" data-l={sel.lev}>{sel.lev}</span>
                  <span>{sel.t}</span>
                </div>
                <div className="dvo-log-msg-full">{sel.msg}</div>

                <div className="dvo-log-section-h">Source</div>
                <div className="dvo-log-fields">
                  <span className="k">cell</span><span className="v">{sel.cell}</span>
                  <span className="k">slice</span><span className="v">{sel.slice}</span>
                  {sel.trace && (<><span className="k">trace</span><span className="v">{sel.trace}</span></>)}
                </div>

                <div className="dvo-log-section-h">Fields</div>
                <div className="dvo-log-fields">
                  {Object.entries(sel.fields).map(([k,v]) => (
                    <React.Fragment key={k}>
                      <span className="k">{k}</span>
                      <span className="v">{typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}</span>
                    </React.Fragment>
                  ))}
                </div>

                {sel.trace && (
                  <>
                    <div className="dvo-log-section-h">Trace context</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>
                      This log line is span <span className="v1-mono">{sel.cell}.{sel.slice.split('@')[0]}</span> inside trace <span className="v1-mono">{sel.trace}</span>.
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="v1-btn dvo-btn-primary" onClick={() => setTraceFilter(sel.trace)}>Pivot · all logs in trace</button>
                      <button className="v1-btn" onClick={() => onPivotTrace && onPivotTrace(sel.trace)}>Open in Traces</button>
                    </div>
                  </>
                )}

                <div className="dvo-log-section-h">Actions</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="v1-btn">Live tail this source</button>
                  <button className="v1-btn">Create alert from query</button>
                  <button className="v1-btn" onClick={() => onPivotTrace && onPivotTrace(sel.trace)}
                          disabled={!sel.trace}>Open in Traces</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // TAB 5 — SERVICE GRAPH (blast radius)
  // ============================================================
  const ServiceGraph = ({ onSeed }) => {
    const [focus, setFocus] = useState('auditcore');
    const focusN = NODES.find(n => n.id === focus);

    // determine connected set: nodes within 1 hop of focus
    const connected = new Set([focus]);
    EDGES.forEach(e => {
      if (e.from === focus) connected.add(e.to);
      if (e.to === focus) connected.add(e.from);
    });

    return (
      <div className="dvo-scroll">
        <div className="dvo-section">
          <div className="dvo-h">
            Service graph · blast radius
            <span className="v1-mute v1-mono">click a node to focus</span>
            <div className="dvo-h-actions">
              <button className="dvo-chip" data-active onClick={() => setFocus('auditcore')}>Focus on incident</button>
              <button className="dvo-chip" onClick={() => setFocus(null)}>Clear focus</button>
            </div>
          </div>

          <div className="dvo-graph-wrap">
            <svg viewBox="0 0 900 480">
              {EDGES.map((e, i) => {
                const a = NODES.find(n => n.id === e.from);
                const b = NODES.find(n => n.id === e.to);
                if (!a || !b) return null;
                const dimmed = focus && !(connected.has(e.from) && connected.has(e.to));
                return (
                  <line key={i} x1={a.x + 50} y1={a.y} x2={b.x - 50} y2={b.y}
                        className="dvo-graph-edge"
                        data-status={e.status}
                        data-dim={dimmed || undefined}/>
                );
              })}
              {NODES.map(n => {
                const dimmed = focus && !connected.has(n.id);
                return (
                  <g key={n.id} className="dvo-graph-node"
                     data-status={n.status} data-focus={focus === n.id || undefined}
                     data-dim={dimmed || undefined}
                     onClick={() => setFocus(n.id)}>
                    <rect x={n.x - 50} y={n.y - 24} width="100" height="48" rx="4"/>
                    <text className="t" x={n.x} y={n.y - 3} textAnchor="middle">{n.id}</text>
                    <text className="s" x={n.x} y={n.y + 12} textAnchor="middle">
                      {typeof n.rps === 'number' ? n.rps.toLocaleString() : n.rps} rps · p95 {n.p95}ms
                    </text>
                  </g>
                );
              })}
            </svg>

            {focusN && (
              <div className="dvo-graph-side">
                <h4>{focusN.id}</h4>
                <div className="kv"><span>Status</span><b>{focusN.status}</b></div>
                <div className="kv"><span>QPS</span><b>{typeof focusN.rps === 'number' ? focusN.rps.toLocaleString() : focusN.rps}</b></div>
                <div className="kv"><span>p95</span><b>{focusN.p95}ms</b></div>
                <div className="kv"><span>Err %</span><b>{focusN.err.toFixed(2)}</b></div>
                <div className="kv"><span>SLO</span><b>{focusN.slo}{typeof focusN.slo === 'number' ? '%' : ''}</b></div>
                <div className="kv"><span>External</span><b>{focusN.ext ? 'yes' : 'no'}</b></div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="v1-btn">Traces</button>
                  <button className="v1-btn">Incidents</button>
                  <button className="v1-btn dvo-btn-primary" onClick={() => onSeed && onSeed()}>Open AI sandbox</button>
                </div>
              </div>
            )}

            <div className="dvo-graph-legend">
              <span><span className="ln"/>healthy</span>
              <span><span className="ln ln-warn"/>warn</span>
              <span><span className="ln ln-err"/>error</span>
              <span style={{ marginLeft: 'auto' }}>edge thickness ≈ rps · color = upstream status</span>
            </div>
          </div>
        </div>

        <div className="dvo-section">
          <div className="dvo-two">
            <div className="dvo-card">
              <div className="dvo-card-h">Critical paths · upstream-impacted by focus</div>
              <div className="dvo-card-body" style={{ padding: '4px 16px' }}>
                <ul className="devr-anom">
                  <li data-sev="err">
                    <span className="devr-anom-sev"/>
                    <div className="devr-anom-body">
                      <div className="devr-anom-head">
                        <span className="v1-mono">gateway → auditcore → pg-primary</span>
                        <span className="v1-mute v1-mono" style={{ marginLeft: 'auto' }}>1380 rps</span>
                      </div>
                      <div className="v1-mute" style={{ fontSize: 12 }}>writes blocked on pgx.acquire; +130ms tail</div>
                    </div>
                  </li>
                  <li data-sev="warn">
                    <span className="devr-anom-sev"/>
                    <div className="devr-anom-body">
                      <div className="devr-anom-head">
                        <span className="v1-mono">accesscore → auditcore</span>
                        <span className="v1-mute v1-mono" style={{ marginLeft: 'auto' }}>890 rps</span>
                      </div>
                      <div className="v1-mute" style={{ fontSize: 12 }}>secondary effect — every auth write touches audit</div>
                    </div>
                  </li>
                  <li data-sev="info">
                    <span className="devr-anom-sev"/>
                    <div className="devr-anom-body">
                      <div className="devr-anom-head">
                        <span className="v1-mono">configcore → auditcore</span>
                        <span className="v1-mute v1-mono" style={{ marginLeft: 'auto' }}>8 rps</span>
                      </div>
                      <div className="v1-mute" style={{ fontSize: 12 }}>config publishes log to audit — low volume, low priority</div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div className="dvo-card">
              <div className="dvo-card-h">Degradation path · what to disable</div>
              <div className="dvo-card-body" style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                <p style={{ marginTop: 0 }}>
                  Auditcore is on the write path of every auth + config call.
                  Pre-declared degradation contracts (set in <span className="v1-mono">Operate / Configuration</span>):
                </p>
                <ol style={{ paddingLeft: 18, margin: '8px 0', lineHeight: 1.7 }}>
                  <li><b>audit.append</b> falls back to async queue if pg latency &gt; 200ms.</li>
                  <li><b>accesscore</b> serves verified tokens for 30s past upstream JWKS failure.</li>
                  <li><b>configcore</b> reads from local mirror if pg-primary is unreachable.</li>
                </ol>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="v1-btn dvo-btn-danger">Engage degradation · audit.append</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // TAB 6 — SLICE HEALTH
  // ============================================================
  const SliceHealth = () => {
    const maxConv = Math.max(...CONV.map(c => c.n));
    return (
      <div className="dvo-scroll">
        <div className="dvo-section">
          <div className="dvo-h">
            Contract drift
            <span className="v1-mute v1-mono">implementation diverging from registered schema</span>
          </div>
          <div className="dvo-card"><div className="dvo-card-body tight">
            <table className="dvo-tbl">
              <thead><tr>
                <th>Contract</th><th>Change</th><th>Severity</th>
                <th className="num">Callers</th><th>Since</th><th>State</th><th></th>
              </tr></thead>
              <tbody>
                {DRIFT.map(d => (
                  <tr key={d.id}>
                    <td className="mono">{d.contract}</td>
                    <td>{d.change}</td>
                    <td><span className="dvo-drift-sev" data-sev={d.sev}>{d.sev}</span></td>
                    <td className="num">{d.callers}</td>
                    <td className="mono">{d.since}</td>
                    <td className="mono"><span className="v1-mute">{d.state}</span></td>
                    <td><button className="v1-btn">Reconcile</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>

        <div className="dvo-section">
          <div className="dvo-two">
            <div className="dvo-card">
              <div className="dvo-card-h">
                Slice CI flake rate · last 30 runs
                <span className="v1-mute v1-mono" style={{ marginLeft: 'auto' }}>red = failed run · grey = unrun</span>
              </div>
              <div className="dvo-card-body" style={{ padding: 0 }}>
                {FLAKE.map(f => (
                  <div key={f.name} className="dvo-flake">
                    <div>
                      <div className="dvo-flake-name">{f.name}</div>
                      <div className="v1-mute" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        last run {f.last} · flake {(f.flake * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="dvo-flake-grid">
                      {f.runs.split('').map((r, i) => (
                        <div key={i} className="dvo-flake-cell" data-r={r === 'g' ? '' : r}/>
                      ))}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <button className="v1-btn">Open</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="dvo-card">
              <div className="dvo-card-h">AI sandbox · convergence histogram (24h)</div>
              <div className="dvo-card-body">
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginBottom: 12 }}>
                  How many self-loops a sandbox runs before all verify checks turn green.
                  Tail (5+ / fail) is where sandbox heuristics need work.
                </div>
                {CONV.map(c => (
                  <div key={c.bucket} className="dvo-conv">
                    <div className="dvo-conv-label">{c.bucket}</div>
                    <div className="dvo-conv-bar">
                      <div className="dvo-conv-fill" style={{ width: ((c.n / maxConv) * 100).toFixed(0) + '%',
                                                              background: c.bucket === 'fail' ? 'oklch(0.62 0.18 25)' : 'var(--accent)' }}/>
                    </div>
                    <div className="dvo-conv-n">{c.n}</div>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 10, fontFamily: 'var(--font-mono)' }}>
                  median = 2 loops · 95th = 5 loops · failure rate = 1.9%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dvo-section">
          <div className="dvo-h">
            N+1 / fan-out hot spots
            <span className="v1-mute v1-mono">trace-derived call patterns</span>
          </div>
          <div className="dvo-card"><div className="dvo-card-body tight">
            <table className="dvo-tbl">
              <thead><tr>
                <th>Caller</th><th>Callee</th><th className="num">Calls / req</th><th>Pattern</th><th>Endpoint</th><th></th>
              </tr></thead>
              <tbody>
                {FAN_OUT.map((f, i) => (
                  <tr key={i}>
                    <td className="mono">{f.caller}</td>
                    <td className="mono">{f.callee}</td>
                    <td className="num">{f.n}</td>
                    <td><span className="dvo-drift-sev" data-sev={f.pattern === 'N+1' ? 'major' : 'minor'}>{f.pattern}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{f.fp}</td>
                    <td><button className="v1-btn">Trace sample</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>

        <div className="devr-note" style={{ margin: '0 32px 32px' }}>
          <span className="v1-mono">Slice health = the "code quality" view of observability.</span>
          {' '}Drift, flake, and convergence are all derived from the same trace / metric pipeline as
          the runtime tabs — the difference is that the unit of analysis is a <span className="v1-mono">slice</span>,
          not a request. This is the page on-call hands to the team lead during postmortem.
        </div>
      </div>
    );
  };

  // ============================================================
  // SeededSandboxModal — what happens when you "Open AI sandbox (seeded)"
  // 3 phases: preview → running → done
  // ============================================================
  const SeededSandboxModal = ({ incident, onClose }) => {
    const [phase, setPhase] = useState('preview');
    const [loop, setLoop] = useState(0);
    const [loopResults, setLoopResults] = useState([]);

    React.useEffect(() => {
      if (phase !== 'running') return;
      let cancelled = false;
      const loops = [
        { label: 'Apply suggested patch · pgx pool acquire timeout 30s → 5s', dur: 1100, result: 'pass' },
        { label: 'Run verify: unit + contract',                                dur: 900,  result: 'partial' },
        { label: 'Patch v2: add retry with jitter on ECONNRESET',               dur: 1200, result: 'pass' },
        { label: 'Re-run verify · 9/9 unit · 4/4 contract',                     dur: 800,  result: 'pass' },
      ];
      let i = 0;
      const tick = () => {
        if (cancelled || i >= loops.length) { if (!cancelled) setPhase('done'); return; }
        setLoop(i);
        setTimeout(() => {
          if (cancelled) return;
          setLoopResults(prev => [...prev, loops[i]]);
          i++;
          tick();
        }, loops[i].dur);
      };
      tick();
      return () => { cancelled = true; };
    }, [phase]);

    if (!incident) return null;

    const sandboxId = 'sb-' + (790 + (incident.id === 'inc-204' ? 0 : incident.id === 'inc-203' ? 1 : 2));

    return (
      <div className="dvo-modal-bg" onClick={onClose}>
        <div className="dvo-seed-modal" onClick={e => e.stopPropagation()}>
          <div className="dvo-seed-head">
            <div>
              <div className="dvo-seed-eyebrow">AI sandbox · seeded from incident</div>
              <h2 className="dvo-seed-title">
                <span className="v1-mono">{sandboxId}</span>
                <span className="dvo-inc-state" data-st={phase === 'done' ? 'closed' : phase === 'running' ? 'ack' : 'open'}>
                  {phase === 'preview' ? 'ready' : phase === 'running' ? 'running' : 'converged'}
                </span>
              </h2>
              <div className="dvo-seed-sub">
                source · <span className="v1-mono">{incident.id}</span> · {incident.title}
              </div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>

          <div className="dvo-seed-body">
            <div className="dvo-seed-grid">
              <div>
                <div className="dvo-seed-section-h">Failing trace · seed</div>
                <div className="dvo-seed-trace">
                  <div className="dvo-seed-trace-h">
                    <span className="v1-mono">7f3a…d8e1</span>
                    <span className="devr-trace-st devr-trace-err">slow · 142ms</span>
                  </div>
                  <Waterfall spans={SPAN_SLOW} total={142}/>
                </div>

                <div className="dvo-seed-section-h">Reproducer command</div>
                <div className="dvo-seed-code">
                  <span className="dvo-seed-prompt">$</span> gocell sandbox replay \<br/>
                  <span style={{ paddingLeft: 16 }}>--seed-trace 7f3a…d8e1 \</span><br/>
                  <span style={{ paddingLeft: 16 }}>--incident {incident.id} \</span><br/>
                  <span style={{ paddingLeft: 16 }}>--cell {incident.cell}</span>
                </div>
              </div>

              <div>
                <div className="dvo-seed-section-h">Suspect slice · primary</div>
                {incident.suspects[0] && (
                  <div className="dvo-seed-suspect">
                    <div className="dvo-seed-suspect-h">
                      <span className="dvo-suspect-score" data-sev={incident.suspects[0].sev}>{(incident.suspects[0].score * 100).toFixed(0)}%</span>
                      <span className="v1-mono">{incident.suspects[0].name}</span>
                    </div>
                    <div className="v1-mute" style={{ fontSize: 12, marginTop: 4 }}>{incident.suspects[0].why}</div>
                    <div className="dvo-seed-diff">
                      <div className="dvo-seed-diff-row dvo-seed-diff-h2"><span>cells/auditcore/persist/pool.go</span></div>
                      <div className="dvo-seed-diff-row dvo-seed-diff-del">- pool.MaxOpen = 20</div>
                      <div className="dvo-seed-diff-row dvo-seed-diff-add">+ pool.MaxOpen = 32</div>
                      <div className="dvo-seed-diff-row dvo-seed-diff-del">- ctx, cancel := context.WithTimeout(ctx, 30*time.Second)</div>
                      <div className="dvo-seed-diff-row dvo-seed-diff-add">+ ctx, cancel := context.WithTimeout(ctx, 5*time.Second)</div>
                    </div>
                  </div>
                )}

                <div className="dvo-seed-section-h">What the AI will do</div>
                <ol className="dvo-seed-plan">
                  <li>Reproduce the failing trace locally inside sandbox.</li>
                  <li>Diff against the closest healthy trace; identify the regression.</li>
                  <li>Propose a patch; run verify (unit + contract).</li>
                  <li>Self-loop up to 5 times until all gates green.</li>
                  <li>Open PR for human review · slice allowed-files only.</li>
                </ol>
              </div>
            </div>

            {phase !== 'preview' && (
              <div className="dvo-seed-loops">
                <div className="dvo-seed-section-h" style={{ marginTop: 8 }}>Self-loop progress</div>
                {loopResults.map((r, i) => (
                  <div key={i} className="dvo-seed-loop dvo-seed-loop-done" data-result={r.result}>
                    <span className="dvo-seed-loop-n">{i + 1}</span>
                    <span className="dvo-seed-loop-label">{r.label}</span>
                    <span className="dvo-seed-loop-tag" data-result={r.result}>{r.result === 'pass' ? '✓ pass' : '◐ partial'}</span>
                  </div>
                ))}
                {phase === 'running' && loop >= loopResults.length && (
                  <div className="dvo-seed-loop dvo-seed-loop-active">
                    <span className="dvo-seed-loop-n">{loopResults.length + 1}</span>
                    <span className="dvo-seed-loop-label">working…</span>
                    <span className="dvo-seed-spinner"/>
                  </div>
                )}
              </div>
            )}

            {phase === 'done' && (
              <div className="dvo-seed-result">
                <div className="dvo-seed-section-h" style={{ marginTop: 8 }}>Result · converged in 4 loops</div>
                <div className="dvo-seed-pr">
                  <div className="dvo-seed-pr-h">
                    <span className="dvo-inc-state" data-st="closed">PR ready</span>
                    <span className="v1-mono">gocell/runtime#2247 · "fix: pgx pool acquire timeout + ECONNRESET retry"</span>
                  </div>
                  <div className="dvo-seed-pr-meta">
                    <span><b>+18 −6</b> across 2 files</span>
                    <span>verify <b>13/13</b></span>
                    <span>files within allowedFiles · ✓</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="dvo-seed-foot">
            {phase === 'preview' && (
              <>
                <button className="v1-btn" onClick={onClose}>Cancel</button>
                <button className="v1-btn dvo-btn-primary" onClick={() => setPhase('running')}>Start AI loop</button>
              </>
            )}
            {phase === 'running' && (
              <>
                <span className="v1-mute" style={{ fontSize: 12, marginRight: 'auto' }}>AI is iterating · safe to step away</span>
                <button className="v1-btn dvo-btn-danger" onClick={() => { setPhase('preview'); setLoop(0); setLoopResults([]); }}>Stop</button>
              </>
            )}
            {phase === 'done' && (
              <>
                <button className="v1-btn" onClick={onClose}>Discard</button>
                <button className="v1-btn" onClick={() => {
                  onClose();
                  window.gcNav && window.gcNav({ route: 'sandboxes' });
                }}>Open full sandbox</button>
                <button className="v1-btn dvo-btn-primary">Open PR</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // ROOT
  // ============================================================
  const ObservabilityPage = () => {
    const [range, setRange] = useState('1h');
    const [tab, setTab] = useState('overview');
    const [selectedInc, setSelectedInc] = useState('inc-204');
    const [logTraceFilter, setLogTraceFilter] = useState(null);
    const [seedingFor, setSeedingFor] = useState(null);
    const [selectedTrace, setSelectedTrace] = useState(null);

    // listen for external nav intents (from Audit log, cell pages, etc.)
    React.useEffect(() => {
      const handler = (e) => {
        const intent = e.detail || {};
        if (intent.route && intent.route !== 'observe') return;
        if (intent.tab) setTab(intent.tab);
        if (intent.incidentId) { setSelectedInc(intent.incidentId); setTab(intent.tab || 'incidents'); }
        if (intent.traceId) { setSelectedTrace(intent.traceId); setTab(intent.tab || 'traces'); }
        if (intent.logTraceFilter) { setLogTraceFilter(intent.logTraceFilter); setTab(intent.tab || 'logs'); }
      };
      window.addEventListener('gcNavIntent', handler);
      return () => window.removeEventListener('gcNavIntent', handler);
    }, []);

    const onSeedFromIncident = (incident) => setSeedingFor(incident);
    const onPivotToTrace = (traceId) => { setSelectedTrace(traceId); setTab('traces'); };

    const openCount = INCIDENTS.filter(i => i.state === 'open').length;
    const driftCount = DRIFT.length;
    const errLogCount = LOG_LINES.filter(l => l.lev === 'error').length;

    const tabs = [
      { k: 'overview',  label: 'Overview' },
      { k: 'incidents', label: 'Anomalies', count: openCount, pulse: openCount > 0 },
      { k: 'changed',   label: 'What changed', count: TL_EVENTS.length },
      { k: 'traces',    label: 'Traces',     count: 'live' },
      { k: 'logs',      label: 'Logs',       count: errLogCount + ' err', pulse: errLogCount > 0 },
      { k: 'graph',     label: 'Service graph' },
      { k: 'slices',    label: 'Slice health', count: driftCount },
    ];

    return (
      <div className="dev-backlog dvo-page" style={{ overflow: 'hidden' }}>
        <PageHead range={range} setRange={setRange} onExport={() => console.log('export')}/>
        <div className="dvo-tabs">
          {tabs.map(t => (
            <Tab key={t.k} id={t.k} label={t.label} count={t.count}
                 active={tab === t.k} pulse={t.pulse} onClick={setTab}/>
          ))}
        </div>
        {tab === 'overview'  && <Overview onOpenIncident={setSelectedInc} goTab={setTab}/>}
        {tab === 'incidents' && <Incidents selected={selectedInc} setSelected={setSelectedInc}
                                          onSeed={onSeedFromIncident}/>}
        {tab === 'changed'   && <WhatChanged/>}
        {tab === 'traces'    && <Traces selectedTrace={selectedTrace} setSelectedTrace={setSelectedTrace}/>}
        {tab === 'logs'      && <Logs traceFilter={logTraceFilter} setTraceFilter={setLogTraceFilter}
                                       onPivotTrace={onPivotToTrace}/>}
        {tab === 'graph'     && <ServiceGraph onSeed={() => onSeedFromIncident(INCIDENTS[0])}/>}
        {tab === 'slices'    && <SliceHealth/>}

        {seedingFor && <SeededSandboxModal incident={seedingFor} onClose={() => setSeedingFor(null)}/>}
      </div>
    );
  };

  // Merge into DevReserved (override the v1 ObservabilityPage)
  window.DevReserved = Object.assign({}, window.DevReserved || {}, { ObservabilityPage });
})();
