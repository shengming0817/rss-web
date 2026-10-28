import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
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
import { count, array, nullable, uuid, string, enumeration } from '../../../services/decode'
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
function baseTargetFacts(
  v: Pick<
    api.postApiV1PoliciesPreviewsContract.Response.PreviewTarget,
    'object' | 'channel' | 'availability' | 'reason' | 'target' | 'taskAdmission'
  >,
) {
  return {
    object: objectRef(v['object']),
    channel: nullable(v['channel'], (v) => enumeration(v, channels)),
    availability: v['availability'],
    reason: nullable(v['reason'], string),
    target: nullable(v['target'], primaryRegistration),
    taskAdmission: nullable(v['taskAdmission'], taskAdmission),
  }
}
export function createPoliciesClient(transport: HttpTransport) {
  return {
    capabilities: () =>
      api.getApiV1PoliciesCapabilities(transport, {}, (value) => {
        const v = value
        return {
          defaultSoftwareChannel: v['defaultSoftwareChannel'],
          mdmSoftwareDistributionEnabled: v['mdmSoftwareDistributionEnabled'],
        }
      }),
    rerun: (id: string, operationId: string, expectedRevision: number, deadline: number) =>
      api.postApiV1PoliciesByIdReruns(
        transport,
        { pathParams: { id }, body: { operationId, expectedRevision, input: { deadline } } },
        (value) => {
          const v = value
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
      ),
    preview: (input: PreviewInput, page: WindowQuery = {}) =>
      api.postApiV1PoliciesPreviews(
        transport,
        { body: input, query: windowParameters({ limit: 20, ...page }, 1000) },
        (value) => {
          const v = value,
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
              if (!wireSchemas.postApiV1PoliciesPreviewsResponse.validatePreviewTarget(value))
                throw new Error('Invalid preview target')
              const d = value
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
      ),
    assignments: (id: string, page: WindowQuery = {}) =>
      api.getApiV1PoliciesByIdAssignments(
        transport,
        { pathParams: { id }, query: windowParameters({ limit: 20, ...page }, 1000) },
        (value) => {
          const v = value
          return {
            items: array(v['items'], (value) => {
              const d = value
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
      ),
    list: <F extends keyof typeof policyFields = keyof typeof policyFields>(
      query: PolicyDirectoryQuery<F> = {},
    ) =>
      api.getApiV1Policies(
        transport,
        {
          query: queryParameters({
            limit: 20,
            ...query,
            fields: query.fields ?? Object.keys(policyFields),
          }),
        },
        (value) => {
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
      ),
    resolve: (selector: CapabilitySelector) =>
      api.postApiV1PoliciesResolve(transport, { body: decodeSelector(selector) }, (value) => {
        const v = value
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
      }),
    read: (id: string) =>
      api.getApiV1PoliciesById(transport, { pathParams: { id } }, (v) => decodePolicy(v, id)),
    change: (id: string, body: Operation<PolicyChange>) => {
      const input = body.input
      const project = (v: unknown) => decodePolicy(v, id)
      if (input.action === 'archive')
        return api.deleteApiV1PoliciesById(
          transport,
          {
            pathParams: { id },
            body: { operationId: body.operationId, expectedRevision: body.expectedRevision },
          },
          project,
        )
      return api.postApiV1PoliciesById(
        transport,
        { pathParams: { id }, body: { ...body, input } },
        project,
      )
    },
  }
}
