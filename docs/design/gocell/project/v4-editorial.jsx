/* global React */
// ============================================================
// Variation 4 — Editorial / super-modern
// Magazine-scale typography, serif + mono mix, data-as-layout.
// This is the "bold" end of the spectrum.
// ============================================================
const { useState: uS4 } = React;

const V4 = () => {
  const [route, setRoute] = uS4('users');
  const [theme, setTheme] = uS4('light');
  const [collapsed, setCollapsed] = uS4(false);

  const nav = [
    ['users', '01', 'Users'],
    ['audit', '02', 'Audit'],
    ['config', '03', 'Config'],
    ['flags', '04', 'Flags'],
    ['cells', '05', 'Cells'],
  ];

  return (
    <div className="v4-root" data-theme={theme}>
      <aside className="v4-side" data-collapsed={collapsed || undefined}>
        <div className="v4-logo">
          <span className="v4-logo-serif">gocell</span>
          {!collapsed && <span className="v4-logo-sub">/ admin</span>}
        </div>
        <nav className="v4-nav">
          {nav.map(([k, n, label]) => (
            <button key={k} data-active={route === k || undefined} onClick={() => setRoute(k)}>
              <span className="v4-nav-num">{n}</span>
              {!collapsed && <span className="v4-nav-label">{label}</span>}
              {!collapsed && <span className="v4-nav-rule" />}
            </button>
          ))}
        </nav>
        {!collapsed && (
          <div className="v4-side-foot">
            <div className="v4-mono">v0.8.2 · prod</div>
            <div className="v4-mono">us-east · 6 cells</div>
          </div>
        )}
        <button className="v4-collapse" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? '›' : '‹'}
        </button>
      </aside>

      <main className="v4-main">
        <header className="v4-top">
          <div className="v4-date v4-mono">Saturday · April 25, 2026 · 12:42 UTC</div>
          <div className="v4-top-right">
            <button className="v4-top-link" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? 'Dark' : 'Light'} mode
            </button>
            <span className="v4-top-sep">·</span>
            <span className="v4-mono">alex @ gocell</span>
          </div>
        </header>

        {route === 'users' && (
          <>
            <section className="v4-hero">
              <div className="v4-kicker">§ {nav.find(n=>n[0]===route)[1]} · The roster</div>
              <h1 className="v4-title">
                Eight <em>members,</em> three <em>roles,</em><br />
                one <u>workspace.</u>
              </h1>
              <p className="v4-lead">
                Identity is handled by <code>accesscore</code>. Sessions expire after 15 minutes and
                every privileged action lands in the audit log with a hash-chained signature.
              </p>
              <div className="v4-hero-stats">
                <div><b>8</b><span>Active</span></div>
                <div><b>3</b><span>Admins</span></div>
                <div><b>1</b><span>Locked</span></div>
                <div><b>7 d</b><span>Avg session</span></div>
              </div>
            </section>

            <section className="v4-section">
              <div className="v4-section-head">
                <h2>Members</h2>
                <div className="v4-actions">
                  <button className="v4-link">+ Invite</button>
                  <button className="v4-link">Export</button>
                </div>
              </div>
              <div className="v4-list">
                {window.GC_DATA.users.map((u, i) => (
                  <div key={u.id} className="v4-row">
                    <div className="v4-row-n v4-mono">{String(i+1).padStart(2, '0')}</div>
                    <div className="v4-row-main">
                      <div className="v4-row-name">{u.name}</div>
                      <div className="v4-row-sub v4-mono">{u.email}</div>
                    </div>
                    <div className="v4-row-role">{u.role}</div>
                    <div className={'v4-row-status v4-row-status-' + u.status}>{u.status}</div>
                    <div className="v4-row-seen v4-mono">{u.lastSeen}</div>
                    <div className="v4-row-id v4-mono">{u.id}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {route === 'audit' && (
          <>
            <section className="v4-hero">
              <div className="v4-kicker">§ 02 · The record</div>
              <h1 className="v4-title">
                Every <em>event,</em> sealed<br />by a <u>hash chain.</u>
              </h1>
              <p className="v4-lead">
                2,104 entries this week. HMAC-SHA256 links each record to the last — tamper with one row
                and the whole chain breaks.
              </p>
            </section>
            <section className="v4-section">
              <div className="v4-section-head"><h2>Recent events</h2></div>
              <div className="v4-list">
                {window.GC_DATA.audit.map((e, i) => (
                  <div key={e.id} className="v4-evt">
                    <div className="v4-mono v4-evt-ts">{e.ts}</div>
                    <div className={'v4-evt-lvl v4-evt-lvl-' + e.level}>{e.level}</div>
                    <div className="v4-evt-name v4-mono">{e.eventType}</div>
                    <div className="v4-mute">{e.actor} · {e.cell}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {route === 'config' && (
          <>
            <section className="v4-hero">
              <div className="v4-kicker">§ 03 · The dials</div>
              <h1 className="v4-title">Tune <em>production</em><br /> without a <u>deploy.</u></h1>
              <p className="v4-lead">Every key is versioned. Edits stage until you publish. Rollback is one click.</p>
            </section>
            <section className="v4-section">
              <div className="v4-section-head"><h2>Keys</h2><button className="v4-link">+ New key</button></div>
              <div className="v4-list">
                {window.GC_DATA.configs.map((c, i) => (
                  <div key={c.key} className="v4-row v4-row-cfg">
                    <div className="v4-row-n v4-mono">{String(i+1).padStart(2,'0')}</div>
                    <div className="v4-mono" style={{fontWeight:500}}>{c.key}</div>
                    <div className="v4-mono v4-mute" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.value}</div>
                    <div className="v4-mono">v{c.version}</div>
                    <div className="v4-mono v4-mute">{c.publishedAt}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {route === 'flags' && (
          <>
            <section className="v4-hero">
              <div className="v4-kicker">§ 04 · The switches</div>
              <h1 className="v4-title">Ship <em>softly.</em><br />Roll back <u>loudly.</u></h1>
              <p className="v4-lead">Five runtime toggles. Three at 100%, one at 35%, one off.</p>
            </section>
            <section className="v4-section v4-flags">
              {window.GC_DATA.flags.map(f => (
                <div key={f.key} className="v4-flag">
                  <div className="v4-flag-key v4-mono">{f.key}</div>
                  <div className="v4-flag-meta">{f.env}</div>
                  <div className="v4-flag-big" style={{opacity: f.enabled ? 1 : 0.25}}>
                    <span className="v4-flag-num">{f.rollout}</span><span className="v4-flag-pct">%</span>
                  </div>
                  <div className={'v4-flag-state ' + (f.enabled ? 'on' : '')}>{f.enabled ? 'Live' : 'Off'}</div>
                </div>
              ))}
            </section>
          </>
        )}

        {route === 'cells' && (
          <>
            <section className="v4-hero">
              <div className="v4-kicker">§ 05 · The system</div>
              <h1 className="v4-title">Six <em>cells</em><br />in <u>one</u> assembly.</h1>
              <p className="v4-lead">Each Cell owns a domain. They never import each other — only contracts.</p>
            </section>
            <section className="v4-section v4-cells">
              {window.GC_DATA.cells.map(c => (
                <div key={c.id} className="v4-cell">
                  <div className="v4-cell-n v4-mono">{c.id}</div>
                  <div className="v4-cell-type">{c.type} · {c.level}</div>
                  <div className="v4-cell-big v4-mono">{c.rps}</div>
                  <div className="v4-cell-bigsub">rps · p99 {c.p99}</div>
                  <div className={'v4-cell-health ' + c.health}>{c.health === 'warn' ? 'Warning' : 'Healthy'}</div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

window.V4 = V4;
