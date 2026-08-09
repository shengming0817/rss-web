/* global React */
// Wave 1 — unified work-item Inbox: Task / Bug / Issue, attach-anywhere model

(() => {
  const { useState } = React;

  // ===== Shared work-item model =====
  // attached: { level: 'slice'|'cell'|'journey'|'product', ref: <string> }
  const WORK_ITEMS = [
    // ----- Tasks -----
    { id: 'TASK-101', kind: 'task', title: 'OIDC: Microsoft Entra integration',
      status: 'doing', sprint: 'S-22', owner: '@li.wei', est: 5,
      attached: { level: 'slice', ref: 'accesscore/sso.oidc' },
      branch: 'sso/oidc-entra', pr: 1842 },
    { id: 'TASK-102', kind: 'task', title: 'OIDC: Okta integration',
      status: 'todo',  sprint: 'S-23', owner: '@li.wei', est: 3,
      attached: { level: 'slice', ref: 'accesscore/sso.oidc' } },
    { id: 'TASK-103', kind: 'task', title: 'SAML 2.0 fallback',
      status: 'todo',  sprint: 'S-24', owner: '@kim',    est: 5,
      attached: { level: 'slice', ref: 'accesscore/sso.saml' } },
    { id: 'TASK-201', kind: 'task', title: 'Stage / publish / rollback',
      status: 'doing', sprint: 'S-22', owner: '@park',   est: 5,
      attached: { level: 'cell', ref: 'configcore' } },
    { id: 'TASK-901', kind: 'task', title: 'Migrate CI runners to ARM pool',
      status: 'doing', sprint: 'S-22', owner: '@infra', est: 8,
      attached: { level: 'product', ref: 'gocell-platform' } },
    { id: 'TASK-902', kind: 'task', title: 'End-to-end SSO smoke test wiring',
      status: 'todo',  sprint: 'S-23', owner: '@li.wei', est: 5,
      attached: { level: 'journey', ref: 'J-sso-onboarding' } },

    // ----- Bugs -----
    { id: 'BUG-12',  kind: 'bug', title: 'Entra group claims dropped when issued as `roles`',
      status: 'active',   sprint: 'S-22', owner: '@li.wei', severity: 'P1',
      attached: { level: 'slice', ref: 'accesscore/sso.oidc' },
      repro: '3/3', linkedFrom: ['ISSUE-7'] },
    { id: 'BUG-18',  kind: 'bug', title: 'Stage TTL expires without cleanup',
      status: 'new',      sprint: 'S-23', owner: '@park',   severity: 'P2',
      attached: { level: 'slice', ref: 'configcore/stage' }, repro: '2/3' },
    { id: 'BUG-44',  kind: 'bug', title: 'p95 spike across audit-bridge after replicas autoscale',
      status: 'resolved', sprint: 'S-21', owner: '@chen',   severity: 'P2',
      attached: { level: 'cell', ref: 'auditcore' }, repro: '1/1' },
    { id: 'BUG-77',  kind: 'bug', title: 'Tenant proof export omits last block in window',
      status: 'active',   sprint: 'S-22', owner: '@chen',   severity: 'P1',
      attached: { level: 'journey', ref: 'J-tenant-audit' }, repro: '5/5' },

    // ----- Issues -----
    { id: 'ISSUE-7',  kind: 'issue', subtype: 'clarification',
      title: 'Entra `roles` vs `groups` claim — which is canonical?',
      status: 'resolved', sprint: 'S-22', owner: '@li.wei',
      attached: { level: 'slice', ref: 'accesscore/sso.oidc' },
      transitionedTo: [{ kind: 'bug', id: 'BUG-12', why: '复现确认后转 Bug' }] },
    { id: 'ISSUE-9',  kind: 'issue', subtype: 'impediment',
      title: 'Waiting on Okta sandbox tenant from procurement',
      status: 'open', sprint: 'S-23', owner: '@li.wei',
      attached: { level: 'cell', ref: 'accesscore' }, blockingDays: 4 },
    { id: 'ISSUE-14', kind: 'issue', subtype: 'risk',
      title: 'Audit chain depth may exceed 32 in 6 months — proof size grows',
      status: 'open', sprint: '—', owner: '@chen',
      attached: { level: 'cell', ref: 'auditcore' } },
    { id: 'ISSUE-21', kind: 'issue', subtype: 'spike',
      title: 'OTLP gRPC vs HTTP at our scale — benchmark before committing',
      status: 'open', sprint: 'S-23', owner: '@nakamura',
      attached: { level: 'cell', ref: 'observecore' } },
    { id: 'ISSUE-30', kind: 'issue', subtype: 'clarification',
      title: 'Cross-tenant data residency for the audit chain',
      status: 'open', sprint: '—', owner: '@vp-platform',
      attached: { level: 'product', ref: 'gocell-platform' } },
    { id: 'ISSUE-33', kind: 'issue', subtype: 'risk',
      title: 'SSO end-to-end SLO is unclear — could miss enterprise commit',
      status: 'open', sprint: 'S-23', owner: '@li.wei',
      attached: { level: 'journey', ref: 'J-sso-onboarding' } },
  ];

  const KIND_META = {
    task:  { label: 'Task',  color: 'oklch(0.55 0.15 250)', soft: 'oklch(0.95 0.04 250)', dark: 'oklch(0.25 0.06 250)' },
    bug:   { label: 'Bug',   color: 'oklch(0.50 0.20 25)',  soft: 'oklch(0.95 0.05 25)',  dark: 'oklch(0.25 0.08 25)' },
    issue: { label: 'Issue', color: 'oklch(0.50 0.15 70)',  soft: 'oklch(0.95 0.06 70)',  dark: 'oklch(0.25 0.08 70)' },
  };
  const SUBTYPE_META = {
    impediment:    { label: 'Impediment',    icon: '⏸' },
    risk:          { label: 'Risk',          icon: '⚠' },
    spike:         { label: 'Spike',         icon: '⌕' },
    clarification: { label: 'Clarification', icon: '?' },
  };
  const ATTACH_META = {
    slice:   { label: 'Slice',   icon: '·',  color: 'oklch(0.60 0.10 200)' },
    cell:    { label: 'Cell',    icon: '⬡',  color: 'oklch(0.55 0.15 250)' },
    journey: { label: 'Journey', icon: '◇',  color: 'oklch(0.55 0.15 290)' },
    product: { label: 'Product', icon: '◧',  color: 'oklch(0.55 0.15 30)' },
  };
  const STATUS_META = {
    todo:     { label: 'todo',     class: 'breaking' },
    doing:    { label: 'doing',    class: 'preview' },
    done:     { label: 'done',     class: 'stable' },
    new:      { label: 'new',      class: 'breaking' },
    active:   { label: 'active',   class: 'preview' },
    resolved: { label: 'resolved', class: 'stable' },
    closed:   { label: 'closed',   class: 'stable' },
    open:     { label: 'open',     class: 'preview' },
  };

  // ===== Issue state-machine modal — force conversion target =====
  const IssueConvertModal = ({ item, open, onClose }) => {
    const [target, setTarget] = useState('split');
    const [count, setCount] = useState(1);
    const [reason, setReason] = useState('');
    if (!open || !item) return null;
    return (
      <div className="devsbx-veil" onClick={onClose}>
        <div className="devsbx-modal" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
          <div className="devsbx-h">
            <div>
              <div className="v1-h2" style={{ margin: 0 }}>Resolve Issue</div>
              <div className="v1-mute" style={{ fontSize: 12.5 }}>
                Issue 是输入项 — 推进状态时必须选择转化目标，保证溯源链完整。
              </div>
            </div>
            <button className="v1-ghost" onClick={onClose}>✕</button>
          </div>
          <div className="devsbx-body">
            <div className="devsbx-card">
              <div className="devsbx-card-h">{item.id} · {SUBTYPE_META[item.subtype].label}</div>
              <div style={{ fontSize: 13 }}>{item.title}</div>
            </div>

            <div>
              <div className="devsbx-card-h" style={{ marginBottom: 6 }}>Conversion target</div>
              <div className="devsbx-mode" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <button data-active={target === 'split' || undefined} onClick={() => setTarget('split')}>
                  <div className="devsbx-mode-t">拆出 PBI / Bug</div>
                  <div className="devsbx-mode-d">承接结论为新工作项，自动建双向 link。</div>
                </button>
                <button data-active={target === 'accept' || undefined} onClick={() => setTarget('accept')}>
                  <div className="devsbx-mode-t">接受风险</div>
                  <div className="devsbx-mode-d">归档到风险登记，不创建下游工作项。</div>
                </button>
                <button data-active={target === 'drop' || undefined} onClick={() => setTarget('drop')}>
                  <div className="devsbx-mode-t">不再追踪</div>
                  <div className="devsbx-mode-d">直接关闭并写明放弃理由。</div>
                </button>
              </div>
            </div>

            {target === 'split' && (
              <div>
                <div className="devsbx-card-h" style={{ marginBottom: 6 }}>下游数量</div>
                <input type="number" min="1" max="10" className="devcfg-in v1-mono"
                       value={count} onChange={e => setCount(+e.target.value)} style={{ width: 120 }}/>
                <div className="v1-mute" style={{ fontSize: 11.5, marginTop: 6 }}>
                  会创建 {count} 个新工作项，挂在和当前 Issue 同样的层级（{ATTACH_META[item.attached.level].label} ·
                  <span className="v1-mono"> {item.attached.ref}</span>），并在两侧建立 link。
                </div>
              </div>
            )}
            <div>
              <div className="devsbx-card-h" style={{ marginBottom: 6 }}>Resolution note</div>
              <textarea className="devsbx-prompt" rows={3}
                        value={reason} onChange={e => setReason(e.target.value)}
                        placeholder={target === 'split' ? '简述拆解依据'
                                    : target === 'accept' ? '说明为何可接受、何时复评'
                                    : '说明放弃理由'}/>
            </div>
          </div>
          <div className="devsbx-foot">
            <button className="v1-btn" onClick={onClose}>Cancel</button>
            <button className="v1-btn v1-btn-primary" onClick={onClose}>
              {target === 'split' ? `拆出 ${count} 个并关闭` : target === 'accept' ? '归档风险并关闭' : '关闭 Issue'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===== Inbox page =====
  const InboxPage = ({ onOpenCell }) => {
    const [kind, setKind]   = useState('all');     // all | task | bug | issue
    const [sub, setSub]     = useState('all');     // all | impediment | risk | spike | clarification
    const [sprint, setSpr]  = useState('all');
    const [groupBy, setGB]  = useState('attach');  // attach | kind | sprint
    const [convert, setConvert] = useState(null);

    const sprints = ['all', ...Array.from(new Set(WORK_ITEMS.map(w => w.sprint)))];
    const filtered = WORK_ITEMS.filter(w =>
      (kind === 'all' || w.kind === kind) &&
      (kind !== 'issue' || sub === 'all' || w.subtype === sub) &&
      (sprint === 'all' || w.sprint === sprint));

    const groups = {};
    if (groupBy === 'attach') {
      ['slice', 'cell', 'journey', 'product'].forEach(l => groups[l] = []);
      filtered.forEach(w => groups[w.attached.level].push(w));
    } else if (groupBy === 'kind') {
      ['task', 'bug', 'issue'].forEach(k => groups[k] = []);
      filtered.forEach(w => groups[w.kind].push(w));
    } else {
      sprints.filter(s => s !== 'all').forEach(s => groups[s] = []);
      filtered.forEach(w => (groups[w.sprint] = groups[w.sprint] || []).push(w));
    }

    const counts = WORK_ITEMS.reduce((a, w) => (a[w.kind] = (a[w.kind]||0)+1, a), {});

    return (
      <div className="devib-page">
        <div className="v1-page-head">
          <div>
            <h1 className="v1-h1">Inbox</h1>
            <p className="v1-sub">
              统一视图：Task / Bug / Issue。每个工作项可挂 Slice / Cell / Journey / Product 任意层级。
              Issue 推进状态时强制选转化目标。
            </p>
          </div>
        </div>

        <div className="devib-toolbar">
          <div className="v1-seg">
            <button data-active={kind === 'all'   || undefined} onClick={() => setKind('all')}>All <span className="v1-mute">{WORK_ITEMS.length}</span></button>
            <button data-active={kind === 'task'  || undefined} onClick={() => setKind('task')}>Tasks <span className="v1-mute">{counts.task||0}</span></button>
            <button data-active={kind === 'bug'   || undefined} onClick={() => setKind('bug')}>Bugs <span className="v1-mute">{counts.bug||0}</span></button>
            <button data-active={kind === 'issue' || undefined} onClick={() => setKind('issue')}>Issues <span className="v1-mute">{counts.issue||0}</span></button>
          </div>
          {kind === 'issue' && (
            <div className="v1-seg">
              <button data-active={sub === 'all' || undefined} onClick={() => setSub('all')}>All</button>
              {Object.entries(SUBTYPE_META).map(([k, m]) => (
                <button key={k} data-active={sub === k || undefined} onClick={() => setSub(k)}>{m.icon} {m.label}</button>
              ))}
            </div>
          )}
          <div className="devib-spacer"/>
          <label className="devib-sel">Sprint
            <select value={sprint} onChange={e => setSpr(e.target.value)}>
              {sprints.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="devib-sel">Group by
            <select value={groupBy} onChange={e => setGB(e.target.value)}>
              <option value="attach">Attach level</option>
              <option value="kind">Kind</option>
              <option value="sprint">Sprint</option>
            </select>
          </label>
        </div>

        <div className="devib-groups">
          {Object.entries(groups).filter(([_, items]) => items.length > 0).map(([key, items]) => {
            const meta = groupBy === 'attach' ? ATTACH_META[key]
                        : groupBy === 'kind'  ? KIND_META[key]
                        : { label: key };
            return (
              <div key={key} className="devib-group" data-group-kind={groupBy}>
                <div className="devib-group-h">
                  <span className="devib-group-label">{meta.label || key}</span>
                  <span className="v1-mute">{items.length}</span>
                </div>
                <div className="devib-rows">
                  {items.map(w => {
                    const km = KIND_META[w.kind];
                    const am = ATTACH_META[w.attached.level];
                    const sm = STATUS_META[w.status] || { label: w.status, class: 'preview' };
                    const cellId = w.attached.level === 'cell' ? w.attached.ref
                                  : w.attached.level === 'slice' ? w.attached.ref.split('/')[0]
                                  : null;
                    return (
                      <div key={w.id} className="devib-row" onClick={() => cellId && onOpenCell && onOpenCell(cellId)}>
                        <span className="devib-kind"
                              style={{ color: km.color, background: km.soft, borderColor: km.color }}>
                          {km.label}{w.kind === 'issue' && ` · ${SUBTYPE_META[w.subtype].label}`}
                        </span>
                        <span className="devib-id v1-mono">{w.id}</span>
                        <span className="devib-title">{w.title}</span>
                        <span className={`devc-status devc-status-${sm.class}`} style={{ textTransform: 'lowercase' }}>{sm.label}</span>
                        {w.severity && <span className="devib-sev" data-sev={w.severity}>{w.severity}</span>}
                        <span className="devib-attach" style={{ borderColor: am.color, color: am.color }}>
                          <span>{am.icon}</span>
                          <span className="v1-mono">{w.attached.ref}</span>
                        </span>
                        <span className="v1-mono devib-meta">{w.sprint}</span>
                        <span className="v1-mono devib-meta">{w.owner}</span>
                        {w.kind === 'issue' && w.status === 'open' && (
                          <button className="v1-btn devib-resolve" onClick={(e) => { e.stopPropagation(); setConvert(w); }}>Resolve…</button>
                        )}
                        {w.transitionedTo && (
                          <span className="devib-link v1-mono" title="Transitioned to">
                            → {w.transitionedTo.map(t => t.id).join(', ')}
                          </span>
                        )}
                        {w.linkedFrom && (
                          <span className="devib-link v1-mono" title="Linked from">
                            ← {w.linkedFrom.join(', ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <IssueConvertModal item={convert} open={!!convert} onClose={() => setConvert(null)}/>
      </div>
    );
  };

  window.DevInbox = { WORK_ITEMS, InboxPage, IssueConvertModal, KIND_META, SUBTYPE_META, ATTACH_META };
})();
