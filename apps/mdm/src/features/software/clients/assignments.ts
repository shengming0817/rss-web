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
  record,
  string,
  uuid,
} from '../../../services/decode'
import {
  eligibility,
  resourceBinding,
  softwarePolicy,
  taskAdmission,
  type SoftwarePolicyDefinition,
} from './assignment-model'
export type AssignmentChange =
  | { action: 'put'; enabled: boolean; definition: SoftwarePolicyDefinition }
  | { action: 'enable' | 'disable' }
export function createAssignmentsClient(transport: HttpTransport) {
  return {
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies',
        query: { after },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (item) => {
              const kind = enumeration(
                record(record(record(item)['definition'])['behavior'])['kind'],
                ['software', 'execution', 'configuration'] as const,
              )
              return kind === 'software' ? softwarePolicy(item) : null
            }).filter((p) => p !== null),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => softwarePolicy(v, id),
      }),
    change: (id: string, body: Operation<AssignmentChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => softwarePolicy(v, id),
      }),
    preview: (definition: SoftwarePolicyDefinition, after?: string, scopeResult?: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/previews',
        body: { definition, ...(after ? { after } : {}), ...(scopeResult ? { scopeResult } : {}) },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['resource', 'scopeResult', 'items', 'nextCursor']),
            resource = resourceBinding(v['resource']),
            result = uuid(v['scopeResult'])
          if (
            resource.id !== definition.resource.id ||
            resource.version !== definition.resource.version ||
            JSON.stringify(Object.entries(resource.variants).sort()) !==
              JSON.stringify(Object.entries(definition.resource.variants).sort()) ||
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
        path: '/api/v2/policies/{id}/devices',
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
        path: '/api/v2/policies/{id}/software/rollout',
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
