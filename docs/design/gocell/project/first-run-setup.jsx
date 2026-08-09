/* global React, ReactDOM */
// First-run admin setup wizard for POST /api/v1/access/setup/admin
// Implements the two-plane bootstrap design from ADR 202605061600
// + docs/ops/first-run-setup.md. Operator-facing single-shot UI.

(() => {
  const { useState, useEffect, useMemo, useRef } = React;

  // ============================================================
  // Validation rules (mirror the kernel-side checks)
  // ============================================================
  const hasControlChar = (s) => /[\x00-\x08\x0E-\x1F\x7F]/.test(s);
  const trimMagic = (s) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

  const validateBasic = ({ user, pass }) => {
    const out = { user: null, pass: null };
    const u = trimMagic(user);
    const p = trimMagic(pass);
    if (!u) out.user = 'GOCELL_BOOTSTRAP_ADMIN_USERNAME is required.';
    else if (hasControlChar(u)) out.user = 'must not contain control characters';
    if (!p) out.pass = 'GOCELL_BOOTSTRAP_ADMIN_PASSWORD is required.';
    else if (hasControlChar(p)) out.pass = 'must not contain control characters';
    else if (p.length < 8) out.pass = 'must be at least 8 bytes (TrimSpace applied)';
    return out;
  };

  const pwChecks = (p) => ({
    len:  p.length >= 8 && p.length <= 72,
    ctrl: !!p && !hasControlChar(p),
    case: /[a-z]/.test(p) && /[A-Z]/.test(p),
    num:  /\d/.test(p),
    sym:  /[^A-Za-z0-9]/.test(p),
  });
  const pwScore = (c) => Object.values(c).filter(Boolean).length;

  const validateAdmin = ({ username, email, password, confirm }) => {
    const out = {};
    if (!username) out.username = 'username required';
    else if (!/^[a-z0-9_.-]{3,32}$/i.test(username))
      out.username = '3-32 chars, letters / digits / . _ -';
    if (!email) out.email = 'email required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      out.email = 'must be RFC-5321 form';
    const checks = pwChecks(password);
    if (!password) out.password = 'password required';
    else if (!checks.len)  out.password = 'must be 8–72 bytes (bcrypt cap)';
    else if (!checks.ctrl) out.password = 'must not contain control characters';
    if (confirm !== password) out.confirm = 'does not match';
    return out;
  };

  // ============================================================
  // Steps
  // ============================================================
  const STEPS = [
    { k: 'preflight', title: 'Preflight',         hint: 'env + endpoint',         line: '0' },
    { k: 'planes',    title: 'Two planes',        hint: 'why we ask twice',       line: '1' },
    { k: 'operator',  title: 'Operator credentials', hint: 'Basic Auth identity', line: '2' },
    { k: 'admin',     title: 'Admin identity',    hint: 'who we are creating',    line: '3' },
    { k: 'submit',    title: 'Submit',            hint: 'POST setup/admin',       line: '4' },
    { k: 'done',      title: 'Done',              hint: 'next: login',            line: '5' },
  ];

  // ============================================================
  // Simulated response scenarios — operator can switch in aside
  // ============================================================
  const SCENARIOS = {
    '201': { code: 201, title: '201 Created',
      detail: 'Admin user created. Token pair will be issued on subsequent login.' },
    '401': { code: 401, title: '401 ERR_AUTH_BOOTSTRAP_FAILED',
      detail: 'Operator Basic Auth rejected. Envelope is oracle-safe — username vs password is not distinguished. crypto/subtle.ConstantTimeCompare in use.' },
    '409': { code: 409, title: '409 ERR_USER_USERNAME_TAKEN',
      detail: 'Body username conflicts with an existing user. Change username and retry.' },
    '410': { code: 410, title: '410 Gone — admin already provisioned',
      detail: 'first-run window already closed (permanent). endpoint remains Basic-Auth-protected to avoid 410 oracle. Recover the admin password via PG password reset (docs/ops/first-run-setup.md §Reset).' },
    '429': { code: 429, title: '429 ERR_RATE_LIMITED',
      detail: 'per-IP token bucket exceeded (5 req/min sustained, burst 10). Wait for the window to reset.' },
  };

  // ============================================================
  // Wire payload preview
  // ============================================================
  const WirePreview = ({ basic, admin }) => {
    const b64 = btoa(`${basic.user || '<USERNAME>'}:${basic.pass || '<PASSWORD>'}`);
    const body = JSON.stringify({
      username: admin.username || '<admin>',
      email:    admin.email    || '<admin@corp.example>',
      password: admin.password ? '••••••••' : '<PASSWORD>',
    }, null, 2);
    return (
      <div>
        <div className="frs-wire-h">
          <span className="frs-method">POST</span>
          <span>/api/v1/access/setup/admin</span>
        </div>
        <pre className="frs-wire">{`Authorization: Basic ${b64}
Content-Type: application/json

${body}`}</pre>
      </div>
    );
  };

  // ============================================================
  // Aside content per step
  // ============================================================
  const Aside = ({ step, basic, admin, scenario, onScenario }) => (
    <aside className="frs-aside">
      <div className="frs-aside-section">
        <div className="frs-aside-h">Wire</div>
        <WirePreview basic={basic} admin={admin}/>
      </div>

      <div className="frs-aside-section">
        <div className="frs-aside-h">Response codes</div>
        <div className="frs-aside-list">
          {Object.entries(SCENARIOS).map(([k, s]) => (
            <div key={k} className="frs-aside-status">
              <span className={`frs-aside-status-code frs-aside-status-${k}`}>{k}</span>
              <span>
                <b>{s.title.replace(/^\d+ /, '')}</b>
                <div className="frs-aside-status-name">{s.detail}</div>
              </span>
            </div>
          ))}
        </div>
        {step === 'submit' && (
          <div style={{ marginTop: 14 }}>
            <div className="frs-aside-h">Simulate response</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(SCENARIOS).map(k => (
                <button key={k}
                        className="frs-btn"
                        data-active={scenario === k || undefined}
                        style={{
                          height: 28, padding: '0 10px', fontSize: 12,
                          background: scenario === k ? 'var(--fg)' : 'var(--bg)',
                          color: scenario === k ? 'var(--bg)' : 'var(--fg)',
                        }}
                        onClick={() => onScenario(k)}>{k}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {step === 'planes' && (
        <div className="frs-aside-section">
          <div className="frs-aside-h">Reference</div>
          <div className="frs-aside-title">ADR 202605061600</div>
          <div className="frs-aside-body">
            Bootstrap admin security boundary — closes B2-C-02 (P0).
            Replaces v1 credfile path; operator Basic Auth is now the persistent
            authenticator. <span className="v1-mono">FMT-27</span> / <span className="v1-mono">FMT-28</span>{' '}
            enforce mutual exclusion across <code>auth.public</code> /{' '}
            <code>auth.bootstrap</code> / <code>auth.passwordResetExempt</code>.
          </div>
        </div>
      )}

      {step === 'operator' && (
        <div className="frs-aside-section">
          <div className="frs-aside-h">Where do these come from?</div>
          <div className="frs-aside-body">
            Set in the deployment manifest before container start. In K8s, use a{' '}
            <code>Secret</code> ref'd by{' '}
            <code>env.valueFrom.secretKeyRef</code>; in docker-compose, set in{' '}
            <code>environment:</code>. These env values are the{' '}
            <b>persistent authenticator</b> — they stay set forever and gate every
            future call to <code>setup/admin</code> (which will return{' '}
            <span className="v1-mono">410</span> after first success).
          </div>
        </div>
      )}

      {step === 'admin' && (
        <div className="frs-aside-section">
          <div className="frs-aside-h">Stored as</div>
          <div className="frs-aside-body">
            Password is hashed with <b>bcrypt cost=12</b> (OWASP 2023) before
            writing to <code>users.password_hash</code>. The plaintext never
            touches the slog pipeline. Cap is 72 bytes (bcrypt limit).
          </div>
          <div className="frs-aside-title" style={{ marginTop: 14 }}>After 201</div>
          <div className="frs-aside-body">
            <code>POST /api/v1/access/sessions/login</code> with the body
            credentials returns a <code>TokenPair</code> ({'{'} accessToken,
            refreshToken {'}'}). RS256 signed; verify via JWKS.
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="frs-aside-section">
          <div className="frs-aside-h">After this</div>
          <div className="frs-aside-body">
            The <code>setup/admin</code> endpoint will now answer{' '}
            <span className="v1-mono">410 Gone</span> permanently. Bootstrap env
            stays in place to keep the route Basic-Auth-protected (avoids the
            410 oracle).
            <br/><br/>
            Rotate via "rolling K8s Secret replace + restart". See backlog{' '}
            <span className="v1-mono">BOOTSTRAP-RATELIMIT-DISTRIBUTED-01</span>{' '}
            for distributed rate limiter; current bucket is per-replica
            in-memory.
          </div>
        </div>
      )}
    </aside>
  );

  // ============================================================
  // Preflight — simulated env / endpoint check
  // ============================================================
  const Preflight = ({ onNext }) => {
    const [checks, setChecks] = useState([
      { k: 'env-user', state: 'loading', name: 'GOCELL_BOOTSTRAP_ADMIN_USERNAME present', meta: '' },
      { k: 'env-pass', state: 'loading', name: 'GOCELL_BOOTSTRAP_ADMIN_PASSWORD present', meta: '' },
      { k: 'jwt',      state: 'loading', name: 'JWT keypair loaded',                       meta: '' },
      { k: 'ready',    state: 'loading', name: '/readyz reachable',                        meta: '' },
      { k: 'setup',    state: 'loading', name: 'setup/admin not yet consumed (status 401 expected)', meta: '' },
    ]);

    useEffect(() => {
      const seq = [
        { k: 'env-user', state: 'ok',   meta: 'len=3 · ops' },
        { k: 'env-pass', state: 'ok',   meta: '≥8 bytes · TrimSpace ok' },
        { k: 'jwt',      state: 'ok',   meta: 'RS256 · issuer=todoorder-local' },
        { k: 'ready',    state: 'ok',   meta: 'http://localhost:8082/readyz · 204' },
        { k: 'setup',    state: 'ok',   meta: 'GET /api/v1/access/setup/admin → 405 (POST only, Basic Auth still active)' },
      ];
      seq.forEach((upd, i) => {
        setTimeout(() => {
          setChecks(prev => prev.map(c => c.k === upd.k ? { ...c, ...upd } : c));
        }, 420 * (i + 1));
      });
    }, []);

    const allOk = checks.every(c => c.state === 'ok');
    return (
      <>
        <div className="frs-card">
          <div className="frs-card-h">
            Preflight
            <span className="frs-tag">/readyz · env probe</span>
          </div>
          <div className="frs-checks">
            {checks.map(c => (
              <div key={c.k} className="frs-check">
                <span className="frs-check-icon" data-state={c.state}>
                  {c.state === 'ok' ? '✓' : c.state === 'fail' ? '✗' : c.state === 'warn' ? '!' : '·'}
                </span>
                <span>
                  <div className="frs-check-name">{c.name}</div>
                  {c.meta && <div className="frs-check-sub">{c.meta}</div>}
                </span>
                <span className="frs-check-meta">{c.state}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="frs-actions">
          <span className="frs-actions-sep"/>
          <button className="frs-btn frs-btn-primary" disabled={!allOk} onClick={onNext}>
            Continue → Two planes
          </button>
        </div>
      </>
    );
  };

  // ============================================================
  // Planes — explainer (operator vs admin identity)
  // ============================================================
  const Planes = ({ onPrev, onNext }) => (
    <>
      <div className="frs-planes">
        <div className="frs-plane">
          <div className="frs-plane-h">Plane A · authenticator</div>
          <div className="frs-plane-title">Operator (env)</div>
          <div className="frs-plane-sub">
            Persistent HTTP Basic Auth. Verifies <i>who is allowed to call</i>{' '}
            setup/admin. Never written to <span className="v1-mono">users</span> table.
          </div>
          <div className="frs-plane-rows">
            <div className="frs-plane-row"><b>GOCELL_BOOTSTRAP_ADMIN_USERNAME</b></div>
            <div className="frs-plane-row"><b>GOCELL_BOOTSTRAP_ADMIN_PASSWORD</b></div>
            <div className="frs-plane-row"><span>injected by</span> K8s Secret / docker-compose env</div>
            <div className="frs-plane-row"><span>lifecycle</span> persistent · rotate by rolling restart</div>
          </div>
        </div>
        <div className="frs-planes-divider">
          <svg width="20" height="80" viewBox="0 0 20 80" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M10 4 V 76 M 4 70 L 10 76 L 16 70"/>
          </svg>
          <div className="frs-planes-divider-label">authenticates</div>
        </div>
        <div className="frs-plane">
          <div className="frs-plane-h">Plane B · subject</div>
          <div className="frs-plane-title">Admin (request body)</div>
          <div className="frs-plane-sub">
            The actual user being created. Password hashed bcrypt cost=12, stored
            in <span className="v1-mono">users</span> table. Logs in via{' '}
            <span className="v1-mono">/sessions/login</span>.
          </div>
          <div className="frs-plane-rows">
            <div className="frs-plane-row"><b>username</b></div>
            <div className="frs-plane-row"><b>email</b></div>
            <div className="frs-plane-row"><b>password</b></div>
            <div className="frs-plane-row"><span>lifecycle</span> one-shot · 410 Gone after success</div>
            <div className="frs-plane-row"><span>reset path</span> SQL update + <span className="v1-mono">password_reset_required</span></div>
          </div>
        </div>
      </div>

      <div className="frs-card">
        <div className="frs-card-h">
          Why two?
          <span className="frs-tag">ADR §D4 plane separation</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
          The legacy v1 design exposed <code>setup/admin</code> as{' '}
          <span className="v1-mono">auth.public:true</span> — anyone reaching the
          endpoint in the first-run window could steal admin. The fix is
          permanent operator authentication via env; the admin you create is
          unrelated to the operator. Operator env stays set forever so the route
          never re-opens (returns <span className="v1-mono">401</span> if the
          operator probes again, <span className="v1-mono">410</span> if a
          legitimate operator probes after success).
        </p>
      </div>

      <div className="frs-actions">
        <button className="frs-btn frs-btn-ghost" onClick={onPrev}>← Back</button>
        <span className="frs-actions-sep"/>
        <button className="frs-btn frs-btn-primary" onClick={onNext}>
          Continue → Enter operator credentials
        </button>
      </div>
    </>
  );

  // ============================================================
  // Operator credentials form
  // ============================================================
  const OperatorForm = ({ basic, setBasic, onPrev, onNext }) => {
    const [showPw, setShowPw] = useState(false);
    const errors = validateBasic(basic);
    const valid = !errors.user && !errors.pass;
    return (
      <>
        <div className="frs-card">
          <div className="frs-card-h">
            Operator (env)
            <span className="frs-tag">Basic Auth</span>
          </div>
          <div className="frs-field-pair">
            <div className="frs-field">
              <label className="frs-label">
                Username
                <span className="v1-mono">GOCELL_BOOTSTRAP_ADMIN_USERNAME</span>
              </label>
              <input className="frs-input"
                     placeholder="ops"
                     value={basic.user}
                     data-invalid={!!errors.user && basic.user.length > 0 || undefined}
                     onChange={e => setBasic({ ...basic, user: e.target.value })}/>
              {errors.user && basic.user.length > 0 &&
                <div className="frs-help frs-help-err">{errors.user}</div>}
            </div>
            <div className="frs-field">
              <label className="frs-label">
                Password
                <span className="v1-mono">GOCELL_BOOTSTRAP_ADMIN_PASSWORD</span>
              </label>
              <div className="frs-input-pw"
                   data-invalid={!!errors.pass && basic.pass.length > 0 || undefined}>
                <input type={showPw ? 'text' : 'password'}
                       placeholder="≥ 8 bytes, printable ASCII"
                       value={basic.pass}
                       onChange={e => setBasic({ ...basic, pass: e.target.value })}/>
                <button type="button" onClick={() => setShowPw(s => !s)}>
                  {showPw ? 'hide' : 'show'}
                </button>
              </div>
              {errors.pass && basic.pass.length > 0 &&
                <div className="frs-help frs-help-err">{errors.pass}</div>}
              {!errors.pass && basic.pass.length >= 8 &&
                <div className="frs-help frs-help-ok">looks good</div>}
            </div>
          </div>
          <div className="frs-help" style={{ marginTop: 6 }}>
            TrimSpace is applied — K8s Secret end-of-line newline is absorbed
            automatically. Control characters cause startup fail-fast.
          </div>
        </div>

        <div className="frs-actions">
          <button className="frs-btn frs-btn-ghost" onClick={onPrev}>← Back</button>
          <span className="frs-actions-sep"/>
          <button className="frs-btn frs-btn-primary" disabled={!valid} onClick={onNext}>
            Continue → Admin identity
          </button>
        </div>
      </>
    );
  };

  // ============================================================
  // Admin identity form
  // ============================================================
  const AdminForm = ({ admin, setAdmin, onPrev, onNext }) => {
    const [showPw, setShowPw] = useState(false);
    const errors = validateAdmin(admin);
    const valid = Object.keys(errors).length === 0;
    const checks = pwChecks(admin.password);
    const score = pwScore(checks);
    const strength = score < 3 ? 'weak' : score < 5 ? 'mid' : 'ok';
    const bars = ['weak', 'weak', 'mid', 'mid', 'ok'];
    return (
      <>
        <div className="frs-card">
          <div className="frs-card-h">
            Admin user (body)
            <span className="frs-tag">request body</span>
          </div>

          <div className="frs-field-pair">
            <div className="frs-field">
              <label className="frs-label">
                Username
                <span className="frs-label-required">required</span>
              </label>
              <input className="frs-input"
                     placeholder="admin"
                     value={admin.username}
                     data-invalid={!!errors.username && admin.username.length > 0 || undefined}
                     onChange={e => setAdmin({ ...admin, username: e.target.value })}/>
              {errors.username && admin.username.length > 0 &&
                <div className="frs-help frs-help-err">{errors.username}</div>}
            </div>
            <div className="frs-field">
              <label className="frs-label">
                Email
                <span className="frs-label-required">required</span>
              </label>
              <input className="frs-input"
                     placeholder="admin@corp.example"
                     value={admin.email}
                     data-invalid={!!errors.email && admin.email.length > 0 || undefined}
                     onChange={e => setAdmin({ ...admin, email: e.target.value })}/>
              {errors.email && admin.email.length > 0 &&
                <div className="frs-help frs-help-err">{errors.email}</div>}
            </div>
          </div>

          <div className="frs-field">
            <label className="frs-label">
              Password
              <span className="frs-label-required">required</span>
              <span className="v1-mono">8–72 bytes · bcrypt cost=12</span>
            </label>
            <div className="frs-input-pw">
              <input type={showPw ? 'text' : 'password'}
                     placeholder="long passphrase, mixed case, digits, symbol"
                     value={admin.password}
                     onChange={e => setAdmin({ ...admin, password: e.target.value })}/>
              <button type="button" onClick={() => setShowPw(s => !s)}>
                {showPw ? 'hide' : 'show'}
              </button>
            </div>
            <div className="frs-pw-bars">
              {bars.map((b, i) => (
                <div key={i} className="frs-pw-bar"
                     data-on={i < score ? strength : undefined}/>
              ))}
            </div>
            <div className="frs-pw-checks">
              <span data-ok={checks.len}>8–72 bytes</span>
              <span data-ok={checks.ctrl}>no control chars</span>
              <span data-ok={checks.case}>mixed case</span>
              <span data-ok={checks.num}>digit</span>
              <span data-ok={checks.sym}>symbol</span>
            </div>
          </div>

          <div className="frs-field">
            <label className="frs-label">
              Confirm password
              <span className="frs-label-required">required</span>
            </label>
            <input className="frs-input"
                   type="password"
                   value={admin.confirm}
                   data-invalid={!!errors.confirm && admin.confirm.length > 0 || undefined}
                   onChange={e => setAdmin({ ...admin, confirm: e.target.value })}/>
            {errors.confirm && admin.confirm.length > 0 &&
              <div className="frs-help frs-help-err">{errors.confirm}</div>}
          </div>
        </div>

        <div className="frs-actions">
          <button className="frs-btn frs-btn-ghost" onClick={onPrev}>← Back</button>
          <span className="frs-actions-sep"/>
          <button className="frs-btn frs-btn-primary" disabled={!valid} onClick={onNext}>
            Continue → Review &amp; submit
          </button>
        </div>
      </>
    );
  };

  // ============================================================
  // Submit step — fires the (simulated) POST
  // ============================================================
  const SubmitStep = ({ basic, admin, scenario, onPrev, onSuccess, onScenario }) => {
    const [pending, setPending] = useState(false);
    const [result, setResult] = useState(null);

    const submit = () => {
      setPending(true);
      setResult(null);
      setTimeout(() => {
        const s = SCENARIOS[scenario];
        setResult(s);
        setPending(false);
        if (s.code === 201) {
          setTimeout(() => onSuccess(), 700);
        }
      }, 900);
    };

    return (
      <>
        <div className="frs-card">
          <div className="frs-card-h">
            Review request
            <span className="frs-tag">no plaintext password is logged</span>
          </div>
          <WirePreview basic={basic} admin={admin}/>
        </div>

        <div className="frs-card">
          <div className="frs-card-h">
            Send
            <span className="frs-tag">simulate {scenario}</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--fg-muted)' }}>
            The request below is dispatched against <code>POST /api/v1/access/setup/admin</code>.
            Until the live backend is wired, response is simulated — switch
            scenarios on the right.
          </p>
          <div className="frs-actions" style={{ marginTop: 0 }}>
            <button className="frs-btn frs-btn-ghost" onClick={onPrev}>← Back</button>
            <span className="frs-actions-sep"/>
            <button className="frs-btn frs-btn-primary" disabled={pending} onClick={submit}>
              {pending ? 'POST …' : `POST setup/admin (simulate ${scenario})`}
            </button>
          </div>

          {result && (
            <div className={`frs-result frs-result-${result.code}`}>
              <span className="frs-result-code">{result.code}</span>
              <div className="frs-result-body">
                <div className="frs-result-title">{result.title}</div>
                <div className="frs-result-detail">{result.detail}</div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  // ============================================================
  // Done — success summary + next step
  // ============================================================
  const DoneStep = ({ basic, admin, onRestart }) => (
    <>
      <div className="frs-card">
        <div className="frs-done-art">
          <div className="frs-done-badge">setup/admin · 201</div>
        </div>
        <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--fg-muted)' }}>
          Admin <b className="v1-mono">{admin.username}</b> is now in the{' '}
          <span className="v1-mono">users</span> table with role{' '}
          <span className="v1-mono">admin</span>. The bootstrap window is closed
          — subsequent calls to <span className="v1-mono">setup/admin</span> will
          return <span className="v1-mono">410 Gone</span>.
        </p>
        <dl className="frs-done-kv">
          <dt>user.id</dt>           <dd>u_01HJ7… (assigned)</dd>
          <dt>user.role</dt>         <dd>admin</dd>
          <dt>password_hash</dt>     <dd>$2a$12$… (bcrypt, cost=12)</dd>
          <dt>password_reset_required</dt> <dd>false</dd>
          <dt>created_at</dt>        <dd>2026-05-23T11:42:08Z</dd>
        </dl>
      </div>

      <div className="frs-card">
        <div className="frs-card-h">
          Next: sign in with the new admin
          <span className="frs-tag">POST /api/v1/access/sessions/login</span>
        </div>
        <pre className="frs-wire">{`curl -s -X POST http://localhost:8082/api/v1/access/sessions/login \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify({ username: admin.username || 'admin', password: '••••••••' })}'

# returns:
# { "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 3600 }`}</pre>
      </div>

      <div className="frs-card">
        <div className="frs-card-h">
          Lock down the bootstrap surface
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--fg-muted)' }}>
          <li>Keep <span className="v1-mono">GOCELL_BOOTSTRAP_ADMIN_*</span> set — removing them re-opens the route to 401 oracle.</li>
          <li>Rotate via <i>rolling K8s Secret replace + restart</i>. Don't rename the env keys without a coordinated ADR.</li>
          <li>Per-IP rate limit (5/min, burst 10) is per-replica in-memory. Multi-pod distributed limiter tracked in backlog <span className="v1-mono">BOOTSTRAP-RATELIMIT-DISTRIBUTED-01</span>.</li>
          <li>Forgotten admin password → SQL update + <span className="v1-mono">password_reset_required=true</span>.</li>
        </ul>
      </div>

      <div className="frs-actions">
        <button className="frs-btn frs-btn-ghost" onClick={onRestart}>↺ Run another preflight</button>
      </div>
    </>
  );

  // ============================================================
  // Root wizard
  // ============================================================
  const titles = {
    preflight: ['STEP 0 · PREFLIGHT',
      'Verify env and endpoint are ready',
      'Before sending credentials, confirm GOCELL_BOOTSTRAP_ADMIN_* are present in the running container and the listener is healthy.'],
    planes: ['STEP 1 · DESIGN',
      'Two identity planes — operator and admin',
      'setup/admin is protected by env-injected operator Basic Auth. The actual admin you create is unrelated.'],
    operator: ['STEP 2 · OPERATOR',
      'Operator credentials (env)',
      'These match GOCELL_BOOTSTRAP_ADMIN_USERNAME / _PASSWORD as configured in the deployment manifest. They authenticate this very request — and every future call to setup/admin.'],
    admin: ['STEP 3 · ADMIN',
      'Admin identity (request body)',
      'The user we are about to create. Password is hashed bcrypt cost=12 before persistence; plaintext never enters slog.'],
    submit: ['STEP 4 · SUBMIT',
      'Review and dispatch POST setup/admin',
      'The wire is shown verbatim. The operator may pick a response scenario on the right while the backend is being stood up.'],
    done: ['STEP 5 · DONE',
      'Admin provisioned — proceed to sign in',
      'The bootstrap window is permanently closed. Use the new admin credentials to sign in below.'],
  };

  const App = () => {
    const [step, setStep] = useState('preflight');
    const [basic, setBasic] = useState({ user: '', pass: '' });
    const [admin, setAdmin] = useState({ username: '', email: '', password: '', confirm: '' });
    const [scenario, setScenario] = useState('201');
    const [doneSteps, setDoneSteps] = useState({});
    const [theme, setTheme] = useState('light');

    const mark = (k) => setDoneSteps(d => ({ ...d, [k]: true }));

    const go = (k) => { mark(step); setStep(k); };
    const back = (k) => { setStep(k); };

    const idx = STEPS.findIndex(s => s.k === step);
    const [eyebrow, title, deck] = titles[step];

    return (
      <div className="frs-root" data-theme={theme}>
        <div className="frs-side">
          <div className="frs-brand">
            <div className="frs-brand-mark">G</div>
            <span className="frs-brand-name">gocell</span>
            <span className="frs-brand-env">first run</span>
          </div>
          <div className="frs-side-sub">todoorder · :8082 · DurabilityDemo</div>
          <nav className="frs-steps">
            {STEPS.map((s, i) => (
              <button key={s.k}
                      className="frs-step"
                      data-active={step === s.k}
                      data-done={doneSteps[s.k] || (i < idx && step !== s.k) || undefined}
                      disabled={i > idx + 1 && !doneSteps[s.k]}
                      onClick={() => setStep(s.k)}>
                <span className="frs-step-mark">
                  {doneSteps[s.k] || i < idx ? '✓' : s.line}
                </span>
                <span className="frs-step-body">
                  <div className="frs-step-title">{s.title}</div>
                  <div className="frs-step-hint">{s.hint}</div>
                </span>
              </button>
            ))}
          </nav>
          <div className="frs-side-foot">
            <div>ADR <span className="v1-mono">202605061600</span></div>
            <div>FMT-27 / FMT-28 · oracle-safe 401</div>
            <button className="frs-btn frs-btn-ghost"
                    style={{ marginTop: 10, height: 28, padding: '0 10px', fontSize: 11.5 }}
                    onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? 'switch to dark' : 'switch to light'}
            </button>
          </div>
        </div>

        <main className="frs-main">
          <div className="frs-eyebrow">{eyebrow}</div>
          <h1 className="frs-title">{title}</h1>
          <p className="frs-deck">{deck}</p>

          {step === 'preflight' && <Preflight onNext={() => go('planes')}/>}
          {step === 'planes' && (
            <Planes onPrev={() => back('preflight')} onNext={() => go('operator')}/>
          )}
          {step === 'operator' && (
            <OperatorForm basic={basic} setBasic={setBasic}
                          onPrev={() => back('planes')}
                          onNext={() => go('admin')}/>
          )}
          {step === 'admin' && (
            <AdminForm admin={admin} setAdmin={setAdmin}
                       onPrev={() => back('operator')}
                       onNext={() => go('submit')}/>
          )}
          {step === 'submit' && (
            <SubmitStep basic={basic} admin={admin}
                        scenario={scenario}
                        onScenario={setScenario}
                        onPrev={() => back('admin')}
                        onSuccess={() => go('done')}/>
          )}
          {step === 'done' && (
            <DoneStep basic={basic} admin={admin}
                      onRestart={() => {
                        setDoneSteps({});
                        setStep('preflight');
                      }}/>
          )}
        </main>

        <Aside step={step}
               basic={basic} admin={admin}
               scenario={scenario}
               onScenario={setScenario}/>
      </div>
    );
  };

  window.FirstRunSetup = App;
})();
