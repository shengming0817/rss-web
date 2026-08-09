/* global React */
// Phase 3 — Git, Sandboxes, AI dev mode
//   1. Cells link to a Git repo (URL, default branch, head commit)
//   2. Tasks link to commits + a draft/open PR
//   3. Click a task → "Deploy AI sandbox" modal — spins up an isolated
//      copy-on-write workspace pinned to (cell, task, branch)
//   4. AI Shell shows the active sandbox in its header chip
//   5. AI Studio gains a "Sandboxes" panel — fleet view, attach AI, promote to PR

(() => {
  const { useState, useEffect } = React;

  // ===== Git metadata =====
  const CELL_REPO = {
    accesscore:  { repo: 'acme/gocell',   path: 'cells/accesscore',  branch: 'main',
      head: { sha: 'a3f9c12', when: '2h', msg: 'wire JWKS rotation', by: '@li.wei' },
      openPRs: 3, ahead: 0, behind: 0 },
    auditcore:   { repo: 'acme/gocell',   path: 'cells/auditcore',   branch: 'main',
      head: { sha: '7d1b04e', when: '6h', msg: 'merkle: bound proof depth at 32', by: '@chen' },
      openPRs: 1, ahead: 0, behind: 0 },
    configcore:  { repo: 'acme/gocell',   path: 'cells/configcore',  branch: 'main',
      head: { sha: 'f2c8b91', when: '1d', msg: 'stage flow: redo TTL semantics', by: '@park' },
      openPRs: 2, ahead: 0, behind: 0 },
    observecore: { repo: 'acme/gocell',   path: 'cells/observecore', branch: 'main',
      head: { sha: '5e019ab', when: '3d', msg: 'OTLP draft scaffold', by: '@nakamura' },
      openPRs: 0, ahead: 0, behind: 4 },
  };

  const TASK_GIT = {
    'T-090': { branch: 'audit/chain-v2',   pr: { num: 1791, state: 'merged', title: 'Hash chain v2 schema' }, commits: 8 },
    'T-101': { branch: 'sso/oidc-entra',   pr: { num: 1842, state: 'open',   title: 'OIDC: Microsoft Entra integration' }, commits: 5 },
    'T-102': { branch: 'sso/oidc-okta',    pr: null, commits: 0 },
    'T-103': { branch: 'sso/saml',         pr: null, commits: 0 },
    'T-110': { branch: 'audit/merkle',     pr: { num: 1838, state: 'review', title: 'Merkle proof endpoint' }, commits: 11 },
    'T-115': { branch: 'audit/query',      pr: { num: 1844, state: 'open',   title: 'Audit query API' }, commits: 3 },
    'T-201': { branch: 'config/stage-pub', pr: { num: 1840, state: 'open',   title: 'Stage / publish flow' }, commits: 14 },
    'T-202': { branch: 'config/flag-calc', pr: { num: 1810, state: 'merged', title: 'Flag rollout calculation' }, commits: 6 },
    'T-301': { branch: 'observe/otlp',     pr: null, commits: 0 },
  };

  // ===== Sandboxes (live + recent) =====
  const SANDBOXES = [
    { id: 'sbx-7e2a91', task: 'T-101', cell: 'accesscore', branch: 'sandbox/T-101-oidc-entra',
      base: 'a3f9c12', agent: 'claude-sonnet-4.5', driver: '@li.wei', created: '12m',
      status: 'running', diff: { files: 4, add: 142, del: 38 }, traces: 6, prDraft: false,
      last: 'edited claims.go · ran sso_test.go (3 fail)' },
    { id: 'sbx-2db1f4', task: 'T-110', cell: 'auditcore', branch: 'sandbox/T-110-merkle-bench',
      base: '7d1b04e', agent: 'claude-sonnet-4.5', driver: '@chen',  created: '54m',
      status: 'review-ready', diff: { files: 2, add: 86, del: 12 }, traces: 12, prDraft: true,
      last: 'all tests green · draft PR ready · awaiting review' },
    { id: 'sbx-91c7ab', task: 'T-201', cell: 'configcore', branch: 'sandbox/T-201-publish-rollback',
      base: 'f2c8b91', agent: 'claude-sonnet-4.5', driver: '@park',  created: '3h',
      status: 'idle',         diff: { files: 7, add: 312, del: 88 }, traces: 4, prDraft: false,
      last: 'idle 18m · last action: ran integration suite' },
    { id: 'sbx-44eb02', task: 'T-301', cell: 'observecore', branch: 'sandbox/T-301-otlp-grpc',
      base: '5e019ab', agent: 'claude-sonnet-4.5', driver: '@nakamura', created: '18h',
      status: 'stopped',      diff: { files: 1, add: 18, del: 4 }, traces: 0, prDraft: false,
      last: 'stopped by driver · resources released' },
  ];

  // ===== Display chips =====
  const GitChip = ({ cellId }) => {
    const r = CELL_REPO[cellId];
    if (!r) return null;
    return (
      <div className="devg-chip">
        <span className="devg-chip-icon">⎇</span>
        <div>
          <div className="v1-mono devg-chip-line">{r.repo}<span className="v1-mute"> / </span>{r.path}</div>
          <div className="v1-mute devg-chip-sub">
            <span className="v1-mono">{r.branch}</span>
            <span> · </span>
            <span className="v1-mono">{r.head.sha}</span>
            <span> · {r.head.msg}</span>
            <span> · {r.head.when} ago by <span className="v1-mono">{r.head.by}</span></span>
          </div>
        </div>
        <div className="devg-chip-meta v1-mono">
          {r.openPRs} PRs{r.behind ? ` · ${r.behind}↓` : ''}{r.ahead ? ` · ${r.ahead}↑` : ''}
        </div>
      </div>
    );
  };

  const PRChip = ({ taskId }) => {
    const g = TASK_GIT[taskId];
    if (!g) return null;
    if (!g.pr) return <span className="v1-mute" style={{ fontSize: 11.5 }}>no PR</span>;
    const cls = g.pr.state === 'merged' ? 'devg-pr-merged'
              : g.pr.state === 'review' ? 'devg-pr-review'
              : 'devg-pr-open';
    return (
      <span className={`devg-pr ${cls}`}>
        <span className="v1-mono">#{g.pr.num}</span>
        <span>{g.pr.state}</span>
      </span>
    );
  };

  const BranchChip = ({ taskId }) => {
    const g = TASK_GIT[taskId];
    if (!g) return null;
    return (
      <span className="devg-branch v1-mono" title={`${g.commits} commits on this branch`}>
        ⎇ {g.branch}
        {g.commits > 0 && <span className="v1-mute"> · {g.commits}c</span>}
      </span>
    );
  };

  // ===== Deploy modal =====
  const DeployModal = ({ task, cellId, open, onClose, onDeploy }) => {
    const [agent,  setAgent]  = useState('claude-sonnet-4.5');
    const [base,   setBase]   = useState('main');
    const [auto,   setAuto]   = useState(true);
    const [mode,   setMode]   = useState('interactive');
    const [prompt, setPrompt] = useState('');
    const D2 = window.DevCell2 || {};
    const slice = (open && task) ? (D2.findSliceForTask && D2.findSliceForTask(cellId, task.id)) : null;
    const sliceDoD = slice && D2.SLICE_DOD ? D2.SLICE_DOD[slice.name] : null;
    const defaultPaths = sliceDoD?.allowedFiles?.join('\n') || '';
    const [paths,  setPaths]  = useState(defaultPaths);
    useEffect(() => { setPaths(defaultPaths); }, [defaultPaths]);
    const [files,  setFiles]  = useState([]);
    if (!open || !task) return null;
    const repo = CELL_REPO[cellId];
    const git  = TASK_GIT[task.id] || {};
    return (
      <div className="devsbx-veil" onClick={onClose}>
        <div className="devsbx-modal" onClick={e => e.stopPropagation()}>
          <div className="devsbx-h">
            <div>
              <div className="v1-h2" style={{ margin: 0 }}>Deploy AI development sandbox</div>
              <div className="v1-mute" style={{ fontSize: 12.5 }}>
                Isolated copy-on-write workspace pinned to this task. AI iterates here — nothing lands until a PR is opened.
              </div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devsbx-body">
            <div className="devsbx-card">
              <div className="devsbx-card-h">Pinned task</div>
              <div className="v1-mono devsbx-row-mono">{task.id} — {task.title}</div>
              <div className="devsbx-meta">
                <div><span>Cell</span><b className="v1-mono">{cellId}</b></div>
                <div><span>Repo</span><b className="v1-mono">{repo?.repo || '—'}</b></div>
                <div><span>Path</span><b className="v1-mono">{repo?.path || '—'}</b></div>
                <div><span>Existing PR</span><b className="v1-mono">{git.pr ? `#${git.pr.num}` : 'none'}</b></div>
              </div>
            </div>
            <div className="devsbx-form">
              <label>
                <span>Agent</span>
                <select className="devcfg-in v1-mono" value={agent} onChange={e => setAgent(e.target.value)}>
                  <option>claude-sonnet-4.5</option>
                  <option>claude-haiku-4.5</option>
                  <option>gocell-cell-tuned</option>
                </select>
              </label>
              <label>
                <span>Base branch</span>
                <select className="devcfg-in v1-mono" value={base} onChange={e => setBase(e.target.value)}>
                  <option>main</option>
                  <option>{git.branch || 'task branch'}</option>
                </select>
              </label>
              <label>
                <span>Sandbox branch</span>
                <input className="devcfg-in v1-mono" readOnly
                       value={`sandbox/${task.id}-${(git.branch || '').split('/').pop() || 'work'}`}/>
              </label>
              <label className="devsbx-toggle">
                <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>
                <span>Auto-attach AI Shell on deploy</span>
              </label>
            </div>

            <div>
              <div className="devsbx-card-h" style={{ marginBottom: 6 }}>Run mode</div>
              <div className="devsbx-mode">
                <button data-active={mode === 'interactive' || undefined}
                        onClick={() => setMode('interactive')}>
                  <div className="devsbx-mode-t">Interactive</div>
                  <div className="devsbx-mode-d">Agent waits for you in AI Shell after each step.</div>
                </button>
                <button data-active={mode === 'autonomous' || undefined}
                        onClick={() => setMode('autonomous')}>
                  <div className="devsbx-mode-t">Autonomous (self-loop)</div>
                  <div className="devsbx-mode-d">Agent iterates plan → edit → run → review on its own until tests pass or budget hits.</div>
                </button>
              </div>
            </div>

            <div>
              <div className="devsbx-card-h" style={{ marginBottom: 6 }}>Initial prompt</div>
              <textarea className="devsbx-prompt" rows={4}
                        placeholder="What should the agent do? e.g. 'Add a configurable claim-name fallback so Entra `roles` claim works alongside `groups`. Cover with a unit test.'"
                        value={prompt} onChange={e => setPrompt(e.target.value)}/>
            </div>

            <div>
              <div className="devsbx-card-h" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span>Sandbox write boundary <span className="v1-mute" style={{ fontWeight: 400 }}>· allowed file paths</span></span>
                {slice && (
                  <span className="v1-chip" title="Pre-filled from slice DoD allowedFiles" style={{ marginLeft: 'auto' }}>
                    from slice <b className="v1-mono" style={{ marginLeft: 4 }}>{slice.name}</b> DoD
                  </span>
                )}
              </div>
              <textarea className="devsbx-paths v1-mono" rows={Math.max(3, defaultPaths ? defaultPaths.split('\n').length : 3)}
                        placeholder={`cells/${cellId}/sso/oidc/claims.go\ncells/${cellId}/sso/oidc/oidc_test.go\ndocs/sso/entra-mapping.md`}
                        value={paths} onChange={e => setPaths(e.target.value)}/>
              {slice && sliceDoD && (
                <div className="v1-mute" style={{ fontSize: 11, marginTop: 4 }}>
                  Sandbox write is locked to these paths. Edits outside CI-fail the PR; verify clean = halt signal for self-loop mode.
                </div>
              )}
              <label className="devsbx-upload">
                <input type="file" multiple onChange={e => setFiles([...e.target.files])}/>
                <span className="v1-btn">Upload files…</span>
                <span className="v1-mute" style={{ fontSize: 11.5 }}>
                  {files.length === 0 ? 'or drop screenshots / specs / sample payloads' : `${files.length} file(s) attached`}
                </span>
              </label>
            </div>
            <div className="devsbx-perms">
              Sandbox runs with <b>read</b> on every cell, <b>write</b> only inside <span className="v1-mono">{repo?.path || cellId}</span>.
              Outbound contract calls are stubbed unless explicitly granted. Audit appended on every action.
            </div>
          </div>
          <div className="devsbx-foot">
            <button className="v1-btn" onClick={onClose}>Cancel</button>
            <button className="v1-btn v1-btn-primary"
                    onClick={() => { onDeploy && onDeploy({ task, cellId, agent, base, auto, mode, prompt, paths, files }); onClose(); }}>
              Deploy sandbox
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===== Sandboxes panel — fits inside AI Studio =====
  const SandboxesPanel = ({ onOpenCell, onOpenSandbox }) => {
    const [open, setOpen] = useState(false);
    const counts = SANDBOXES.reduce((acc, s) => (acc[s.status] = (acc[s.status] || 0) + 1, acc), {});
    return (
      <div className="devsbx-panel" data-open={open || undefined}>
        <button className="devsbx-panel-h" onClick={() => setOpen(o => !o)}>
          <div className="devsbx-panel-h-l">
            <span className="devsbx-panel-chev">{open ? '▾' : '▸'}</span>
            <span className="devsbx-panel-title">AI Sandboxes</span>
            <span className="v1-mute devsbx-panel-sub">isolated workspaces · nothing lands without a PR</span>
          </div>
          <div className="devsbx-counts">
            <span data-status="running">●</span> {counts.running || 0} running
            <span data-status="review-ready">●</span> {counts['review-ready'] || 0} review-ready
            <span data-status="idle">●</span> {counts.idle || 0} idle
            <span data-status="stopped">●</span> {counts.stopped || 0} stopped
          </div>
        </button>
        {open && (
        <div className="devsbx-list">
          {SANDBOXES.map(s => (
            <div key={s.id} className="devsbx-item" data-status={s.status}
                 onClick={() => onOpenSandbox && onOpenSandbox(s.id)}
                 style={{ cursor: onOpenSandbox ? 'pointer' : undefined }}>
              <div className="devsbx-item-l">
                <div className="devsbx-id v1-mono">{s.id}</div>
                <div className="devsbx-status" data-s={s.status}>{s.status}</div>
              </div>
              <div className="devsbx-item-m">
                <div className="devsbx-item-t">
                  <span className="v1-mono">{s.task}</span>
                  <span className="devsbx-arrow">·</span>
                  <button className="v1-link v1-mono" onClick={(e) => { e.stopPropagation(); onOpenCell && onOpenCell(s.cell); }}>{s.cell}</button>
                  <span className="devsbx-arrow">·</span>
                  <span className="v1-mono devsbx-branch">⎇ {s.branch}</span>
                </div>
                <div className="devsbx-item-last v1-mute">{s.last}</div>
                <div className="devsbx-item-meta">
                  <span><b className="v1-mono">{s.agent}</b> · driven by <b className="v1-mono">{s.driver}</b></span>
                  <span>{s.created} ago</span>
                  <span className="v1-mono">+{s.diff.add}/-{s.diff.del} · {s.diff.files}f</span>
                  <span className="v1-mono">{s.traces} traces</span>
                  {s.prDraft && <span className="devg-pr devg-pr-review">draft PR</span>}
                </div>
              </div>
              <div className="devsbx-item-r" onClick={(e) => e.stopPropagation()}>
                {s.status === 'review-ready' && <button className="v1-btn v1-btn-primary" onClick={() => onOpenSandbox && onOpenSandbox(s.id)}>Open PR</button>}
                {s.status === 'running'      && <button className="v1-btn" onClick={() => onOpenSandbox && onOpenSandbox(s.id)}>Open</button>}
                {s.status === 'idle'         && <button className="v1-btn" onClick={() => onOpenSandbox && onOpenSandbox(s.id)}>Open</button>}
                {s.status === 'stopped'      && <button className="v1-btn" onClick={() => onOpenSandbox && onOpenSandbox(s.id)}>Inspect</button>}
                <button className="v1-ghost" title="More">⋯</button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    );
  };

  // ===== AI Shell sandbox badge — shown in shell header =====
  const ShellSandboxBadge = () => {
    const active = SANDBOXES.find(s => s.status === 'running');
    if (!active) return null;
    return (
      <span className="devsbx-badge" data-status={active.status}>
        <span className="devsbx-dot"/>
        <span>sandbox</span>
        <span className="v1-mono">{active.id}</span>
        <span className="v1-mute">·</span>
        <span className="v1-mono">{active.task}</span>
      </span>
    );
  };

  window.DevCell3 = {
    CELL_REPO, TASK_GIT, SANDBOXES,
    GitChip, PRChip, BranchChip, DeployModal, SandboxesPanel, ShellSandboxBadge,
  };
})();
