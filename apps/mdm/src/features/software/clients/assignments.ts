import { createPoliciesClient } from '../../policies/clients/policies'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import {
  eligibility,
  softwarePolicy,
  taskAdmission,
  type SoftwarePolicyDefinition,
} from './assignment-model'
import { resourceBinding } from '../../policies/clients/model'
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
    preview: (definition: SoftwarePolicyDefinition, after?: string, scopeResult?: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/previews',
        body: { definition, ...(after ? { after } : {}), ...(scopeResult ? { scopeResult } : {}) },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['resource', 'scopeResult', 'items', 'nextCursor']),
            resource = resourceBinding(v['resource']),
            result = uuid(v['scopeResult'])
          if (
            resource.id !== definition.action.resource.id ||
            resource.version !== definition.action.resource.version ||
            JSON.stringify(Object.entries(resource.variants).sort()) !==
              JSON.stringify(Object.entries(definition.action.resource.variants).sort()) ||
            (scopeResult && result !== scopeResult)
          )
            throw new Error('Wrong preview basis')
          return {
            resource,
            scopeResult: result,
            items: array(v['items'], (value) => {
              const d = closed(value, ['device', 'eligibility', 'taskAdmission'])
              return {
                device: identifier(d['device']),
                eligibility: eligibility(d['eligibility']),
                taskAdmission: nullable(d['taskAdmission'], taskAdmission),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    devices: (id: string, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}/devices',
        pathParams: { id },
        query: { after },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (value) => {
              const d = closed(value, [
                'device',
                'assignment',
                'taskAdmission',
                'operationId',
                'diagnosis',
              ])
              return {
                device: identifier(d['device']),
                assignment: enumeration(d['assignment'], [
                  'eligible',
                  'excluded',
                  'pending',
                ] as const),
                taskAdmission: nullable(d['taskAdmission'], taskAdmission),
                operationId: nullable(d['operationId'], uuid),
                diagnosis: nullable(d['diagnosis'], string),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
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
