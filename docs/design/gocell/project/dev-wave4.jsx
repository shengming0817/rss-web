/* global React */
// Wave 4 — Sandbox detail page
//   Tabs: Diff · Commits · Verify · Conversation
//   Header actions: open draft PR (when review-ready), stop, GC resources
//   Resource usage: cpu / mem / disk / wallclock budgets

(() => {
  const { useState } = React;
  const C3 = window.DevCell3 || {};
  const D2 = window.DevCell2 || {};
  const SANDBOXES = C3.SANDBOXES || [];
  const CELL_REPO = C3.CELL_REPO || {};
  const SLICE_DOD = D2.SLICE_DOD || {};
  const SLICES    = D2.SLICES   || {};

  // ====== Synthesized per-sandbox detail (keyed by sandbox id) ======
  const SBX_DETAIL = {
    'sbx-7e2a91': {
      slice: 'sso.oidc',
      resources: { cpu: { used: 0.42, cap: 2 }, mem: { used: 380, cap: 1024 }, disk: { used: 184, cap: 1024 }, wall: { used: '12m', cap: '4h' } },
      diff: [
        { path: 'cells/accesscore/sso/oidc.go', op: 'edit', add: 64, del: 18, hunk: [
          { l: 47, txt: 'func (h *Handler) verifyIDToken(ctx context.Context, raw string) (*Claims, error) {', tone: 'ctx' },
          { l: 48, txt: '-\tkey, err := h.jwks.Get(ctx, raw)',  tone: 'del' },
          { l: 49, txt: '+\tkey, err := h.jwks.GetForKid(ctx, raw)', tone: 'add' },
          { l: 50, txt: '+\tif err != nil { return nil, fmt.Errorf("oidc: kid lookup: %w", err) }', tone: 'add' },
          { l: 51, txt: '\treturn h.parser.Parse(raw, key)', tone: 'ctx' },
        ]},
        { path: 'cells/accesscore/sso/claims.go', op: 'edit', add: 38, del: 6, hunk: [
          { l: 22, txt: 'func mapGroupClaims(claims map[string]any) []string {', tone: 'ctx' },
          { l: 23, txt: '+\tif arr, ok := claims["groups"].([]any); ok {', tone: 'add' },
          { l: 24, txt: '+\t\treturn toStringSlice(arr)', tone: 'add' },
          { l: 25, txt: '+\t}', tone: 'add' },
          { l: 26, txt: '+\tif arr, ok := claims["roles"].([]any); ok {', tone: 'add' },
          { l: 27, txt: '+\t\treturn toStringSlice(arr)', tone: 'add' },
          { l: 28, txt: '+\t}', tone: 'add' },
        ]},
        { path: 'cells/accesscore/sso/oidc_test.go', op: 'edit', add: 32, del: 10, hunk: [
          { l: 88, txt: 'func TestEntra_GroupsClaim(t *testing.T) {', tone: 'ctx' },
          { l: 89, txt: '+\tt.Run("groups present", func(t *testing.T) {', tone: 'add' },
          { l: 90, txt: '+\t\tgot := mapGroupClaims(map[string]any{"groups": []any{"admin"}})', tone: 'add' },
          { l: 91, txt: '+\t\trequire.Equal(t, []string{"admin"}, got)', tone: 'add' },
          { l: 92, txt: '+\t})', tone: 'add' },
        ]},
        { path: 'docs/sso/entra-mapping.md', op: 'create', add: 8, del: 2, hunk: [
          { l: 1, txt: '+# Entra `groups` vs `roles` claim', tone: 'add' },
          { l: 2, txt: '+', tone: 'add' },
          { l: 3, txt: '+Entra emits one of `groups` or `roles` depending on app registration.', tone: 'add' },
        ]},
      ],
      commits: [
        { sha: 'd9e8a14', when: '2m ago',  by: '@li.wei',     msg: 'fix: kid lookup before parse' },
        { sha: '4f1b6c2', when: '6m ago',  by: 'agent/claude', msg: 'oidc: handle Entra groups + roles' },
        { sha: '0e2b988', when: '9m ago',  by: 'agent/claude', msg: 'test: Entra group claim cases' },
        { sha: 'a3f9c12', when: '12m ago', by: 'agent/claude', msg: 'sandbox: branch off main@a3f9c12' },
      ],
      verify: {
        unit: [
          { name: 'TestOIDC_Discovery',          pass: true,  ms: 14 },
          { name: 'TestOIDC_TokenVerify',        pass: true,  ms: 22 },
          { name: 'TestEntra_GroupsClaim',       pass: true,  ms: 6 },
          { name: 'TestEntra_RolesClaim',        pass: false, ms: 5, why: 'roles fallback returns nil — line 26' },
          { name: 'TestSession_Mint_AfterLogin', pass: false, ms: 31, why: 'session.refresh contract: missing iat field' },
          { name: 'TestSession_RotateOnRefresh', pass: true,  ms: 18 },
        ],
        contract: [
          { name: 'auth.verify',     pass: true },
          { name: 'session.refresh', pass: false, why: 'iat field expected but missing in payload' },
        ],
      },
      conversation: [
        { kind: 'plan',   when: '12m', txt: 'Plan:\n1. Verify ID token w/ JWKS kid lookup\n2. Map groups OR roles claim\n3. Add Entra-specific tests\n4. Wire audit hook' },
        { kind: 'patch',  when: '11m', txt: 'cells/accesscore/sso/oidc.go (+64 −18)\ncells/accesscore/sso/claims.go (+38 −6)' },
        { kind: 'run',    when: '8m',  txt: 'go test ./cells/accesscore/sso/...', exit: 1, tail: 'FAIL: TestEntra_RolesClaim — roles fallback returns nil' },
        { kind: 'review', when: '7m',  txt: 'roles fallback in claims.go:26 returns early before string conversion. Patch: handle when claims["roles"] is []any too.' },
        { kind: 'patch',  when: '6m',  txt: 'cells/accesscore/sso/claims.go (+12 −0) — toStringSlice helper' },
        { kind: 'run',    when: '4m',  txt: 'go test ./cells/accesscore/sso/...', exit: 1, tail: 'FAIL: TestSession_Mint_AfterLogin — session.refresh missing iat' },
        { kind: 'review', when: '3m',  txt: 'session.refresh contract failing — out of slice scope (sso.oidc owns oidc only). Halting; will request slice boundary expansion.' },
      ],
    },
    'sbx-2db1f4': {
      slice: 'merkle.proof',
      resources: { cpu: { used: 0.06, cap: 2 }, mem: { used: 210, cap: 1024 }, disk: { used: 88, cap: 1024 }, wall: { used: '54m', cap: '4h' } },
      diff: [
        { path: 'cells/auditcore/merkle/proof.go', op: 'edit', add: 60, del: 8, hunk: [
          { l: 11, txt: 'func (p *Prover) Build(events []Event) (*Proof, error) {', tone: 'ctx' },
          { l: 12, txt: '+\tif len(events) == 0 { return &Proof{Empty: true}, nil }', tone: 'add' },
        ]},
        { path: 'cells/auditcore/merkle/proof_test.go', op: 'edit', add: 26, del: 4, hunk: [] },
      ],
      commits: [
        { sha: 'b41e9c0', when: '3m',  by: 'agent/claude', msg: 'proof: empty-set short-circuit' },
        { sha: '8a72d3f', when: '22m', by: 'agent/claude', msg: 'proof: handle batch >10k events' },
        { sha: '7d1b04e', when: '54m', by: 'agent/claude', msg: 'sandbox: branch off main@7d1b04e' },
      ],
      verify: {
        unit: [
          { name: 'TestMerkle_BuildSmall',  pass: true, ms: 4 },
          { name: 'TestMerkle_BuildLarge',  pass: true, ms: 184 },
          { name: 'TestMerkle_EmptyEvents', pass: true, ms: 1 },
          { name: 'TestProof_Verify',       pass: true, ms: 12 },
        ],
        contract: [
          { name: 'audit.proof', pass: true },
        ],
      },
      conversation: [
        { kind: 'plan',  when: '54m', txt: 'Plan: empty-set + large-batch coverage for merkle.proof.' },
        { kind: 'patch', when: '50m', txt: 'cells/auditcore/merkle/proof.go (+60 −8)' },
        { kind: 'run',   when: '40m', txt: 'go test ./cells/auditcore/merkle/...', exit: 0, tail: 'ok — 4 tests, 201ms' },
        { kind: 'review',when: '38m', txt: 'All unit + contract tests pass. Empty-set edge case covered. Drafted PR #1947.' },
      ],
    },
    'sbx-91c7ab': {
      slice: 'publish',
      resources: { cpu: { used: 0, cap: 2 }, mem: { used: 140, cap: 1024 }, disk: { used: 240, cap: 1024 }, wall: { used: '3h', cap: '4h' } },
      diff: [], commits: [
        { sha: 'f2c8b91', when: '3h', by: 'agent/claude', msg: 'sandbox: branch off main@f2c8b91' },
      ],
      verify: { unit: [], contract: [] },
      conversation: [
        { kind: 'plan', when: '3h', txt: 'Plan: stage → publish → rollback flow.' },
        { kind: 'run',  when: '2h', txt: 'go test ./cells/configcore/publish/...', exit: 1, tail: 'FAIL: TestRollback — slice not implemented' },
        { kind: 'review', when: '2h', txt: 'rollback slice marked todo by driver. Idle pending decision.' },
      ],
    },
    'sbx-44eb02': {
      slice: 'otlp',
      resources: { cpu: { used: 0, cap: 2 }, mem: { used: 0, cap: 1024 }, disk: { used: 12, cap: 1024 }, wall: { used: '18h', cap: '4h' } },
      diff: [], commits: [], verify: { unit: [], contract: [] }, conversation: [
        { kind: 'review', when: '18h', txt: 'Stopped by driver. Resources released; workspace retained for inspection until 7d GC.' },
      ],
    },
  };

  // ====== PR draft modal ======
  const PRDraftModal = ({ open, sbx, onClose, onConfirm }) => {
    const [title, setTitle] = useState('');
    const [body,  setBody]  = useState('');
    if (!open || !sbx) return null;
    const det = SBX_DETAIL[sbx.id] || {};
    const defaultTitle = `${sbx.task}: ${det.slice} — ready for review`;
    const t = title || defaultTitle;
    const passU = (det.verify?.unit || []).filter(u => u.pass).length;
    const passC = (det.verify?.contract || []).filter(u => u.pass).length;
    const totU  = (det.verify?.unit || []).length;
    const totC  = (det.verify?.contract || []).length;
    const greens = passU === totU && passC === totC && (totU + totC) > 0;
    return (
      <div className="devsbx-veil" onClick={onClose}>
        <div className="devsbx-modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
          <div className="devsbx-h">
            <div>
              <div className="v1-h2" style={{margin:0}}>Open PR from sandbox</div>
              <div className="v1-mute" style={{fontSize:12.5}}>One click promotes the sandbox branch to a draft PR. Verify must be green to merge.</div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devsbx-body">
            <div className="devsbx-card">
              <div className="devsbx-card-h">From sandbox</div>
              <div className="v1-mono devsbx-row-mono">{sbx.id} → {sbx.cell}/{det.slice} · {sbx.task}</div>
              <div className="v1-mute" style={{fontSize:11.5, marginTop:4}}>branch <span className="v1-mono">{sbx.branch}</span> · base <span className="v1-mono">{sbx.base}</span></div>
            </div>
            <div className="devsbx-card">
              <div className="devsbx-card-h">Verify gate</div>
              <div className="devw4-pr-gate">
                <div className="devw4-pr-gate-row">
                  <span>Unit tests</span>
                  <b className={passU === totU ? 'devw3-good' : 'devw3-bad'}>{passU}/{totU}</b>
                </div>
                <div className="devw4-pr-gate-row">
                  <span>Contract tests</span>
                  <b className={passC === totC ? 'devw3-good' : 'devw3-bad'}>{passC}/{totC}</b>
                </div>
                <div className="devw4-pr-gate-row">
                  <span>Slice boundary</span>
                  <b className="devw3-good">in scope</b>
                </div>
                {!greens && <div className="devw4-pr-warn">Verify is not all green — PR will open as draft, but cannot be marked ready until the gate clears.</div>}
              </div>
            </div>
            <div className="devsbx-card">
              <div className="devsbx-card-h">PR title</div>
              <input className="devw4-input" value={t} placeholder={defaultTitle}
                     onChange={e => setTitle(e.target.value)}/>
            </div>
            <div className="devsbx-card">
              <div className="devsbx-card-h">Body (auto-summary)</div>
              <textarea className="devw4-input devw4-textarea" rows="6"
                        value={body || `## Summary\n${(det.conversation || []).filter(x=>x.kind==='review').slice(-1)[0]?.txt || 'Auto-generated.'}\n\n## Verify\n- Unit ${passU}/${totU}\n- Contract ${passC}/${totC}\n\nCloses ${sbx.task}.`}
                        onChange={e => setBody(e.target.value)}/>
            </div>
          </div>
          <div className="devsbx-foot">
            <button className="v1-ghost" onClick={onClose}>Cancel</button>
            <button className="v1-btn" onClick={() => onConfirm({ title: t })}>Open draft PR</button>
          </div>
        </div>
      </div>
    );
  };

  // ====== Mini bar for resources ======
  const Bar = ({ used, cap, unit }) => {
    const pct = Math.min(100, Math.round((used / cap) * 100));
    const tone = pct > 90 ? 'bad' : pct > 75 ? 'warn' : 'ok';
    return (
      <div className="devw4-bar-wrap">
        <div className="devw4-bar"><div className="devw4-bar-fill" data-tone={tone} style={{ width: pct + '%' }}/></div>
        <div className="devw4-bar-meta v1-mono">{typeof used === 'string' ? used : `${used}${unit || ''}`} / {typeof cap === 'string' ? cap : `${cap}${unit || ''}`}</div>
      </div>
    );
  };

  // ====== Tab — Diff ======
  const DiffTab = ({ det }) => {
    const [open, setOpen] = useState(det.diff?.[0]?.path);
    if (!det.diff?.length) return <div className="v1-mute" style={{padding:'24px 0'}}>No diff yet.</div>;
    return (
      <div className="devw4-diff">
        <aside className="devw4-diff-list">
          {det.diff.map(f => (
            <button key={f.path} className="devw4-diff-item" data-active={open === f.path || undefined}
                    onClick={() => setOpen(f.path)}>
              <div className="devw4-diff-path v1-mono">{f.path}</div>
              <div className="devw4-diff-stats v1-mono">
                <span className="devw3-good">+{f.add}</span> <span className="devw3-bad">−{f.del}</span>
                <span className="devw4-diff-op" data-op={f.op}>{f.op}</span>
              </div>
            </button>
          ))}
        </aside>
        <div className="devw4-diff-viewer">
          {(() => {
            const f = det.diff.find(x => x.path === open) || det.diff[0];
            return (<>
              <div className="devw4-diff-h v1-mono">{f.path}</div>
              <div className="devw4-diff-hunks">
                {f.hunk.length === 0 && <div className="v1-mute" style={{padding:14, fontSize:12}}>Hunk preview not synthesized for this file.</div>}
                {f.hunk.map((h, i) => (
                  <div key={i} className="devw4-diff-line" data-tone={h.tone}>
                    <span className="devw4-diff-ln v1-mono">{h.l}</span>
                    <span className="devw4-diff-txt v1-mono">{h.txt}</span>
                  </div>
                ))}
              </div>
            </>);
          })()}
        </div>
      </div>
    );
  };

  // ====== Tab — Commits ======
  const CommitsTab = ({ det }) => (
    <ul className="devw4-commits">
      {det.commits.map(c => (
        <li key={c.sha}>
          <span className="v1-mono devw4-commit-sha">{c.sha}</span>
          <span className="devw4-commit-msg">{c.msg}</span>
          <span className="v1-mono devw4-commit-by">{c.by}</span>
          <span className="devw4-commit-when">{c.when}</span>
        </li>
      ))}
      {det.commits.length === 0 && <li className="v1-mute">No commits.</li>}
    </ul>
  );

  // ====== Tab — Verify ======
  const VerifyTab = ({ det }) => {
    const u = det.verify?.unit || [];
    const c = det.verify?.contract || [];
    const passU = u.filter(x => x.pass).length;
    const passC = c.filter(x => x.pass).length;
    return (
      <div className="devw4-verify">
        <section className="devw3-panel">
          <div className="devw3-panel-h">
            <span>Unit tests</span>
            <span className={`devw3-pill ${passU===u.length?'':'devw3-bad'}`} data-tone={passU===u.length?'good':'bad'}>{passU}/{u.length}</span>
          </div>
          <ul className="devw4-test-list">
            {u.map((t, i) => (
              <li key={i} data-pass={t.pass}>
                <span className="devw4-test-dot" data-pass={t.pass}/>
                <span className="v1-mono devw4-test-name">{t.name}</span>
                <span className="v1-mono devw4-test-ms">{t.ms}ms</span>
                {!t.pass && <div className="devw4-test-why">{t.why}</div>}
              </li>
            ))}
            {u.length === 0 && <li className="v1-mute">No unit tests recorded yet.</li>}
          </ul>
        </section>
        <section className="devw3-panel">
          <div className="devw3-panel-h">
            <span>Contract tests</span>
            <span className={`devw3-pill ${passC===c.length?'':'devw3-bad'}`} data-tone={passC===c.length?'good':'bad'}>{passC}/{c.length}</span>
          </div>
          <ul className="devw4-test-list">
            {c.map((t, i) => (
              <li key={i} data-pass={t.pass}>
                <span className="devw4-test-dot" data-pass={t.pass}/>
                <span className="v1-mono devw4-test-name">{t.name}</span>
                {!t.pass && <div className="devw4-test-why">{t.why}</div>}
              </li>
            ))}
            {c.length === 0 && <li className="v1-mute">No contract tests recorded yet.</li>}
          </ul>
        </section>
      </div>
    );
  };

  // ====== Tab — Conversation ======
  const KIND_META = {
    plan:   { label: 'PLAN',   tone: 'plan' },
    patch:  { label: 'PATCH',  tone: 'patch' },
    run:    { label: 'RUN',    tone: 'run' },
    review: { label: 'REVIEW', tone: 'review' },
  };
  const ConversationTab = ({ det, sbx }) => (
    <ol className="devw4-conv">
      {sbx && (
        <li className="devw4-conv-cta">
          <span className="devw4-conv-cta-text">
            This is the recorded log. To talk to the agent in this sandbox, open the AI Shell.
          </span>
          <button className="v1-btn devw4-sd-resume"
                  onClick={() => window.dispatchEvent(new CustomEvent('gocell.ai.open', { detail: {
                    context: `sandbox:${sbx.id} · ${sbx.cell}/${det.slice||''} · ${sbx.task}`,
                    seed: `Resumed sandbox ${sbx.id} · ${sbx.cell}/${det.slice||''} · ${sbx.task} · driver ${sbx.driver}`,
                  }}))}>
            {det.conversation && det.conversation.length ? 'Continue in AI Shell' : 'Start session'}
          </button>
        </li>
      )}
      {det.conversation.map((m, i) => {
        const meta = KIND_META[m.kind] || { label: m.kind.toUpperCase(), tone: 'plan' };
        return (
          <li key={i} className="devw4-conv-item">
            <div className="devw4-conv-rail">
              <span className="devw4-conv-tag" data-tone={meta.tone}>{meta.label}</span>
              <span className="devw4-conv-when">{m.when}</span>
            </div>
            <div className="devw4-conv-card" data-kind={m.kind}>
              {m.kind === 'patch' && <pre className="devw4-conv-pre">{m.txt}</pre>}
              {m.kind === 'run' && <>
                <div className="v1-mono" style={{fontSize:12.5,marginBottom:6}}>$ {m.txt}</div>
                <div className="devw4-conv-tail" data-exit={m.exit === 0 ? 'ok' : 'fail'}>
                  <span className="v1-mono">exit {m.exit}</span> · <span className="v1-mono">{m.tail}</span>
                </div>
              </>}
              {(m.kind === 'plan' || m.kind === 'review') && <pre className="devw4-conv-pre">{m.txt}</pre>}
            </div>
          </li>
        );
      })}
      {det.conversation.length === 0 && <li className="v1-mute">No log.</li>}
    </ol>
  );

  // ====== Sandbox detail page ======
  const SandboxDetailPage = ({ sbxId, onBack, nav }) => {
    const sbx = SANDBOXES.find(s => s.id === sbxId);
    if (!sbx) return <div className="devw3-page"><p className="v1-mute">Sandbox not found.</p></div>;
    const det = SBX_DETAIL[sbxId] || { resources: { cpu:{used:0,cap:2}, mem:{used:0,cap:1024}, disk:{used:0,cap:1024}, wall:{used:'?',cap:'4h'} }, diff:[], commits:[], verify:{unit:[],contract:[]}, conversation:[] };
    const [tab, setTab] = useState('diff');
    const [pr, setPr] = useState(false);
    const [openedPR, setOpenedPR] = useState(null);
    const repo = CELL_REPO[sbx.cell];
    const passU = (det.verify?.unit || []).filter(t => t.pass).length;
    const totU  = (det.verify?.unit || []).length;
    const passC = (det.verify?.contract || []).filter(t => t.pass).length;
    const totC  = (det.verify?.contract || []).length;
    const greens = totU + totC > 0 && passU === totU && passC === totC;

    const tabs = [
      { k: 'diff',   label: `Diff · ${sbx.diff.files} files` },
      { k: 'commits',label: `Commits · ${det.commits.length}` },
      { k: 'verify', label: `Verify · ${passU + passC}/${totU + totC}` },
      { k: 'conv',   label: `Conversation · ${det.conversation.length}` },
    ];

    return (
      <div className="devw3-page" data-screen-label={`Sandbox · ${sbx.id}`}>
        <div className="devw4-sd-head">
          <div>
            <button className="devw3-back" onClick={onBack}>← Sandboxes</button>
            <div className="devw4-sd-title-row">
              <span className="devw4-sd-status" data-status={sbx.status}>{sbx.status}</span>
              <h1 className="v1-h1" style={{display:'block', lineHeight:1.2, margin:0}}>{sbx.id}</h1>
              {openedPR && <span className="devw3-pill" data-tone="good">PR #{openedPR.num} opened</span>}
            </div>
            <div className="devw4-sd-sub">
              <button className="devw3-link" onClick={() => nav('cell:'+sbx.cell)}>⬡ {sbx.cell}</button>
              <span>/</span>
              <span className="v1-mono">{det.slice}</span>
              <span>·</span>
              <span className="v1-mono">{sbx.task}</span>
              <span>·</span>
              <span className="v1-mono">{sbx.agent}</span>
              <span>·</span>
              <span className="v1-mono">{sbx.driver}</span>
            </div>
          </div>
          <div className="devw4-sd-actions">
            {sbx.status !== 'stopped' && (
              <button className="v1-btn devw4-sd-resume"
                      title="Open the AI Shell pinned to this sandbox and resume the conversation."
                      onClick={() => window.dispatchEvent(new CustomEvent('gocell.ai.open', { detail: {
                        context: `sandbox:${sbx.id} · ${sbx.cell}/${det.slice||''} · ${sbx.task}`,
                        seed: `Resumed sandbox ${sbx.id} · ${sbx.cell}/${det.slice||''} · ${sbx.task} · driver ${sbx.driver}`,
                      }}))}>
                {det.conversation && det.conversation.length ? 'Resume session' : 'Start session'}
              </button>
            )}
            {sbx.status !== 'stopped' && <button className="v1-ghost">Stop</button>}
            <button className="v1-ghost" title="Garbage-collect workspace and free resources. Sandbox state is retained 7 days for inspection.">GC now</button>
            <button className="v1-btn" disabled={sbx.status === 'stopped'} onClick={() => setPr(true)}>
              {greens ? 'Open PR' : 'Open draft PR'}
            </button>
          </div>
        </div>

        <section className="devw4-sd-meta">
          <div><span>Branch</span><b className="v1-mono">{sbx.branch}</b></div>
          <div><span>Base</span><b className="v1-mono">{sbx.base}</b></div>
          <div><span>Repo</span><b className="v1-mono">{repo?.repo || '—'}</b></div>
          <div><span>Created</span><b className="v1-mono">{sbx.created} ago</b></div>
          <div><span>Diff</span><b className="v1-mono"><span className="devw3-good">+{sbx.diff.add}</span> <span className="devw3-bad">−{sbx.diff.del}</span> · {sbx.diff.files}f</b></div>
          <div><span>Verify gate</span><b className={greens?'devw3-good':'devw3-bad'}>{passU+passC}/{totU+totC}</b></div>
        </section>

        <section className="devw3-panel">
          <div className="devw3-panel-h">Resources</div>
          <div className="devw4-res">
            <div><div className="devw4-res-k">CPU</div><Bar used={det.resources.cpu.used} cap={det.resources.cpu.cap} unit=" core"/></div>
            <div><div className="devw4-res-k">Memory</div><Bar used={det.resources.mem.used} cap={det.resources.mem.cap} unit="MB"/></div>
            <div><div className="devw4-res-k">Disk</div><Bar used={det.resources.disk.used} cap={det.resources.disk.cap} unit="MB"/></div>
            <div><div className="devw4-res-k">Wallclock</div><Bar used={det.resources.wall.used} cap={det.resources.wall.cap}/></div>
          </div>
          <div className="devw4-res-foot v1-mute">
            Idle &gt; 30m → auto-stop · stopped &gt; 7d → GC · diff is preserved on GC for replay.
          </div>
        </section>

        <nav className="devw3-tabs">
          {tabs.map(t => (
            <button key={t.k} className="devw3-tab" data-active={tab === t.k || undefined} onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="devw3-tab-body">
          {tab === 'diff'    && <DiffTab det={det}/>}
          {tab === 'commits' && <CommitsTab det={det}/>}
          {tab === 'verify'  && <VerifyTab det={det}/>}
          {tab === 'conv'    && <ConversationTab det={det} sbx={sbx}/>}
        </div>

        <PRDraftModal open={pr} sbx={sbx} onClose={() => setPr(false)}
                      onConfirm={() => { setPr(false); setOpenedPR({ num: 1900 + Math.floor(Math.random()*99) }); }}/>
      </div>
    );
  };

  // ====== Sandboxes route page (list view, opens detail) ======
  const SandboxesPage = ({ onOpen }) => {
    const counts = SANDBOXES.reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {});
    return (
      <div className="devw3-page" data-screen-label="Sandboxes">
        <div className="devw3-head">
          <div>
            <h1 className="v1-h1">Sandboxes <span className="v1-h1-count">{SANDBOXES.length}</span></h1>
            <p className="v1-sub">Each sandbox = isolated copy-on-write workspace pinned to one task. AI drives, humans review. Nothing lands without a PR.</p>
          </div>
          <div className="devw4-sb-counts">
            {['running', 'review-ready', 'idle', 'stopped'].map(k => (
              <div key={k} className="devw4-sb-count" data-status={k}>
                <span>{k}</span><b>{counts[k] || 0}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="devw4-sb-grid">
          {SANDBOXES.map(s => {
            const det = SBX_DETAIL[s.id] || {};
            const passU = (det.verify?.unit || []).filter(t => t.pass).length;
            const totU  = (det.verify?.unit || []).length;
            const passC = (det.verify?.contract || []).filter(t => t.pass).length;
            const totC  = (det.verify?.contract || []).length;
            return (
              <button key={s.id} className="devw4-sb-card" data-status={s.status} onClick={() => onOpen(s.id)}>
                <div className="devw4-sb-card-h">
                  <span className="devw4-sd-status" data-status={s.status}>{s.status}</span>
                  <span className="v1-mono devw4-sb-id">{s.id}</span>
                </div>
                <div className="devw4-sb-card-body">
                  <div className="devw4-sb-row"><span>Cell · Slice</span><b className="v1-mono">{s.cell}/{det.slice || '—'}</b></div>
                  <div className="devw4-sb-row"><span>Task</span><b className="v1-mono">{s.task}</b></div>
                  <div className="devw4-sb-row"><span>Driver</span><b className="v1-mono">{s.driver}</b></div>
                  <div className="devw4-sb-row"><span>Diff</span><b className="v1-mono"><span className="devw3-good">+{s.diff.add}</span> <span className="devw3-bad">−{s.diff.del}</span> · {s.diff.files}f</b></div>
                  <div className="devw4-sb-row"><span>Verify</span><b className={(passU+passC)===(totU+totC) && (totU+totC)>0 ?'devw3-good':'devw3-bad'}>{passU+passC}/{totU+totC || '—'}</b></div>
                  <div className="devw4-sb-row"><span>Age</span><b className="v1-mono">{s.created}</b></div>
                </div>
                <div className="devw4-sb-card-foot v1-mute">{s.last}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  window.DevWave4 = { SandboxesPage, SandboxDetailPage, SBX_DETAIL };
})();
