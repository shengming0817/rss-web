/* global React */
// ============================================================
// Variation 1 — Linear-style minimal
// - ultra-calm grays, tight density, serif accent in page titles
// - keyboard-first affordances, inline actions on hover
// - secondary detail drawer on row click
// ============================================================

const { useState, useMemo } = React;

// ---------- icons (inline SVG, stroke-only, 16px) ----------
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);
const I = {
  users:   <Ico d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13A4 4 0 0 1 16 11" />,
  audit:   <Ico d="M4 4h16v4H4z M4 12h10v8H4z M18 14l3 3-3 3 M21 17h-7" />,
  config:  <Ico d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3l2 .9-.8 2.3 1.3 1.7-1.7 1.7.4 2.2-2.2.4-1.1 2-2.1-.9-2 1.4-1.6-1.6-2.2.3-.3-2.2L5 17.4l1.4-2-.9-2.1 2-1.1L7.2 10l2.2-.3.3-2.2 2 .4 1.6-1.5 1.6 1.6 2.2-.4.4 2.2 2 1.1-.8 2.2z" />,
  flag:    <Ico d="M4 21V4h13l-2 4 2 4H4" />,
  cell:    <Ico d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 3v18 M4 7.5l8 4.5 8-4.5" />,
  search:  <Ico d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35" />,
  plus:    <Ico d="M12 5v14 M5 12h14" />,
  more:    <Ico d="M5 12h.01 M12 12h.01 M19 12h.01" />,
  chev:    <Ico d="M9 6l6 6-6 6" />,
  close:   <Ico d="M18 6L6 18 M6 6l12 12" />,
  filter:  <Ico d="M3 5h18 M6 12h12 M10 19h4" />,
  theme:   <Ico d="M12 3a9 9 0 1 0 9 9c-.7.1-1.5.2-2.3.2A7 7 0 0 1 11.8 5c0-.8.1-1.4.2-2z" />,
  cmd:     <Ico d="M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6v12a3 3 0 1 0 0-6" />,
  cols:    <Ico d="M3 3h18v18H3z M3 9h18 M9 9v12" />,
};

