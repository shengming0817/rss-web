import type { Snapshot } from '@rss/mdm-runtime-diagnostics'
/** Deliberately synthetic, candidate owner observations. Never a backend acceptance fixture. */
export function diagnosticScenario(scenario: string): Snapshot {
  return {
    source: 'mock',
    alive: true,
    ready: scenario === 'ready',
    channels: [
      {
        name: 'agent',
        state: scenario === 'ready' ? 'ready' : 'waiting',
        mounted: true,
        loadedMaterials: { agent: 7 },
        reasons: scenario === 'ready' ? [] : ['material_version_mismatch'],
      },
    ],
    components: [
      {
        owner: 'policy',
        readiness: 'ready',
        health: scenario === 'ready' ? 'healthy' : 'degraded',
        task: 'running',
        reasons: scenario === 'ready' ? [] : ['dependency_unavailable'],
        dependencies: [{ name: 'policy_storage', state: 'available' }],
        queues: [{ name: 'policy_changes', count: 3, truncated: true }],
        progress: {
          state: 'running',
          confirmedPosition: 10,
          sourceHead: 17,
          lagging: true,
          applied: 2,
        },
        recovery: null,
      },
      {
        owner: 'scope',
        readiness: 'not_applicable',
        health: scenario === 'unknown' ? 'unknown' : 'healthy',
        task: scenario === 'unknown' ? 'unknown' : 'running',
        reasons: [],
        dependencies: [],
        queues: [{ name: 'scope_recompute', count: null, truncated: null }],
        progress: {
          state: 'unobserved',
          confirmedPosition: null,
          sourceHead: null,
          lagging: null,
          applied: null,
        },
        recovery: null,
      },
      {
        owner: 'device_control',
        readiness: 'ready',
        health: 'degraded',
        task: 'failed',
        reasons: ['settlement_unknown'],
        dependencies: [],
        queues: [],
        progress: null,
        recovery: {
          unresolvedAttempts: 2,
          truncated: true,
          lastFailure: 'finish: settlement_unknown',
        },
      },
    ],
  }
}
