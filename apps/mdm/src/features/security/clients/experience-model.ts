import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  unique,
} from '../../../services/decode'
import { boundedText } from './compliance-model'
import { securitySource } from './source'
export const experienceMetrics = [
  'boot_seconds_p95',
  'crashes_per_100_sessions',
  'disk_free_percent',
] as const
export function experience(value: unknown) {
  const v = closed(value, ['device', 'window', 'source', 'evaluatedAt', 'metrics']),
    w = closed(v['window'], ['from', 'until']),
    result = {
      device: identifier(v['device']),
      window: { from: count(w['from']), until: count(w['until']) },
      evaluatedAt: count(v['evaluatedAt']),
      source: nullable(v['source'], (value) => {
        const s = closed(value, ['provider', 'registration'])
        return {
          provider: boundedText(s['provider'], 128),
          registration: securitySource(s['registration']),
        }
      }),
      metrics: unique(
        array(v['metrics'], (value) => {
          const m = closed(value, [
              'metric',
              'value',
              'state',
              'sampleCount',
              'denominator',
              'unknownCount',
            ]),
            metric = enumeration(m['metric'], experienceMetrics),
            result = {
              metric,
              value: nullable(m['value'], (v) => {
                if (
                  typeof v !== 'number' ||
                  !Number.isFinite(v) ||
                  v < 0 ||
                  (metric === 'disk_free_percent' && v > 100)
                )
                  throw new Error('Invalid metric value')
                return v
              }),
              state: enumeration(m['state'], ['complete', 'incomplete', 'unknown'] as const),
              sampleCount: count(m['sampleCount']),
              denominator: nullable(m['denominator'], count),
              unknownCount: nullable(m['unknownCount'], count),
            }
          if (
            (result.state === 'unknown') !== (result.value === null) ||
            (result.denominator === null
              ? result.sampleCount !== 0 || result.unknownCount !== null
              : result.unknownCount === null ||
                result.sampleCount + result.unknownCount !== result.denominator) ||
            (result.state !== 'unknown' && (!result.sampleCount || !result.denominator)) ||
            (result.state === 'complete' && result.unknownCount !== 0) ||
            (result.state === 'incomplete' && !result.unknownCount)
          )
            throw new Error('Invalid metric coverage')
          return result
        }),
        (m) => m.metric,
      ),
    }
  if (
    result.window.until <= result.window.from ||
    result.window.until > result.evaluatedAt ||
    result.metrics.length !== experienceMetrics.length ||
    (!result.source && result.metrics.some((m) => m.state !== 'unknown')) ||
    (result.source && result.source.registration.source !== 'agent.builtin')
  )
    throw new Error('Invalid experience provenance')
  return result
}
export type Experience = ReturnType<typeof experience>
