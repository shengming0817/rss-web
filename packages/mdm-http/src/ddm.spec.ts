import { expect, it } from 'vitest'
import { createDeviceDeclarationsAdapter } from './device-declarations'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
const id = '11111111-1111-4111-8111-111111111111'
it('preserves declaration publication, native redaction and current registration availability', async () => {
  const value = {
    availability: 'no_current_registration',
    effect: 'unverified',
    compliance: 'unknown',
    items: [],
    nextCursor: null,
  }
  const transport = {
    request: async (input: RequestOptions<unknown>) => input.decode(value),
  } as unknown as HttpTransport
  const adapter = createDeviceDeclarationsAdapter(transport, id)
  expect(await adapter.declarations(id, null)).toEqual(value)
})
