export type * from './model'
export { owners } from './model'
import { owners } from './model'
import type { DiagnosticsPort, Queue } from './model'
function count(value: number | null) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0))
    throw new Error('Invalid observation coordinate')
}
function unique(keys: readonly string[]) {
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate diagnostic identity')
}
export function queueText(queue: Queue): string {
  count(queue.count)
  return queue.count === null ? '—' : `${queue.truncated === true ? '≥' : ''}${queue.count}`
}
/** This core never derives health from readiness, loaded materials or queue emptiness. */
export function createRuntimeDiagnostics(port: DiagnosticsPort) {
  return Object.freeze({
    async snapshot() {
      const result = await port.snapshot()
      unique(result.components.map((c) => c.owner))
      unique(result.channels.map((c) => c.name))
      for (const c of result.components) {
        if (!owners.includes(c.owner)) throw new Error('Unknown diagnostic owner')
        unique(c.queues.map((q) => q.name))
        unique(c.dependencies.map((d) => d.name))
        for (const q of c.queues) count(q.count)
        if (c.progress)
          for (const n of [c.progress.confirmedPosition, c.progress.sourceHead, c.progress.applied])
            count(n)
        if (c.recovery) count(c.recovery.unresolvedAttempts)
      }
      for (const c of result.channels) for (const n of Object.values(c.loadedMaterials)) count(n)
      return result
    },
  })
}
