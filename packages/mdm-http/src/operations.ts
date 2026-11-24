import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import { enumeration, nullable, positive, text, uuid, count, record } from './decode'
import { integer, requestInput } from './inventory-values'
import type { OperationsPort, Execution, RunDetail } from '@rss/mdm-operations'
const fields = [
  'id',
  'kind',
  'device',
  'origin',
  'policy',
  'deadline',
  'status',
  'evidence',
] as const
export function createOperationsAdapter(transport: HttpTransport, tenant: string): OperationsPort {
  return {
    statistics: (filter, signal) =>
      api.getApiV1TenantsByTenantOperationsStatistics(
        transport,
        { pathParams: { tenant }, signal, query: queryParameters(filter ? { filter } : {}) },
        (value) => ({
          total: count(value.statistics.total),
          commands: count(value.statistics.commands),
          actionRuns: count(value.statistics.actionRuns),
          unknown: count(value.statistics.unknown),
          asOf: integer(value.asOf),
        }),
      ),
    list: (query, signal) =>
      api.getApiV1TenantsByTenantOperations(
        transport,
        {
          pathParams: { tenant },
          signal,
          query: queryParameters({ limit: 100, ...query, fields }),
        },
        (value) => {
          const items: Execution[] = value.items.map((item) => ({
            id: uuid(item.id),
            family: item.evidence === null ? null : text(item.evidence?.owner),
            kind: enumeration(item.kind, ['command', 'action_run'] as const),
            device: text(item.device),
            origin: enumeration(item.origin, ['direct', 'policy'] as const),
            policy: nullable(item.policy, uuid),
            deadline: integer(item.deadline),
            status: text(item.status),
          }))
          if (new Set(items.map((item) => `${item.kind}/${item.id}`)).size !== items.length)
            throw new Error('Duplicate execution')
          return { items, nextCursor: nextCursor(value.nextCursor) }
        },
      ),
    command: (device, id, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceOperationsById(
        transport,
        { signal, pathParams: { tenant, device, id: uuid(id) } },
        (value) => {
          if (
            !schema.getApiV1TenantsByTenantDevicesByDeviceOperationsByIdResponse.validateRoot(
              value,
            ) ||
            value.operationId !== id ||
            value.commandId !== id
          )
            throw new Error('Wrong command detail')
          const recovery =
            value.owner === 'device'
              ? requestInput(
                  value.reauthorization,
                  schema.getApiV1TenantsByTenantDevicesByDeviceOperationsByIdResponse
                    .validateReauthorization,
                )
              : null
          return {
            kind: 'command',
            id,
            revision: positive(value.revision),
            task: value.task,
            target: value.target,
            inputVersion: text(value.inputVersion),
            dispatchFailure: value.dispatchFailure,
            reauthorization: recovery
              ? {
                  state: recovery.state,
                  confirmationRequired:
                    recovery.state === 'available' && recovery.confirmationRequired,
                  reason: recovery.state === 'unavailable' ? recovery.reason : null,
                }
              : null,
            device,
            owner: value.owner,
            delivery: text(value.commandStatus),
            observation: value.observation,
            deadline: integer(value.deadline),
            authorization: value.authorization,
          }
        },
      ),
    run: (policy, id, signal) =>
      api.getApiV1TenantsByTenantPoliciesByIdRunsByTask(
        transport,
        { signal, pathParams: { tenant, id: uuid(policy), task: uuid(id) } },
        (value) => {
          if (
            !schema.getApiV1TenantsByTenantPoliciesByIdRunsByTaskResponse.validateRoot(value) ||
            value.taskId !== id ||
            value.policyId !== policy
          )
            throw new Error('Wrong run detail')
          const native = value.kind === 'collection' && value.channel === 'mdm'
          const state = native
            ? null
            : requestInput(
                value.state,
                schema.getApiV1TenantsByTenantPoliciesByIdRunsByTaskResponse.validateRunState,
              )
          const authorization =
            'authorization' in value && value.authorization
              ? requestInput(
                  value.authorization,
                  schema.getApiV1TenantsByTenantPoliciesByIdRunsByTaskResponse
                    .validateTaskAuthorization,
                )
              : null
          const common = {
            kind: 'run' as const,
            id,
            policyId: uuid(value.policyId),
            versionId:
              'versionId' in value && typeof value.versionId === 'string'
                ? uuid(value.versionId)
                : null,
            occurrence:
              'occurrence' in value && typeof value.occurrence === 'string'
                ? value.occurrence
                : null,
            availableAt: integer(value.availableAt),
            device: text(value.device),
            state,
            delivery: state
              ? state.delivery.kind
              : text('delivery' in value ? value.delivery : undefined),
            effect:
              value.kind === 'access' && value.result
                ? value.result.effect.state
                : 'effect' in value
                  ? nullable(value.effect, text)
                  : null,
            attempt: 'attemptId' in value ? nullable(value.attemptId, uuid) : null,
            deadline: integer(value.deadline),
            authorization,
          }
          const detail: RunDetail =
            value.kind === 'script'
              ? {
                  ...common,
                  owner: 'script',
                  resourceId: value.resourceId,
                  result: value.result === null ? null : record(value.result),
                }
              : value.kind === 'collection'
                ? {
                    ...common,
                    owner: 'collection',
                    channel: value.channel,
                    report: value.report === null ? null : record(value.report),
                    result:
                      value.channel === 'agent' && value.result !== null
                        ? record(value.result)
                        : null,
                  }
                : {
                    ...common,
                    owner: value.kind,
                    result:
                      'result' in value && value.result !== null
                        ? typeof value.result === 'string'
                          ? value.result
                          : record(value.result)
                        : null,
                    userAction: 'userAction' in value ? nullable(value.userAction, text) : null,
                    nodes:
                      value.kind === 'software'
                        ? value.nodes.map((node) => ({
                            ...node,
                            stepId: node.stepId
                              .map((byte) => byte.toString(16).padStart(2, '0'))
                              .join(''),
                          }))
                        : [],
                  }
          return detail
        },
      ),
  }
}
