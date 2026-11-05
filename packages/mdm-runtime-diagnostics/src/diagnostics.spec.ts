import { expect, it } from 'vitest'
import { createRuntimeDiagnostics, queueText } from './index'
import type { Snapshot } from './model'
function snapshot(): Snapshot {
  return {
    source: 'mock',
    alive: true,
    ready: true,
    channels: [],
    components: [
      {
        owner: 'policy',
        health: 'degraded',
        readiness: 'ready',
        task: 'failed',
        reasons: [],
        dependencies: [],
        queues: [{ name: 'pending', count: null, truncated: null }],
        progress: null,
        recovery: null,
      },
    ],
  }
}
it('preserves readiness and degraded/unknown health independently', async () => {
  const value = snapshot(),
    result = await createRuntimeDiagnostics({ snapshot: async () => value }).snapshot()
  expect(result.ready).toBe(true)
  expect(result.components[0]?.health).toBe('degraded')
  expect(result.components[0]?.task).toBe('failed')
  expect(queueText(result.components[0]!.queues[0]!)).toBe('—')
  expect(queueText({ name: 'pending', count: 3, truncated: true })).toBe('≥3')
})
it('rejects duplicate owners, retired aggregates and unsafe observation counters', async () => {
  const value = snapshot()
  await expect(
    createRuntimeDiagnostics({
      snapshot: async () => ({ ...value, components: [...value.components, ...value.components] }),
    }).snapshot(),
  ).rejects.toThrow()
  await expect(
    createRuntimeDiagnostics({
      snapshot: async () => ({
        ...value,
        components: [{ ...value.components[0]!, owner: 'automation' as never }],
      }),
    }).snapshot(),
  ).rejects.toThrow()
  expect(() =>
    queueText({ name: 'pending', count: Number.MAX_SAFE_INTEGER + 1, truncated: false }),
  ).toThrow()
})
