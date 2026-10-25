import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeCatalog, decodeReadiness, createSettingsCatalog } from './catalog'
import { createAppleMaterials, appleReceipt, appleDirectory } from './apple'
import {
  createStorageClient,
  createMailClient,
  createWnsClient,
  storageReceipt,
  mailReceipt,
  wnsReceipt,
  wnsOperation,
} from './providers'
import { createWebhookMaterials, webhookOperation } from './webhook'
import { createPlatformClient, provisionReceipt, registryReceipt, tenant } from './platform'
import { createTaskTrustClient, taskTrust, installationObservation } from './trust'
import { createPkiClient, pkiTrust, pkiReceipt } from './pki'
import { createManagedPackages } from './packages'
import { runtimeSnapshot, createRuntimeDiagnostics } from './runtime'
import { entryIds } from '../entries'
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  c = '33333333-3333-4333-8333-333333333333',
  digest = 'a'.repeat(64)
const storage = {
  operationId: a,
  revision: 1,
  profile: 'approved',
  state: 'rejected',
  failureReason: 'authorization',
  selected: false,
  revoked: false,
  qualifiedAt: null,
  expiresAt: null,
}
const mail = {
  operationId: a,
  revision: 1,
  profile: 'approved',
  state: 'unknown',
  failureReason: null,
  attemptedAt: 1,
  acceptedAt: null,
}
const wns = {
  operationId: a,
  revision: 1,
  packageFamilyName: 'RSS_example',
  qualifiedAt: null,
  attemptedAt: null,
  failureReason: null,
  selected: false,
  revoked: false,
}
const material = {
  operationId: a,
  reference: 'events',
  revision: 1,
  configurationSha256: digest,
  keyDigest: digest,
  challenge: 'YWJj',
  confirmed: false,
  revoked: false,
  endpoint: 'https://receiver.test/hook',
  networkReference: 'approved',
  attemptedAt: null,
  confirmedAt: null,
  failureReason: null,
}
const head = { reference: 'events', revision: 1, activeRevision: null, retiringRevision: null }
const t = {
  tenantId: b,
  management: false,
  initialEpoch: 1,
  currentEpoch: 1,
  name: 'Team',
  notes: null,
  revision: 1,
  deletable: false,
}
const provision = {
  operationId: a,
  action: 'provision',
  result: {
    operationId: a,
    tenantId: b,
    administratorId: c,
    hostId: c,
    revision: 1,
    phase: 'host_pending',
    blocked: 'capacity',
    origin: null,
    application: {
      requestedRevision: 1,
      materialDigest: digest,
      operationId: a,
      observation: {
        hostId: c,
        processGeneration: a,
        appliedRevision: 1,
        materialDigest: digest,
        observedAt: 1,
        failure: null,
      },
    },
  },
}
const task = {
  version: 1,
  service_id: c,
  tenant: b,
  revision: 1,
  keys: [{ id: 'key-a', public_key: 'A'.repeat(43), state: 'active' }],
}
const pki = {
  version: 1,
  service_id: c,
  origin: 'https://mdm.test',
  tenant: b,
  purpose: 'agent',
  revision: 1,
  issuers: [
    {
      digest,
      mode: 'active',
      certificate: 'YQ==',
      root: 'YQ==',
      crl: 'YQ==',
      root_crl: 'YQ==',
      provisioner: 'agent',
      kid: 'kid-a',
    },
  ],
}
function transport(value: unknown) {
  const calls: (RequestOptions<unknown> | NoContentRequest)[] = []
  return {
    calls,
    client: {
      async request(o: RequestOptions<unknown> | NoContentRequest) {
        calls.push(o)
        return typeof o.decode === 'function' ? o.decode(value) : undefined
      },
    } as HttpTransport,
  }
}
it('keeps all 44 requirements, realm visibility and hostile locators closed', () => {
  expect(entryIds).toHaveLength(44)
  const item = {
    id: 'wns',
    scope: 'tenant',
    owner: 'windows-channel',
    custody: 'domain_service',
    lifecycle: 'provider_credential',
    status: 'unknown',
    revision: null,
    desiredRevision: null,
    appliedRevision: null,
    configuredCount: null,
    reason: null,
    actions: [{ name: 'read', href: '/api/v1/windows/wns' }],
  }
  expect(
    decodeCatalog(
      { items: [item], domains: [{ id: 'apple', href: '/api/v1/apple/organizations' }] },
      'tenant',
    ).items[0]?.status,
  ).toBe('unknown')
  for (const v of [
    { ...item, scope: 'platform' },
    { ...item, id: 'future' },
    { ...item, actions: [{ name: 'run', href: 'https://evil.test' }] },
    { ...item, privateKey: 'secret' },
  ])
    expect(() => decodeCatalog({ items: [v], domains: [] }, 'tenant')).toThrow()
  expect(() => decodeCatalog({ items: [item, item], domains: [] }, 'tenant')).toThrow()
  expect(
    decodeCatalog({ items: [{ ...item, scope: 'deployment' }], domains: [] }, 'platform').items,
  ).toHaveLength(1)
})
it('decodes exact host observations without equating readiness to installation', async () => {
  const value = {
    ready: true,
    observation: {
      hostId: c,
      operationId: a,
      revision: 2,
      materialDigest: digest,
      processGeneration: a,
      tenantId: b,
      instanceId: c,
    },
  }
  expect(decodeReadiness(value).observation?.revision).toBe(2)
  expect(() => decodeReadiness({ ...value, installed: true })).toThrow()
  const f = transport(value)
  await createSettingsCatalog(f.client, f.client, 'platform').readiness()
  expect(f.calls[0]).toMatchObject({ path: '/readyz', method: 'GET' })
  const g = transport({ items: [], domains: [] })
  await createSettingsCatalog(g.client, g.client, 'platform').read()
  expect(g.calls[0]?.path).toBe('/api/v1/tenant-administration/settings/catalog')
})
it('distinguishes every Apple receipt and rejects secret or wrong-operation responses', async () => {
  const receipts = [
    {
      operationId: a,
      revision: 1,
      state: 'awaiting_certificate',
      keyId: b,
      csr: 'PUBLIC\nCSR',
      publicKeyDigest: digest,
    },
    {
      operationId: a,
      revision: 2,
      state: 'validated',
      keyId: b,
      certificateDigest: digest,
      expiresAt: 1,
    },
    { operationId: a, revision: 3, state: 'pending_application', desiredRevision: 2 },
    { operationId: a, revision: 4, state: 'revoked', materialRevision: 2 },
  ]
  for (const v of receipts) expect(appleReceipt(v).state).toBe(v.state)
  expect(() => appleReceipt({ ...receipts[0], privateKey: 'secret' })).toThrow()
  const directory = {
    revision: 2,
    desiredRevision: 2,
    versions: [
      {
        revision: 1,
        keyId: b,
        publicKeyDigest: digest,
        csr: 'PUBLIC',
        certificateChainPem: null,
        certificateDigest: null,
        topic: null,
        expiresAt: null,
        revoked: false,
      },
    ],
    runtimeObservation: 'separate',
    accountBindings: { renewal: 1 },
  }
  expect(appleDirectory(directory).versions).toHaveLength(1)
  expect(() => appleDirectory({ ...directory, runtimeObservation: 'applied' })).toThrow()
  const f = transport(receipts[0]),
    client = createAppleMaterials(f.client)
  await client.key(a, 'apns', {
    expectedRevision: 0,
    source: { kind: 'import', private_key_pem: 'private' },
  })
  expect(f.calls[0]).toMatchObject({
    body: { source: { private_key_pem: 'private' } },
    headers: { 'Idempotency-Key': a },
  })
  await client.operation(a)
  await expect(client.operation(c)).rejects.toThrow('operation')
  for (const [method, input] of [
    ['certificate', { expectedRevision: 0, keyRevision: 1, certificateChainPem: 'PUBLIC' }],
    ['apply', { expectedRevision: 0, materialRevision: 1, accountAlias: null }],
    ['revoke', { expectedRevision: 0, materialRevision: 1 }],
  ] as const)
    await client[method](a, 'apns', input as never)
  const g = transport(directory)
  await createAppleMaterials(g.client).read('profile')
})
it('preserves provider-specific states, qualification times and WNS tagged operations', async () => {
  expect(storageReceipt(storage).state).toBe('rejected')
  expect(mailReceipt(mail).state).toBe('unknown')
  expect(wnsReceipt(wns).qualifiedAt).toBeNull()
  expect(() => storageReceipt({ ...storage, state: 'failed' })).toThrow()
  expect(() => mailReceipt({ ...mail, password: 'secret' })).toThrow()
  expect(
    wnsOperation({
      kind: 'revocation',
      receipt: { operationId: a, revision: 2, materialRevision: 1 },
    }).kind,
  ).toBe('revocation')
  const s = transport(storage),
    storageClient = createStorageClient(s.client)
  await storageClient.save(a, {
    expectedRevision: 0,
    profile: 'approved',
    source: { kind: 'generate' },
  })
  await storageClient.operation(a)
  await expect(storageClient.operation(c)).rejects.toThrow()
  const m = transport(mail),
    mailClient = createMailClient(m.client)
  await mailClient.save(a, {
    expectedRevision: 0,
    profile: 'approved',
    sender: 'a@b.test',
    recipient: 'c@b.test',
    username: 'user',
    password: 'password',
  })
  await mailClient.operation(a)
  const w = transport({ kind: 'material', receipt: wns }),
    wnsClient = createWnsClient(w.client)
  await wnsClient.save(a, {
    expectedRevision: 0,
    packageFamilyName: 'RSS',
    sid: 'sid',
    clientSecret: 'secret',
  })
  await wnsClient.operation(a)
  await wnsClient.revoke(a, { expectedRevision: 1, materialRevision: 1 })
  await expect(wnsClient.operation(c)).rejects.toThrow()
  for (const [kind, value, client] of [
    ['storage', { revision: 1, desiredRevision: null, versions: [storage] }, createStorageClient],
    ['mail', { revision: 1, selectedRevision: 1, versions: [mail] }, createMailClient],
    ['wns', { revision: 1, desiredRevision: null, versions: [wns] }, createWnsClient],
  ] as const) {
    const f = transport(value)
    expect((await client(f.client).read()).revision, kind).toBe(1)
  }
})
it('binds Webhook configuration, direct transitions and original query paths', async () => {
  const f = transport(material),
    client = createWebhookMaterials(f.client)
  await client.prepare(a, {
    reference: 'events',
    expectedRevision: 0,
    configurationSha256: digest,
    endpoint: 'https://receiver.test/hook',
    networkReference: 'approved',
    source: { kind: 'generate' },
  })
  await client.operation(a)
  await expect(client.operation(b)).rejects.toThrow()
  expect(f.calls[1]?.path).toBe('/api/v1/webhooks/materials/operations/{id}')
  expect(webhookOperation({ operationId: a, ...head }).revision).toBe(1)
  const g = transport({ operationId: a, ...head })
  await createWebhookMaterials(g.client).transition(a, {
    reference: 'events',
    expectedRevision: 1,
    action: { kind: 'retire_previous' },
  })
  const d = transport({
    configurationSha256: digest,
    keys: { heads: [head], materials: [material] },
  })
  expect((await createWebhookMaterials(d.client).read()).materials[0]?.confirmed).toBe(false)
})
it('keeps provisioning pending and binds metadata and administrator receipts to the target', async () => {
  expect(provisionReceipt(provision).result.blocked).toBe('capacity')
  expect(() => provisionReceipt({ ...provision, operationId: b })).toThrow()
  expect(tenant(t).management).toBe(false)
  expect(() => tenant({ ...t, session: 'secret' })).toThrow()
  const f = transport(provision),
    client = createPlatformClient(f.client)
  await client.provision(a, {
    name: 'Team',
    administratorLogin: 'admin',
    administratorPassword: 'secret',
  })
  expect(f.calls[0]?.successStatus).toEqual([200, 202])
  await client.operation(a)
  const d = transport({ items: [t] })
  await createPlatformClient(d.client).tenants()
  const p = transport({ items: [provision], nextAfter: null })
  await createPlatformClient(p.client).provisionings()
  const u = transport({ operationId: a, action: 'update', result: t })
  await createPlatformClient(u.client).update(b, a, 1, { name: 'Changed', notes: null })
  await createPlatformClient(u.client).registryOperation(a)
  const r = transport({ operationId: a, action: 'delete', result: t })
  await createPlatformClient(r.client).remove(b, a, 1)
  const admin = {
    operationId: a,
    action: 'administrator_create',
    result: { tenantId: b, principalId: c, login: 'admin', ruleId: a, ruleRevision: 1 },
  }
  expect(registryReceipt(admin).action).toBe('administrator_create')
  const x = transport(admin)
  await createPlatformClient(x.client).administrator(b, a, { login: 'admin', password: 'secret' })
  await expect(
    createPlatformClient(x.client).administrator(c, a, { login: 'admin', password: 'secret' }),
  ).rejects.toThrow()
})
it('checks task/PKI tenant bindings and current-generation installation observations', async () => {
  expect(taskTrust(task, b).keys[0]?.state).toBe('active')
  expect(() => taskTrust(task, a)).toThrow()
  expect(() => taskTrust({ ...task, keys: [] }, b)).toThrow()
  const f = transport(task),
    client = createTaskTrustClient(f.client, b, c)
  await client.read()
  await client.operation(a)
  await client.change(a, { action: 'prepare', expectedRevision: 0 })
  expect(installationObservation(null)).toBeNull()
  const observation = {
    observation: {
      operation: a,
      version: 1,
      registration: c,
      generation: 2,
      sequence: 1,
      target_revision: 3,
      target_digest: digest,
      actual_revision: null,
      actual_digest: null,
      state: 'unknown',
      reason: null,
      observed_at: 1,
    },
    received_at: 2,
  }
  expect(installationObservation(observation)?.observation.generation).toBe(2)
  expect(() =>
    installationObservation({
      ...observation,
      observation: { ...observation.observation, actual_digest: digest },
    }),
  ).toThrow()
  const o = transport(observation)
  await createTaskTrustClient(o.client, b, c).observation('device-a')
  await createPkiClient(o.client, b, c).observation('device-a')
  const trust = pkiTrust(pki, b, 'agent')
  expect(() => pkiTrust(pki, b, 'apple')).toThrow()
  expect(() => pkiTrust({ ...pki, issuers: [] }, b, 'agent')).toThrow()
  const q = transport({ operation: a, revision: 2, state: 'distributing' }),
    pkiClient = createPkiClient(q.client, b, c)
  await pkiClient.prepare(a, 'agent', 1, trust)
  await createPkiClient(
    transport({ operation: a, revision: 3, state: 'activated' }).client,
    b,
    c,
  ).transition(a, 'agent', 2, 'activate')
  await expect(pkiClient.transition(c, 'agent', 1, 'retire')).rejects.toThrow()
  expect(() => pkiReceipt({ operation: a, revision: 2, state: 'prepared' })).toThrow()
  const j = transport(pki)
  await createPkiClient(j.client, b, c).read('agent')
  const z = transport(undefined)
  await createPkiClient(z.client, b, c).publish(a, 'agent', [
    { issuer: digest, crl: 'YQ==', root_crl: 'YQ==' },
  ])
  expect(z.calls[0]?.successStatus).toBe(204)
  const recover = transport({ attempt: c, fingerprint: digest })
  await createPkiClient(recover.client, b, c).recover(a, c, ['YQ=='])
})
it('reads explicit runtime facts and never turns missing counts into zero', async () => {
  const snapshot = {
    alive: true,
    channels: [],
    ready: false,
    components: [
      {
        name: 'execution_recovery',
        readiness: 'not_ready',
        health: 'unknown',
        reasons: ['unobserved'],
        task: 'unknown',
        dependencies: [{ name: 'flow_storage', state: 'unavailable', reason: 'deadline' }],
        queues: [{ name: 'pending', count: null, truncated: null }],
        progress: {
          state: 'unobserved',
          confirmedPosition: null,
          sourceHead: null,
          lagging: null,
          invocationAgeMs: null,
          completedPassAgeMs: null,
          sourceObservationAgeMs: null,
          applied: null,
        },
        bridge: { successful: false, reason: 'deadline', observedAt: null },
        runner: {
          scan: null,
          unresolvedAttempts: 2,
          truncated: false,
          latestFailure: { stage: 'observe', reason: 'deadline', observedAt: null },
        },
        dispatch: { consumed: 0, watermark: 0 },
      },
    ],
  }
  expect(runtimeSnapshot(snapshot).components[0]?.queues[0]?.count).toBeNull()
  const f = transport(snapshot)
  await createRuntimeDiagnostics(f.client).read()
  expect(
    runtimeSnapshot({
      alive: true,
      channels: [],
      ready: true,
      components: [{ name: 'inventory', readiness: 'ready', health: 'healthy', reasons: [] }],
    }).components[0]?.runner,
  ).toBeNull()
  expect(() => runtimeSnapshot({ ...snapshot, secret: 'unsafe' })).toThrow()
})
it('reads formal Agent package metadata and withdraws with the same operation owner', async () => {
  const value = {
    releaseId: a,
    tenantId: b,
    target: { platform: 'windows', architecture: 'x86_64' },
    version: '1',
    format: 'windows_msi',
    filename: 'rss.msi',
    length: 100,
    installerSha256: Array(32).fill(1),
  }
  const f = transport({
    items: [{ ...value, state: 'published', ...value.target }],
    nextCursor: null,
  })
  expect((await createManagedPackages(f.client, b).list()).items.length).toBe(1)
  const w = transport(undefined)
  await createManagedPackages(w.client, b).withdraw(a, c)
  expect(w.calls[0]).toMatchObject({ successStatus: 204, body: { operationId: a } })
})