// ---------- primitives ----------
const Sidebar = ({ active, onNav, onCollapse, collapsed }) => {
  const items = [
    { k: 'users',  label: 'Users',           i: I.users,  count: 8 },
    { k: 'audit',  label: 'Audit log',       i: I.audit,  count: 2104 },
    { k: 'config', label: 'Configuration',   i: I.config, count: 24 },
    { k: 'flags',  label: 'Feature flags',   i: I.flag,   count: 5 },
    { k: 'cells',  label: 'Cells',           i: I.cell,   count: 6 },
  ];
  return (
    <aside className="v1-side" data-collapsed={collapsed || undefined}>
      <div className="v1-side-top">
        <div className="v1-brand">
          <div className="v1-brand-mark" aria-hidden="true" />
          {!collapsed && <span className="v1-brand-name">gocell</span>}
          {!collapsed && <span className="v1-brand-env">prod</span>}
        </div>
        <button className="v1-side-collapse" onClick={onCollapse} title="Collapse sidebar">
          <Ico d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
        </button>
      </div>

      {!collapsed && (
        <button className="v1-cmd">
          <span className="v1-cmd-ico">{I.search}</span>
          <span>Search…</span>
          <span className="v1-kbd">⌘K</span>
        </button>
      )}

      <nav className="v1-nav">
        {items.map(it => (
          <button key={it.k}
                  className="v1-nav-item"
                  data-active={active === it.k || undefined}
                  onClick={() => onNav(it.k)}
                  title={collapsed ? it.label : undefined}>
            <span className="v1-nav-ico">{it.i}</span>
            {!collapsed && <span className="v1-nav-label">{it.label}</span>}
            {!collapsed && <span className="v1-nav-count">{it.count}</span>}
          </button>
        ))}
      </nav>

      <div className="v1-side-foot">
        {!collapsed && (
          <div className="v1-user">
            <div className="v1-avatar">AC</div>
            <div className="v1-user-meta">
              <div className="v1-user-name">Alex Chen</div>
              <div className="v1-user-role">Admin · gocell</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

const TopBar = ({ title, sub, onTheme, theme, actions }) => (
  <header className="v1-top">
    <div className="v1-crumbs">
      <span className="v1-crumb-faint">gocell</span>
      <span className="v1-crumb-sep">/</span>
      <span>{title}</span>
    </div>
    <div className="v1-top-actions">
      {actions}
      <button className="v1-ghost" onClick={onTheme} title="Toggle theme">
        {I.theme}
      </button>
    </div>
  </header>
);

const StatusDot = ({ s }) => <span className={`v1-dot v1-dot-${s}`} />;

// ---------- USERS ----------
const UsersPage = ({ onRow }) => {
  const users = window.GC_DATA.users;
  const [q, setQ] = useState('');
  const filtered = users.filter(u =>
    !q || u.name.toLowerCase().includes(q.toLowerCase()) ||
    u.email.toLowerCase().includes(q.toLowerCase()) ||
    u.role.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Users <span className="v1-h1-count">{users.length}</span></h1>
          <p className="v1-sub">Members of the <span className="v1-mono">gocell</span> workspace. Lock, unlock, or invite.</p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-input">
            <span className="v1-input-ico">{I.search}</span>
            <input placeholder="Filter users…" value={q} onChange={e => setQ(e.target.value)} />
            <span className="v1-kbd v1-kbd-inline">/</span>
          </div>
          <button className="v1-btn">{I.filter}<span>Filter</span></button>
          <button className="v1-btn v1-btn-primary">{I.plus}<span>Invite</span></button>
        </div>
      </div>

      <div className="v1-table">
        <div className="v1-tr v1-th">
          <div className="v1-td v1-td-check"><input type="checkbox" /></div>
          <div className="v1-td v1-td-name">Member</div>
          <div className="v1-td v1-td-role">Role</div>
          <div className="v1-td v1-td-status">Status</div>
          <div className="v1-td v1-td-seen">Last active</div>
          <div className="v1-td v1-td-id">ID</div>
          <div className="v1-td v1-td-act"></div>
        </div>
        {filtered.map(u => (
          <button key={u.id} className="v1-tr v1-tr-row" onClick={() => onRow(u)}>
            <div className="v1-td v1-td-check" onClick={e => e.stopPropagation()}><input type="checkbox" /></div>
            <div className="v1-td v1-td-name">
              <div className="v1-avatar v1-avatar-sm">{u.name.split(' ').map(s => s[0]).join('')}</div>
              <div>
                <div className="v1-name">{u.name}</div>
                <div className="v1-mute">{u.email}</div>
              </div>
            </div>
            <div className="v1-td v1-td-role"><span className="v1-chip">{u.role}</span></div>
            <div className="v1-td v1-td-status">
              <StatusDot s={u.status === 'active' ? 'ok' : u.status === 'locked' ? 'err' : 'warn'} />
              <span className="v1-mute">{u.status}</span>
            </div>
            <div className="v1-td v1-td-seen v1-mute">{u.lastSeen}</div>
            <div className="v1-td v1-td-id v1-mono v1-mute">{u.id}</div>
            <div className="v1-td v1-td-act">{I.more}</div>
          </button>
        ))}
      </div>
    </>
  );
};

// ---------- AUDIT ----------
const AuditPage = () => {
  const ev = window.GC_DATA.audit;
  const [exp, setExp] = useState(ev[0].id);
  const levelClr = l => l === 'error' ? 'err' : l === 'warn' ? 'warn' : 'ok';
  return (
    <>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Audit log <span className="v1-h1-count v1-mono">2,104</span></h1>
          <p className="v1-sub">Tamper-proof event stream with HMAC-SHA256 hash chain. <a className="v1-link">verify chain →</a></p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-seg">
            <button data-active>Live</button>
            <button>1h</button>
            <button>24h</button>
            <button>7d</button>
          </div>
          <button className="v1-btn">Export</button>
        </div>
      </div>

      <div className="v1-timeline">
        {ev.map(e => (
          <div key={e.id} className="v1-ev" data-open={exp === e.id || undefined}>
            <button className="v1-ev-row" onClick={() => setExp(exp === e.id ? null : e.id)}>
              <div className="v1-ev-ts v1-mono">{e.ts}</div>
              <div className="v1-ev-lvl"><StatusDot s={levelClr(e.level)} /></div>
              <div className="v1-ev-name v1-mono">{e.eventType}</div>
              <div className="v1-ev-actor">{e.actor}</div>
              <div className="v1-ev-cell"><span className="v1-chip">{e.cell}</span></div>
              <div className="v1-ev-chev">{I.chev}</div>
            </button>
            {exp === e.id && (
              <div className="v1-ev-body">
                <pre className="v1-mono">{JSON.stringify(e.payload, null, 2)}</pre>
                <div className="v1-ev-hash">
                  <span className="v1-mute">chain</span>
                  <code className="v1-mono">9f2a4e…{e.id.slice(-4)}</code>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- CONFIG ----------
const ConfigPage = () => {
  const cfg = window.GC_DATA.configs;
  return (
    <>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Configuration</h1>
          <p className="v1-sub">Versioned keys. Edits stage until you publish.</p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-seg">
            <button data-active>prod</button>
            <button>staging</button>
            <button>dev</button>
          </div>
          <button className="v1-btn v1-btn-primary">{I.plus}<span>New key</span></button>
        </div>
      </div>
      <div className="v1-table">
        <div className="v1-tr v1-th">
          <div className="v1-td v1-td-k">Key</div>
          <div className="v1-td v1-td-v">Value</div>
          <div className="v1-td v1-td-ver">Version</div>
          <div className="v1-td v1-td-pub">Published</div>
          <div className="v1-td v1-td-act"></div>
        </div>
        {cfg.map(c => (
          <div key={c.key} className="v1-tr">
            <div className="v1-td v1-td-k v1-mono">{c.key}</div>
            <div className="v1-td v1-td-v v1-mono v1-mute">{c.value}</div>
            <div className="v1-td v1-td-ver v1-mono">v{c.version}</div>
            <div className="v1-td v1-td-pub v1-mute">{c.publishedAt}</div>
            <div className="v1-td v1-td-act">
              <button className="v1-link-btn">Edit</button>
              <button className="v1-link-btn">Diff</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- FLAGS ----------
const FlagsPage = () => {
  const [flags, setFlags] = useState(window.GC_DATA.flags);
  const toggle = (i) => setFlags(f => f.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x));
  return (
    <>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Feature flags</h1>
          <p className="v1-sub">Runtime toggles with rollout %. Changes propagate via configcore.</p>
        </div>
      </div>
      <div className="v1-flags">
        {flags.map((f, i) => (
          <div key={f.key} className="v1-flag">
            <div className="v1-flag-main">
              <div className="v1-mono v1-flag-key">{f.key}</div>
              <div className="v1-mute">{f.env} · rollout {f.rollout}%</div>
            </div>
            <div className="v1-flag-bar">
              <div className="v1-flag-fill" style={{ width: `${f.rollout}%` }} />
            </div>
            <label className="v1-switch">
              <input type="checkbox" checked={f.enabled} onChange={() => toggle(i)} />
              <span />
            </label>
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- CELLS ----------
const CellsPage = () => {
  const cells = window.GC_DATA.cells;
  return (
    <>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Cells <span className="v1-h1-count">{cells.length}</span></h1>
          <p className="v1-sub">Runtime health across the current assembly.</p>
        </div>
      </div>
      <div className="v1-cells">
        {cells.map(c => {
          const pts = window.GC_DATA.spark(c.id.length * 7);
          const max = Math.max(...pts);
          return (
            <div key={c.id} className="v1-cell">
              <div className="v1-cell-head">
                <div>
                  <div className="v1-cell-id v1-mono">{c.id}</div>
                  <div className="v1-mute">{c.type} · {c.level}</div>
                </div>
                <StatusDot s={c.health === 'warn' ? 'warn' : 'ok'} />
              </div>
              <div className="v1-cell-stats">
                <div><span className="v1-mute">slices</span><b>{c.slices}</b></div>
                <div><span className="v1-mute">p99</span><b className="v1-mono">{c.p99}</b></div>
                <div><span className="v1-mute">rps</span><b className="v1-mono">{c.rps}</b></div>
              </div>
              <svg viewBox="0 0 100 28" className="v1-spark" preserveAspectRatio="none">
                <polyline
                  fill="none" stroke="currentColor" strokeWidth="1.2"
                  points={pts.map((v, i) => `${(i / (pts.length - 1)) * 100},${28 - (v / max) * 24 - 2}`).join(' ')} />
              </svg>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ---------- drawer ----------
const UserDrawer = ({ user, onClose }) => (
  <div className="v1-drawer" onClick={onClose}>
    <div className="v1-drawer-panel" onClick={e => e.stopPropagation()}>
      <div className="v1-drawer-head">
        <div className="v1-avatar">{user.name.split(' ').map(s => s[0]).join('')}</div>
        <div>
          <div className="v1-h2">{user.name}</div>
          <div className="v1-mute v1-mono">{user.id}</div>
        </div>
        <button className="v1-ghost" onClick={onClose}>{I.close}</button>
      </div>
      <div className="v1-kv">
        <div><span>Email</span><b>{user.email}</b></div>
        <div><span>Username</span><b className="v1-mono">{user.username}</b></div>
        <div><span>Role</span><b>{user.role}</b></div>
        <div><span>Status</span><b>{user.status}</b></div>
        <div><span>Created</span><b className="v1-mono">{user.createdAt}</b></div>
        <div><span>Last seen</span><b>{user.lastSeen}</b></div>
      </div>
      <div className="v1-drawer-acts">
        <button className="v1-btn">Reset password</button>
        <button className="v1-btn">Lock</button>
        <button className="v1-btn v1-btn-primary">Edit</button>
      </div>
    </div>
  </div>
);

// ---------- root ----------
const V1 = () => {
  const [route, setRoute] = useState('users');
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState('light');
  const [drawerUser, setDrawerUser] = useState(null);

  const title = {
    users: 'Users', audit: 'Audit log', config: 'Configuration',
    flags: 'Feature flags', cells: 'Cells'
  }[route];

  return (
    <div className="v1-root" data-theme={theme}>
      <Sidebar active={route} onNav={setRoute}
               collapsed={collapsed} onCollapse={() => setCollapsed(c => !c)} />
      <div className="v1-main">
        <TopBar title={title}
                onTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                theme={theme} />
        <div className="v1-content">
          {route === 'users'  && <UsersPage onRow={setDrawerUser} />}
          {route === 'audit'  && <AuditPage />}
          {route === 'config' && <ConfigPage />}
          {route === 'flags'  && <FlagsPage />}
          {route === 'cells'  && <CellsPage />}
        </div>
      </div>
      {drawerUser && <UserDrawer user={drawerUser} onClose={() => setDrawerUser(null)} />}
    </div>
  );
};

window.V1 = V1;
