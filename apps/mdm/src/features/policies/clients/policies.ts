import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  count,
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
  policyDefinition,
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

const policyFields = {
  id: uuid,
  revision: count,
  version: count,
  versionId: uuid,
  state: (v: unknown) => enumeration(v, ['enabled', 'disabled', 'archived'] as const),
  definition: policyDefinition,
}
export type PolicyDirectoryQuery<F extends keyof typeof policyFields = keyof typeof policyFields> =
  DirectoryQuery<F>
function baseTargetFacts(v: Record<string, unknown>, lifecycle = false) {
  return {
    object: objectRef(v['object']),
    channel: lifecycle
      ? v['channel'] === null
        ? null
        : (() => {
            throw new Error('Lifecycle channel must be null')
          })()
      : enumeration(v['channel'], channels),
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
    capabilities: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/capabilities',
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['defaultSoftwareChannel', 'mdmSoftwareDistributionEnabled'])
          return {
            defaultSoftwareChannel: enumeration(v['defaultSoftwareChannel'], ['agent'] as const),
            mdmSoftwareDistributionEnabled: boolean(v['mdmSoftwareDistributionEnabled']),
          }
        },
      }),
    rerun: (id: string, operationId: string, expectedRevision: number, deadline: number) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/{id}/reruns',
        pathParams: { id },
        body: { operationId, expectedRevision, input: { deadline } },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['operationId', 'policyId', 'versionId', 'deadline'])
          if (
            v['operationId'] !== operationId ||
            v['policyId'] !== id ||
            v['deadline'] !== deadline
          )
            throw new Error('Wrong trigger receipt')
          return {
            operationId: uuid(v['operationId']),
            policyId: uuid(v['policyId']),
            versionId: uuid(v['versionId']),
            deadline,
          }
        },
      }),
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
              if (action.kind === 'unmanage_device') {
                if (d['target'] !== null || d['taskAdmission'] !== null)
                  throw new Error('Invalid lifecycle target')
                return {
                  ...baseTargetFacts(d, true),
                  taskAdmission: null,
                  eligibility: eligibility(d['eligibility']),
                }
              }
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
    assignments: (id: string, after?: string, lifecycle = false) =>
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
                ...(lifecycle
                  ? { ...baseTargetFacts(d, true), taskAdmission: null }
                  : targetFacts(d)),
                qualification: eligibility(d['qualification']),
                sources: array(d['sources'], deviceObject),
                scopeResult: lifecycle ? nullable(d['scopeResult'], uuid) : uuid(d['scopeResult']),
                operationIds: array(d['operationIds'], uuid),
              }
            }),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    list: <F extends keyof typeof policyFields = keyof typeof policyFields>(
      query: PolicyDirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies',
        query: queryParameters({
          limit: 20,
          ...query,
          fields: query.fields ?? Object.keys(policyFields),
        }),
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, policyFields, query.fields, ['id'])
          return page
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
