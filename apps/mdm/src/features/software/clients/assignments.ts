import { createPoliciesClient } from '../../policies/clients/policies'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { array, boolean, closed, count, nullable, uuid } from '../../../services/decode'
import { softwarePolicy, type SoftwarePolicyDefinition } from './assignment-model'
export type AssignmentChange =
  | { action: 'put'; enabled: boolean; definition: SoftwarePolicyDefinition }
  | { action: 'enable' | 'disable' }
export function createAssignmentsClient(transport: HttpTransport) {
  const policies = createPoliciesClient(transport)
  return {
    list: async (after?: string) => {
      const page = await policies.list(after, 'software')
      return { ...page, items: page.items.map((p) => softwarePolicy(p)) }
    },
    read: async (id: string) => softwarePolicy(await policies.read(id), id),
    change: async (id: string, body: Operation<AssignmentChange>) =>
      softwarePolicy(await policies.change(id, body), id),
    preview: policies.preview,
    devices: policies.devices,
    rollout: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}/software/rollout',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['policyId', 'versionId', 'paused', 'asOf', 'stages'])
          if (v['policyId'] !== id) throw new Error('Wrong rollout')
          return {
            policyId: id,
            versionId: uuid(v['versionId']),
            paused: boolean(v['paused']),
            asOf: count(v['asOf']),
            stages: array(v['stages'], (value) => {
              const s = closed(value, [
                'scope',
                'opensAt',
                'minimumVerifiedPercent',
                'open',
                'totalTargets',
                'reported',
                'unknown',
                'waitingUser',
                'waitingReboot',
                'failed',
                'verifiedSuccess',
                'unsupportedCapability',
              ])
              return {
                scope: uuid(s['scope']),
                opensAt: count(s['opensAt']),
                minimumVerifiedPercent: nullable(s['minimumVerifiedPercent'], count),
                open: boolean(s['open']),
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
        },
      }),
  }
}
