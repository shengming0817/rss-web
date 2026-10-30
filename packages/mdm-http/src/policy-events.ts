import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { EventBatch, EventMember, EventProgress, PolicyEventsPort } from '@rss/mdm-policies'
import { count, positive, text, uuid } from './decode'
import { requestInput } from './inventory-values'

function batch(value: unknown): EventBatch {
  if (!schema.getApiV1DevicesByDevicePolicyEventBatchesByBatchResponse.validateRoot(value))
    throw new Error('Invalid event batch')
  if (value.operationId !== value.request.operationId || value.event !== value.request.event)
    throw new Error('Wrong batch request binding')
  for (const n of [
    value.createdAt,
    value.deadline,
    value.members,
    ...Object.values(value.admission),
  ])
    count(n)
  return {
    id: uuid(value.id),
    operationId: uuid(value.operationId),
    event: value.event,
    createdAt: value.createdAt,
    deadline: value.deadline,
    members: value.members,
    admission: { ...value.admission },
    processingFailure: value.processingFailure,
    request: {
      operationId: value.operationId,
      event: value.event,
      source: { ...value.request.source },
    },
  }
}
function progress(value: unknown): EventProgress {
  const validators = schema.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembersResponse
  if (!validators.validateEventOperationProgress(value) || value.allowedActions.length)
    throw new Error('Invalid event progress')
  const id = uuid(value.reference.id)
  if (value.reference.kind === 'run') {
    if (!validators.validateRunState(value.state)) throw new Error('Wrong event run state')
    return { reference: { kind: 'run', id }, state: { ...value.state } }
  }
  if (value.reference.kind === 'retirement') {
    if (!validators.validateRetirement(value.state) || value.state.id !== id)
      throw new Error('Wrong event retirement')
    return { reference: { kind: 'retirement', id }, state: value.state }
  }
  if (
    typeof value.state !== 'string' ||
    ![
      'queued',
      'published',
      'received',
      'applied',
      'rejected',
      'timed_out',
      'superseded',
      'cancelled',
    ].includes(value.state)
  )
    throw new Error('Wrong event native state')
  // The generated native state is narrowed independently of the untagged progress union.
  if (
    value.state === 'queued' ||
    value.state === 'published' ||
    value.state === 'received' ||
    value.state === 'applied' ||
    value.state === 'rejected' ||
    value.state === 'timed_out' ||
    value.state === 'superseded' ||
    value.state === 'cancelled'
  )
    return { reference: { kind: 'native', id }, state: value.state }
  throw new Error('Unsupported native event progress')
}
function member(value: unknown): EventMember {
  const validators = schema.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembersResponse
  if (
    !validators.validateProjection_Member(value) ||
    !value.id ||
    !value.policyId ||
    !value.versionId ||
    value.revision === undefined ||
    !value.state ||
    !value.decision ||
    !value.operations
  )
    throw new Error('Incomplete event member')
  if (value.state !== value.decision.state) throw new Error('Wrong member decision')
  const operations = value.operations.map(progress)
  const expected = value.decision.state === 'accepted' ? value.decision.operations : []
  if (
    expected.length !== operations.length ||
    expected.some(
      (ref, index) =>
        ref.kind !== operations[index]?.reference.kind ||
        ref.id !== operations[index]?.reference.id,
    )
  )
    throw new Error('Wrong member operation references')
  return {
    id: uuid(value.id),
    policyId: uuid(value.policyId),
    versionId: uuid(value.versionId),
    revision: positive(value.revision),
    state: value.state,
    decision: value.decision,
    operations,
  }
}
export function createPolicyEventsAdapter(transport: HttpTransport): PolicyEventsPort {
  return {
    submit: (device, request) =>
      api.postApiV1DevicesByDevicePolicyEvents(
        transport,
        {
          pathParams: { device: text(device) },
          body: requestInput(request, schema.postApiV1DevicesByDevicePolicyEventsBody.validateRoot),
        },
        (value) => {
          if (value.operationId !== request.operationId) throw new Error('Wrong event receipt')
          return {
            operationId: request.operationId,
            batchId: uuid(value.batchId),
            members: count(value.members),
          }
        },
      ),
    batches: (device, query = {}) =>
      api.getApiV1DevicesByDevicePolicyEventBatches(
        transport,
        { pathParams: { device: text(device) }, query: queryParameters({ limit: 20, ...query }) },
        (value) => ({ items: value.items.map(batch), nextCursor: nextCursor(value.nextCursor) }),
      ),
    batch: (device, id) =>
      api.getApiV1DevicesByDevicePolicyEventBatchesByBatch(
        transport,
        { pathParams: { device: text(device), batch: uuid(id) } },
        (value) => {
          const result = batch(value)
          if (result.id !== id) throw new Error('Wrong batch identity')
          return result
        },
      ),
    members: (device, id, query = {}) =>
      api.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembers(
        transport,
        {
          pathParams: { device: text(device), batch: uuid(id) },
          query: queryParameters({ limit: 20, ...query }),
        },
        (value) => ({ items: value.items.map(member), nextCursor: nextCursor(value.nextCursor) }),
      ),
  }
}
