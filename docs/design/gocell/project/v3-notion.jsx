/* global React */
// ============================================================
// Variation 3 — Notion / Figma canvas panels
// - editable-feeling cards, inline property panes, drag handles
// - cream/paper background, generous whitespace
// - two-pane layout: list + inspector
// ============================================================

const { useState: uS3 } = React;

const v3I = (d) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);

const V3 = () => {
  const [route, setRoute] = uS3('users');
  const [theme, setTheme] = uS3('light');
  const [selected, setSelected] = uS3(0);
  const [collapsed, setCollapsed] = uS3(false);

  const nav = [
    { k: 'users', label: 'People', emoji: '◐' },
    { k: 'audit', label: 'Activity', emoji: '◑' },
    { k: 'config', label: 'Settings', emoji: '◒' },
    { k: 'flags', label: 'Experiments', emoji: '◓' },
    { k: 'cells', label: 'Services', emoji: '◉' },
  ];

  return (
    <div className="v3-root" data-theme={theme}>
      <aside className="v3-side" data-collapsed={collapsed || undefined}>
        <div className="v3-workspace">
          <div className="v3-ws-ico">G</div>
          {!collapsed && <div>
            <div className="v3-ws-name">gocell</div>
            <div className="v3-ws-sub">Production workspace</div>
          </div>}
        </div>

        <div className="v3-side-section">
          {!collapsed && <div className="v3-side-label">WORKSPACE</div>}
          {nav.map(n => (
            <button key={n.k} className="v3-side-item"
                    data-active={route === n.k || undefined}
                    onClick={() => { setRoute(n.k); setSelected(0); }}>
              <span className="v3-side-glyph">{n.emoji}</span>
              {!collapsed && <span>{n.label}</span>}
            </button>
          ))}
        </div>

        {!collapsed && (
          <>
            <div className="v3-side-section">
              <div className="v3-side-label">PINNED</div>
              <button className="v3-side-item"><span className="v3-side-glyph">✦</span><span>alex@gocell.dev</span></button>
              <button className="v3-side-item"><span className="v3-side-glyph">✦</span><span>rate_limit.http</span></button>
            </div>
            <div className="v3-side-foot">
              <button className="v3-new">+ New entry</button>
            </div>
          </>
        )}
      </aside>

      <div className="v3-center">
        <header className="v3-head">
          <div className="v3-head-left">
            <button className="v3-iconbtn" onClick={() => setCollapsed(c => !c)}>{v3I('M3 6h18 M3 12h18 M3 18h18')}</button>
            <div className="v3-bread">
              <span className="v3-bread-mute">Workspace</span>
              <span className="v3-bread-sep">›</span>
              <span>{nav.find(n => n.k === route)?.label}</span>
            </div>
          </div>
          <div className="v3-head-right">
            <button className="v3-iconbtn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{v3I('M21 13a9 9 0 1 1-9-9 7 7 0 0 0 9 9z')}</button>
            <button className="v3-share">Share</button>
          </div>
        </header>

        <div className="v3-cover">
          <div className="v3-cover-title">
            <span className="v3-cover-emoji">{nav.find(n => n.k === route)?.emoji}</span>
            <h1>{nav.find(n => n.k === route)?.label}</h1>
          </div>
          <p className="v3-cover-sub">
            {route === 'users' && 'Team members with access to the gocell workspace. Click any row to inspect.'}
            {route === 'audit' && 'Every meaningful event in the system. Verified by HMAC hash chain.'}
            {route === 'config' && 'Runtime configuration keys. Versioned. Edits stage until publish.'}
            {route === 'flags' && 'Runtime toggles. Roll out gradually or flip instantly.'}
            {route === 'cells' && 'Independently deployable Cells running in the current Assembly.'}
          </p>
        </div>

        <div className="v3-toolbar">
          <button className="v3-chip" data-active>+ Filter</button>
          <button className="v3-chip">Sort</button>
          <button className="v3-chip">Group</button>
          <div style={{ flex: 1 }} />
          <div className="v3-search">
            {v3I('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35')}
            <input placeholder="Search…" />
          </div>
        </div>

        {route === 'users' && (
          <div className="v3-cards">
            {window.GC_DATA.users.map((u, i) => (
              <button key={u.id} className="v3-card" data-active={selected === i || undefined}
                      onClick={() => setSelected(i)}>
                <div className="v3-card-drag">⋮⋮</div>
                <div className="v3-avatar">{u.name.split(' ').map(s=>s[0]).join('')}</div>
                <div className="v3-card-main">
                  <div className="v3-card-name">{u.name}</div>
                  <div className="v3-card-meta">{u.email}</div>
                </div>
                <div className="v3-prop"><span className="v3-prop-k">Role</span><span className="v3-tag">{u.role}</span></div>
                <div className="v3-prop">
                  <span className="v3-prop-k">Status</span>
                  <span className={'v3-status v3-status-' + (u.status === 'active' ? 'ok' : u.status === 'locked' ? 'err' : 'warn')}>
                    ● {u.status}
                  </span>
                </div>
                <div className="v3-prop"><span className="v3-prop-k">Last seen</span><span className="v3-prop-v">{u.lastSeen}</span></div>
              </button>
            ))}
          </div>
        )}

        {route === 'audit' && (
          <div className="v3-cards v3-cards-audit">
            {window.GC_DATA.audit.map((e, i) => (
              <div key={e.id} className="v3-card v3-card-audit" onClick={() => setSelected(i)} data-active={selected === i || undefined}>
                <div className="v3-card-drag">⋮⋮</div>
                <div className="v3-evt-mark" data-lvl={e.level}>●</div>
                <div className="v3-card-main">
                  <div className="v3-card-name v3-mono">{e.eventType}</div>
                  <div className="v3-card-meta">{e.actor} · {e.cell} · <span className="v3-mono">{e.ts}</span></div>
                </div>
                <button className="v3-chip">Expand</button>
              </div>
            ))}
          </div>
        )}

        {route === 'config' && (
          <div className="v3-cards">
            {window.GC_DATA.configs.map((c, i) => (
              <div key={c.key} className="v3-card" data-active={selected === i || undefined} onClick={() => setSelected(i)}>
                <div className="v3-card-drag">⋮⋮</div>
                <div className="v3-card-main">
                  <div className="v3-card-name v3-mono">{c.key}</div>
                  <div className="v3-card-meta v3-mono">{c.value}</div>
                </div>
                <div className="v3-prop"><span className="v3-prop-k">Env</span><span className="v3-tag">{c.env}</span></div>
                <div className="v3-prop"><span className="v3-prop-k">Version</span><span className="v3-mono">v{c.version}</span></div>
                <div className="v3-prop"><span className="v3-prop-k">Published</span><span>{c.publishedAt}</span></div>
              </div>
            ))}
          </div>
        )}

        {route === 'flags' && (
          <div className="v3-cards">
            {window.GC_DATA.flags.map((f, i) => (
              <div key={f.key} className="v3-card" data-active={selected === i || undefined} onClick={() => setSelected(i)}>
                <div className="v3-card-drag">⋮⋮</div>
                <div className="v3-card-main">
                  <div className="v3-card-name v3-mono">{f.key}</div>
                  <div className="v3-card-meta">{f.env} environment</div>
                </div>
                <div className="v3-prop">
                  <span className="v3-prop-k">Rollout</span>
                  <div className="v3-bar"><div style={{width:f.rollout+'%'}}/></div>
                  <span className="v3-mono">{f.rollout}%</span>
                </div>
                <div className="v3-prop">
                  <span className="v3-prop-k">State</span>
                  <span className={'v3-pill ' + (f.enabled ? 'on' : '')}>{f.enabled ? 'ON' : 'OFF'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {route === 'cells' && (
          <div className="v3-cards v3-cards-grid">
            {window.GC_DATA.cells.map((c, i) => (
              <div key={c.id} className="v3-card v3-card-cell" data-active={selected === i || undefined} onClick={() => setSelected(i)}>
                <div className="v3-cell-ico">{c.id[0].toUpperCase()}</div>
                <div className="v3-card-name v3-mono">{c.id}</div>
                <div className="v3-card-meta">{c.type} · {c.level}</div>
                <div className="v3-cellstats">
                  <div><b>{c.p99}</b><span>p99</span></div>
                  <div><b>{c.rps}</b><span>rps</span></div>
                  <div><b>{c.slices}</b><span>slices</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="v3-inspector">
        <div className="v3-insp-head">
          <span className="v3-insp-title">Properties</span>
          <button className="v3-iconbtn">{v3I('M18 6L6 18 M6 6l12 12')}</button>
        </div>
        {route === 'users' && (
          <div className="v3-insp-body">
            <div className="v3-insp-hero">
              <div className="v3-avatar v3-avatar-lg">
                {window.GC_DATA.users[selected].name.split(' ').map(s=>s[0]).join('')}
              </div>
              <div>
                <div className="v3-insp-name">{window.GC_DATA.users[selected].name}</div>
                <div className="v3-mute v3-mono">{window.GC_DATA.users[selected].id}</div>
              </div>
            </div>
            {[
              ['Email', window.GC_DATA.users[selected].email, true],
              ['Username', window.GC_DATA.users[selected].username, true],
              ['Role', window.GC_DATA.users[selected].role],
              ['Status', window.GC_DATA.users[selected].status],
              ['Created', window.GC_DATA.users[selected].createdAt, true],
              ['Last seen', window.GC_DATA.users[selected].lastSeen],
            ].map(([k, v, mono]) => (
              <div key={k} className="v3-prop-row">
                <span className="v3-prop-k">{k}</span>
                <span className={'v3-prop-v' + (mono ? ' v3-mono' : '')}>{v}</span>
              </div>
            ))}
            <div className="v3-insp-section">
              <div className="v3-insp-label">ACTIVITY</div>
              {window.GC_DATA.audit.slice(0,3).map(e => (
                <div key={e.id} className="v3-insp-evt">
                  <span className="v3-mono">{e.ts.slice(0,8)}</span>
                  <span>{e.eventType.split('.').pop()}</span>
                </div>
              ))}
            </div>
            <div className="v3-insp-actions">
              <button className="v3-btn">Lock</button>
              <button className="v3-btn v3-btn-primary">Edit user</button>
            </div>
          </div>
        )}
        {route !== 'users' && (
          <div className="v3-insp-body">
            <div className="v3-insp-empty">
              <div className="v3-insp-empty-ico">◇</div>
              <div>Select an item to inspect</div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};

window.V3 = V3;
