// Sample data for the developer platform extension.
window.DEV_DATA = (() => {
  // Hierarchy: Product → Epic → Feature → Sprint → Task → Step
  // Journey/Task mapping is on each Task node.
  const products = [{
    id: 'P-1', name: 'gocell platform', status: 'Active',
    epics: [
      {
        id: 'E-1', name: 'Identity & RBAC', status: 'Active', owner: 'alex',
        features: [
          {
            id: 'F-1', name: 'SSO providers', status: 'In progress', sprint: 'S-26',
            tasks: [
              { id: 'T-101', title: 'OIDC: Microsoft Entra integration',
                status: 'In progress', journey: 'J-9821', cell: 'accesscore', slice: 'sso',
                assignee: 'ai/claude', sprint: 'S-26', points: 5,
                steps: [
                  { id: 's1', name: 'Scaffold slice', status: 'done' },
                  { id: 's2', name: 'OIDC discovery client', status: 'done' },
                  { id: 's3', name: 'Token exchange + claims map', status: 'doing' },
                  { id: 's4', name: 'Conformance tests', status: 'todo' },
                  { id: 's5', name: 'Audit hooks', status: 'todo' },
                ] },
              { id: 'T-102', title: 'OIDC: Okta integration',
                status: 'Ready', journey: null, cell: 'accesscore', slice: 'sso',
                assignee: 'unassigned', sprint: 'S-26', points: 3,
                steps: [{id:'s1',name:'Scaffold slice',status:'todo'},{id:'s2',name:'Discovery',status:'todo'}] },
              { id: 'T-103', title: 'SAML 2.0 fallback',
                status: 'Backlog', journey: null, cell: 'accesscore', slice: 'sso',
                assignee: 'unassigned', sprint: null, points: 8,
                steps: [] },
            ]
          },
          {
            id: 'F-2', name: 'Audit chain v2', status: 'Review', sprint: 'S-26',
            tasks: [
              { id: 'T-110', title: 'Merkle proof endpoint',
                status: 'Review', journey: 'J-9803', cell: 'auditcore', slice: 'chain',
                assignee: 'ai/claude', sprint: 'S-26', points: 5,
                steps: [
                  {id:'s1',name:'Tree builder',status:'done'},
                  {id:'s2',name:'/proof handler',status:'done'},
                  {id:'s3',name:'Verifier CLI',status:'done'},
                  {id:'s4',name:'PR review',status:'doing'},
                ] },
            ]
          },
        ]
      },
      {
        id: 'E-2', name: 'Config & Flags', status: 'Active', owner: 'maria',
        features: [
          {
            id: 'F-3', name: 'Versioned publishing', status: 'In progress', sprint: 'S-26',
            tasks: [
              { id: 'T-201', title: 'Stage / publish workflow',
                status: 'In progress', journey: 'J-9844', cell: 'configcore', slice: 'publish',
                assignee: 'ai/claude', sprint: 'S-26', points: 5,
                steps: [
                  {id:'s1',name:'Stage table',status:'done'},
                  {id:'s2',name:'Diff endpoint',status:'doing'},
                  {id:'s3',name:'Publish + rollback',status:'todo'},
                ] },
              { id: 'T-202', title: 'Feature flag rollout calculator',
                status: 'Done', journey: 'J-9700', cell: 'configcore', slice: 'flags',
                assignee: 'human/maria', sprint: 'S-25', points: 3, steps: [] },
            ]
          },
        ]
      },
      {
        id: 'E-3', name: 'Observability', status: 'Draft', owner: 'alex',
        features: [
          { id: 'F-4', name: 'Trace exporter', status: 'Draft', sprint: null,
            tasks: [
              { id: 'T-301', title: 'OTLP exporter slice',
                status: 'Backlog', journey: null, cell: 'observecore', slice: 'otlp',
                assignee: 'unassigned', sprint: null, points: 5, steps: [] },
            ] },
        ]
      },
    ]
  }];

  // Flat task list for the board
  const flatTasks = [];
  products.forEach(p => p.epics.forEach(e => e.features.forEach(f => f.tasks.forEach(t =>
    flatTasks.push({ ...t, epic: e.name, epicId: e.id, feature: f.name, featureId: f.id, product: p.name })
  ))));

  // Sprints
  const sprints = [
    { id: 'S-26', name: 'Sprint 26', range: 'May 4 → May 17', state: 'active', completed: 4, total: 9 },
    { id: 'S-25', name: 'Sprint 25', range: 'Apr 20 → May 3', state: 'closed', completed: 11, total: 11 },
    { id: 'S-27', name: 'Sprint 27', range: 'May 18 → May 31', state: 'planned', completed: 0, total: 5 },
  ];

  // AI conversation transcript (preset; user can append)
  const aiThread = [
    { role: 'system', text: 'Connected to T-101 — OIDC: Microsoft Entra integration. Journey J-9821 active. Cell: accesscore · Slice: sso.' },
    { role: 'user', text: '继续推进 OIDC token exchange，要求覆盖 id_token 校验和 group claims 映射到 RBAC 角色。' },
    { role: 'ai', text: 'Plan:\n1. Add `IDTokenVerifier` with JWKS cache.\n2. Map `groups` claim → role via configcore.sso.groupMap.\n3. Wire `OnLogin` audit hook (event=auth.sso.login).\n4. Conformance tests against entra-mock.\n\nProceeding with step 3 of journey J-9821 — token exchange + claims map.', steps: [
      {f: 'cells/accesscore/slices/sso/oidc_verifier.go', op: 'create', lines: 142, status: 'done'},
      {f: 'cells/accesscore/slices/sso/claims_map.go', op: 'create', lines: 88, status: 'done'},
      {f: 'cells/accesscore/slices/sso/sso_handler.go', op: 'edit', lines: 24, status: 'doing'},
      {f: 'cells/accesscore/slices/sso/oidc_verifier_test.go', op: 'create', lines: 0, status: 'queued'},
    ] },
    { role: 'user', text: '看一下 group → role 的默认映射规则。' },
    { role: 'ai', text: 'Reading `configcore.sso.groupMap` from the dev environment:\n\n```yaml\ngroupMap:\n  "gocell-admins":     Admin\n  "gocell-operators":  Operator\n  "gocell-engineering":Developer\n  "*":                 Viewer\n```\n\nThe wildcard fallback ensures every authenticated user gets at least Viewer. Want me to make the wildcard configurable per-tenant?' },
  ];

  return { products, flatTasks, sprints, aiThread };
})();
