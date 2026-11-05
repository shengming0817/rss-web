import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createTenantSetup } from '@rss/mdm-tenant-setup'
import { createCatalogAdapter, createTenantSetupAdapter } from './tenant-setup'
import { createRuntimeDiagnosticsAdapter } from './runtime-diagnostics'
const tenant = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222'
const selection = { channels: ['agent'] as const, capabilities: {}, completionRequested: false }
const progress = {
  tenantId: tenant,
  saved: { revision: 0, intent: selection },
  steps: [{ id: 'agent', status: 'unknown', reason: null, evidence: [] }],
  canComplete: false,
  complete: false,
}
function fixture(reply: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply)),
    transport = { request } as unknown as HttpTransport
  return {
    request,
    transport,
    setup: createTenantSetup(createTenantSetupAdapter(transport, tenant), tenant),
  }
}
it('uses the real first-use operation, tenant binding and current progress states', async () => {
  const f = fixture(progress)
  expect((await f.setup.read()).steps[0]?.status).toBe('unknown')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'GET', path: '/api/v1/settings/first-use' }),
  )
  await expect(fixture({ ...progress, tenantId: operationId }).setup.read()).rejects.toThrow()
  await expect(
    fixture({ ...progress, steps: [{ ...progress.steps[0], status: 'success' }] }).setup.read(),
  ).rejects.toThrow()
  await expect(
    fixture({ ...progress, steps: [...progress.steps, ...progress.steps] }).setup.read(),
  ).rejects.toThrow()
})
it('binds generated writes and operation receipts to exact UUID, CAS and frozen intent', async () => {
  const f = fixture({ operationId, saved: { revision: 1, intent: selection } }),
    command = f.setup.prepare(operationId, 0, selection)
  await f.setup.submit(command)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'PUT',
      path: '/api/v1/settings/first-use',
      headers: expect.objectContaining({ 'Idempotency-Key': operationId }),
      body: { expectedRevision: 0, intent: selection },
    }),
  )
  await f.setup.operation(operationId)
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/v1/settings/first-use/operations/{id}',
      pathParams: { id: operationId },
    }),
  )
})
it('uses separate permission-filtered business and platform catalog operations', async () => {
  const f = fixture({ items: [], domains: [{ id: 'policies', href: 'https://untrusted.invalid' }] })
  expect((await f.setup.catalog()).domains[0]?.href).toBe('https://untrusted.invalid')
  await createCatalogAdapter(f.transport, true)()
  expect(f.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/v1/tenant-administration/settings/catalog' }),
  )
})
it('refuses the retired aggregated runtime endpoint rather than presenting it as owner health', async () => {
  await expect(createRuntimeDiagnosticsAdapter().snapshot()).rejects.toMatchObject({
    code: 'diagnostics_contract_unavailable',
  })
})
