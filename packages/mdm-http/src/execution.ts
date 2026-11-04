import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { Execution, ExecutionPort, ExecutionDetail, Trust } from '@rss/mdm-execution'
import { enumeration, nullable, positive, text, uuid, count } from './decode'
import { integer, requestInput } from './inventory-values'
const fields = [
  'id',
  'kind',
  'device',
  'registrationId',
  'generation',
  'origin',
  'policy',
  'deadline',
  'status',
  'evidence',
] as const
export function createExecutionAdapter(
  transport: HttpTransport,
  tenant: string,
  serviceId: string,
): ExecutionPort {
  function trust(value: unknown): Trust {
    if (
      !schema.getApiV1TaskSigningTrustResponse.validateRoot(value) ||
      value.version !== 1 ||
      value.tenant !== tenant ||
      value.service_id !== serviceId
    )
      throw new Error('Wrong task signing trust')
    return {
      tenant: uuid(value.tenant),
      serviceId: uuid(value.service_id),
      revision: count(value.revision),
      keys: value.keys.map((key) => ({
        id: text(key.id),
        publicKey: text(key.public_key),
        state: key.state,
      })),
    }
  }
  return {
    statistics: (filter) =>
      api.getApiV1OperationsStatistics(
        transport,
        { query: queryParameters(filter ? { filter } : {}) },
        (value) => ({
          total: count(value.statistics.total),
          commands: count(value.statistics.commands),
          actionRuns: count(value.statistics.actionRuns),
          unknown: count(value.statistics.unknown),
          asOf: integer(value.asOf),
        }),
      ),
    create: (input, pin) =>
      api.postApiV1DevicesByDeviceOperations(
        transport,
        {
          pathParams: { device: input.device },
          body: requestInput(
            {
              operationId: input.operationId,
              deadline: input.deadline,
              action: input.action.kind === 'lock' ? { ...input.action, pin } : input.action,
            },
            schema.postApiV1DevicesByDeviceOperationsBody.validateRoot,
          ),
        },
        (value) => {
          if (value.operationId !== input.operationId || value.commandId !== input.operationId)
            throw new Error('Wrong control receipt')
          return { operationId: uuid(value.operationId), revision: positive(value.revision) }
        },
      ),
    cancel: (device, id, input) =>
      api.postApiV1DevicesByDeviceOperationsByIdCancel(
        transport,
        {
          pathParams: { device, id },
          body: requestInput(
            { requestId: input.requestId, expectedRevision: input.expectedRevision },
            schema.postApiV1DevicesByDeviceOperationsByIdCancelBody.validateRoot,
          ),
        },
        (value) => ({ operationId: uuid(value.operationId), revision: positive(value.revision) }),
      ),
    reauthorize: (device, id, input) =>
      api.postApiV1DevicesByDeviceOperationsByIdReauthorize(
        transport,
        {
          pathParams: { device, id },
          body: requestInput(
            input,
            schema.postApiV1DevicesByDeviceOperationsByIdReauthorizeBody.validateRoot,
          ),
        },
        (value) => ({ operationId: uuid(value.operationId), revision: positive(value.revision) }),
      ),
    trust: () => api.getApiV1TaskSigningTrust(transport, {}, trust),
    changeTrust: (operationId, input) =>
      api.postApiV1TaskSigningTrust(
        transport,
        {
          body: requestInput(input, schema.postApiV1TaskSigningTrustBody.validateRoot),
          headers: { 'Idempotency-Key': operationId },
        },
        trust,
      ),
    trustOperation: (id) =>
      api.getApiV1TaskSigningOperationsById(transport, { pathParams: { id } }, trust),
    trustObservation: (device) =>
      api.getApiV1TaskSigningTrustDevicesByDeviceObservation(
        transport,
        { pathParams: { device } },
        (value) =>
          value === null
            ? null
            : {
                registration: uuid(value.observation.registration),
                generation: positive(value.observation.generation),
                state: value.observation.state,
                reason: value.observation.reason,
                targetRevision: nullable(value.observation.target_revision, positive),
                actualRevision: nullable(value.observation.actual_revision, positive),
                receivedAt: integer(value.received_at),
              },
      ),
    list: (query) =>
      api.getApiV1Operations(
        transport,
        { query: queryParameters({ limit: 20, ...query, fields }) },
        (value) => {
          const items: Execution[] = value.items.map((item) => ({
            id: uuid(item.id),
            family: item.evidence === null ? null : text(item.evidence?.owner),
            kind: enumeration(item.kind, ['command', 'action_run'] as const),
            device: text(item.device),
            registrationId: uuid(item.registrationId),
            generation: positive(item.generation),
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
    command: (device, id) =>
      api.getApiV1DevicesByDeviceOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) } },
        (value) => {
          if (
            !schema.getApiV1DevicesByDeviceOperationsByIdResponse.validateRoot(value) ||
            value.operationId !== id ||
            value.commandId !== id
          )
            throw new Error('Wrong command detail')
          const recovery =
            value.owner === 'device'
              ? requestInput(
                  value.reauthorization,
                  schema.getApiV1DevicesByDeviceOperationsByIdResponse.validateReauthorization,
                )
              : null
          return {
            id,
            revision: positive(value.revision),
            taskName: text(value.task.name),
            dispatchFailure: value.dispatchFailure?.reason ?? null,
            reauthorization: recovery
              ? {
                  state: recovery.state,
                  confirmationRequired:
                    recovery.state === 'available' && recovery.confirmationRequired,
                  reason: recovery.state === 'unavailable' ? recovery.reason : null,
                }
              : null,
            device,
            registrationId: null,
            generation: null,
            owner: value.owner,
            delivery: text(value.commandStatus),
            execution: null,
            effect: value.observation.effect,
            cancellation: null,
            attempt: null,
            deadline: integer(value.deadline),
            authorization: value.authorization.state,
          }
        },
      ),
    run: (policy, id) =>
      api.getApiV1PoliciesByIdRunsByTask(
        transport,
        { pathParams: { id: uuid(policy), task: uuid(id) } },
        (value) => {
          if (
            !schema.getApiV1PoliciesByIdRunsByTaskResponse.validateRoot(value) ||
            value.taskId !== id ||
            value.policyId !== policy
          )
            throw new Error('Wrong run detail')
          const native = value.kind === 'collection' && value.channel === 'mdm'
          const state = native
            ? null
            : requestInput(
                value.state,
                schema.getApiV1PoliciesByIdRunsByTaskResponse.validateRunState,
              )
          const authorization =
            'authorization' in value && value.authorization
              ? requestInput(
                  value.authorization,
                  schema.getApiV1PoliciesByIdRunsByTaskResponse.validateTaskAuthorization,
                )
              : null
          const detail: ExecutionDetail = {
            id,
            revision: null,
            reauthorization: null,
            taskName: null,
            dispatchFailure: null,
            device: text(value.device),
            registrationId: uuid(value.registrationId),
            generation: positive(value.generation),
            owner: value.kind,
            delivery: state
              ? state.delivery.kind
              : text('delivery' in value ? value.delivery : undefined),
            execution: state?.execution ?? null,
            cancellation: state?.cancellation ?? null,
            effect:
              value.kind === 'access' && value.result
                ? requestInput(
                    value.result,
                    schema.getApiV1PoliciesByIdRunsByTaskResponse.validateAccessResult,
                  ).effect.state
                : 'effect' in value
                  ? nullable(value.effect, text)
                  : null,
            attempt: 'attemptId' in value ? nullable(value.attemptId, uuid) : null,
            deadline: integer(value.deadline),
            authorization: authorization?.kind ?? null,
          }
          return detail
        },
      ),
  }
}
