import type { DomainHandler } from '../scenario'
import type { SecuritySource } from '../../src/features/security/clients/source'
import {
  experience,
  experienceMetrics,
  type Experience,
} from '../../src/features/security/clients/experience-model'
import { identifier } from '../../src/services/decode'
import { error } from '../http'
import { candidate, queryKeys } from './http'
export function createExperienceDemo(
  now: () => number,
  source: (device: string) => SecuritySource | null | undefined,
) {
  const records = new Map<string, Experience>()
  const handle: DomainHandler = (request, scenario) => {
    const match =
      /^\/api\/v1\/mdm-candidate\/security\/support\/devices\/([^/]+)\/experience$/.exec(
        request.path,
      )
    if (!match) return
    if (scenario === 'denied') return error('permission_denied', 403)
    try {
      if (request.method !== 'GET') return error('malformed_request', 400)
      queryKeys(request.query, [])
      const device = identifier(match[1]),
        s = source(device)
      if (s === undefined) return error('device_not_found', 404)
      let value = records.get(device)
      const missing = () =>
        experienceMetrics.map((metric) => ({
          metric,
          state: 'unknown',
          sampleCount: 0,
          denominator: null,
          unknownCount: null,
          value: null,
        }))
      if (!value) {
        const at = now()
        value = experience({
          device,
          window: { from: Math.max(0, at - 86400), until: at },
          evaluatedAt: at,
          source: s ? { provider: 'RSS synthetic telemetry v1', registration: s } : null,
          metrics: s
            ? [
                {
                  metric: 'boot_seconds_p95',
                  state: 'incomplete',
                  sampleCount: 8,
                  denominator: 10,
                  unknownCount: 2,
                  value: 42,
                },
                {
                  metric: 'crashes_per_100_sessions',
                  state: 'complete',
                  sampleCount: 20,
                  denominator: 20,
                  unknownCount: 0,
                  value: 5,
                },
                {
                  metric: 'disk_free_percent',
                  state: 'incomplete',
                  sampleCount: 4,
                  denominator: 5,
                  unknownCount: 1,
                  value: 32,
                },
              ]
            : missing(),
        })
        records.set(device, value)
      }
      const current = structuredClone(value)
      if (
        ['empty', 'unsupported'].includes(scenario) ||
        !s ||
        JSON.stringify(s) !== JSON.stringify(current.source?.registration)
      ) {
        current.source = null
        current.metrics = experience({ ...current, metrics: missing() }).metrics
        current.evaluatedAt = now()
      }
      return candidate({ experience: current, asOf: now() })
    } catch {
      return error('malformed_request', 400)
    }
  }
  return {
    handle,
    reset() {
      records.clear()
    },
  }
}
