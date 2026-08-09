/* global React */
// ============================================================
// Operate / Audit log — tamper-evident compliance trail
// Replaces the PlaceholderRoute for route 'audit'.
// Different from Observability/Logs: actor × action × target,
// hash-chained for integrity.
// ============================================================

(() => {
  const { useState, useMemo } = React;

  // ----- data -----
  const ENTRIES = [
    // Most recent first
    { id: 'a-1042', t: '12:48:55', day: 'Today',     actor: { k: 'sandbox', name: 'sb-790',           ip: 'internal',     mfa: '—' },
      action: 'slice.merge',  target: 'auditcore/persist@a7f3 (revert)', result: 'denied',
      reason: 'Sandbox lacks slice.merge permission on auditcore. Escalated to dario@gocell.dev.',
      payload: { repo: 'gocell/runtime', branch: 'sb-790-revert-a7f3', requested_by: 'sb-790', escalate_to: 'dario@gocell.dev' },
      hash: '0x3a91…b042', prev: '0x91c4…d8e1' },

    { id: 'a-1041', t: '12:48:11', day: 'Today',     actor: { k: 'cell',     name: 'observecore',     ip: '10.0.4.21',    mfa: '—' },
      action: 'anomaly.publish', target: 'inc-204 (audit.append burn 4.1×)',  result: 'ok',
      reason: 'Auto-published via observe.metric.emit → anomaly.publish contract chain.',
      payload: { incident: 'inc-204', contract: 'audit.append', burn_rate_1h: 4.1, severity: 'err', auto_seeded_sandbox: 'sb-790' },
      hash: '0x91c4…d8e1', prev: '0x771e…77c3' },

    { id: 'a-1040', t: '12:46:55', day: 'Today',     actor: { k: 'sa',       name: 'sa:platform-bot', ip: '10.0.1.4',     mfa: '—' },
      action: 'config.publish', target: 'configcore.pgx_pool_size 20→32', result: 'ok',
      reason: 'Triggered by rollout plan for slice configcore/db-pool@9c11.',
      payload: { keys: { pgx_pool_size: { from: 20, to: 32 } }, dry_run: false, rollout: 'all-tenants' },
      hash: '0x771e…77c3', prev: '0x6f30…0918' },

    { id: 'a-1039', t: '12:45:02', day: 'Today',     actor: { k: 'human',    name: 'dario@gocell.dev',ip: '203.0.113.4', mfa: 'webauthn' },
      action: 'slice.merge',   target: 'auditcore/persist@a7f3',           result: 'ok',
      reason: 'PR #2241 merged after CI pass + 1 review approval.',
      payload: { pr: 2241, sha: 'a7f37c1', verify_unit: '9/9', verify_contract: '4/4', allowed_files: ['cells/auditcore/persist/*'] },
      hash: '0x6f30…0918', prev: '0x5208…ea42' },

    { id: 'a-1038', t: '12:42:18', day: 'Today',     actor: { k: 'human',    name: 'shihui@gocell.dev',ip: '203.0.113.7', mfa: 'webauthn' },
      action: 'flag.flip',     target: 'flag.audit.batch (off → on)',      result: 'ok',
      reason: 'Gradual rollout completed; full traffic to new audit batcher.',
      payload: { flag: 'audit.batch', from: false, to: true, scope: 'all-tenants', strategy: 'percent', value: 100 },
      hash: '0x5208…ea42', prev: '0x4127…b801' },

    { id: 'a-1037', t: '12:30:14', day: 'Today',     actor: { k: 'sa',       name: 'sa:ci-deployer',  ip: '10.0.0.18',    mfa: '—' },
      action: 'sandbox.apply', target: 'sb-784 (accesscore/jwks-cache@e201)',result: 'ok',
      reason: 'AI sandbox sb-784 converged in 2 loops, verify 12/12 green; applied automatically per cell policy.',
      payload: { sandbox: 'sb-784', cell: 'accesscore', verify_unit: '9/9', verify_contract: '3/3', convergence_loops: 2 },
      hash: '0x4127…b801', prev: '0x3915…aa10' },

    { id: 'a-1036', t: '11:58:00', day: 'Today',     actor: { k: 'human',    name: 'dario@gocell.dev',ip: '203.0.113.4', mfa: 'webauthn' },
      action: 'role.grant',    target: 'shihui@gocell.dev (operator → admin)',result: 'ok',
      reason: 'Promoted to admin to manage upcoming flag rollouts.',
      payload: { subject: 'shihui@gocell.dev', from: 'operator', to: 'admin', justification: 'flag rollout duty' },
      hash: '0x3915…aa10', prev: '0x2280…f110' },

    { id: 'a-1035', t: '11:42:33', day: 'Today',     actor: { k: 'sandbox',  name: 'sb-771',          ip: 'internal',     mfa: '—' },
      action: 'secret.read',   target: 'observe.otlp.token',               result: 'failed',
      reason: 'Secret expired 2 days ago. Sandbox blocked from proceeding; opened ticket.',
      payload: { secret: 'observe.otlp.token', state: 'expired', expired_d: 2 },
      hash: '0x2280…f110', prev: '0x1a07…3344' },

    { id: 'a-1034', t: '10:11:08', day: 'Today',     actor: { k: 'human',    name: 'shihui@gocell.dev',ip: '203.0.113.7', mfa: 'webauthn' },
      action: 'cell.create',   target: 'cells/promomgr (v0.1)',            result: 'ok',
      reason: 'New cell scaffolded for promotion management capability.',
      payload: { cell: 'promomgr', stage: 'preview', owner: 'shihui@gocell.dev', contracts: [] },
      hash: '0x1a07…3344', prev: '0x0f99…ccf3' },

    { id: 'a-1033', t: '09:48:50', day: 'Today',     actor: { k: 'sa',       name: 'sa:ci-deployer',  ip: '10.0.0.18',    mfa: '—' },
      action: 'slice.revert',  target: 'auditcore/cache-warm@8a1c',        result: 'ok',
      reason: 'Reverted slice on burn rate alert (auto-rollback policy).',
      payload: { slice: 'auditcore/cache-warm', from: '8a1c', to: '7c41', policy: 'auto-rollback-on-burn' },
      hash: '0x0f99…ccf3', prev: '0x0c12…aa90' },

    { id: 'a-1032', t: '22:14:02', day: 'Yesterday', actor: { k: 'human',    name: 'dario@gocell.dev',ip: '203.0.113.4', mfa: 'webauthn' },
      action: 'tenant.create', target: 'acme-corp (plan: scale)',          result: 'ok',
      reason: '—',
      payload: { tenant: 'acme-corp', plan: 'scale', region: 'us-east-1' },
      hash: '0x0c12…aa90', prev: '0x0001…0000' },

    { id: 'a-1031', t: '14:22:00', day: 'Yesterday', actor: { k: 'human',    name: 'dario@gocell.dev',ip: '198.51.100.9', mfa: 'webauthn' },
      action: 'user.login',    target: 'session 7f3a-001',                 result: 'ok',
      reason: 'WebAuthn challenge succeeded from new IP (notified).',
      payload: { method: 'webauthn', ip: '198.51.100.9', ua: 'Chrome 129 / macOS', new_ip: true },
      hash: '0x0001…0000', prev: 'genesis' },
  ];

  const ACTORS_K = [
    { k: 'all',     label: 'All actors' },
    { k: 'human',   label: 'Human' },
    { k: 'sa',      label: 'Service account' },
    { k: 'cell',    label: 'Cell (auto)' },
    { k: 'sandbox', label: 'AI sandbox' },
  ];
  const ACTIONS_NS = [
    'all', 'slice.*', 'flag.*', 'config.*', 'sandbox.*', 'role.*', 'secret.*', 'cell.*', 'tenant.*', 'user.*', 'anomaly.*'
  ];

  // syntax-highlight JSON-ish payload
  const PayloadCode = ({ data }) => {
    const lines = JSON.stringify(data, null, 2).split('\n');
    return (
      <div className="dva-d-code">
        {lines.map((line, i) => {
          // tokenize: indent, "key": value
          const m = line.match(/^(\s*)("[^"]+"):\s*(.+?)(,?)$/);
          if (m) {
            const [, indent, key, value, comma] = m;
            const valHtml =
              value.startsWith('"') ? <span className="str">{value.replace(/,$/, '')}</span>
              : value === 'true' || value === 'false' ? <span className="num">{value.replace(/,$/, '')}</span>
              : value === 'null' ? <span className="nul">null</span>
              : !isNaN(parseFloat(value)) ? <span className="num">{value.replace(/,$/, '')}</span>
              : <span>{value.replace(/,$/, '')}</span>;
            return (
              <div key={i}>{indent}<span className="key">{key}</span>: {valHtml}{comma}</div>
            );
          }
          return <div key={i}>{line}</div>;
        })}
      </div>
    );
  };

  // ----- main page -----
  const AuditPage = () => {
    const [query, setQuery] = useState('');
    const [actor, setActor] = useState('all');
    const [actionNs, setActionNs] = useState('all');
    const [result, setResult] = useState('all');
    const [range, setRange] = useState('24h');
    const [selected, setSelected] = useState(ENTRIES[0].id);

    const filtered = ENTRIES.filter(e => {
      if (actor !== 'all' && e.actor.k !== actor) return false;
      if (actionNs !== 'all' && !e.action.startsWith(actionNs.replace('.*',''))) return false;
      if (result !== 'all' && e.result !== result) return false;
      if (query) {
        const hay = `${e.action} ${e.target} ${e.actor.name} ${e.reason}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });

    const sel = ENTRIES.find(e => e.id === selected) || filtered[0] || ENTRIES[0];
    const selIdx = ENTRIES.findIndex(e => e.id === sel.id);
    const chainContext = ENTRIES.slice(Math.max(0, selIdx - 1), selIdx + 2);

    // group by day
    const grouped = filtered.reduce((acc, e) => {
      acc[e.day] = acc[e.day] || [];
      acc[e.day].push(e);
      return acc;
    }, {});

    return (
      <div className="dva-page">
        <div className="dva-head">
          <div className="dva-head-row">
            <div>
              <h1 className="v1-h1">
                Audit log
                <span className="devs-badge devs-live">live</span>
              </h1>
              <p className="v1-sub">
                Tamper-evident record of every privileged action — by humans, service accounts, cells, and
                AI sandboxes. Hash-chained per-tenant; verified continuously by <span className="v1-mono">auditcore</span>.
              </p>
            </div>
            <div className="v1-head-actions">
              <div className="v1-seg">
                {['1h','24h','7d','30d','custom'].map(r => (
                  <button key={r} data-active={range === r || undefined} onClick={() => setRange(r)}>{r}</button>
                ))}
              </div>
              <button className="v1-btn">Export CSV</button>
              <button className="v1-btn">Verify chain</button>
            </div>
          </div>
        </div>

        <div className="dva-chain-card">
          <div className="dva-chain-stat">
            <span className="dva-chain-dot"/>
            chain integrity · <b style={{ fontWeight: 500 }}>OK</b>
          </div>
          <div className="dva-chain-meta">
            <span>last verified <b>14s ago</b></span>
            <span>entries <b>{ENTRIES.length.toLocaleString()}</b> in window · <b>2.4M</b> total</span>
            <span>head <b className="v1-mono">{ENTRIES[0].hash}</b></span>
            <span>genesis <b className="v1-mono">2024-08-04</b></span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span className="dva-pill">SHA-256</span>
            <span className="dva-pill">per-tenant chain</span>
            <span className="dva-pill">co-signed · auditcore + observecore</span>
          </div>
        </div>

        <div className="dva-filters">
          <input className="dva-input" placeholder='filter · e.g.  actor:dario@  action:slice.merge  result:denied  target:auditcore'
                 value={query} onChange={e => setQuery(e.target.value)}/>
          <select className="dva-input" value={actor} onChange={e => setActor(e.target.value)}>
            {ACTORS_K.map(a => <option key={a.k} value={a.k}>{a.label}</option>)}
          </select>
          <select className="dva-input" value={actionNs} onChange={e => setActionNs(e.target.value)}>
            {ACTIONS_NS.map(a => <option key={a} value={a}>{a === 'all' ? 'all actions' : a}</option>)}
          </select>
          <select className="dva-input" value={result} onChange={e => setResult(e.target.value)}>
            <option value="all">all results</option>
            <option value="ok">ok</option>
            <option value="denied">denied</option>
            <option value="failed">failed</option>
          </select>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-faint)', justifySelf: 'end' }}>
            {filtered.length} / {ENTRIES.length} shown
          </span>
        </div>

        <div className="dva-bulk-bar">
          <span className="v1-mono" style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>quick filters:</span>
          <button className="dvo-chip" onClick={() => { setActor('sandbox'); setResult('denied'); }}>sandbox denials</button>
          <button className="dvo-chip" onClick={() => { setActionNs('secret.*'); }}>secret reads</button>
          <button className="dvo-chip" onClick={() => { setActionNs('flag.*'); }}>flag flips</button>
          <button className="dvo-chip" onClick={() => { setResult('failed'); }}>failures only</button>
          <button className="dvo-chip" onClick={() => { setActor('human'); setActionNs('role.*'); }}>role changes by humans</button>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--fg-faint)' }}>
            click an entry to see full payload + chain context
          </span>
        </div>

        <div className="dva-layout">
          <div className="dva-list">
            <div className="dva-list-inner">
              {Object.entries(grouped).map(([day, rows]) => (
                <React.Fragment key={day}>
                  <div className="dva-day">{day} · {rows.length}</div>
                  {rows.map(e => (
                    <button key={e.id} className="dva-row" data-active={sel.id === e.id || undefined}
                            onClick={() => setSelected(e.id)}>
                      <span className="dva-t">{e.t}</span>
                      <span className="dva-actor" data-k={e.actor.k}>{e.actor.k}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {e.actor.name}
                      </span>
                      <span>
                        <span className="dva-action">
                          <span className="ns">{e.action.split('.').slice(0,-1).join('.')}.</span>
                          {e.action.split('.').pop()}
                        </span>
                        <span className="dva-target" style={{ display: 'block', marginTop: 2 }}>{e.target}</span>
                      </span>
                      <span className="dva-result" data-r={e.result}>{e.result}</span>
                      <span className="dva-hash">{e.hash.slice(2,8)}</span>
                    </button>
                  ))}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--fg-faint)' }}>
                  No entries match this filter.
                </div>
              )}
            </div>
          </div>

          <div className="dva-detail">
            <div className="dva-d-h">
              <span className="dva-actor" data-k={sel.actor.k}>{sel.actor.k}</span>
              <span className="dva-result" data-r={sel.result}>{sel.result}</span>
            </div>
            <div className="dva-d-action">{sel.action}</div>
            <div className="dva-d-sub">{sel.target}</div>

            <div className="dva-kv">
              <div className="k">Entry id</div><div className="v">{sel.id}</div>
              <div className="k">Timestamp</div><div className="v">{sel.day} · {sel.t} UTC</div>
              <div className="k">Actor</div><div className="v">{sel.actor.name}</div>
              <div className="k">Source IP</div><div className="v">{sel.actor.ip}</div>
              <div className="k">MFA</div><div className="v">{sel.actor.mfa}</div>
            </div>

            <div className="dva-d-section-h">Reason / context</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>{sel.reason || '—'}</div>

            <div className="dva-d-section-h">Payload (signed)</div>
            <PayloadCode data={sel.payload}/>

            <div className="dva-d-section-h">Hash chain</div>
            <div className="dva-chain">
              {chainContext.map((e, i) => (
                <div key={e.id} className="dva-chain-link" data-self={e.id === sel.id || undefined}>
                  <div className="dva-chain-rail"/>
                  <div className="dva-chain-info">
                    <b>{e.hash}</b>
                    <span>← prev {e.prev}</span>
                    <span style={{ marginLeft: 'auto' }}>{e.t}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              chain verified · co-signed by auditcore + observecore
            </div>

            <div className="dva-d-section-h">Related</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sel.action.startsWith('slice') && (
                <button className="v1-btn" onClick={() => {
                  const targetCell = sel.target.split('/')[0];
                  window.gcNav && window.gcNav({ route: 'cells', cellId: targetCell });
                }}>Open slice</button>
              )}
              {sel.action.startsWith('flag') && (
                <button className="v1-btn" onClick={() => {
                  const flagId = (sel.payload && sel.payload.flag) || null;
                  window.gcNav && window.gcNav({ route: 'flags', flagId });
                }}>Open flag history</button>
              )}
              {sel.action.startsWith('sandbox') && (
                <button className="v1-btn" onClick={() => {
                  const sandboxId = (sel.payload && sel.payload.sandbox) || null;
                  window.gcNav && window.gcNav({ route: 'sandboxes', sandboxId });
                }}>Open sandbox</button>
              )}
              {sel.action === 'anomaly.publish' && (
                <button className="v1-btn" onClick={() => {
                  const incidentId = (sel.payload && sel.payload.incident) || null;
                  window.gcNav && window.gcNav({ route: 'observe', tab: 'incidents', incidentId });
                }}>Open incident</button>
              )}
              {sel.action.startsWith('config') && (
                <button className="v1-btn" onClick={() => {
                  window.gcNav && window.gcNav({ route: 'config' });
                }}>Open configuration</button>
              )}
              <button className="v1-btn">View in trace</button>
              <button className="v1-btn">Copy as JSON</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  window.DevAudit = { AuditPage };
})();
