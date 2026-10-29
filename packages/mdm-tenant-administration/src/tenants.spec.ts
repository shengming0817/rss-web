import { expect, it, vi } from 'vitest'
import {
  createTenantAdministration,
  prepareUpdate,
  provisioningEntry,
  provisioningState,
  type TenantAdministrationPort,
  type Tenant,
  type Provisioning,
} from './index'
const tenantId = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
const tenant: Tenant = {
  tenantId,
  name: 'Business',
  notes: null,
  management: false,
  initialEpoch: 1,
  currentEpoch: 1,
  revision: 4,
  deletable: true,
}
const progress: Provisioning = {
  operationId,
  tenantId,
  administratorId: null,
  hostId: tenantId,
  revision: 1,
  phase: 'reserved',
  blocked: null,
  origin: null,
  application: null,
}
it('does not turn a registered operation, administrator or pending host into an enabled tenant entry', () => {
  expect(provisioningState(progress)).toBe('needs_credentials')
  expect(provisioningEntry(progress)).toBeNull()
  const waiting = {
    ...progress,
    administratorId: operationId,
    phase: 'host_pending' as const,
    origin: 'https://tenant.example',
  }
  expect(provisioningState(waiting)).toBe('waiting_for_host')
  expect(provisioningEntry(waiting)).toBeNull()
  expect(provisioningEntry({ ...waiting, phase: 'enabled' })).toBe('https://tenant.example')
  expect(provisioningEntry({ ...waiting, phase: 'enabled', blocked: 'outcome_unknown' })).toBeNull()
})
it('uses full tenant detail revision, forbids management edits and deletion of used tenants', async () => {
  expect(() => prepareUpdate(operationId, { ...tenant, management: true }, 'New', null)).toThrow()
  const input = prepareUpdate(operationId, tenant, '新'.repeat(128), null)
  expect(input.expectedRevision).toBe(4)
  expect(() => prepareUpdate(operationId, tenant, 'x'.repeat(129), null)).toThrow()
  const remove = vi.fn()
  const client = createTenantAdministration({ remove } as unknown as TenantAdministrationPort)
  await expect(client.remove({ ...tenant, deletable: false }, operationId)).rejects.toThrow()
  expect(remove).not.toHaveBeenCalled()
})
it('submits provisioning exactly once per explicit call and keeps credentials out of its public intent', async () => {
  const provision = vi.fn(async () => {
    throw new Error('Lost response')
  })
  const client = createTenantAdministration({ provision } as unknown as TenantAdministrationPort)
  const intent = { operationId, name: 'New', administratorLogin: 'admin' }
  await expect(client.provision(intent, 'disposable secret')).rejects.toThrow('Lost response')
  expect(provision).toHaveBeenCalledTimes(1)
  expect(intent).toEqual({ operationId, name: 'New', administratorLogin: 'admin' })
  await expect(client.provision(intent, 'disposable secret')).rejects.toThrow()
  expect(provision).toHaveBeenCalledTimes(2)
  expect(provision.mock.calls[0]).toEqual(provision.mock.calls[1])
})
it('rejects historical or foreign receipts instead of claiming current operation success', async () => {
  const update = vi.fn(async () => ({
    operationId,
    action: 'update',
    result: { ...tenant, revision: 4 },
  }))
  const client = createTenantAdministration({ update } as unknown as TenantAdministrationPort)
  await expect(client.update(prepareUpdate(operationId, tenant, 'New', null))).rejects.toThrow(
    'revision',
  )
})
