import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAgentPackagesAdapter } from './agent-packages'
const id = '11111111-1111-4111-8111-111111111111'
it('requires the formal exact upload href before handing coordinates to Content', async () => {
  const value = {
    packageId: id,
    resource: id,
    upload: id,
    offset: 0,
    length: 4,
    complete: false,
    href: 'https://foreign.example/upload',
  }
  const transport = {
    request: async (input: RequestOptions<unknown>) => input.decode(value),
  } as unknown as HttpTransport
  const adapter = createAgentPackagesAdapter(transport),
    input = { operationId: id, filename: 'agent.exe', length: 4, sha256: Array<number>(32).fill(0) }
  await expect(adapter.prepare(input)).rejects.toThrow('href')
  value.href = `/api/v1/resources/${id}/uploads/${id}`
  expect((await adapter.prepare(input)).upload).toBe(id)
})
