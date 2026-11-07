import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { validatePolicyDefinition } from '@rss/api/mdm-validators'
import { nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { PoliciesPort, Policy, PolicyDefinition, PolicyRun } from '@rss/mdm-policies'
import { boolean, count, enumeration, nullable, positive, text, uuid } from './decode'
import { boundedObject, requestInput, windowQuery } from './inventory-values'

function safeNumbers(value: unknown): void {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    throw new Error('Unsafe policy coordinate')
  if (value && typeof value === 'object') Object.values(value).forEach(safeNumbers)
}
function definition(value: unknown): PolicyDefinition {
  if (!validatePolicyDefinition(value)) throw new Error('Invalid policy definition')
  safeNumbers(value)
  return {
    ...value,
    ...(value.selfService
      ? {
          selfService: {
            ...value.selfService,
            presentation: boundedObject(value.selfService.presentation),
          },
        }
      : {}),
  }
}
function policy(value: unknown, id: string): Policy {
  if (!schema.getApiV1PoliciesByIdResponse.validateRoot(value) || value.id !== id)
    throw new Error('Wrong policy detail')
  return {
    id: uuid(value.id),
    revision: positive(value.revision),
    version: positive(value.version),
    versionId: uuid(value.versionId),
    state: value.state,
    definition: definition(value.definition),
  }
}
const fields = {
  id: uuid,
  revision: positive,
  version: positive,
  versionId: uuid,
  state: (v: unknown) => enumeration(v, ['enabled', 'disabled', 'archived'] as const),
  definition,
  scope: uuid,
  resource: (v: unknown) => nullable(v, text),
  category: (v: unknown) => nullable(v, text),
  alias: (v: unknown) => nullable(v, text),
  customEvent: (v: unknown) => nullable(v, text),
  toolName: text,
  action: (v: unknown) =>
    enumeration(v, [
      'device_access',
      'credential',
      'execution',
      'agent_collection',
      'native_collection',
      'telemetry_profile',
      'configuration',
      'software',
      'unmanage_device',
      'ensure_agent_installed',
      'request_mdm_enrollment',
    ] as const),
}
function policyRun(item: api.getApiV1PoliciesByIdRunsContract.Output['items'][number]): PolicyRun {
  return {
    kind: item.kind,
    versionId:
      'versionId' in item && typeof item.versionId === 'string' ? uuid(item.versionId) : null,
    nativeDelivery: item.kind === 'collection' && item.channel === 'mdm' ? item.delivery : null,
    report: item.kind === 'collection' ? item.report : null,
    taskId: uuid(item.taskId),
    device: text(item.device),
    registrationId: uuid(item.registrationId),
    generation: positive(item.generation),
    occurrence: item.occurrence,
    availableAt: item.availableAt,
    deadline: item.deadline,
    state:
      item.kind === 'collection' && item.channel === 'mdm'
        ? null
        : requestInput(item.state, schema.getApiV1PoliciesByIdRunsResponse.validateRunState),
    effect: item.kind === 'software' || item.kind === 'execution' ? text(item.effect) : null,
    userAction:
      item.kind === 'software' || item.kind === 'execution'
        ? nullable(item.userAction, text)
        : null,
  }
}
export function createPoliciesAdapter(transport: HttpTransport): PoliciesPort {
  return {
    list: (query = {}) =>
      api.getApiV1Policies(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => {
          if (query.fields && !query.fields.includes('id'))
            throw new Error('Policy identity required')
          const page = projectedPage(value, fields, query.fields, ['id'])
          for (const row of page.items)
            if (
              row.toolName !== undefined &&
              row.toolName !== `policy_${row.id.replaceAll('-', '')}`
            )
              throw new Error('Wrong policy tool identity')
          return page
        },
      ),
    read: (id) =>
      api.getApiV1PoliciesById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        policy(value, id),
      ),
    change: (id, change) =>
      api.postApiV1PoliciesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1PoliciesByIdBody.validateRoot),
        },
        (value) => policy(value, id),
      ),
    archive: (id, operationId, expectedRevision) =>
      api.deleteApiV1PoliciesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(
            { operationId, expectedRevision },
            schema.deleteApiV1PoliciesByIdBody.validateRoot,
          ),
        },
        (value) => policy(value, id),
      ),
    rerun: (id, change) =>
      api.postApiV1PoliciesByIdReruns(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1PoliciesByIdRerunsBody.validateRoot),
        },
        (value) => {
          if (
            value.operationId !== change.operationId ||
            value.policyId !== id ||
            value.deadline !== change.input.deadline
          )
            throw new Error('Wrong rerun receipt')
          return { ...value, versionId: uuid(value.versionId) }
        },
      ),
    capabilities: () =>
      api.getApiV1PoliciesCapabilities(transport, {}, (value) => ({
        defaultSoftwareChannel: value.defaultSoftwareChannel,
        mdmSoftwareDistributionEnabled: boolean(value.mdmSoftwareDistributionEnabled),
      })),
    preview: (input, scopeResult, query) =>
      api.postApiV1PoliciesPreviews(
        transport,
        {
          body: requestInput(
            {
              definition: input,
              ...(scopeResult === null ? {} : { scopeResult: uuid(scopeResult) }),
            },
            schema.postApiV1PoliciesPreviewsBody.validateRoot,
          ),
          query: windowQuery(query),
        },
        (value) => {
          safeNumbers(value)
          if (scopeResult !== null && value.scopeResult !== scopeResult)
            throw new Error('Wrong policy preview result')
          const canonical = (v: unknown): string =>
            JSON.stringify(v, (_, node: unknown) =>
              node && typeof node === 'object' && !Array.isArray(node)
                ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => a.localeCompare(b)))
                : node,
            )
          if (canonical(value.action) !== canonical(input.action))
            throw new Error('Wrong policy preview action')
          return {
            action: value.action,
            scopeResult: uuid(value.scopeResult),
            nextCursor: nextCursor(value.nextCursor),
            items: value.items.map((item) => ({
              ...item,
              taskAdmission: 'taskAdmission' in item ? item.taskAdmission : null,
            })),
          }
        },
      ),
    assignments: (id, query, signal) =>
      api.getApiV1PoliciesByIdAssignments(
        transport,
        { signal, pathParams: { id: uuid(id) }, query: windowQuery(query) },
        (value) => {
          safeNumbers(value)
          return {
            items: value.items.map((item) => ({
              ...item,
              execution:
                item.execution.kind === 'operations'
                  ? {
                      kind: 'operations' as const,
                      operationIds: item.execution.operationIds.map(uuid),
                    }
                  : item.execution.kind === 'restricted'
                    ? { kind: 'restricted' as const }
                    : {
                        kind: 'recurring' as const,
                        latestRun: item.execution.latestRun
                          ? policyRun(item.execution.latestRun)
                          : null,
                        currentRecord:
                          item.execution.currentRecord.state === 'present'
                            ? {
                                state: 'present' as const,
                                taskId: uuid(item.execution.currentRecord.taskId),
                              }
                            : item.execution.currentRecord,
                      },
              scopeResult: nullable(item.scopeResult, uuid),
            })),
            nextCursor: nextCursor(value.nextCursor),
          }
        },
      ),
    runs: (id, query, signal) =>
      api.getApiV1PoliciesByIdRuns(
        transport,
        { signal, pathParams: { id: uuid(id) }, query: windowQuery(query) },
        (value) => {
          safeNumbers(value)
          return {
            items: value.items.map(policyRun),
            nextCursor: nextCursor(value.nextCursor),
          }
        },
      ),
    rollout: (id) =>
      api.getApiV1PoliciesByIdSoftwareRollout(
        transport,
        { pathParams: { id: uuid(id) } },
        (value) => {
          if (value.policyId !== id) throw new Error('Wrong rollout policy')
          safeNumbers(value)
          return {
            ...value,
            versionId: uuid(value.versionId),
            stages: value.stages.map((stage) => ({
              ...stage,
              scope: uuid(stage.scope),
              totalTargets: count(stage.totalTargets),
            })),
          }
        },
      ),
  }
}
