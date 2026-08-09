/* global React */
// develop @ edafbb0b — shared UI for changes introduced in the
// develop branch (ghbvf/gocell). Exposes overlay components that
// the existing pages import to surface new platform capabilities:
//
//   ResponseEnvelopeBlock   — typed HTTP response envelope (PR #403)
//   GovernanceGatesBlock    — CH-06 typed-response-set bijection
//   ConsumerBaseCard        — outbox observability bridge + WithConsumerBase
//   SweeperFactoryCard      — kcommand.NewSweeper factory + options

(() => {
  const { useState } = React;

  // ============================================================
  // Typed Response Envelope — populated from contract.yaml `responses[]`
  // Bijection (CH-06) requires every status to map 1:1 to a generated
  // *XxxResponseObject struct. Business 4xx/5xx are TYPED structs, never
  // `error`; `error` is reserved for undeclared framework 5xx.
  // ============================================================
  const RESPONSE_SETS = {
    'audit.append': [
      { status: 201, obj: 'AppendResponse',                    kind: '2xx',
        note: 'Body: AppendBody{ seq, hash, prevHash, ts }.' },
      { status: 400, obj: 'Append400ErrorResponse',            kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED).' },
      { status: 409, obj: 'Append409ErrorResponse',            kind: '4xx',
        note: 'Body: *errcode (ERR_HASH_CHAIN_BROKEN). HMAC-SHA256 mismatch with prevHash.' },
    ],
    'auth.verify': [
      { status: 200, obj: 'VerifyResponse',                    kind: '2xx',
        note: 'Body: VerifyBody{ sub, scope[], exp }. JWT verified with JWKS.' },
      { status: 401, obj: 'Verify401ErrorResponse',            kind: '4xx',
        note: 'Body: *errcode (ERR_TOKEN_EXPIRED / ERR_TOKEN_INVALID / ERR_SIGNATURE_MISMATCH).' },
    ],
    'config.read': [
      { status: 200, obj: 'ReadResponse',                      kind: '2xx',
        note: 'Body: ReadBody{ key, value, version, publishedAt }.' },
      { status: 404, obj: 'Read404ErrorResponse',              kind: '4xx',
        note: 'Body: *errcode (ERR_CONFIG_NOT_FOUND).' },
    ],
    'flag.evaluate': [
      { status: 200, obj: 'EvaluateResponse',                  kind: '2xx',
        note: 'Body: EvaluateBody{ flagId, enabled, variant, ruleHit }.' },
      { status: 400, obj: 'Evaluate400ErrorResponse',          kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED). Context attrs malformed.' },
    ],
    'metric.emit': [
      { status: 202, obj: 'EmitResponse',                      kind: '2xx',
        note: 'Body: EmitBody{ accepted }. Fire-and-forget; outbox-backed.' },
      { status: 400, obj: 'Emit400ErrorResponse',              kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED). Cardinality cap, name regex.' },
      { status: 413, obj: 'Emit413ErrorResponse',              kind: '4xx',
        note: 'Body: *errcode (ERR_PAYLOAD_TOO_LARGE). Batch over 8 KiB.' },
    ],
    'trace.span': [
      { status: 202, obj: 'SpanResponse',                      kind: '2xx',
        note: 'Body: SpanBody{ traceId, spanId, accepted }. W3C traceparent honored.' },
      { status: 400, obj: 'Span400ErrorResponse',              kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED). traceparent malformed.' },
    ],
    'access.sso.AuthorizeOIDC': [
      { status: 302, obj: 'AuthorizeOIDC302RedirectResponse', kind: '2xx',
        note: 'Redirect to IdP — typed envelope still required.' },
      { status: 400, obj: 'AuthorizeOIDC400ErrorResponse',     kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED).' },
      { status: 401, obj: 'AuthorizeOIDC401ErrorResponse',     kind: '4xx',
        note: 'JWT-exempt endpoint, but state token check fails.' },
    ],
    'audit.chain.MerkleProof': [
      { status: 200, obj: 'MerkleProofResponse',               kind: '2xx',
        note: 'Body: MerkleProofBody{ proof[], rootHash }.' },
      { status: 404, obj: 'MerkleProof404ErrorResponse',       kind: '4xx',
        note: 'Body: *errcode (ERR_AUDIT_SEQ_NOT_FOUND).' },
    ],
    'config.publish.Stage': [
      { status: 200, obj: 'StageResponse',                     kind: '2xx',
        note: 'Body: StageBody{ versionId, stagedAt }.' },
      { status: 409, obj: 'Stage409ErrorResponse',             kind: '4xx',
        note: 'Body: *errcode (ERR_CONFIG_LOCK_HELD).' },
      { status: 422, obj: 'Stage422ErrorResponse',             kind: '4xx',
        note: 'Body: *errcode (ERR_VALIDATION_FAILED).' },
    ],
  };

  const ResponseEnvelopeBlock = ({ contractId }) => {
    const set = RESPONSE_SETS[contractId];
    if (!set) {
      return (
        <div className="devr-tre">
          <div className="devr-tre-h">
            Typed response envelope
            <span className="devr-tre-tag">PR #403</span>
          </div>
          <div className="devr-tre-foot">
            <span className="v1-mute">No <span className="v1-mono">contract.yaml</span> on file for this entry yet.</span>{' '}
            Once present, CH-06 requires every <span className="v1-mono">responses[]</span> entry to map
            1:1 to a generated <span className="v1-mono">XxxResponseObject</span> struct.
          </div>
        </div>
      );
    }
    return (
      <div className="devr-tre">
        <div className="devr-tre-h">
          Typed response envelope
          <span className="v1-mute" style={{ fontSize: 11, fontWeight: 400 }}>
            {set.length} responses
          </span>
          <span className="devr-tre-tag">PR #403</span>
        </div>
        {set.map(r => (
          <div key={r.status} className="devr-tre-row">
            <span className={`devr-tre-status devr-tre-${r.kind}`}>{r.status}</span>
            <span>
              <span className="devr-tre-obj">{r.obj}</span>
              <span className="devr-tre-obj-mute">{r.note}</span>
            </span>
          </div>
        ))}
        <div className="devr-tre-foot">
          Service signature:{' '}
          <span className="v1-mono">
            Method(ctx, *Request) (XxxResponseObject, error)
          </span>{' '}
          — business 4xx/5xx must be returned as typed structs (e.g.{' '}
          <span className="v1-mono">{set[0].obj.replace(/2.*/, '404ErrorResponse')}{'{Body: *errcode.New(…)}'}</span>).
          The <span className="v1-mono">error</span> return is reserved for undeclared framework 5xx (panic
          recover, infrastructure faults).
        </div>
      </div>
    );
  };

  // ============================================================
  // Governance gates — CH-06 is the new typed-response-set bijection
  // gate; the others were already enforced but were not surfaced in the
  // Contracts page UI. Counts are illustrative.
  // ============================================================
  const GATES = [
    { id: 'CH-01', name: 'Contract id ↔ filesystem path',                 verdict: 'pass', count: '45/45',  isNew: false },
    { id: 'CH-02', name: 'Owner cell exists + lifecycle ≠ deprecated',    verdict: 'pass', count: '45/45',  isNew: false },
    { id: 'CH-03', name: 'Consumer roles legal for kind',                 verdict: 'pass', count: '45/45',  isNew: false },
    { id: 'CH-04', name: 'Schema $ref resolvable + draft 2020-12',        verdict: 'warn', count: '44/45',  isNew: false,
      detail: 'config.publish.Stage v0.9 — response.schema.json missing $schema.' },
    { id: 'CH-05', name: 'Breaking change requires waiver',               verdict: 'pass', count: '45/45',  isNew: false },
    { id: 'CH-06', name: 'Typed-response-set bijection',                  verdict: 'pass', count: '45/45',  isNew: true,
      detail: 'Every contract.yaml responses[] maps 1:1 to a generated XxxResponseObject struct (PR #403).' },
    { id: 'FMT-26', name: 'auth.public ⊕ passwordResetExempt mutual',     verdict: 'pass', count: '45/45',  isNew: false },
  ];

  const GovernanceGatesBlock = () => (
    <div className="devr-gates">
      <div className="devr-gates-h">
        Governance gates
        <span className="v1-mute" style={{ fontSize: 11, fontWeight: 400, marginLeft: 'auto' }}>
          run by <span className="v1-mono">gocell validate --strict</span>
        </span>
      </div>
      {GATES.map(g => (
        <div key={g.id} className="devr-gate" title={g.detail || ''}>
          <span className="devr-gate-id">
            {g.id}
            {g.isNew && <span className="devr-gate-new">new</span>}
          </span>
          <span>{g.name}</span>
          <span className={`devr-gate-${g.verdict}`}>{g.verdict}</span>
          <span className="devr-gate-cnt">{g.count}</span>
        </div>
      ))}
    </div>
  );

  // ============================================================
  // Outbox observability bridge + WithConsumerBase requirement
  // ============================================================
  const ConsumerBaseCard = () => (
    <div className="devr-build-card">
      <div className="devr-build-card-h">
        Consumer composition
        <span className="devr-gate-new">required · develop</span>
      </div>
      <div className="devr-build-note" style={{ marginBottom: 10 }}>
        Subscription-bearing bootstrap apps must now pass{' '}
        <span className="v1-mono">WithConsumerBase(...)</span>. Phase 6 fails fast without it
        — idempotency claim + broker settlement become explicit.
      </div>
      <pre className="devr-build-pre">{`cb, _ := outbox.NewConsumerBase(
    idempotency.NewInMemClaimer(clk),
    outbox.ConsumerBaseConfig{},
    clk,
)

app := bootstrap.New(
    bootstrap.WithSubscriber(rawSub),
    bootstrap.WithConsumerBase(cb),     // <-- new, required
    bootstrap.WithTracer(tracer),
)`}</pre>
      <ul className="devr-build-list">
        <li>
          <span className="v1-mono">requestId / correlationId / traceId</span>
          <span>bridged into <span className="v1-mono">outbox.Entry.Observability</span> on write; restored by{' '}
            <span className="v1-mono">SubscriberWithMiddleware.SubscribeEntry</span> on consume.</span>
        </li>
        <li>
          <span className="v1-mono">traceparent / b3</span>
          <span>extracted from inbound HTTP — W3C precedence; B3 fallback. <b>span_id is NOT propagated across the outbox hop.</b></span>
        </li>
        <li>
          <span className="v1-mono">eventrouter.NewContractTracingSubscriber</span>
          <span>auto-decorated by bootstrap — closes consumer span on final settlement (ack / requeue / commit_failed / retry_exhausted).</span>
        </li>
      </ul>
    </div>
  );

  // ============================================================
  // Sweeper construction — NewSweeper(...) factory replaces literal
  // ============================================================
  const SweeperFactoryCard = () => (
    <div className="devr-build-card">
      <div className="devr-build-card-h">
        Sweeper construction
        <span className="devr-gate-new">breaking · develop</span>
      </div>
      <div className="devr-build-note" style={{ marginBottom: 10 }}>
        <span className="v1-mono">&kcommand.Sweeper{`{Scanner: …, Queue: …}`}</span> literal no longer
        compiles. Use the factory; required deps fail-fast on nil at construction time.
      </div>
      <pre className="devr-build-pre">{`sw, err := kcommand.NewSweeper(
    scanner, queue, clk,
    kcommand.WithSweeperFilter(filter),
    kcommand.WithSweeperInterval(15 * time.Second),
    kcommand.WithSweeperOnError(func(err error) { /* … */ }),
)`}</pre>
      <ul className="devr-build-list">
        <li>
          <span className="v1-mono">Hard</span>
          <span>typed-nil deps rejected via <span className="v1-mono">validation.IsNilInterface</span>.</span>
        </li>
        <li>
          <span className="v1-mono">Medium</span>
          <span>unexported <span className="v1-mono">built</span> sentinel + <span className="v1-mono">Start</span> head-checks <span className="v1-mono">if !s.built</span> — fail-closed against zero-value literal attack surface.</span>
        </li>
      </ul>
    </div>
  );

  window.DevDevelop = {
    RESPONSE_SETS,
    ResponseEnvelopeBlock,
    GovernanceGatesBlock,
    ConsumerBaseCard,
    SweeperFactoryCard,
  };
})();
