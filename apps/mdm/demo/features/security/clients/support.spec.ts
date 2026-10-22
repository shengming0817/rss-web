import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { supportRecord, supportTarget } from './support-model'
import { createSupportClient } from './support'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  source = { registrationId: other, generation: 1, source: 'agent.builtin' },
  target = { kind: 'remote_support', device: 'device-01', contextRevision: 1, mode: 'view' },
  support = {
    request: id,
    requester: other,
    target,
    source,
    action: other,
    details: {
      kind: 'remote_support',
      attempt: id,
      helper: other,
      mode: 'view',
      consent: { state: 'granted', at: 99, validUntil: 200 },
      session: { state: 'active', startedAt: 100, endedAt: null },
    },
  },
  envelope = { contract: 'security-v1', tenantId: id, source: 'mock', asOf: 100 }
it('binds consent to the exact attempt, helper and mode and requires an execution for connection evidence', () => {
  expect(supportRecord(support).request).toBe(id)
  for (const details of [
    { ...support.details, helper: id },
    { ...support.details, attempt: other },
    { ...support.details, mode: 'control' },
  ])
    expect(() => supportRecord({ ...support, details })).toThrow()
  expect(() => supportRecord({ ...support, action: null })).toThrow()
  expect(() => supportRecord({ ...support, source: null })).toThrow()
  expect(() =>
    supportRecord({
      ...support,
      details: { ...support.details, consent: { state: 'denied', at: 99, validUntil: null } },
    }),
  ).toThrow()
  expect(() =>
    supportTarget({
      kind: 'diagnostics',
      device: 'device-01',
      contextRevision: 1,
      artifacts: ['raw_shell'],
      retentionSeconds: 60,
    }),
  ).toThrow()
  expect(() =>
    supportTarget({
      kind: 'diagnostics',
      device: 'device-01',
      contextRevision: 1,
      artifacts: ['system_events'],
      retentionSeconds: 604801,
    }),
  ).toThrow()
})
it('checks support device/request identity, source and observation time before displaying evidence', async () => {
  let reply: unknown = { ...envelope, support }
  const transport = {
      request: vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    } as unknown as HttpTransport,
    client = createSupportClient(transport, id, true)
  await expect(client.read(id)).resolves.toMatchObject({ support: { request: id } })
  await expect(client.read(other)).rejects.toThrow()
  reply = { ...envelope, asOf: 98, support }
  await expect(client.read(id)).rejects.toThrow()
  reply = {
    ...envelope,
    context: {
      device: 'device-01',
      revision: 1,
      platform: 'windows',
      source,
      capabilities: { elevation: true, diagnostics: true, remoteModes: ['view'] },
      accounts: [],
      programs: [],
      evaluatedAt: 100,
    },
  }
  await expect(client.context('device-02')).rejects.toThrow()
  await expect(createSupportClient(transport, id, false).context('device-01')).rejects.toThrow()
})

it('binds diagnostic availability to the approved retention from collection time', () => {
  const diagnostics = {
    ...support,
    target: {
      kind: 'diagnostics',
      device: 'device-01',
      contextRevision: 1,
      artifacts: ['system_events'],
      retentionSeconds: 86400,
    },
    details: {
      kind: 'diagnostics',
      state: 'ready',
      collection: { at: 100, artifacts: [{ kind: 'system_events', records: 5, bytes: 1024 }] },
      uploadedAt: 101,
      scan: { state: 'clean', at: 102 },
      availableUntil: 86500,
    },
  }
  expect(supportRecord(diagnostics).details.kind).toBe('diagnostics')
  for (const availableUntil of [null, 86499, 86501, 864100])
    expect(() =>
      supportRecord({ ...diagnostics, details: { ...diagnostics.details, availableUntil } }),
    ).toThrow()
  expect(() =>
    supportRecord({
      ...diagnostics,
      action: null,
      details: {
        kind: 'diagnostics',
        state: 'not_collected',
        collection: null,
        uploadedAt: null,
        scan: { state: 'not_scanned', at: null },
        availableUntil: 86500,
      },
    }),
  ).toThrow()
  expect(() =>
    supportRecord({
      ...diagnostics,
      details: {
        ...diagnostics.details,
        collection: { ...diagnostics.details.collection, at: Number.MAX_SAFE_INTEGER },
        availableUntil: Number.MAX_SAFE_INTEGER,
      },
    }),
  ).toThrow()
})
