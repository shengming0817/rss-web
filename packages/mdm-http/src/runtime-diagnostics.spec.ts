import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createRuntimeDiagnosticsAdapter } from './runtime-diagnostics'
it('reads current owner observations through the injected executor and preserves absent observations', async () => {
  const value = {
    alive: true,
    ready: false,
    channels: [],
    components: [
      {
        name: 'scope',
        mounted: false,
        health: 'unknown',
        readiness: 'not_applicable',
        reasons: [],
      },
    ],
    firstUse: { access: 'forbidden' },
  }
  const request = vi.fn(async (input: RequestOptions<unknown>) => input.decode(value)),
    adapter = createRuntimeDiagnosticsAdapter({ request } as unknown as HttpTransport)
  const controller = new AbortController(),
    snapshot = await adapter.snapshot(controller.signal)
  expect(snapshot.components[0]).toMatchObject({
    mounted: false,
    queues: [],
    progress: null,
    runner: null,
    dispatch: null,
  })
  expect(snapshot.firstUse).toEqual({ access: 'forbidden' })
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/api/v1/runtime/diagnostics', signal: controller.signal }),
  )
})
