import { expect, it, vi } from 'vitest'
import { agentIntent, createConnections } from './index'
import type { ConnectionConfiguration, ConnectionsPorts, Migration } from './model'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333',
  generation = '44444444-4444-4444-8444-444444444444'
function ports(value: Partial<ConnectionsPorts>): ConnectionsPorts {
  return {
    storage: {},
    mail: {},
    wns: {},
    apple: {},
    agent: {},
    evidence: {},
    ...value,
  } as ConnectionsPorts
}
const configuration: ConnectionConfiguration = {
  wireVersion: 1,
  tenantId: tenant,
  serviceId: service,
  revision: 3,
  preferredOrigin: 'https://b.example',
  origins: ['https://a.example', 'https://b.example'],
  keyId: 'public-key',
}
it('prepares canonical explicit connection authoring without collapsing save into publish', async () => {
  const save = vi.fn(async () => ({ configuration })),
    publish = vi.fn(),
    connection = createConnections(
      ports({ agent: { save, publish } as unknown as ConnectionsPorts['agent'] }),
      tenant,
      service,
    ),
    intent = agentIntent(operation, 2, 'https://b.example', [
      'https://b.example',
      'https://a.example',
    ])
  expect(intent.origins).toEqual(['https://a.example', 'https://b.example'])
  expect(Object.isFrozen(intent.origins)).toBe(true)
  expect((await connection.agent.save(intent)).configuration.revision).toBe(3)
  expect(publish).not.toHaveBeenCalled()
  expect(() => agentIntent(operation, 2, 'https://other.example', ['https://a.example'])).toThrow()
})
it('publishes the exact saved revision and rejects a foreign service receipt', async () => {
  const publish = vi.fn(async () => ({ configuration, signature: 'public-signature' })),
    connection = createConnections(
      ports({ agent: { publish } as unknown as ConnectionsPorts['agent'] }),
      tenant,
      service,
    )
  expect((await connection.agent.publish(operation, 3)).configuration.revision).toBe(3)
  expect(publish).toHaveBeenCalledWith(operation, 3)
  await expect(connection.agent.publish(operation, 2)).rejects.toThrow('Wrong published')
  const foreign = createConnections(
    ports({ agent: { publish } as unknown as ConnectionsPorts['agent'] }),
    tenant,
    generation,
  )
  await expect(foreign.agent.publish(operation, 3)).rejects.toThrow('Wrong published')
})
it('keeps the migration request bound to storage revision and target material without assuming cutover', async () => {
  const receipt: Migration = {
      operationId: operation,
      sourceGeneration: generation,
      targetGeneration: service,
      expectedStorageRevision: 9,
      targetRevision: 3,
      phase: 'requested',
      blockedReason: null,
      sourceObjects: 0,
      verifiedObjects: 0,
      verifiedBytes: 0,
      nextAction: 'run_maintenance',
      observedAt: null,
    },
    requestMigration = vi.fn(async () => receipt),
    connection = createConnections(
      ports({ storage: { requestMigration } as unknown as ConnectionsPorts['storage'] }),
      tenant,
      service,
    )
  const result = await connection.storage.requestMigration({
    operationId: operation,
    expectedStorageRevision: 9,
    targetRevision: 3,
  })
  expect(result.phase).toBe('requested')
  expect(result.observedAt).toBeNull()
  await expect(
    connection.storage.requestMigration({
      operationId: operation,
      expectedStorageRevision: 3,
      targetRevision: 3,
    }),
  ).rejects.toThrow('Wrong migration')
})
it('does not replay unknown private material and keeps the intent free of credentials', async () => {
  const save = vi.fn(async () => {
      throw { status: 503, code: 'operation_unknown' }
    }),
    connection = createConnections(
      ports({ storage: { save } as unknown as ConnectionsPorts['storage'] }),
      tenant,
      service,
    ),
    intent = connection.storage.prepare(operation, 2, 'production', {
      kind: 'import',
      access_key: 'test-access',
      secret_key: 'test-secret',
      session_token: null,
      expires_at: null,
    })
  expect(Object.keys(intent).sort()).toEqual([
    'expectedRevision',
    'operationId',
    'profile',
    'sourceKind',
  ])
  await expect(
    connection.storage.save(intent, {
      kind: 'import',
      access_key: 'test-access',
      secret_key: 'test-secret',
      session_token: null,
      expires_at: null,
    }),
  ).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(save).toHaveBeenCalledTimes(1)
})
it('rejects observation from another registration generation and fixed-target pagination drift', async () => {
  const agent = {
      observation: async () => ({
        targetRevision: 3,
        registration: generation,
        generation: 2,
        acknowledgement: null,
        receivedAt: null,
        failure: null,
      }),
      devices: async () => ({ targetRevision: 4, items: [], next: null }),
    } as unknown as ConnectionsPorts['agent'],
    connection = createConnections(ports({ agent }), tenant, service)
  await expect(
    connection.agent.observation('endpoint', { registrationId: generation, generation: 1 }),
  ).rejects.toThrow('Changed connection registration')
  await expect(connection.agent.devices(3)).rejects.toThrow('Wrong connection convergence target')
})
