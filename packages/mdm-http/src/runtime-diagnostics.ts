import type { DiagnosticsPort } from '@rss/mdm-runtime-diagnostics'
import type { HttpTransport } from '@rss/api/mdm'
import { getApiV1RuntimeDiagnostics } from '@rss/api/mdm-operations'
/** Generated current contract validation precedes this presentation projection. */
export function createRuntimeDiagnosticsAdapter(transport: HttpTransport): DiagnosticsPort {
  return {
    snapshot: (signal) =>
      getApiV1RuntimeDiagnostics(transport, { ...(signal ? { signal } : {}) }, (value) => ({
        alive: value.alive,
        ready: value.ready,
        channels: value.channels,
        firstUse: value.firstUse ?? null,
        components: value.components.map((component) => ({
          ...component,
          phases: component.phases ?? [],
          dependencies: component.dependencies ?? [],
          queues: component.queues ?? [],
          task: component.task ?? null,
          progress: component.progress ?? null,
          runner: component.runner ?? null,
          dispatch: component.dispatch ?? null,
        })),
      })),
  }
}
