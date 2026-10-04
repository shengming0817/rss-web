import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  nullable,
  uuid,
  identifier,
  string,
  enumeration,
} from '../../../services/decode'
import {
  decodePolicy,
  policyAction,
  eligibility,
  taskAdmission,
  type PolicyChange,
  type PolicyDefinition,
} from './model'
export function createPoliciesClient(transport: HttpTransport) {
  return {
    preview: (definition: PolicyDefinition, after?: string, scopeResult?: string) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/previews',
        body: { definition, ...(after ? { after } : {}), ...(scopeResult ? { scopeResult } : {}) },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['action', 'scopeResult', 'items', 'nextCursor']),
            action = policyAction(v['action']),
            result = uuid(v['scopeResult'])
          const basis = (value: unknown) =>
            JSON.stringify(value, (_key, v: unknown) =>
              v && typeof v === 'object' && !Array.isArray(v)
                ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
                : v,
            )
          if (
            basis(action) !== basis(policyAction(definition.action)) ||
            (scopeResult && result !== scopeResult)
          )
            throw new Error('Wrong preview basis')
          return {
            action,
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
                'operationIds',
                'diagnoses',
              ])
              return {
                device: identifier(d['device']),
                assignment: enumeration(d['assignment'], [
                  'eligible',
                  'excluded',
                  'pending',
                ] as const),
                taskAdmission: nullable(d['taskAdmission'], taskAdmission),
                operationIds: array(d['operationIds'], uuid),
                diagnoses: array(d['diagnoses'], string),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    list: (after?: string, action?: PolicyDefinition['action']['kind']) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies',
        query: { after, action, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (item) => decodePolicy(item)),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
    change: (id: string, body: Operation<PolicyChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
  }
}
