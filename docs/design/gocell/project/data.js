// Shared demo data used across all four admin variations.
// Loaded as a plain script and attached to window.

window.GC_DATA = {
  users: [
    { id: 'usr_01H9XK', name: 'Alex Chen',     username: 'alex',       email: 'alex@gocell.dev',     role: 'Admin',     status: 'active',  lastSeen: '2m ago',   createdAt: '2025-03-14' },
    { id: 'usr_02G7PN', name: 'Maya Ortiz',    username: 'maya',       email: 'maya@gocell.dev',     role: 'Operator',  status: 'active',  lastSeen: '14m ago',  createdAt: '2025-04-02' },
    { id: 'usr_03B2KD', name: 'Ren Takahashi', username: 'ren',        email: 'ren@gocell.dev',      role: 'Admin',     status: 'active',  lastSeen: '1h ago',   createdAt: '2024-11-19' },
    { id: 'usr_04F4LM', name: 'Priya Shah',    username: 'priya',      email: 'priya@gocell.dev',    role: 'Developer', status: 'locked',  lastSeen: '3d ago',   createdAt: '2025-01-22' },
    { id: 'usr_05W9QJ', name: 'Luka Novak',    username: 'luka',       email: 'luka@gocell.dev',     role: 'Developer', status: 'active',  lastSeen: 'just now', createdAt: '2025-06-08' },
    { id: 'usr_06T3XA', name: 'Sana Koroma',   username: 'sana',       email: 'sana@gocell.dev',     role: 'Viewer',    status: 'active',  lastSeen: '5h ago',   createdAt: '2025-02-11' },
    { id: 'usr_07L1UV', name: 'Oren Fields',   username: 'oren',       email: 'oren@gocell.dev',     role: 'Operator',  status: 'invited', lastSeen: '—',        createdAt: '2026-04-20' },
    { id: 'usr_08R8ZP', name: 'Nadia Rao',     username: 'nadia',      email: 'nadia@gocell.dev',    role: 'Developer', status: 'active',  lastSeen: '22m ago',  createdAt: '2025-09-01' },
  ],

  audit: [
    { id: 'evt_4f9e',  ts: '12:42:08.114', eventType: 'session.login.succeeded', actor: 'alex',  cell: 'accesscore',  level: 'info',  payload: { ip: '10.0.4.22', ua: 'Chrome 140' } },
    { id: 'evt_4f9d',  ts: '12:41:55.004', eventType: 'order.created',           actor: 'maya',  cell: 'todoorder',   level: 'info',  payload: { orderId: 'ord_9a1', item: 'foo' } },
    { id: 'evt_4f9c',  ts: '12:41:49.882', eventType: 'config.published',        actor: 'ren',   cell: 'configcore',  level: 'info',  payload: { key: 'rate_limit.http', version: 14 } },
    { id: 'evt_4f9b',  ts: '12:41:30.221', eventType: 'rbac.role.assigned',      actor: 'alex',  cell: 'accesscore',  level: 'info',  payload: { target: 'priya', role: 'Developer' } },
    { id: 'evt_4f9a',  ts: '12:40:12.445', eventType: 'user.locked',             actor: 'alex',  cell: 'accesscore',  level: 'warn',  payload: { target: 'priya', reason: 'threshold' } },
    { id: 'evt_4f99',  ts: '12:39:48.019', eventType: 'outbox.publish.failed',   actor: 'system',cell: 'todoorder',   level: 'error', payload: { entry: 'ob_812', retries: 3 } },
    { id: 'evt_4f98',  ts: '12:39:02.603', eventType: 'cell.start',              actor: 'system',cell: 'auditcore',   level: 'info',  payload: { pid: 4412 } },
    { id: 'evt_4f97',  ts: '12:38:50.112', eventType: 'session.refresh',         actor: 'maya',  cell: 'accesscore',  level: 'info',  payload: { tokenAge: '14m' } },
  ],

  configs: [
    { key: 'rate_limit.http',      value: '{"rps":600,"burst":1200}',         version: 14, publishedAt: '2d ago',   env: 'prod' },
    { key: 'feature.new_checkout', value: 'true',                              version: 3,  publishedAt: '5h ago',   env: 'prod' },
    { key: 'outbox.poll_interval', value: '"250ms"',                           version: 22, publishedAt: '11h ago',  env: 'prod' },
    { key: 'auth.jwt.ttl',         value: '"15m"',                             version: 7,  publishedAt: '1w ago',   env: 'prod' },
    { key: 'audit.retention_days', value: '90',                                version: 4,  publishedAt: '3w ago',   env: 'prod' },
    { key: 'telemetry.otel.endpoint', value: '"otlp://collector:4317"',         version: 12, publishedAt: '1d ago',   env: 'staging' },
  ],

  flags: [
    { key: 'checkout.v2',           enabled: true,  rollout: 100, env: 'prod' },
    { key: 'audit.hash_chain',      enabled: true,  rollout: 100, env: 'prod' },
    { key: 'experiment.new_nav',    enabled: false, rollout: 0,   env: 'prod' },
    { key: 'beta.websocket_push',   enabled: true,  rollout: 35,  env: 'staging' },
    { key: 'quota.elastic_burst',   enabled: false, rollout: 0,   env: 'prod' },
  ],

  cells: [
    { id: 'accesscore',  type: 'core',    level: 'L1', health: 'ok',    slices: 9, p99: '12ms', rps: 248 },
    { id: 'auditcore',   type: 'core',    level: 'L2', health: 'ok',    slices: 4, p99: '8ms',  rps: 94 },
    { id: 'configcore',  type: 'core',    level: 'L1', health: 'ok',    slices: 6, p99: '5ms',  rps: 31 },
    { id: 'todoorder',   type: 'edge',    level: 'L2', health: 'warn',  slices: 3, p99: '41ms', rps: 612 },
    { id: 'ssobff',      type: 'edge',    level: 'L1', health: 'ok',    slices: 2, p99: '22ms', rps: 410 },
    { id: 'iotdevice',   type: 'support', level: 'L4', health: 'ok',    slices: 5, p99: '—',    rps: 14 },
  ],

  // tiny sparkline helper
  spark: (seed) => {
    const pts = [];
    let v = 40 + (seed % 20);
    for (let i = 0; i < 24; i++) {
      v += ((seed * (i + 3)) % 17) - 8;
      v = Math.max(8, Math.min(80, v));
      pts.push(v);
    }
    return pts;
  }
};