it('computes file comparison identity synchronously without retaining the input', async () => {
  const { inputDigest } = await import('./value')
  const value = inputDigest('abc')
  expect(typeof value).toBe('string')
  expect(value).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
it('does not manufacture a package operation receipt from a null result', async () => {
  const request = async (o: RequestOptions<unknown>) => o.decode(null)
  const client = createManagedPackages({ request } as unknown as HttpTransport, a)
  expect(await client.operation(b, 'publish', c)).toBeNull()
})

it('decodes current initialization and telemetry diagnostics without turning missing observations into success', () => {
  const current = {
    alive: true,
    channels: [],
    ready: false,
    components: [
      {
        name: 'initialization',
        readiness: 'not_ready',
        health: 'degraded',
        reasons: ['initialization_telemetry_backend'],
        queues: [{ name: 'initialization_telemetry_pending', count: null, truncated: null }],
      },
      {
        name: 'telemetry',
        readiness: 'not_applicable',
        health: 'unknown',
        reasons: ['unobserved'],
        dependencies: [{ name: 'telemetry_storage', state: 'unavailable' }],
      },
    ],
  }
  const decoded = runtimeSnapshot(current)
  expect(decoded.ready).toBe(false)
  expect(decoded.components[0]!.queues[0]!.count).toBeNull()
  expect(decoded.components[1]!.health).toBe('unknown')
})

it('requires current channel observations and keeps loaded material distinct from readiness', () => {
  const channel = {
    name: 'apple',
    state: 'degraded',
    reasons: ['trust_conflict'],
    mounted: false,
    loadedMaterials: { apns: 4 },
  }
  const value = { alive: true, ready: true, components: [], channels: [channel] }
  expect(runtimeSnapshot(value)).toMatchObject({ ready: true, channels: [channel] })
  expect(() => runtimeSnapshot({ alive: true, ready: true, components: [] })).toThrow()
  expect(() => runtimeSnapshot({ ...value, channels: [channel, channel] })).toThrow()
  for (const bad of [
    { ...channel, state: 'configured' },
    { ...channel, reasons: ['unknown_reason'] },
    { ...channel, loadedMaterials: { apns: -1 } },
    { ...channel, legacy: true },
  ]) {
    expect(() => runtimeSnapshot({ ...value, channels: [bad] })).toThrow()
  }
})

it('rejects retired task origin and PKI documents without stable identity', () => {
  const oldTask: Record<string, unknown> = { ...task }
  delete oldTask['service_id']
  expect(() => taskTrust({ ...oldTask, origin: 'https://mdm.test' }, b)).toThrow()
  const oldPki: Record<string, unknown> = { ...pki }
  delete oldPki['service_id']
  expect(() => pkiTrust(oldPki, b, 'agent')).toThrow()
})

it('decodes current audit source capacity and independent projector health without legacy defaults', () => {
  const backlog = {
    events: 80,
    sourceBytes: 800,
    reservedEvents: 1,
    reservedSourceBytes: 10,
    maxEvents: 100,
    maxSourceBytes: 1000,
    oldestSeconds: 301,
    warning: true,
    admissionClosed: false,
    reserveExhausted: false,
  }
  const source = {
    name: 'audit_source',
    readiness: 'ready',
    health: 'degraded',
    reasons: ['audit_backlog_warning'],
    auditBacklog: backlog,
  }
  const snapshot = (component: unknown) => ({
    alive: true,
    ready: true,
    channels: [],
    components: [
      component,
      {
        name: 'audit_projection',
        readiness: 'not_applicable',
        health: 'degraded',
        reasons: ['delivery_retrying'],
        task: 'running',
      },
    ],
  })
  expect(runtimeSnapshot(snapshot(source)).components).toMatchObject([
    { auditBacklog: backlog },
    {
      name: 'audit_projection',
      readiness: 'not_applicable',
      health: 'degraded',
      auditBacklog: null,
    },
  ])
  expect(
    runtimeSnapshot(
      snapshot({
        ...source,
        auditBacklog: {
          ...backlog,
          events: 0,
          sourceBytes: 0,
          reservedEvents: 0,
          reservedSourceBytes: 0,
          oldestSeconds: null,
          warning: false,
        },
      }),
    ).components[0]?.auditBacklog?.oldestSeconds,
  ).toBeNull()
  for (const invalid of [
    { ...backlog, events: -1 },
    { ...backlog, sourceBytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...backlog, oldestSeconds: '301' },
    { ...backlog, admissionClosed: 1 },
    { ...backlog, secret: 'unexpected' },
    { events: 0 },
    null,
  ])
    expect(() => runtimeSnapshot(snapshot({ ...source, auditBacklog: invalid }))).toThrow()
  expect(
    runtimeSnapshot(
      snapshot({
        ...source,
        readiness: 'not_ready',
        reasons: ['audit_backpressure', 'audit_reserve_exhausted'],
      }),
    ).components[0]?.reasons,
  ).toEqual(['audit_backpressure', 'audit_reserve_exhausted'])
})
