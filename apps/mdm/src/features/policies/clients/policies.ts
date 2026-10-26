import { decodeCapability, decodeSelector, toolName, type CapabilitySelector } from './addressing'
import {
  queryParameters,
  windowParameters,
  nextCursor,
  type WindowQuery,
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
  policyName,
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
  toolName,
  alias: (v: unknown) => nullable(v, policyName),
  customEvent: (v: unknown) => nullable(v, policyName),
  revision: count,
  version: count,
  versionId: uuid,
  state: (v: unknown) => enumeration(v, ['enabled', 'disabled', 'archived'] as const),
  definition: policyDefinition,
}
export type PolicyDirectoryQuery<F extends keyof typeof policyFields = keyof typeof policyFields> =
  DirectoryQuery<F>
export interface PreviewInput {
  definition: PolicyDefinition
  scopeResult?: string
}
function baseTargetFacts(v: Record<string, unknown>) {
  return {
    object: objectRef(v['object']),
    channel: nullable(v['channel'], (v) => enumeration(v, channels)),
    availability: enumeration(v['availability'], ['ready', 'unavailable'] as const),
    reason: nullable(v['reason'], string),
    target: nullable(v['target'], primaryRegistration),
    taskAdmission: nullable(v['taskAdmission'], taskAdmission),
  }
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
    preview: (input: PreviewInput, page: WindowQuery = {}) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/previews',
        body: input,
        query: windowParameters({ limit: 20, ...page }, 1000),
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
            basis(action) !== basis(policyAction(input.definition.action)) ||
            (input.scopeResult && result !== input.scopeResult)
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
                'taskAdmission',
              ])
              if (
                action.kind === 'unmanage_device' &&
                (d['channel'] !== null || d['target'] !== null || d['taskAdmission'] !== null)
              )
                throw new Error('Invalid lifecycle target')
              return { ...baseTargetFacts(d), eligibility: eligibility(d['eligibility']) }
            }),
            nextCursor: nextCursor(v['nextCursor']),
          }
        },
      }),
    assignments: (id: string, page: WindowQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/policies/{id}/assignments',
        pathParams: { id },
        query: windowParameters({ limit: 20, ...page }, 1000),
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
                ...baseTargetFacts(d),
                qualification: eligibility(d['qualification']),
                sources: array(d['sources'], deviceObject),
                scopeResult: nullable(d['scopeResult'], uuid),
                operationIds: array(d['operationIds'], uuid),
              }
            }),
            nextCursor: nextCursor(v['nextCursor']),
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
          for (const row of page.items)
            if (
              'id' in row &&
              'toolName' in row &&
              row.toolName !== `policy_${String(row.id).replaceAll('-', '')}`
            )
              throw new Error('Wrong tool identity')
          return page
        },
      }),
    resolve: (selector: CapabilitySelector) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/policies/resolve',
        body: decodeSelector(selector),
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['capability', 'policy'])
          const policy = decodePolicy(v['policy']),
            capability = decodeCapability(v['capability'])
          if (
            capability.id !== policy.id ||
            capability.revision !== policy.revision ||
            capability.version !== policy.versionId ||
            capability.alias !== policy.definition.alias ||
            policy.state === 'archived' ||
            (selector.kind === 'id' && selector.id !== policy.id) ||
            (selector.kind === 'tool_name' && selector.name !== capability.toolName) ||
            (selector.kind === 'alias' && policyName(selector.alias) !== capability.alias)
          )
            throw new Error('Wrong resolved Policy')
          return { capability, policy }
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
