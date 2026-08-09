/* global React */
// Wave 5 — AI Shell v2: real multi-turn conversation
//   Cards: plan / patch / run / review
//   State machine: idle → planning → patching → running → reviewing → (idle | halted | pr_ready)
//   Streaming simulated via timed reveals — each card animates in, status mutates over time.

(() => {
  const { useState, useEffect, useRef, useReducer } = React;
  const C3 = window.DevCell3 || {};
  const D2 = window.DevCell2 || {};

  // ====== Scripted runs ======
  // Each scenario is a sequence of "events"; the engine schedules them with delays
  // and mutates the conversation state.
  const SCENARIOS = {
    // Scenario A — slice work, ends review-ready
    'sso.oidc.entra': {
      taskId: 'T-101',
      cell: 'accesscore',
      slice: 'sso.oidc',
      title: 'Map Entra `groups` and `roles` claims',
      events: [
        { t: 200,   k: 'msg',   role: 'user', text: 'Map Entra groups + roles claims; keep slice scoped to sso.oidc.' },
        { t: 600,   k: 'state', s: 'planning' },
        { t: 700,   k: 'card',  type: 'plan', title: 'Plan', steps: [
          { txt: 'Read sso.oidc slice DoD + allowed files', s: 'pending' },
          { txt: 'Sketch claims-mapping branch (groups → roles fallback)', s: 'pending' },
          { txt: 'Write Entra-specific tests for both shapes', s: 'pending' },
          { txt: 'Run unit + contract gates; halt on red', s: 'pending' },
        ]},
        { t: 1300, k: 'mutate', card: 0, mutate: { steps: [{i:0,s:'doing'}] } },
        { t: 2200, k: 'mutate', card: 0, mutate: { steps: [{i:0,s:'done'},{i:1,s:'doing'}] } },
        { t: 3000, k: 'mutate', card: 0, mutate: { steps: [{i:1,s:'done'}] } },
        { t: 3100, k: 'state', s: 'patching' },
        { t: 3300, k: 'card',  type: 'patch', title: 'Patch · 2 files', files: [
          { path: 'cells/accesscore/sso/claims.go',     add: 38, del: 6,  s: 'streaming' },
          { path: 'cells/accesscore/sso/oidc.go',       add: 12, del: 4,  s: 'pending' },
        ]},
        { t: 4200, k: 'mutate', card: 1, mutate: { files: [{i:0,s:'done'},{i:1,s:'streaming'}] } },
        { t: 5000, k: 'mutate', card: 1, mutate: { files: [{i:1,s:'done'}] } },
        { t: 5100, k: 'mutate', card: 0, mutate: { steps: [{i:2,s:'doing'}] } },
        { t: 5400, k: 'card',  type: 'patch', title: 'Patch · tests', files: [
          { path: 'cells/accesscore/sso/oidc_test.go',  add: 32, del: 10, s: 'streaming' },
        ]},
        { t: 6300, k: 'mutate', card: 2, mutate: { files: [{i:0,s:'done'}] } },
        { t: 6400, k: 'mutate', card: 0, mutate: { steps: [{i:2,s:'done'},{i:3,s:'doing'}] } },
        { t: 6500, k: 'state', s: 'running' },
        { t: 6700, k: 'card',  type: 'run', cmd: 'go test ./cells/accesscore/sso/...', s: 'running', tail: [] },
        { t: 7100, k: 'mutate', card: 3, mutate: { tail: { push: '=== RUN   TestOIDC_Discovery' } } },
        { t: 7400, k: 'mutate', card: 3, mutate: { tail: { push: '--- PASS: TestOIDC_Discovery (0.01s)' } } },
        { t: 7700, k: 'mutate', card: 3, mutate: { tail: { push: '=== RUN   TestEntra_GroupsClaim' } } },
        { t: 8000, k: 'mutate', card: 3, mutate: { tail: { push: '--- PASS: TestEntra_GroupsClaim (0.01s)' } } },
        { t: 8300, k: 'mutate', card: 3, mutate: { tail: { push: '=== RUN   TestEntra_RolesClaim' } } },
        { t: 8800, k: 'mutate', card: 3, mutate: { tail: { push: '--- FAIL: TestEntra_RolesClaim (0.01s)' } } },
        { t: 9100, k: 'mutate', card: 3, mutate: { tail: { push: '    claims_test.go:42: roles fallback returned nil' } } },
        { t: 9400, k: 'mutate', card: 3, mutate: { s: 'fail', exit: 1 } },
        { t: 9500, k: 'state', s: 'reviewing' },
        { t: 9700, k: 'card',  type: 'review', text: 'TestEntra_RolesClaim failing — claims.go:26 returns early for `roles`. Patching: handle `roles` as []any too.', decision: 'continue' },
        { t: 10300, k: 'state', s: 'patching' },
        { t: 10500, k: 'card', type: 'patch', title: 'Patch · fix roles fallback', files: [
          { path: 'cells/accesscore/sso/claims.go', add: 12, del: 0, s: 'streaming' },
        ]},
        { t: 11200, k: 'mutate', card: 5, mutate: { files: [{i:0,s:'done'}] } },
        { t: 11300, k: 'state', s: 'running' },
        { t: 11500, k: 'card', type: 'run', cmd: 'go test ./cells/accesscore/sso/...', s: 'running', tail: [] },
        { t: 11900, k: 'mutate', card: 6, mutate: { tail: { push: 'PASS · 6 tests · 87ms' } } },
        { t: 12100, k: 'mutate', card: 6, mutate: { tail: { push: 'contract: auth.verify ✓ · session.refresh ✓' } } },
        { t: 12300, k: 'mutate', card: 6, mutate: { s: 'ok', exit: 0 } },
        { t: 12400, k: 'state', s: 'reviewing' },
        { t: 12600, k: 'card', type: 'review',
          text: 'All gates green. Slice boundary respected (only sso.oidc files touched). Ready to draft PR.',
          decision: 'pr_ready' },
        { t: 13000, k: 'state', s: 'pr_ready' },
        { t: 13100, k: 'mutate', card: 0, mutate: { steps: [{i:3,s:'done'}] } },
      ],
    },
  };

  // ====== Reducer ======
  const initState = (scen) => ({
    scenarioKey: scen,
    state: 'idle', // idle | planning | patching | running | reviewing | pr_ready | halted
    cards: [], // mixed: msg | plan | patch | run | review
    cursor: 0,
  });

  function reducer(s, a) {
    switch (a.type) {
      case 'reset': return initState(a.scen);
      case 'event': {
        const ev = a.ev;
        if (ev.k === 'msg') {
          return { ...s, cards: [...s.cards, { kind: 'msg', role: ev.role, text: ev.text }] };
        }
        if (ev.k === 'state') return { ...s, state: ev.s };
        if (ev.k === 'card') {
          const card = { ...ev };
          delete card.k; delete card.t;
          return { ...s, cards: [...s.cards, { kind: ev.type, ...card }] };
        }
        if (ev.k === 'mutate') {
          const cards = s.cards.slice();
          const c = { ...cards[ev.card] };
          // generic merge with arrays of {i, ...patch}
          for (const key of Object.keys(ev.mutate)) {
            const val = ev.mutate[key];
            if (Array.isArray(val) && val.every(x => 'i' in x) && Array.isArray(c[key])) {
              const arr = c[key].map(x => ({...x}));
              for (const patch of val) { Object.assign(arr[patch.i], patch); }
              c[key] = arr;
            } else if (val && typeof val === 'object' && 'push' in val && Array.isArray(c[key])) {
              c[key] = [...c[key], val.push];
            } else {
              c[key] = val;
            }
          }
          cards[ev.card] = c;
          return { ...s, cards };
        }
        return s;
      }
      case 'user_msg':
        return { ...s, cards: [...s.cards, { kind: 'msg', role: 'user', text: a.text }] };
      case 'halt':
        return { ...s, state: 'halted' };
      default: return s;
    }
  }

  // ====== Per-card components ======
  const StepDot = ({ s }) => (
    <span className="devw5-step-dot" data-s={s}>
      {s === 'done' ? '✓' : s === 'doing' ? '◐' : '○'}
    </span>
  );

  const PlanCard = ({ c }) => (
    <div className="devw5-card devw5-card-plan">
      <div className="devw5-card-h">
        <span className="devw5-card-tag" data-tone="plan">PLAN</span>
        <span className="devw5-card-title">{c.title}</span>
      </div>
      <ol className="devw5-plan">
        {c.steps.map((st, i) => (
          <li key={i} data-s={st.s}>
            <StepDot s={st.s}/>
            <span>{st.txt}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  const PatchCard = ({ c }) => (
    <div className="devw5-card devw5-card-patch">
      <div className="devw5-card-h">
        <span className="devw5-card-tag" data-tone="patch">PATCH</span>
        <span className="devw5-card-title">{c.title}</span>
      </div>
      <ul className="devw5-files">
        {c.files.map((f, i) => (
          <li key={i} data-s={f.s}>
            <span className="devw5-file-state" data-s={f.s}>
              {f.s === 'done' ? '✓' : f.s === 'streaming' ? '…' : '·'}
            </span>
            <span className="v1-mono devw5-file-path">{f.path}</span>
            <span className="v1-mono devw5-file-stats">
              <span className="devw3-good">+{f.add}</span> <span className="devw3-bad">−{f.del}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const RunCard = ({ c }) => (
    <div className="devw5-card devw5-card-run">
      <div className="devw5-card-h">
        <span className="devw5-card-tag" data-tone="run">RUN</span>
        <span className="v1-mono devw5-card-cmd">$ {c.cmd}</span>
        <span className="devw5-run-status" data-s={c.s}>
          {c.s === 'running' ? 'running…' : c.s === 'ok' ? `exit 0` : `exit ${c.exit ?? 1}`}
        </span>
      </div>
      <pre className="devw5-run-tail">{c.tail.join('\n')}</pre>
    </div>
  );

  const ReviewCard = ({ c }) => (
    <div className="devw5-card devw5-card-review" data-decision={c.decision}>
      <div className="devw5-card-h">
        <span className="devw5-card-tag" data-tone="review">REVIEW</span>
        <span className="devw5-card-title">{
          c.decision === 'pr_ready' ? 'Ready for PR' :
          c.decision === 'halt'     ? 'Halting' : 'Continuing'
        }</span>
      </div>
      <div className="devw5-review-text">{c.text}</div>
      {c.decision === 'pr_ready' && (
        <div className="devw5-review-actions">
          <button className="v1-btn v1-btn-primary">Open draft PR</button>
          <button className="v1-ghost">Inspect sandbox</button>
        </div>
      )}
    </div>
  );

  const MsgCard = ({ c }) => (
    <div className={`devw5-msg devw5-msg-${c.role}`}>
      <div className="devw5-msg-av">{c.role === 'user' ? 'A' : '✦'}</div>
      <div className="devw5-msg-body">{c.text}</div>
    </div>
  );

  const renderCard = (c, i) => {
    if (c.kind === 'msg')    return <MsgCard    key={i} c={c}/>;
    if (c.kind === 'plan')   return <PlanCard   key={i} c={c}/>;
    if (c.kind === 'patch')  return <PatchCard  key={i} c={c}/>;
    if (c.kind === 'run')    return <RunCard    key={i} c={c}/>;
    if (c.kind === 'review') return <ReviewCard key={i} c={c}/>;
    return null;
  };

  // ====== State-machine indicator ======
  const STATE_META = {
    idle:      { label: 'Idle',       tone: 'idle' },
    planning:  { label: 'Planning',   tone: 'plan' },
    patching:  { label: 'Patching',   tone: 'patch' },
    running:   { label: 'Running',    tone: 'run' },
    reviewing: { label: 'Reviewing',  tone: 'review' },
    pr_ready:  { label: 'PR ready',   tone: 'good' },
    halted:    { label: 'Halted',     tone: 'bad' },
  };

  const StateBadge = ({ s }) => {
    const m = STATE_META[s] || STATE_META.idle;
    return (
      <span className="devw5-state" data-tone={m.tone}>
        <span className="devw5-state-dot" data-tone={m.tone}/>
        {m.label}
        {(s === 'planning' || s === 'patching' || s === 'running' || s === 'reviewing') && <span className="devw5-state-thinking">···</span>}
      </span>
    );
  };

  // ====== Engine ======
  function useEngine(scenarioKey, autoPlay) {
    const [s, dispatch] = useReducer(reducer, scenarioKey, initState);
    const timersRef = useRef([]);
    const startedRef = useRef(false);

    useEffect(() => {
      // reset on scenario change
      dispatch({ type: 'reset', scen: scenarioKey });
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      startedRef.current = false;
    }, [scenarioKey]);

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const scn = SCENARIOS[scenarioKey];
      if (!scn) return;
      scn.events.forEach(ev => {
        const id = setTimeout(() => dispatch({ type: 'event', ev }), ev.t);
        timersRef.current.push(id);
      });
    };
    const halt = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      dispatch({ type: 'halt' });
    };
    const reset = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      startedRef.current = false;
      dispatch({ type: 'reset', scen: scenarioKey });
    };
    const userMsg = (text) => dispatch({ type: 'user_msg', text });

    useEffect(() => {
      if (autoPlay) start();
      return () => timersRef.current.forEach(clearTimeout);
      // eslint-disable-next-line
    }, [scenarioKey, autoPlay]);

    return { state: s, start, halt, reset, userMsg };
  }

  // ====== AI Shell v2 ======
  const AIShellV2 = ({ pinnedTask }) => {
    const scenarioKey = 'sso.oidc.entra';
    const scen = SCENARIOS[scenarioKey];
    const [autoPlay, setAutoPlay] = useState(false);
    const { state, start, halt, reset, userMsg } = useEngine(scenarioKey, autoPlay);
    const [draft, setDraft] = useState('');
    const endRef = useRef(null);

    useEffect(() => {
      endRef.current?.parentElement?.scrollTo({ top: 99999, behavior: 'smooth' });
    }, [state.cards.length, state.state]);

    const send = () => {
      if (!draft.trim()) return;
      userMsg(draft.trim());
      setDraft('');
      if (state.state === 'idle') {
        // first user prompt kicks the auto run
        setTimeout(start, 200);
      }
    };

    return (
      <div className="devw5-shell">
        <header className="devw5-head">
          <div>
            <div className="devw5-head-title">
              <span className="devw5-head-dot"/>
              <h2 className="v1-h2" style={{margin:0}}>AI Shell</h2>
              <StateBadge s={state.state}/>
            </div>
            <div className="devw5-head-sub">
              <span className="v1-mono devw5-pin">⌖ {scen.taskId}</span>
              <span>·</span>
              <span>{scen.title}</span>
              <span>·</span>
              <span className="v1-mono">{scen.cell}/{scen.slice}</span>
            </div>
          </div>
          <div className="devw5-head-act">
            <button className="v1-ghost" onClick={reset} disabled={state.state === 'idle'}>Reset</button>
            {state.state === 'idle' && <button className="v1-btn" onClick={start}>Start</button>}
            {state.state !== 'idle' && state.state !== 'pr_ready' && state.state !== 'halted' &&
              <button className="v1-ghost" onClick={halt}>Halt</button>}
          </div>
        </header>

        <div className="devw5-grid">
          <main className="devw5-conv">
            <div className="devw5-conv-stream">
              {state.cards.length === 0 && (
                <div className="devw5-empty">
                  <div className="devw5-empty-h">Idle</div>
                  <div className="devw5-empty-sub">
                    Send a prompt or hit <b>Start</b> to replay the canned scenario.
                  </div>
                </div>
              )}
              {state.cards.map((c, i) => renderCard(c, i))}
              <div ref={endRef} style={{ height: 1 }}/>
            </div>

            <div className="devw5-compose">
              <textarea placeholder="Ask Claude to design, edit or test a slice…  (⌘↵ to send)"
                        rows="2"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if ((e.metaKey||e.ctrlKey) && e.key === 'Enter') send(); }}/>
              <div className="devw5-compose-foot">
                <label className="devw5-auto">
                  <input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)}/>
                  <span>Autonomous self-loop</span>
                </label>
                <span style={{flex:1}}/>
                <span className="v1-mute" style={{fontSize:11.5}}>
                  Acting on <b className="v1-mono">{scen.cell}/{scen.slice}</b> · changes go through PR review
                </span>
                <button className="v1-btn v1-btn-primary" onClick={send}>
                  Send <span className="v1-kbd">⌘↵</span>
                </button>
              </div>
            </div>
          </main>

          <aside className="devw5-side">
            <section className="devw5-panel">
              <div className="devw5-panel-h">State machine</div>
              <ol className="devw5-sm">
                {['planning','patching','running','reviewing','pr_ready'].map(k => (
                  <li key={k} data-active={state.state === k || undefined}
                      data-past={isPast(state.state, k) || undefined}>
                    <span className="devw5-sm-dot" data-tone={STATE_META[k].tone}/>
                    <span>{STATE_META[k].label}</span>
                  </li>
                ))}
              </ol>
              <div className="devw5-sm-foot v1-mute">
                Halts on red verify · Branches on review decision · Loops until verify green or budget hit.
              </div>
            </section>
            <section className="devw5-panel">
              <div className="devw5-panel-h">Slice boundary</div>
              <ul className="devw5-bound">
                <li><span>Allowed paths</span><b className="v1-mono">cells/accesscore/sso/**</b></li>
                <li><span>File budget</span><b>4 files / +180 / −40</b></li>
                <li><span>Wallclock</span><b className="v1-mono">12m / 4h</b></li>
              </ul>
            </section>
            <section className="devw5-panel">
              <div className="devw5-panel-h">Tools enabled</div>
              <div className="devw5-tools">
                {['repo.read','repo.write','tests.run','contract.check','audit.write'].map(t => (
                  <div key={t} className="devw5-tool"><span className="v1-mono">{t}</span><span className="devw3-good">on</span></div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  };

  function isPast(cur, k) {
    const order = ['planning','patching','running','reviewing','pr_ready'];
    const ic = order.indexOf(cur);
    const ik = order.indexOf(k);
    return ic > ik && ic >= 0 && ik >= 0;
  }

  window.DevWave5 = { AIShellV2 };
})();
