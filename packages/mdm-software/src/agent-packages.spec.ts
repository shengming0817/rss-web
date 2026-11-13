import { expect, it, vi } from 'vitest'
import {
  createAgentPackages,
  type AgentPackagesPort,
  type ManagedPackage,
  type SavedPackage,
} from './agent-packages'
const tenant = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
const publication: ManagedPackage = {
  tenantId: tenant,
  releaseId: id,
  target: { platform: 'windows', architecture: 'x86_64' },
  version: '1',
  format: 'windows_exe',
  filename: 'agent.exe',
  length: 1,
  installerSha256: Array<number>(32).fill(0),
  state: 'published',
  platform: 'windows',
  architecture: 'x86_64',
}
it('keeps original upload coordinates, immutable input and package ownership through save and publication', async () => {
  const prepare = vi.fn<AgentPackagesPort['prepare']>(async () => ({
      packageId: id,
      resource: id,
      upload: id,
      length: 1,
      offset: 0,
      complete: false,
      href: `/api/v1/resources/${id}/uploads/${id}`,
    })),
    save = vi.fn(async () => ({ packageId: id }) as SavedPackage),
    publish = vi.fn(async () => publication),
    withdraw = vi.fn(async () => {})
  const port = {
    prepare,
    save,
    publish,
    withdraw,
    read: async () => publication,
    list: async () => ({ items: [publication], nextCursor: null }),
    inspect: async () => ({ packageId: id }),
    parse: async () => ({ packageId: id }),
    operation: async () => null,
  } as unknown as AgentPackagesPort
  const packages = createAgentPackages(port, tenant),
    original = {
      operationId: id,
      filename: 'agent.exe',
      length: 1,
      sha256: Array<number>(32).fill(0),
    }
  expect((await packages.prepare(original)).upload).toBe(id)
  expect(Object.isFrozen(prepare.mock.calls[0]?.[0])).toBe(true)
  expect((await packages.list()).items[0]).toEqual(publication)
  expect(await packages.read(id)).toEqual(publication)
  await packages.save({
    operationId: tenant,
    packageId: id,
    target: publication.target,
    version: '1',
    behavior: null,
  })
  expect(await packages.publish(tenant, id)).toEqual(publication)
  await packages.withdraw(tenant, id)
  expect(withdraw).toHaveBeenCalledWith(tenant, id)
  expect(await packages.operation(id)).toBeNull()
  await packages.inspect(id)
  await packages.parse(id)
  await expect(createAgentPackages(port, id).read(id)).rejects.toThrow('tenant')
  prepare.mockResolvedValueOnce({ ...(await port.prepare(original)), upload: tenant })
  await expect(packages.prepare(original)).rejects.toThrow('binding')
  await expect(packages.prepare({ ...original, filename: '../agent.exe' })).rejects.toThrow(
    'preparation',
  )
})
