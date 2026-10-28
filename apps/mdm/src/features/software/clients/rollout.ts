import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, integer, nullable, uuid } from '../../../services/decode'
export function createRolloutClient(transport: HttpTransport) {
  return {
    read: (id: string) =>
      api.getApiV1PoliciesByIdSoftwareRollout(transport, { pathParams: { id } }, (value) => {
        const v = value
        if (v['policyId'] !== id) throw new Error('Wrong rollout')
        return {
          policyId: id,
          versionId: uuid(v['versionId']),
          paused: v['paused'],
          asOf: count(v['asOf']),
          stages: array(v['stages'], (value) => {
            const s = value
            return {
              ready: s['ready'],
              asOf: nullable(s['asOf'], integer),
              scope: uuid(s['scope']),
              opensAt: count(s['opensAt']),
              minimumVerifiedPercent: nullable(s['minimumVerifiedPercent'], count),
              open: s['open'],
              totalTargets: count(s['totalTargets']),
              reported: count(s['reported']),
              unknown: count(s['unknown']),
              waitingUser: count(s['waitingUser']),
              waitingReboot: count(s['waitingReboot']),
              failed: count(s['failed']),
              verifiedSuccess: count(s['verifiedSuccess']),
              unsupportedCapability: count(s['unsupportedCapability']),
            }
          }),
        }
      }),
  }
}

export type Rollout = Awaited<ReturnType<ReturnType<typeof createRolloutClient>['read']>>
export function rolloutStageState(rollout: Rollout, index: number) {
  const stage = rollout.stages[index]!
  if (rollout.paused) return 'paused'
  if (stage.open) return 'stageOpen'
  if (rollout.asOf < stage.opensAt) return 'waitingTime'
  const previous = rollout.stages[index - 1]
  if (stage.minimumVerifiedPercent !== null && previous) {
    if (!previous.ready || previous.totalTargets === 0) return 'waitingStatistics'
    if (previous.verifiedSuccess * 100 < previous.totalTargets * stage.minimumVerifiedPercent)
      return 'thresholdNotMet'
  }
  return 'stageClosed'
}
