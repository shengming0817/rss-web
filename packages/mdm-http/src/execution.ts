import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { Execution, ExecutionPort, ExecutionDetail } from '@rss/mdm-execution'
import { enumeration, nullable, positive, text, uuid } from './decode'
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
] as const
export function createExecutionAdapter(transport: HttpTransport): ExecutionPort {
  return {
    list: (query) =>
      api.getApiV1Operations(
        transport,
        { query: queryParameters({ limit: 20, ...query, fields }) },
        (value) => {
          const items: Execution[] = value.items.map((item) => ({
            id: uuid(item.id),
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
          return {
            id,
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
