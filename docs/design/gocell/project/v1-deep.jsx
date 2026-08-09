/* global React */
// V1 Deep — extends v1-linear with modals, command palette, toast, keyboard shortcuts
// This script REPLACES window.V1 with an enhanced version.

(() => {
  const { useState, useEffect, useRef, useMemo } = React;

  // reuse icons + pages from base v1-linear.jsx by importing through DOM scope
  // The base file already attached V1; we override window.V1 with an enhanced wrapper
  // by redefining the root. To keep bundle small we re-reference subcomponents via
  // internal copies when needed. Here we just redefine the full root.

  const Ico = ({ d, size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
  );
  const I = {
    users:  <Ico d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>,
    audit:  <Ico d="M4 4h16v4H4z M4 12h10v8H4z M18 14l3 3-3 3 M21 17h-7"/>,
    config: <Ico d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3l2 .9-.8 2.3 1.3 1.7-1.7 1.7.4 2.2-2.2.4-1.1 2-2.1-.9-2 1.4-1.6-1.6-2.2.3-.3-2.2L5 17.4l1.4-2-.9-2.1 2-1.1L7.2 10l2.2-.3.3-2.2 2 .4 1.6-1.5 1.6 1.6 2.2-.4.4 2.2 2 1.1-.8 2.2z"/>,
    flag:   <Ico d="M4 21V4h13l-2 4 2 4H4"/>,
    cell:   <Ico d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 3v18 M4 7.5l8 4.5 8-4.5"/>,
    search: <Ico d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35"/>,
    plus:   <Ico d="M12 5v14 M5 12h14"/>,
    close:  <Ico d="M18 6L6 18 M6 6l12 12"/>,
    theme:  <Ico d="M12 3a9 9 0 1 0 9 9c-.7.1-1.5.2-2.3.2A7 7 0 0 1 11.8 5c0-.8.1-1.4.2-2z"/>,
  };

  // ----- Command palette -----
  const CommandPalette = ({ open, onClose, onNav, onAction }) => {
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 10); }, [open]);

    const cmds = [
      { g: 'Navigate', k: 'Users',         i: I.users,  hint: 'G U', run: () => onNav('users') },
      { g: 'Navigate', k: 'Audit log',     i: I.audit,  hint: 'G A', run: () => onNav('audit') },
      { g: 'Navigate', k: 'Configuration', i: I.config, hint: 'G C', run: () => onNav('config') },
      { g: 'Navigate', k: 'Feature flags', i: I.flag,   hint: 'G F', run: () => onNav('flags') },
      { g: 'Navigate', k: 'Cells',         i: I.cell,   hint: 'G S', run: () => onNav('cells') },
      { g: 'Actions',  k: 'Invite member',       i: I.plus,  hint: 'I',  run: () => onAction('invite') },
      { g: 'Actions',  k: 'New config key',      i: I.plus,  hint: 'N',  run: () => onAction('newcfg') },
      { g: 'Actions',  k: 'Toggle theme',        i: I.theme, hint: '⌘J', run: () => onAction('theme') },
      { g: 'Actions',  k: 'Collapse sidebar',    i: null,    hint: '⌘\\',run: () => onAction('collapse') },
    ];
    const filtered = cmds.filter(c => !q || c.k.toLowerCase().includes(q.toLowerCase()));
    const grouped = filtered.reduce((a, c) => ((a[c.g] ||= []).push(c), a), {});

    if (!open) return null;
    return (
      <div className="v1d-cmdk" onClick={onClose}>
        <div className="v1d-cmdk-panel" onClick={e => e.stopPropagation()}>
          <div className="v1d-cmdk-inp">
            <span style={{ color: 'var(--fg-faint)' }}>{I.search}</span>
            <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search commands, users, cells…" />
            <span className="v1-kbd">ESC</span>
          </div>
          <div className="v1d-cmdk-body">
            {Object.entries(grouped).map(([g, items]) => (
              <div key={g}>
                <div className="v1d-cmdk-group">{g}</div>
                {items.map((c, i) => (
                  <button key={c.k} className="v1d-cmdk-row"
                          onClick={() => { c.run(); onClose(); }}>
                    <span className="v1d-cmdk-ico">{c.i || <span style={{ width: 16, height: 16, display:'inline-block' }} />}</span>
                    <span>{c.k}</span>
                    <span className="v1-kbd v1d-cmdk-hint">{c.hint}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className="v1d-cmdk-empty">No results.</div>}
          </div>
        </div>
      </div>
    );
  };

  // ----- Invite modal -----
  const InviteModal = ({ open, onClose, onSubmit }) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('Developer');
    if (!open) return null;
    return (
      <div className="v1d-modal" onClick={onClose}>
        <div className="v1d-modal-panel" onClick={e => e.stopPropagation()}>
          <div className="v1d-modal-head">
            <h2 className="v1-h2">Invite member</h2>
            <button className="v1-ghost" onClick={onClose}>{I.close}</button>
          </div>
          <div className="v1d-modal-body">
            <p className="v1-mute" style={{ margin: '0 0 18px', fontSize: 13 }}>
              They’ll receive an email with a one-time link. The link expires in 72 hours.
            </p>
            <label className="v1d-field">
              <span>Email</span>
              <input autoFocus placeholder="someone@gocell.dev"
                     value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="v1d-field">
              <span>Role</span>
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option>Admin</option>
                <option>Operator</option>
                <option>Developer</option>
                <option>Viewer</option>
              </select>
            </label>
            <div className="v1d-field-hint">
              <b>{role}</b> — {{
                Admin: 'Full access incl. billing and RBAC.',
                Operator: 'Can publish config and lock users.',
                Developer: 'Read/write on non-prod; read on prod.',
                Viewer: 'Read-only across the workspace.',
              }[role]}
            </div>
          </div>
          <div className="v1d-modal-foot">
            <span className="v1-mute v1-mono" style={{ fontSize: 11.5 }}>
              <span className="v1-kbd">⌘</span>&nbsp;<span className="v1-kbd">↵</span>&nbsp;to invite
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="v1-btn" onClick={onClose}>Cancel</button>
              <button className="v1-btn v1-btn-primary"
                      disabled={!email.includes('@')}
                      onClick={() => { onSubmit({ email, role }); onClose(); setEmail(''); }}>
                Send invite
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ----- Toast -----
  const Toast = ({ items }) => (
    <div className="v1d-toasts">
      {items.map(t => (
        <div key={t.id} className="v1d-toast" data-kind={t.kind || 'ok'}>
          <span className="v1-dot v1-dot-ok" />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );

  // --- Re-declared pages ---
  // Sidebar, TopBar, StatusDot, UsersPage, AuditPage, ConfigPage, FlagsPage, CellsPage, UserDrawer
  // are already defined in v1-linear.jsx. We access them via window.__V1_INTERNALS if exposed.
  // Since the base file closes over them locally, we just re-render the existing window.V1 body
  // but wrap it with our interactive shell.

  // Strategy: replace window.V1 with a root that uses the existing V1 sub-pages by composition.
  // To avoid duplicating all page components, we render the base V1 inside this root with
  // overrides via CSS-level controls. Simpler: replicate only the top-level root and pages,
  // letting CSS classes remain v1-*. Pages are lightweight — re-declare inline.

  const Sidebar = ({ active, onNav, onCollapse, collapsed, onCmd }) => {
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
            <div className="v1-brand-mark" aria-hidden="true"/>
            {!collapsed && <span className="v1-brand-name">gocell</span>}
            {!collapsed && <span className="v1-brand-env">prod</span>}
          </div>
          <button className="v1-side-collapse" onClick={onCollapse}>
            <Ico d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}/>
          </button>
        </div>
        {!collapsed && (
          <button className="v1-cmd" onClick={onCmd}>
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
                    onClick={() => onNav(it.k)}>
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

  const TopBar = ({ title, onTheme, onCmd }) => (
    <header className="v1-top">
      <div className="v1-crumbs">
        <span className="v1-crumb-faint">gocell</span>
        <span className="v1-crumb-sep">/</span>
        <span>{title}</span>
      </div>
      <div className="v1-top-actions">
        <button className="v1-btn" onClick={onCmd} style={{ height: 28, fontSize: 12.5 }}>
          <span style={{ color: 'var(--fg-faint)' }}>{I.search}</span>
          <span className="v1-kbd" style={{ marginLeft: 6 }}>⌘K</span>
        </button>
        <button className="v1-ghost" onClick={onTheme}>{I.theme}</button>
      </div>
    </header>
  );

  const StatusDot = ({ s }) => <span className={`v1-dot v1-dot-${s}`}/>;

  const UsersPage = ({ onRow, onInvite, users, query, setQuery }) => {
    const filtered = users.filter(u =>
      !query || u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      u.role.toLowerCase().includes(query.toLowerCase()));
    return (<>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Users <span className="v1-h1-count">{users.length}</span></h1>
          <p className="v1-sub">Members of the <span className="v1-mono">gocell</span> workspace.</p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-input">
            <span className="v1-input-ico">{I.search}</span>
            <input placeholder="Filter users…" value={query} onChange={e => setQuery(e.target.value)}/>
            <span className="v1-kbd v1-kbd-inline">/</span>
          </div>
          <button className="v1-btn v1-btn-primary" onClick={onInvite}>{I.plus}<span>Invite</span></button>
        </div>
      </div>
      <div className="v1-table">
        <div className="v1-tr v1-th">
          <div className="v1-td v1-td-check"><input type="checkbox"/></div>
          <div className="v1-td v1-td-name">Member</div>
          <div className="v1-td v1-td-role">Role</div>
          <div className="v1-td v1-td-status">Status</div>
          <div className="v1-td v1-td-seen">Last active</div>
          <div className="v1-td v1-td-id">ID</div>
          <div className="v1-td v1-td-act"></div>
        </div>
        {filtered.map(u => (
          <button key={u.id} className="v1-tr v1-tr-row" onClick={() => onRow(u)}>
            <div className="v1-td v1-td-check" onClick={e => e.stopPropagation()}><input type="checkbox"/></div>
            <div className="v1-td v1-td-name">
              <div className="v1-avatar v1-avatar-sm">{u.name.split(' ').map(s=>s[0]).join('')}</div>
              <div>
                <div className="v1-name">{u.name}</div>
                <div className="v1-mute">{u.email}</div>
              </div>
            </div>
            <div className="v1-td v1-td-role"><span className="v1-chip">{u.role}</span></div>
            <div className="v1-td v1-td-status">
              <StatusDot s={u.status === 'active' ? 'ok' : u.status === 'locked' ? 'err' : 'warn'}/>
              <span className="v1-mute">{u.status}</span>
            </div>
            <div className="v1-td v1-td-seen v1-mute">{u.lastSeen}</div>
            <div className="v1-td v1-td-id v1-mono v1-mute">{u.id}</div>
            <div className="v1-td v1-td-act">⋯</div>
          </button>
        ))}
      </div>
    </>);
  };

  const UserDrawer = ({ user, onClose, onLock }) => (
    <div className="v1-drawer" onClick={onClose}>
      <div className="v1-drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="v1-drawer-head">
          <div className="v1-avatar">{user.name.split(' ').map(s=>s[0]).join('')}</div>
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
        <div className="v1d-drawer-acts">
          <div className="v1d-drawer-label">RECENT ACTIVITY</div>
          {window.GC_DATA.audit.filter(e => e.actor === user.username || user.username === 'alex').slice(0, 3).map(e => (
            <div key={e.id} className="v1d-act">
              <span className="v1-mono v1-mute">{e.ts.slice(0,8)}</span>
              <span className="v1-mono">{e.eventType}</span>
            </div>
          ))}
        </div>
        <div className="v1-drawer-acts">
          <button className="v1-btn">Reset password</button>
          <button className="v1-btn" onClick={() => onLock(user)}>
            {user.status === 'locked' ? 'Unlock' : 'Lock'}
          </button>
          <button className="v1-btn v1-btn-primary">Edit</button>
        </div>
      </div>
    </div>
  );

  // reuse AuditPage/ConfigPage/FlagsPage/CellsPage from base — they're pure renders of GC_DATA.
  // We simply import them by keeping v1-linear.jsx loaded and reading them off its closures.
  // Since they aren't globalized, easiest path: redeclare minimal versions that match base.

  const AuditPage = ({ onEvt }) => {
    const ev = window.GC_DATA.audit;
    const lvlClr = l => l === 'error' ? 'err' : l === 'warn' ? 'warn' : 'ok';
    return (<>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Audit log <span className="v1-h1-count v1-mono">2,104</span></h1>
          <p className="v1-sub">Tamper-proof stream sealed by HMAC-SHA256.</p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-seg">
            <button data-active>Live</button><button>1h</button><button>24h</button><button>7d</button>
          </div>
          <button className="v1-btn">Export</button>
        </div>
      </div>
      <div className="v1-timeline">
        {ev.map(e => (
          <button key={e.id} className="v1-ev-row" style={{ display: 'grid' }} onClick={() => onEvt(e)}>
            <div className="v1-ev-ts v1-mono">{e.ts}</div>
            <div className="v1-ev-lvl"><StatusDot s={lvlClr(e.level)}/></div>
            <div className="v1-ev-name v1-mono">{e.eventType}</div>
            <div className="v1-ev-actor">{e.actor}</div>
            <div className="v1-ev-cell"><span className="v1-chip">{e.cell}</span></div>
            <div className="v1-ev-chev">›</div>
          </button>
        ))}
      </div>
    </>);
  };

  const EventDrawer = ({ ev, onClose }) => (
    <div className="v1-drawer" onClick={onClose}>
      <div className="v1-drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="v1-drawer-head">
          <div>
            <div className="v1-h2 v1-mono">{ev.eventType}</div>
            <div className="v1-mute v1-mono">{ev.id} · {ev.ts}</div>
          </div>
          <button className="v1-ghost" onClick={onClose}>{I.close}</button>
        </div>
        <div className="v1-kv">
          <div><span>Level</span><b>{ev.level}</b></div>
          <div><span>Actor</span><b>{ev.actor}</b></div>
          <div><span>Cell</span><b className="v1-mono">{ev.cell}</b></div>
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <div className="v1d-drawer-label">PAYLOAD</div>
          <pre className="v1-mono" style={{
            margin: 0, padding: '10px 12px',
            background: 'var(--bg-sunken)', border: '1px solid var(--line)',
            borderRadius: 6, fontSize: 12, lineHeight: 1.6
          }}>{JSON.stringify(ev.payload, null, 2)}</pre>
          <div className="v1d-drawer-label" style={{ marginTop: 18 }}>HASH CHAIN</div>
          <div className="v1-mono v1-mute" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
            prev → <span style={{ color: 'var(--fg)' }}>9f2a4e…7c13</span><br/>
            hash → <span style={{ color: 'var(--fg)' }}>{`${ev.id.slice(-4)}be…03a1`}</span><br/>
            <span style={{ color: 'var(--ok)' }}>● verified</span>
          </div>
        </div>
      </div>
    </div>
  );

  const ConfigPage = () => {
    const cfg = window.GC_DATA.configs;
    return (<>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Configuration</h1>
          <p className="v1-sub">Versioned keys. Edits stage until you publish.</p>
        </div>
        <div className="v1-head-actions">
          <div className="v1-seg">
            <button data-active>prod</button><button>staging</button><button>dev</button>
          </div>
          <button className="v1-btn v1-btn-primary">{I.plus}<span>New key</span></button>
        </div>
      </div>
      <div className="v1-table">
        <div className="v1-tr v1-th" style={{ gridTemplateColumns: 'minmax(200px,1.1fr) minmax(220px,2fr) 100px 140px 120px' }}>
          <div className="v1-td v1-td-k">Key</div>
          <div className="v1-td">Value</div>
          <div className="v1-td">Version</div>
          <div className="v1-td">Published</div>
          <div className="v1-td"></div>
        </div>
        {cfg.map(c => (
          <div key={c.key} className="v1-tr" style={{ gridTemplateColumns: 'minmax(200px,1.1fr) minmax(220px,2fr) 100px 140px 120px' }}>
            <div className="v1-td v1-mono">{c.key}</div>
            <div className="v1-td v1-mono v1-mute">{c.value}</div>
            <div className="v1-td v1-mono">v{c.version}</div>
            <div className="v1-td v1-mute">{c.publishedAt}</div>
            <div className="v1-td" style={{ justifyContent: 'flex-end', gap: 4 }}>
              <button className="v1-link-btn">Edit</button>
              <button className="v1-link-btn">Diff</button>
            </div>
          </div>
        ))}
      </div>
    </>);
  };

  const FlagsPage = () => {
    const [flags, setFlags] = useState(window.GC_DATA.flags);
    return (<>
      <div className="v1-page-head">
        <div>
          <h1 className="v1-h1">Feature flags</h1>
          <p className="v1-sub">Runtime toggles with rollout %.</p>
        </div>
      </div>
      <div className="v1-flags">
        {flags.map((f, i) => (
          <div key={f.key} className="v1-flag">
            <div>
              <div className="v1-mono" style={{ fontWeight: 500 }}>{f.key}</div>
              <div className="v1-mute">{f.env} · rollout {f.rollout}%</div>
            </div>
            <div className="v1-flag-bar"><div className="v1-flag-fill" style={{ width: f.rollout + '%' }}/></div>
            <label className="v1-switch">
              <input type="checkbox" checked={f.enabled}
                     onChange={() => setFlags(x => x.map((v, j) => j === i ? { ...v, enabled: !v.enabled } : v))}/>
              <span/>
            </label>
          </div>
        ))}
      </div>
    </>);
  };

  const CellsPage = () => {
    const cells = window.GC_DATA.cells;
    return (<>
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
                <StatusDot s={c.health === 'warn' ? 'warn' : 'ok'}/>
              </div>
              <div className="v1-cell-stats">
                <div><span className="v1-mute">slices</span><b>{c.slices}</b></div>
                <div><span className="v1-mute">p99</span><b className="v1-mono">{c.p99}</b></div>
                <div><span className="v1-mute">rps</span><b className="v1-mono">{c.rps}</b></div>
              </div>
              <svg viewBox="0 0 100 28" className="v1-spark" preserveAspectRatio="none">
                <polyline fill="none" stroke="currentColor" strokeWidth="1.2"
                          points={pts.map((v,i) => `${(i/(pts.length-1))*100},${28 - (v/max)*24 - 2}`).join(' ')}/>
              </svg>
            </div>
          );
        })}
      </div>
    </>);
  };

  // ----- Root -----
  const V1Deep = () => {
    const [route, setRoute] = useState('users');
    const [collapsed, setCollapsed] = useState(false);
    const [theme, setTheme] = useState('light');
    const [users, setUsers] = useState(window.GC_DATA.users);
    const [userQ, setUserQ] = useState('');
    const [drawerUser, setDrawerUser] = useState(null);
    const [drawerEvt, setDrawerEvt] = useState(null);
    const [cmdOpen, setCmdOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [toasts, setToasts] = useState([]);
    const gSeq = useRef('');

    const pushToast = (msg) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(ts => [...ts, { id, msg }]);
      setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2800);
    };

    const doAction = (a) => {
      if (a === 'invite')   setInviteOpen(true);
      if (a === 'theme')    setTheme(t => t === 'light' ? 'dark' : 'light');
      if (a === 'collapse') setCollapsed(c => !c);
      if (a === 'newcfg')   pushToast('New config key dialog is a placeholder');
    };

    // keyboard
    useEffect(() => {
      const onKey = (e) => {
        const t = e.target.tagName;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault(); setCmdOpen(v => !v); return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
          e.preventDefault(); setTheme(t => t === 'light' ? 'dark' : 'light'); return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
          e.preventDefault(); setCollapsed(c => !c); return;
        }
        if (e.key === 'Escape') {
          setCmdOpen(false); setInviteOpen(false);
          setDrawerUser(null); setDrawerEvt(null); return;
        }
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        if (e.key === '/') { e.preventDefault(); document.querySelector('.v1-input input')?.focus(); return; }
        if (e.key === 'g') { gSeq.current = 'g'; setTimeout(() => gSeq.current = '', 600); return; }
        if (gSeq.current === 'g') {
          const map = { u: 'users', a: 'audit', c: 'config', f: 'flags', s: 'cells' };
          if (map[e.key]) { setRoute(map[e.key]); gSeq.current = ''; }
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const title = { users: 'Users', audit: 'Audit log', config: 'Configuration', flags: 'Feature flags', cells: 'Cells' }[route];

    return (
      <div className="v1-root" data-theme={theme}>
        <Sidebar active={route} onNav={setRoute}
                 collapsed={collapsed}
                 onCollapse={() => setCollapsed(c => !c)}
                 onCmd={() => setCmdOpen(true)}/>
        <div className="v1-main">
          <TopBar title={title}
                  onTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                  onCmd={() => setCmdOpen(true)}/>
          <div className="v1-content">
            {route === 'users'  && <UsersPage users={users} onRow={setDrawerUser}
                                              onInvite={() => setInviteOpen(true)}
                                              query={userQ} setQuery={setUserQ}/>}
            {route === 'audit'  && <AuditPage onEvt={setDrawerEvt}/>}
            {route === 'config' && <ConfigPage/>}
            {route === 'flags'  && <FlagsPage/>}
            {route === 'cells'  && <CellsPage/>}
          </div>
        </div>
        {drawerUser && (
          <UserDrawer user={drawerUser} onClose={() => setDrawerUser(null)}
                      onLock={(u) => {
                        setUsers(us => us.map(x => x.id === u.id
                          ? { ...x, status: x.status === 'locked' ? 'active' : 'locked' } : x));
                        pushToast(`${u.name} ${u.status === 'locked' ? 'unlocked' : 'locked'}.`);
                        setDrawerUser(null);
                      }}/>
        )}
        {drawerEvt && <EventDrawer ev={drawerEvt} onClose={() => setDrawerEvt(null)}/>}
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)}
                        onNav={(k) => setRoute(k)} onAction={doAction}/>
        <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)}
                     onSubmit={({ email, role }) => pushToast(`Invite sent to ${email} as ${role}.`)}/>
        <Toast items={toasts}/>
      </div>
    );
  };

  window.V1Deep = V1Deep;
})();
