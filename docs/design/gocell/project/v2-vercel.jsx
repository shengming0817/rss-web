/* global React */
// ============================================================
// Variation 2 — Vercel / Railway: dark-first, mono data, dense KPI
// Characterized by: deep background, neon accent lines, data-heavy
// cards with sparklines, mono-heavy typography, "ops console" feel.
// ============================================================

const { useState: uS2 } = React;

const V2_Ico = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const v2I = {
  dot: <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>,
  search: <V2_Ico d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35" />,
  plus: <V2_Ico d="M12 5v14 M5 12h14" />,
  chev: <V2_Ico d="M9 6l6 6-6 6" />,
  play: <V2_Ico d="M6 4l14 8-14 8V4z" />,
  bell: <V2_Ico d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2z M10 21h4" />,
  close: <V2_Ico d="M18 6L6 18 M6 6l12 12" />,
};

const V2Spark = ({ seed, clr = 'var(--v2-accent)' }) => {
  const pts = window.GC_DATA.spark(seed);
  const max = Math.max(...pts);
  const poly = pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${30 - (v / max) * 26 - 2}`).join(' ');
  const area = `0,30 ${poly} 100,30`;
  return (
    <svg viewBox="0 0 100 30" className="v2-spark" preserveAspectRatio="none">
      <polygon points={area} fill={clr} opacity="0.12" />
      <polyline points={poly} fill="none" stroke={clr} strokeWidth="1.2" />
    </svg>
  );
};

// overview — the landing page for V2
const V2Overview = () => {
  const cells = window.GC_DATA.cells;
  const stats = [
    { label: 'REQUESTS / MIN',  value: '1,409',  delta: '+12.4%', seed: 17 },
    { label: 'P99 LATENCY',     value: '23ms',   delta: '−4.1%',  seed: 29 },
    { label: 'ERROR RATE',      value: '0.04%',  delta: '+0.01%', seed: 7,  warn: true },
    { label: 'OUTBOX LAG',      value: '142ms',  delta: '−18ms',  seed: 11 },
  ];
  return (
    <>
      <div className="v2-stats">
        {stats.map(s => (
          <div key={s.label} className="v2-stat">
            <div className="v2-stat-label">{s.label}</div>
            <div className="v2-stat-value">{s.value}</div>
            <div className="v2-stat-meta">
              <span className={'v2-delta' + (s.warn ? ' v2-delta-warn' : '')}>{s.delta}</span>
              <span className="v2-mute">vs 1h</span>
            </div>
            <V2Spark seed={s.seed} />
          </div>
        ))}
      </div>

      <div className="v2-grid2">
        <div className="v2-panel">
          <div className="v2-panel-head">
            <h3>Cells</h3>
            <span className="v2-mute">{cells.length} running · 1 warn</span>
          </div>
          <div className="v2-cells">
            {cells.map(c => (
              <div key={c.id} className="v2-cell-row">
                <span className={'v2-ind v2-ind-' + (c.health === 'warn' ? 'warn' : 'ok')}>{v2I.dot}</span>
                <span className="v2-mono v2-cell-name">{c.id}</span>
                <span className="v2-badge">{c.type}</span>
                <span className="v2-badge v2-badge-ghost">{c.level}</span>
                <span className="v2-mute v2-mono" style={{ marginLeft: 'auto' }}>{c.p99}</span>
                <span className="v2-mono">{c.rps}</span>
                <span className="v2-mute">rps</span>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-panel">
          <div className="v2-panel-head">
            <h3>Recent events</h3>
            <button className="v2-ghost v2-mono">LIVE ●</button>
          </div>
          <div className="v2-events">
            {window.GC_DATA.audit.slice(0, 7).map(e => (
              <div key={e.id} className="v2-event">
                <span className="v2-mono v2-mute">{e.ts.slice(0, 8)}</span>
                <span className={'v2-ind v2-ind-' + (e.level === 'error' ? 'err' : e.level === 'warn' ? 'warn' : 'ok')}>{v2I.dot}</span>
                <span className="v2-mono">{e.eventType}</span>
                <span className="v2-mute">by {e.actor}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

const V2Users = () => {
  const users = window.GC_DATA.users;
  return (
    <>
      <div className="v2-toolbar">
        <div className="v2-search">
          {v2I.search}
          <input placeholder="Filter users, emails, roles..." />
          <span className="v2-kbd">⌘F</span>
        </div>
        <div className="v2-toolbar-actions">
          <button className="v2-btn">Export CSV</button>
          <button className="v2-btn v2-btn-primary">{v2I.plus}<span>Invite member</span></button>
        </div>
      </div>
      <div className="v2-table">
        <div className="v2-tr v2-th">
          <div>MEMBER</div>
          <div>ROLE</div>
          <div>STATUS</div>
          <div>LAST ACTIVE</div>
          <div>ID</div>
        </div>
        {users.map(u => (
          <div key={u.id} className="v2-tr">
            <div className="v2-cell-name">
              <div className="v2-avatar">{u.name.split(' ').map(s => s[0]).join('')}</div>
              <div>
                <div>{u.name}</div>
                <div className="v2-mute v2-mono" style={{ fontSize: 11.5 }}>{u.email}</div>
              </div>
            </div>
            <div><span className="v2-badge">{u.role}</span></div>
            <div>
              <span className={'v2-ind v2-ind-' + (u.status === 'active' ? 'ok' : u.status === 'locked' ? 'err' : 'warn')}>{v2I.dot}</span>
              <span className="v2-mono v2-mute" style={{ marginLeft: 6 }}>{u.status.toUpperCase()}</span>
            </div>
            <div className="v2-mute v2-mono">{u.lastSeen}</div>
            <div className="v2-mono v2-mute">{u.id}</div>
          </div>
        ))}
      </div>
    </>
  );
};

const V2Audit = () => {
  const ev = window.GC_DATA.audit;
  return (
    <>
      <div className="v2-toolbar">
        <div className="v2-search">
          {v2I.search}
          <input placeholder="event_type, actor_id, cell..." defaultValue="level:warn OR level:error" />
        </div>
        <div className="v2-seg2">
          <button data-active>LIVE</button>
          <button>1H</button>
          <button>24H</button>
          <button>7D</button>
        </div>
      </div>
      <div className="v2-log">
        {ev.concat(ev).map((e, i) => (
          <div key={i} className="v2-log-row">
            <span className="v2-mono v2-mute">{e.ts}</span>
            <span className={'v2-mono v2-log-lvl v2-log-lvl-' + e.level}>{e.level.toUpperCase().padEnd(5)}</span>
            <span className="v2-mono v2-log-name">{e.eventType}</span>
            <span className="v2-mono v2-mute">actor={e.actor}</span>
            <span className="v2-mono v2-mute">cell={e.cell}</span>
            <span className="v2-mono v2-mute">id={e.id}</span>
          </div>
        ))}
      </div>
    </>
  );
};

const V2Flags = () => {
  const [flags, setFlags] = uS2(window.GC_DATA.flags);
  return (
    <div className="v2-flaglist">
      {flags.map((f, i) => (
        <div key={f.key} className="v2-flag">
          <div className="v2-flag-left">
            <span className={'v2-ind v2-ind-' + (f.enabled ? 'ok' : 'off')}>{v2I.dot}</span>
            <div>
              <div className="v2-mono v2-flag-key">{f.key}</div>
              <div className="v2-mute" style={{ fontSize: 11.5 }}>{f.env}</div>
            </div>
          </div>
          <div className="v2-flag-right">
            <div className="v2-rollout">
              <div className="v2-rollout-bar"><div style={{ width: f.rollout + '%' }} /></div>
              <span className="v2-mono">{f.rollout}%</span>
            </div>
            <button
              className={'v2-tog' + (f.enabled ? ' v2-tog-on' : '')}
              onClick={() => setFlags(x => x.map((v, j) => j === i ? { ...v, enabled: !v.enabled } : v))}>
              <span />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const V2Config = () => (
  <div className="v2-table">
    <div className="v2-tr v2-th" style={{ gridTemplateColumns: '1.3fr 2.2fr 80px 110px 120px' }}>
      <div>KEY</div><div>VALUE</div><div>VERSION</div><div>ENV</div><div>PUBLISHED</div>
    </div>
    {window.GC_DATA.configs.map(c => (
      <div key={c.key} className="v2-tr" style={{ gridTemplateColumns: '1.3fr 2.2fr 80px 110px 120px' }}>
        <div className="v2-mono">{c.key}</div>
        <div className="v2-mono v2-mute" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value}</div>
        <div className="v2-mono">v{c.version}</div>
        <div><span className="v2-badge">{c.env}</span></div>
        <div className="v2-mute v2-mono">{c.publishedAt}</div>
      </div>
    ))}
  </div>
);

const V2 = () => {
  const [route, setRoute] = uS2('overview');
  const [theme, setTheme] = uS2('dark');
  const [collapsed, setCollapsed] = uS2(false);
  const [cmd, setCmd] = uS2(false);

  const nav = [
    { k: 'overview', label: 'Overview' },
    { k: 'cells',    label: 'Cells' },
    { k: 'users',    label: 'Users' },
    { k: 'audit',    label: 'Audit' },
    { k: 'config',   label: 'Config' },
    { k: 'flags',    label: 'Flags' },
  ];

  return (
    <div className="v2-root" data-theme={theme}>
      <aside className="v2-side" data-collapsed={collapsed || undefined}>
        <div className="v2-side-head">
          <div className="v2-logo">
            <div className="v2-logo-mark" />
            {!collapsed && <span>gocell</span>}
          </div>
          {!collapsed && <span className="v2-env-pill"><span className="v2-env-dot" />prod · us-east</span>}
        </div>

        <nav className="v2-nav">
          {nav.map(n => (
            <button key={n.k} data-active={route === n.k || undefined} onClick={() => setRoute(n.k)}>
              <span className="v2-nav-label">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="v2-side-foot">
          <div className="v2-mute v2-mono" style={{ fontSize: 10.5, padding: '0 12px 6px' }}>ASSEMBLY</div>
          <div className="v2-asm">
            <div className="v2-asm-name v2-mono">corebundle</div>
            <div className="v2-mute" style={{ fontSize: 11 }}>6 cells · healthy</div>
            <div className="v2-asm-bar">
              {[...Array(24)].map((_, i) => <span key={i} style={{ opacity: i === 14 ? 1 : (0.3 + (i % 5) * 0.14) }} />)}
            </div>
          </div>
        </div>
      </aside>

      <div className="v2-main">
        <header className="v2-top">
          <div className="v2-top-left">
            <button className="v2-ghost" onClick={() => setCollapsed(c => !c)}>
              <V2_Ico d="M3 6h18 M3 12h18 M3 18h18" size={16} />
            </button>
            <div className="v2-path v2-mono">
              <span className="v2-mute">gocell</span>
              <span className="v2-mute">/</span>
              <span>{route}</span>
            </div>
          </div>
          <button className="v2-cmdbtn" onClick={() => setCmd(true)}>
            {v2I.search}
            <span>Jump to anything…</span>
            <span className="v2-kbd">⌘K</span>
          </button>
          <div className="v2-top-right">
            <button className="v2-ghost">{v2I.bell}</button>
            <button className="v2-ghost" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
              <V2_Ico d={theme === 'dark' ? "M12 3a9 9 0 1 0 9 9c-5 0-9-4-9-9z" : "M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"} size={15} />
            </button>
            <div className="v2-avatar">AC</div>
          </div>
        </header>

        <main className="v2-content">
          <div className="v2-page-title">
            <h1>{{overview: 'System overview', users: 'Users', audit: 'Audit stream', config: 'Configuration', flags: 'Feature flags', cells: 'Cells'}[route]}</h1>
            <div className="v2-mono v2-mute">{window.GC_DATA.cells.length} cells · updated 2s ago</div>
          </div>
          {route === 'overview' && <V2Overview />}
          {route === 'users'    && <V2Users />}
          {route === 'audit'    && <V2Audit />}
          {route === 'config'   && <V2Config />}
          {route === 'flags'    && <V2Flags />}
          {route === 'cells'    && <V2Overview />}
        </main>
      </div>

      {cmd && (
        <div className="v2-cmdk" onClick={() => setCmd(false)}>
          <div className="v2-cmdk-panel" onClick={e => e.stopPropagation()}>
            <div className="v2-cmdk-input">
              {v2I.search}
              <input placeholder="Search commands, cells, users..." autoFocus />
              <button className="v2-ghost" onClick={() => setCmd(false)}>{v2I.close}</button>
            </div>
            <div className="v2-cmdk-list">
              <div className="v2-cmdk-group">NAVIGATE</div>
              {nav.map(n => (
                <button key={n.k} className="v2-cmdk-item" onClick={() => { setRoute(n.k); setCmd(false); }}>
                  <span>Go to {n.label}</span>
                  <span className="v2-mono v2-mute">G {n.label[0].toUpperCase()}</span>
                </button>
              ))}
              <div className="v2-cmdk-group">ACTIONS</div>
              <button className="v2-cmdk-item"><span>Invite member</span><span className="v2-mono v2-mute">⌘I</span></button>
              <button className="v2-cmdk-item"><span>Publish pending config</span><span className="v2-mono v2-mute">⌘P</span></button>
              <button className="v2-cmdk-item"><span>Toggle theme</span><span className="v2-mono v2-mute">⌘J</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.V2 = V2;
