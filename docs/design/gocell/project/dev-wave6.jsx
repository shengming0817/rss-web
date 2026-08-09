/* global React */
// Wave 6 — Cell tab flesh-out + cross-cell linkage
//   Replaces 4 thin tabs with richer Jamf-style inspectors:
//     Configuration · Audit · Groups · AI
//   Plus: Contracts/Deps tabs already link to global registry; here we make the
//         global Contract registry deep-link back into a cell's produces/consumes,
//         and the Dependencies graph deep-link to the consuming cell's detail.

(() => {
  const { useState, useMemo } = React;

  // ============================================================
  // Configuration tab — keys + flags + env overrides + history
  // ============================================================
  const CONFIG_DETAIL = {
    'access.token_ttl':     { type: 'duration', default: '15m', source: 'configcore', validation: '>= 1m, <= 24h', envOverride: { dev: '5m', prod: '15m' } },
    'access.refresh_ttl':   { type: 'duration', default: '12h', source: 'configcore', validation: '>= 1h, <= 30d', envOverride: { dev: '1h', prod: '12h' } },
    'access.max_sessions':  { type: 'int',      default: '8',   source: 'configcore', validation: '1..64',         envOverride: {} },
    'access.saml_off':      { type: 'flag',     default: 'off', source: 'flags',      validation: 'on|off',         envOverride: {} },
    'merkle.batch_size':    { type: 'int',      default: '1024',source: 'configcore', validation: '256..16384',     envOverride: { stage: '512', prod: '1024' } },
    'merkle.proof_v2':      { type: 'flag',     default: '100%',source: 'flags',      validation: '%|cell|tenant',  envOverride: {} },
    'config.diff_v2':       { type: 'flag',     default: '20%', source: 'flags',      validation: '%|cell|tenant',  envOverride: { dev: '100%', stage: '50%', prod: '20%' } },
    'otlp.endpoint':        { type: 'url',      default: 'tempo:4317', source: 'configcore', validation: 'host:port', envOverride: { dev: 'localhost:4317' } },
  };
  const CONFIG_HISTORY = {
    'access.token_ttl':    [{ t: '3d', who: '@li.wei', from: '10m', to: '15m', reason: 'extend per security review' }],
    'merkle.batch_size':   [{ t: '6d', who: '@chen', from: '512', to: '1024', reason: 'reduce p99 fanout' }],
    'config.diff_v2':      [{ t: '12h', who: '@park', from: '5%', to: '20%', reason: 'rollout step' }],
  };

  const ConfigurationTabV2 = ({ c }) => {
    const [active, setActive] = useState(c.config[0]?.k || c.flags[0]?.k);
    const all = useMemo(() => [
      ...c.config.map(x => ({ ...x, kind: 'config' })),
      ...c.flags.map(x  => ({ k: x.k, v: x.rollout, kind: 'flag' })),
    ], [c.id]);
    const sel = all.find(x => x.k === active) || all[0];
    const detail = sel && CONFIG_DETAIL[sel.k];
    const history = sel && CONFIG_HISTORY[sel.k] || [];

    return (
      <div className="devcell-grid">
        <div className="devcell-card devcell-span-2">
          <div className="devcell-card-h">
            Keys ({c.config.length}) + flags ({c.flags.length})
            <button className="v1-link" style={{marginLeft:'auto'}}>+ Add key</button>
          </div>
          <div className="devw6-cfg-list">
            {all.map(x => (
              <button key={x.k} className="devw6-cfg-row" data-active={sel?.k === x.k || undefined}
                      onClick={() => setActive(x.k)}>
                <span className="devw6-cfg-kind" data-kind={x.kind}>{x.kind === 'flag' ? 'flag' : 'cfg'}</span>
                <span className="v1-mono devw6-cfg-k">{x.k}</span>
                <span className="v1-mono devw6-cfg-v">{x.v}</span>
                {CONFIG_HISTORY[x.k] && <span className="devw6-cfg-hist" title="Has history">↻</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="devcell-card">
          <div className="devcell-card-h">Inspect</div>
          {!sel
            ? <div className="v1-mute" style={{fontSize:12.5}}>Select a key.</div>
            : <div className="devw6-cfg-insp">
                <div className="v1-mono devw6-cfg-insp-k">{sel.k}</div>
                <div className="devw6-cfg-insp-v v1-mono">{sel.v}</div>
                <dl className="devw6-cfg-meta">
                  <dt>Type</dt>     <dd className="v1-mono">{detail?.type || '—'}</dd>
                  <dt>Default</dt>  <dd className="v1-mono">{detail?.default || '—'}</dd>
                  <dt>Source</dt>   <dd className="v1-mono">{detail?.source || '—'}</dd>
                  <dt>Validation</dt><dd className="v1-mono">{detail?.validation || 'none'}</dd>
                </dl>
                {detail?.envOverride && Object.keys(detail.envOverride).length > 0 && (
                  <div className="devw6-cfg-envs">
                    <div className="devw6-cfg-envs-h">Per-env overrides</div>
                    {Object.entries(detail.envOverride).map(([env, val]) => (
                      <div key={env} className="devw6-cfg-env">
                        <span className="devw6-env-tag" data-env={env}>{env}</span>
                        <span className="v1-mono">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
                {history.length > 0 && (
                  <div className="devw6-cfg-hist-list">
                    <div className="devw6-cfg-envs-h">Change history</div>
                    {history.map((h, i) => (
                      <div key={i} className="devw6-cfg-hist-row">
                        <span className="v1-mono devw6-cfg-hist-when">{h.t}</span>
                        <span className="v1-mono">{h.who}</span>
                        <span className="v1-mono devw6-cfg-hist-delta">{h.from} → {h.to}</span>
                        <div className="devw6-cfg-hist-why v1-mute">{h.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          }
        </div>
      </div>
    );
  };

  // ============================================================
  // Audit tab — filterable timeline + summary stats + linked PRs
  // ============================================================
  const ACT_META = {
    deploy:   { tone: 'deploy',   label: 'deploy' },
    contract: { tone: 'contract', label: 'contract' },
    review:   { tone: 'review',   label: 'review' },
    config:   { tone: 'config',   label: 'config' },
    flag:     { tone: 'flag',     label: 'flag' },
    incident: { tone: 'incident', label: 'incident' },
    rollback: { tone: 'incident', label: 'rollback' },
  };

  // Augment a cell's activity with synth events to give the timeline body.
  const augmentActivity = (c) => {
    const ext = [
      { t: '4d ago', who: '@li.wei', what: 'config',   detail: 'access.token_ttl 10m → 15m' },
      { t: '5d ago', who: 'agent/claude', what: 'review', detail: 'PR #4502 — JWKS kid lookup, merged' },
      { t: '7d ago', who: '@kim',    what: 'flag',     detail: 'access.saml_off → off' },
      { t: '9d ago', who: '@li.wei', what: 'incident', detail: 'auth p99 spike — reverted #4498' },
      { t: '12d ago',who: '@chen',   what: 'deploy',   detail: 'v2.4.0 — session refresh rotation' },
    ];
    return [...c.activity, ...ext];
  };

  const AuditTabV2 = ({ c }) => {
    const all = useMemo(() => augmentActivity(c), [c.id]);
    const [filter, setFilter] = useState('all');
    const filtered = filter === 'all' ? all : all.filter(a => a.what === filter);
    const counts = all.reduce((acc, a) => (acc[a.what] = (acc[a.what] || 0) + 1, acc), {});
    const filters = ['all', ...Object.keys(counts)];

    return (
      <div className="devcell-grid">
        <div className="devcell-card devcell-span-2">
          <div className="devcell-card-h">
            Activity · {filtered.length} of {all.length}
            <div className="devw6-aud-filters" style={{marginLeft:'auto'}}>
              {filters.map(f => (
                <button key={f} className="devw6-aud-pill"
                        data-active={filter === f || undefined}
                        onClick={() => setFilter(f)}>
                  {f}{f !== 'all' && <span className="devw6-aud-pill-c">{counts[f]}</span>}
                </button>
              ))}
            </div>
          </div>
          <ol className="devw6-aud-tl">
            {filtered.map((a, i) => {
              const meta = ACT_META[a.what] || { tone: 'config', label: a.what };
              return (
                <li key={i}>
                  <span className="devw6-aud-rail" data-tone={meta.tone}/>
                  <div className="devw6-aud-card">
                    <div className="devw6-aud-card-h">
                      <span className="devw6-aud-tag" data-tone={meta.tone}>{meta.label}</span>
                      <span className="v1-mono v1-mute" style={{fontSize:11.5}}>{a.t}</span>
                      <span className="v1-mono" style={{fontSize:11.5}}>{a.who}</span>
                    </div>
                    <div className="devw6-aud-card-d">{a.detail}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="devcell-card">
          <div className="devcell-card-h">Summary (30d)</div>
          <ul className="devw6-aud-sum">
            {Object.keys(ACT_META).map(k => (
              <li key={k}>
                <span className="devw6-aud-tag" data-tone={ACT_META[k].tone}>{ACT_META[k].label}</span>
                <b className="v1-mono">{counts[k] || 0}</b>
              </li>
            ))}
          </ul>
          <div className="devw6-aud-rate">
            <div className="devw6-aud-rate-h">Change cadence</div>
            <div className="devw6-aud-bars">
              {[3, 5, 4, 7, 6, 9, 5, 8, 12, 4, 6, 10].map((v, i) => (
                <span key={i} className="devw6-aud-bar" style={{ height: (v * 4) + 'px' }}/>
              ))}
            </div>
            <div className="v1-mute" style={{fontSize:11}}>last 12 weeks</div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // Groups tab — static + smart preview, with member-cell counts
  // ============================================================
  const SMART_GROUPS = [
    { name: 'L3 capability cells',    q: 'tier=L3', members: 6 },
    { name: 'Identity domain',        q: 'domain=Identity', members: 3 },
    { name: 'Cells with breaking changes', q: 'status=breaking', members: 1 },
    { name: 'Cells without owner',    q: 'owner is null', members: 0 },
    { name: 'Audit-emitting cells',   q: 'consumes(audit.append)', members: 5 },
    { name: 'Hot path cells (qps > 1000)', q: 'qps>1000', members: 4 },
  ];
  const GroupsTabV2 = ({ c, nav }) => {
    const myGroupNames = c.groups.map(g => g.name);
    return (
      <div className="devcell-grid">
        <div className="devcell-card devcell-span-2">
          <div className="devcell-card-h">
            Static taxonomy ({c.groups.length})
            <span className="v1-mute" style={{marginLeft:'auto', fontSize:11.5}}>tags assigned at registration</span>
          </div>
          <ul className="devw6-grp-static">
            {c.groups.map(g => (
              <li key={g.name}>
                <span className="devw6-grp-mark"/>
                <span>{g.name}</span>
                <span className="devw6-grp-tag">{g.kind}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="devcell-card">
          <div className="devcell-card-h">Memberships</div>
          <div className="devw6-grp-stat">
            <div><b>{c.groups.length}</b><span>static</span></div>
            <div><b>{SMART_GROUPS.filter(g => g.members > 0).length}</b><span>smart</span></div>
            <div><b>{c.tasks.length}</b><span>tasks</span></div>
          </div>
        </div>
        <div className="devcell-card devcell-span-3">
          <div className="devcell-card-h">
            Smart groups · saved queries
            <button className="v1-link" style={{marginLeft:'auto'}} onClick={() => nav && nav('groups')}>Open Smart Groups →</button>
          </div>
          <table className="devg-table devcell-tbl">
            <thead><tr><th>Group</th><th>Query</th><th style={{textAlign:'right'}}>Members</th><th>This cell</th></tr></thead>
            <tbody>
              {SMART_GROUPS.map(g => {
                const matches = (
                  (g.q === 'tier=L3' && c.tier === 'L3') ||
                  (g.q === 'domain=Identity' && c.domain === 'Identity') ||
                  (g.q === 'status=breaking' && c.status === 'breaking') ||
                  (g.q === 'consumes(audit.append)' && (c.consumes || []).some(x => x.id === 'audit.append')) ||
                  (g.q === 'qps>1000' && (c.runtime?.qps || 0) > 1000)
                );
                return (
                  <tr key={g.name}>
                    <td>{g.name}</td>
                    <td className="v1-mono" style={{fontSize:11.5, color:'var(--fg-muted)'}}>{g.q}</td>
                    <td className="v1-mono" style={{textAlign:'right'}}>{g.members}</td>
                    <td>{matches
                      ? <span className="devc-status devc-status-stable">✓ in</span>
                      : <span className="v1-mute" style={{fontSize:11.5}}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // AI tab — historical sessions + cost ledger + active sandboxes
  // ============================================================
  const AITabV2 = ({ c, nav }) => {
    const sessions = useMemo(() => {
      const base = c.ai || [];
      // synth a few prior sessions per cell for body
      const synth = [
        { id: 'AI-' + (1000 + Math.abs(c.id.length * 17) % 999), task: 'T-' + (90 + (c.id.length * 7) % 50), status: 'merged', tokens: '8.4k', model: 'sonnet-4.5', dur: '14m', cost: 0.41 },
        { id: 'AI-' + (1100 + Math.abs(c.id.length * 11) % 999), task: 'T-' + (90 + (c.id.length * 11) % 50), status: 'review', tokens: '12.2k', model: 'sonnet-4.5', dur: '22m', cost: 0.66 },
        { id: 'AI-' + (1200 + Math.abs(c.id.length * 13) % 999), task: 'T-' + (90 + (c.id.length * 13) % 50), status: 'failed', tokens: '4.1k', model: 'sonnet-4.5', dur: '6m', cost: 0.18 },
      ];
      return [...base.map(b => ({ ...b, model: 'sonnet-4.5', dur: '18m', cost: 0.55 })), ...synth];
    }, [c.id]);
    const totalTok = sessions.reduce((s, x) => s + parseFloat(x.tokens), 0).toFixed(1);
    const totalCost = sessions.reduce((s, x) => s + (x.cost || 0), 0).toFixed(2);
    const merged = sessions.filter(x => x.status === 'merged').length;

    const SBX = (window.DevCell3 && window.DevCell3.SANDBOXES) || [];
    const cellSandboxes = SBX.filter(s => s.cell === c.id);

    return (
      <div className="devcell-grid">
        <div className="devcell-card">
          <div className="devcell-card-h">Cost ledger</div>
          <div className="devw6-ai-stats">
            <div><b>{sessions.length}</b><span>sessions</span></div>
            <div><b>{merged}</b><span>merged</span></div>
            <div><b>{totalTok}k</b><span>tokens</span></div>
            <div><b>${totalCost}</b><span>cost</span></div>
          </div>
        </div>
        <div className="devcell-card devcell-span-2">
          <div className="devcell-card-h">
            Active sandboxes ({cellSandboxes.length})
            <button className="v1-link" style={{marginLeft:'auto'}} onClick={() => nav && nav('sandboxes')}>Sandboxes →</button>
          </div>
          {cellSandboxes.length === 0
            ? <div className="v1-mute" style={{fontSize:12.5}}>No live sandboxes for this cell.</div>
            : <ul className="devw6-ai-sbx">
                {cellSandboxes.map(s => (
                  <li key={s.id} data-status={s.status}>
                    <span className="devw6-ai-sbx-status" data-s={s.status}>{s.status}</span>
                    <span className="v1-mono">{s.id}</span>
                    <span className="v1-mono devw6-ai-sbx-task">{s.task}</span>
                    <span className="v1-mono v1-mute" style={{fontSize:11}}>{s.driver} · {s.created} ago</span>
                    <span className="v1-mono devw6-ai-sbx-diff"><span className="devw3-good">+{s.diff.add}</span> <span className="devw3-bad">−{s.diff.del}</span></span>
                  </li>
                ))}
              </ul>
          }
        </div>
        <div className="devcell-card devcell-span-3">
          <div className="devcell-card-h">
            Session history
            <button className="v1-link" style={{marginLeft:'auto'}} onClick={() => nav && nav('ai')}>Open AI Studio →</button>
          </div>
          <table className="devg-table devcell-tbl">
            <thead><tr><th>Session</th><th>Task</th><th>Model</th><th>Status</th><th style={{textAlign:'right'}}>Duration</th><th style={{textAlign:'right'}}>Tokens</th><th style={{textAlign:'right'}}>Cost</th></tr></thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td className="v1-mono">{s.id}</td>
                  <td className="v1-mono">{s.task}</td>
                  <td className="v1-mono v1-mute" style={{fontSize:11.5}}>{s.model}</td>
                  <td><span className={`devc-status devc-status-${s.status === 'merged' ? 'stable' : s.status === 'review' ? 'preview' : 'breaking'}`}>{s.status}</span></td>
                  <td style={{textAlign:'right'}} className="v1-mono">{s.dur}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">{s.tokens}</td>
                  <td style={{textAlign:'right'}} className="v1-mono">${s.cost?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // Override the cell tabs after dev-cell loaded
  // ============================================================
  // Patch into TAB_BODY at runtime via a wrapper. We expose v2 components and
  // rely on dev-shell to prefer them via a small monkey-patch on DevCell.
  if (window.DevCell) {
    window.DevCell._v6 = {
      ConfigurationTab: ConfigurationTabV2,
      AuditTab: AuditTabV2,
      GroupsTab: GroupsTabV2,
      AITab: AITabV2,
    };
  }
  window.DevWave6 = { ConfigurationTabV2, AuditTabV2, GroupsTabV2, AITabV2 };
})();
