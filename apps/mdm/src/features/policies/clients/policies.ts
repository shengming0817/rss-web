import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  nullable,
  uuid,
  string,
  enumeration,
  boolean,
} from '../../../services/decode'
import {
  decodePolicy,
  policyAction,
  eligibility,
  taskAdmission,
  type PolicyChange,
  type PolicyDefinition,
} from './model'
import {
  objectRef,
  channels,
  primaryRegistration,
  deviceObject,
} from '../../devices/clients/objects'

function baseTargetFacts(v: Record<string, unknown>) {
  return {
    object: objectRef(v['object']),
    channel: enumeration(v['channel'], channels),
    availability: enumeration(v['availability'], ['ready', 'unavailable'] as const),
    reason: nullable(v['reason'], string),
    target: nullable(v['target'], primaryRegistration),
  }
}
function targetFacts(v: Record<string, unknown>) {
  return { ...baseTargetFacts(v), taskAdmission: nullable(v['taskAdmission'], taskAdmission) }
}
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
              const d = closed(value, [
                'object',
                'channel',
                'availability',
                'reason',
                'target',
                'eligibility',
                ...(action.kind === 'telemetry_profile'
                  ? ['collectionSupported']
                  : ['taskAdmission']),
              ])
              return action.kind === 'telemetry_profile'
                ? {
                    ...baseTargetFacts(d),
                    taskAdmission: null,
                    collectionSupported: nullable(d['collectionSupported'], boolean),
                    eligibility: eligibility(d['eligibility']),
                  }
                : {
                    ...targetFacts(d),

                    eligibility: eligibility(d['eligibility']),
                  }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    assignments: (id: string, after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}/assignments',
        pathParams: { id },
        query: { after },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (value) => {
              const d = closed(value, [
                'object',
                'channel',
                'availability',
                'reason',
                'target',
                'qualification',
                'sources',
                'scopeResult',
                'taskAdmission',
                'operationIds',
              ])
              return {
                ...targetFacts(d),
                qualification: eligibility(d['qualification']),
                sources: array(d['sources'], deviceObject),
                scopeResult: uuid(d['scopeResult']),
                operationIds: array(d['operationIds'], uuid),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    list: (cursor?: string, action?: PolicyDefinition['action']['kind'], resource?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies',
        query: { cursor, action, resource, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (item) => decodePolicy(item)),
            nextCursor: nullable(v['nextCursor'], string),
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
        method: body.input.action === 'archive' ? 'DELETE' : 'POST',
        path: '/api/v1/policies/{id}',
        pathParams: { id },
        body:
          body.input.action === 'archive'
            ? { operationId: body.operationId, expectedRevision: body.expectedRevision }
            : body,
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
  }
}
