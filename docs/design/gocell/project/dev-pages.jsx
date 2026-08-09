/* global React */
// Board (Azure DevOps style) + Backlog tree + AI studio for gocell.
// Reuses tokens.css and v1-linear.css.

(() => {
  const { useState, useRef, useEffect, useMemo } = React;
  const { products, flatTasks, sprints, aiThread } = window.DEV_DATA;

  const Ico = (d) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
  );
  const ICO = {
    chev:    Ico("M9 6l6 6-6 6"),
    chevD:   Ico("M6 9l6 6 6-6"),
    plus:    Ico("M12 5v14 M5 12h14"),
    spark:   Ico("M5 3v4 M3 5h4 M19 17v4 M17 19h4 M14 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"),
    bot:     Ico("M12 2v4 M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2 M9 14h.01 M15 14h.01 M9 17h6"),
    link:    Ico("M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"),
    pause:   Ico("M6 4h4v16H6z M14 4h4v16h-4z"),
    play:    Ico("M5 3l14 9-14 9z"),
    accept:  Ico("M20 6L9 17l-5-5"),
    file:    Ico("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6"),
  };

  const STATUS_COLOR = {
    Backlog: 'mute', Ready: 'info', 'In progress': 'accent',
    Review: 'warn', Done: 'ok', Draft: 'mute', Active: 'ok', Blocked: 'err',
  };

  const StatusChip = ({ s }) => (
    <span className={`dev-stat dev-stat-${STATUS_COLOR[s] || 'mute'}`}>{s}</span>
  );

  const Avatar = ({ who }) => {
    if (who === 'unassigned') return <span className="dev-av dev-av-empty" title="Unassigned">?</span>;
    const ai = who?.startsWith('ai');
    const name = who?.split('/')[1] || who || '';
    return (
      <span className={`dev-av ${ai ? 'dev-av-ai' : ''}`} title={who}>
        {ai ? '✦' : name.slice(0, 1).toUpperCase()}
      </span>
    );
  };

  // ------------------ Backlog tree ------------------
  const BacklogTree = ({ onPick, picked, onDecompose }) => {
    const [open, setOpen] = useState({ 'P-1': true, 'E-1': true, 'E-2': true, 'F-1': true, 'F-3': true });
    const tog = id => setOpen(o => ({ ...o, [id]: !o[id] }));
    return (
      <div className="dev-tree">
        {products.map(p => (
          <div key={p.id} className="dev-tree-prod">
            <button className="dev-tree-row dev-tree-l1" onClick={() => tog(p.id)}>
              <span className="dev-tree-chev">{open[p.id] ? ICO.chevD : ICO.chev}</span>
              <span className="dev-tag">Product</span>
              <span className="dev-tree-name">{p.name}</span>
              <span className="dev-tree-id v1-mono">{p.id}</span>
              <StatusChip s={p.status}/>
            </button>
            {open[p.id] && p.epics.map(e => (
              <div key={e.id}>
                <div className="dev-tree-row dev-tree-l2" style={{cursor:'default'}}>
                  <button className="dev-tree-chev" onClick={() => tog(e.id)} style={{background:'none',border:0,padding:0,cursor:'pointer'}}>{open[e.id] ? ICO.chevD : ICO.chev}</button>
                  <span className="dev-tag dev-tag-epic">Epic</span>
                  <span className="dev-tree-name" onClick={() => tog(e.id)} style={{cursor:'pointer',fontWeight:500}}>{e.name}</span>
                  <span className="dev-tree-id v1-mono">{e.id}</span>
                  <span className="v1-mute" style={{fontSize:11}}>@ {e.owner}</span>
                  <StatusChip s={e.status}/>
                  {onDecompose && (
                    <button className="dev-decompose-btn" onClick={(ev) => { ev.stopPropagation(); onDecompose({ kind: 'Epic', id: e.id, title: e.name }); }}>
                      ✦ Decompose
                    </button>
                  )}
                </div>
                {open[e.id] && e.features.map(f => (
                  <div key={f.id}>
                    <div className="dev-tree-row dev-tree-l3" style={{cursor:'default'}}>
                      <button className="dev-tree-chev" onClick={() => tog(f.id)} style={{background:'none',border:0,padding:0,cursor:'pointer'}}>{open[f.id] ? ICO.chevD : ICO.chev}</button>
                      <span className="dev-tag dev-tag-feat">Feature</span>
                      <span className="dev-tree-name" onClick={() => tog(f.id)} style={{cursor:'pointer'}}>{f.name}</span>
                      <span className="dev-tree-id v1-mono">{f.id}</span>
                      {f.sprint && <span className="dev-sprint v1-mono">{f.sprint}</span>}
                      <StatusChip s={f.status}/>
                      {onDecompose && (
                        <button className="dev-decompose-btn" onClick={(ev) => { ev.stopPropagation(); onDecompose({ kind: 'Feature', id: f.id, title: f.name }); }}>
                          ✦ Decompose
                        </button>
                      )}
                    </div>
                    {open[f.id] && f.tasks.map(t => (
                      <button key={t.id}
                              className={`dev-tree-row dev-tree-l4 ${picked?.id === t.id ? 'dev-tree-on':''}`}
                              onClick={() => onPick(t)}>
                        <span className="dev-tree-chev" style={{visibility:'hidden'}}>{ICO.chev}</span>
                        <span className="dev-tag dev-tag-task">Task</span>
                        <span className="dev-tree-name">{t.title}</span>
                        <span className="dev-tree-id v1-mono">{t.id}</span>
                        {t.journey && <span className="dev-journey v1-mono" title="Journey link">⇄ {t.journey}</span>}
                        <Avatar who={t.assignee}/>
                        <StatusChip s={t.status}/>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const TaskInspector = ({ task, onAccept }) => {
    if (!task) return (
      <div className="dev-insp dev-insp-empty">
        <div className="v1-mute" style={{textAlign:'center',padding:'80px 20px',fontSize:13}}>
          Select a task to see its mapping, journey and steps.
        </div>
      </div>
    );
    const doneSteps = task.steps.filter(s => s.status === 'done').length;
    return (
      <div className="dev-insp">
        <div className="dev-insp-head">
          <div className="v1-mono v1-mute" style={{fontSize:11}}>{task.id}</div>
          <h2 className="v1-h2" style={{margin:'2px 0 8px'}}>{task.title}</h2>
          <div className="dev-insp-meta">
            <StatusChip s={task.status}/>
            <span className="v1-chip">{task.points} pts</span>
            {task.sprint && <span className="dev-sprint v1-mono">{task.sprint}</span>}
            <Avatar who={task.assignee}/>
          </div>
        </div>

        <div className="dev-insp-section">
          <div className="dev-insp-label">MAPPING</div>
          <div className="dev-map">
            <div className="dev-map-row">
              <span>Cell</span><b className="v1-mono">{task.cell}</b>
            </div>
            <div className="dev-map-row">
              <span>Slice</span><b className="v1-mono">{task.slice}</b>
            </div>
            <div className="dev-map-row">
              <span>Journey</span>
              {task.journey
                ? <b className="v1-mono dev-link">{task.journey} ↗</b>
                : <button className="v1-link-btn" onClick={() => onAccept(task)}>
                    <span style={{display:'inline-flex',gap:6,alignItems:'center'}}>
                      {ICO.spark} AI · accept task
                    </span>
                  </button>}
            </div>
          </div>
        </div>

        <div className="dev-insp-section">
          <div className="dev-insp-label">
            STEPS <span className="v1-mono v1-mute" style={{fontWeight:400}}>{doneSteps}/{task.steps.length}</span>
          </div>
          {task.steps.length === 0
            ? <div className="v1-mute" style={{fontSize:12,padding:'6px 0'}}>No steps yet — accept the task to let AI plan it.</div>
            : <ol className="dev-steps">
                {task.steps.map(s => (
                  <li key={s.id} className={`dev-step dev-step-${s.status}`}>
                    <span className="dev-step-mark">
                      {s.status === 'done' ? '✓' : s.status === 'doing' ? '◐' : '○'}
                    </span>
                    <span>{s.name}</span>
                  </li>
                ))}
              </ol>}
        </div>
      </div>
    );
  };

  const BacklogPage = ({ onDecompose }) => {
    const [picked, setPicked] = useState(flatTasks[0]);
    return (
      <div className="dev-backlog">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Backlog</h1>
            <p className="v1-sub">Product → Epic → Feature → Sprint → Task → Step. Each task can map to a Journey for AI execution.</p>
          </div>
          <div className="v1-head-actions">
            <button className="v1-btn">Sprint planner</button>
            <button className="v1-btn v1-btn-primary">{ICO.plus}<span>New epic</span></button>
          </div>
        </div>
        <div className="dev-backlog-body">
          <div className="dev-tree-wrap">
            <BacklogTree onPick={setPicked} picked={picked} onDecompose={onDecompose}/>
          </div>
          <TaskInspector task={picked} onAccept={() => alert('AI accepted — see AI Studio')} />
        </div>
      </div>
    );
  };

  // ------------------ Board ------------------
  const COLS = ['Backlog', 'Ready', 'In progress', 'Review', 'Done'];
  const BoardCard = ({ t, onClick }) => (
    <button className="dev-card" onClick={onClick}>
      <div className="dev-card-top">
        <span className="v1-mono v1-mute" style={{fontSize:10.5}}>{t.id}</span>
        <span className="v1-chip">{t.points}</span>
      </div>
      <div className="dev-card-title">{t.title}</div>
      <div className="dev-card-tags">
        <span className="dev-tag dev-tag-feat">{t.feature}</span>
      </div>
      <div className="dev-card-foot">
        <Avatar who={t.assignee}/>
        {t.journey
          ? <span className="dev-card-journey v1-mono" title="Linked journey">⇄ {t.journey}</span>
          : <span className="v1-mono v1-mute" style={{fontSize:10.5}}>—</span>}
        {t.sprint && <span className="dev-sprint v1-mono">{t.sprint}</span>}
      </div>
    </button>
  );

  const BoardPage = ({ onCard }) => {
    const [sprint, setSprint] = useState('S-26');
    const cur = sprints.find(s => s.id === sprint);
    const tasks = flatTasks.filter(t => sprint === 'all' || t.sprint === sprint);
    const grouped = COLS.reduce((a, c) => (a[c] = tasks.filter(t => t.status === c), a), {});
    return (
      <div className="dev-board-page">
        <div className="dev-backlog-head">
          <div>
            <h1 className="v1-h1">Board <span className="v1-h1-count v1-mono">{tasks.length}</span></h1>
            <p className="v1-sub">{cur && <>{cur.name} · {cur.range} · {cur.completed}/{cur.total} complete</>}</p>
          </div>
          <div className="v1-head-actions">
            <div className="v1-seg">
              {sprints.map(s => (
                <button key={s.id} data-active={sprint===s.id || undefined}
                        onClick={() => setSprint(s.id)}>{s.name.replace('Sprint ','S')}</button>
              ))}
              <button data-active={sprint==='all' || undefined} onClick={() => setSprint('all')}>All</button>
            </div>
            <button className="v1-btn">Filter</button>
          </div>
        </div>
        <div className="dev-board">
          {COLS.map(c => (
            <div key={c} className="dev-col">
              <div className="dev-col-head">
                <span className={`dev-col-dot dev-col-dot-${STATUS_COLOR[c]}`}/>
                <span className="dev-col-name">{c}</span>
                <span className="v1-mono v1-mute">{grouped[c].length}</span>
                <button className="v1-ghost" style={{marginLeft:'auto',width:22,height:22}}>{ICO.plus}</button>
              </div>
              <div className="dev-col-body">
                {grouped[c].map(t => <BoardCard key={t.id} t={t} onClick={() => onCard(t)}/>)}
                {grouped[c].length === 0 && <div className="dev-col-empty">No items</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ------------------ AI Studio ------------------
  const AIStudio = ({ pinnedTask }) => {
    const [thread, setThread] = useState(aiThread);
    const [draft, setDraft] = useState('');
    const [running, setRunning] = useState(true);
    const taskCtx = pinnedTask || flatTasks.find(t => t.journey === 'J-9821');
    const endRef = useRef(null);
    useEffect(() => { endRef.current?.parentElement?.scrollTo(0, 99999); }, [thread]);

    const send = () => {
      if (!draft.trim()) return;
      const u = draft.trim();
      setThread(t => [...t, { role: 'user', text: u }]);
      setDraft('');
      setTimeout(() => {
        setThread(t => [...t, {
          role: 'ai',
          text: `Acknowledged. I'll fold "${u}" into journey ${taskCtx.journey || 'TBD'} and update the next step.`,
          steps: [{ f: 'cells/' + taskCtx.cell + '/slices/' + taskCtx.slice + '/notes.md', op: 'edit', lines: 4, status: 'done' }]
        }]);
      }, 600);
    };

    return (
      <div className="dev-ai">
        <div className="dev-ai-thread">
          <div className="dev-ai-ctx">
            <div className="dev-ai-ctx-row">
              <span className="v1-mono v1-mute">CONTEXT</span>
              <span className="dev-tag dev-tag-task">{taskCtx.id}</span>
              <span style={{flex:1}}>{taskCtx.title}</span>
              <StatusChip s={taskCtx.status}/>
            </div>
            <div className="dev-ai-ctx-row">
              <span className="v1-mono v1-mute">JOURNEY</span>
              <span className="v1-mono dev-link">{taskCtx.journey || '—'}</span>
              <span className="v1-mono v1-mute">·</span>
              <span className="v1-mono">{taskCtx.cell}/{taskCtx.slice}</span>
              <span style={{marginLeft:'auto',display:'flex',gap:6}}>
                <button className="v1-btn" style={{height:24,padding:'0 8px',fontSize:11}}
                        onClick={() => setRunning(r => !r)}>
                  {running ? ICO.pause : ICO.play}<span>{running?'Pause':'Resume'}</span>
                </button>
              </span>
            </div>
          </div>

          <div className="dev-ai-msgs">
            {thread.map((m, i) => (
              <div key={i} className={`dev-msg dev-msg-${m.role}`}>
                <div className="dev-msg-head">
                  {m.role === 'ai' ? <span className="dev-av dev-av-ai">✦</span>
                    : m.role === 'user' ? <span className="dev-av">A</span>
                    : <span className="dev-av dev-av-empty">●</span>}
                  <span className="v1-mono v1-mute" style={{fontSize:10.5}}>
                    {m.role === 'ai' ? 'claude/sonnet · cell-eng' : m.role === 'user' ? 'alex' : 'system'}
                  </span>
                </div>
                <div className="dev-msg-body">{m.text}</div>
                {m.steps && (
                  <div className="dev-msg-steps">
                    {m.steps.map((s, j) => (
                      <div key={j} className={`dev-msg-step dev-msg-step-${s.status}`}>
                        <span className="dev-msg-step-ico">{ICO.file}</span>
                        <span className="dev-msg-step-op">{s.op}</span>
                        <span className="v1-mono dev-msg-step-f">{s.f}</span>
                        <span className="v1-mono v1-mute" style={{fontSize:10.5}}>+{s.lines}</span>
                        <span className={`dev-msg-step-st dev-msg-step-st-${s.status}`}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef}/>
          </div>

          <div className="dev-ai-compose">
            <textarea placeholder="Ask Claude to design, edit or test a slice…"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if ((e.metaKey||e.ctrlKey) && e.key==='Enter') send(); }}/>
            <div className="dev-ai-compose-foot">
              <span className="v1-mono v1-mute" style={{fontSize:11}}>
                Acting on <b>{taskCtx.cell}/{taskCtx.slice}</b> · changes go through PR review
              </span>
              <button className="v1-btn v1-btn-primary" onClick={send}>
                Send <span className="v1-kbd">⌘↵</span>
              </button>
            </div>
          </div>
        </div>

        <div className="dev-ai-side">
          <div className="dev-ai-side-section">
            <div className="dev-insp-label">JOURNEY STEPS</div>
            <ol className="dev-steps">
              {taskCtx.steps.map(s => (
                <li key={s.id} className={`dev-step dev-step-${s.status}`}>
                  <span className="dev-step-mark">
                    {s.status === 'done' ? '✓' : s.status === 'doing' ? '◐' : '○'}
                  </span>
                  <span>{s.name}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="dev-ai-side-section">
            <div className="dev-insp-label">TOOLS ENABLED</div>
            <div className="dev-tool-list">
              {['repo.read','repo.write','tests.run','config.read','audit.write'].map(t => (
                <div key={t} className="dev-tool-row">
                  <span className="v1-mono">{t}</span>
                  <span className="dev-stat dev-stat-ok">on</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dev-ai-side-section">
            <div className="dev-insp-label">RECENT FILES</div>
            <div className="dev-file-list">
              <div className="dev-file v1-mono">cells/accesscore/slices/sso/oidc_verifier.go</div>
              <div className="dev-file v1-mono">cells/accesscore/slices/sso/claims_map.go</div>
              <div className="dev-file v1-mono">cells/accesscore/slices/sso/sso_handler.go</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  window.DevPages = { BacklogPage, BoardPage, AIStudio };
})();
