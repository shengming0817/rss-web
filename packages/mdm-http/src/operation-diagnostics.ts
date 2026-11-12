import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import { nextCursor } from '@rss/api/mdm-query'
import type {
  DiagnosticPage,
  DiagnosticsContext,
  DiagnosticsPort,
  Evidence,
  ExecutionEvidence,
  OperationDetail,
  OperationLocator,
  ReceiptSummary,
} from '@rss/mdm-audit'
import { auditFact } from './audit'
import { list, nullable, uuid } from './decode'
import { integer, requestInput } from './inventory-values'

type WirePage = api.getApiV1OperationDiagnosticsContract.Output
type WireDetail = api.getApiV1OperationDiagnosticsOperationsByOwnerByOperationIdContract.Output
type WireExecution = Extract<
  WireDetail['executionEvidence'],
  { availability: 'available' }
>['value']

const endpoints = {
  mdm: {
    search: api.getApiV1OperationDiagnostics,
    request: api.getApiV1OperationDiagnosticsRequestsByRequestId,
    operation: api.getApiV1OperationDiagnosticsOperationsByOwnerByOperationId,
  },
  da: {
    search: api.getApiV1DeviceAccessOperationDiagnostics,
    request: api.getApiV1DeviceAccessOperationDiagnosticsRequestsByRequestId,
    operation: api.getApiV1DeviceAccessOperationDiagnosticsOperationsByOwnerByOperationId,
  },
  management: {
    search: api.getApiV1TenantAdministrationOperationDiagnostics,
    request: api.getApiV1TenantAdministrationOperationDiagnosticsRequestsByRequestId,
    operation: api.getApiV1TenantAdministrationOperationDiagnosticsOperationsByOwnerByOperationId,
  },
}

function locator(value: WireDetail['operation']): OperationLocator {
  const { product, owner, operationId, actor, instance, device, target } = value
  return {
    product,
    owner,
    operationId: uuid(operationId),
    ...(actor === null ? {} : { actor }),
    ...(instance === null ? {} : { instance: uuid(instance) }),
    ...(device === null ? {} : { device }),
    ...(target === null ? {} : { target }),
  }
}

function page(value: WirePage): DiagnosticPage {
  return {
    items: value.items.map((item) => ({
      fact: auditFact(item.fact),
      operation: item.operation === null ? null : locator(item.operation),
      operationConfirmed: item.operationConfirmed,
    })),
    coverage: value.coverage,
    nextCursor: nextCursor(value.nextCursor),
  }
}

function evidence<T, V>(value: Evidence<T>, project: (value: T) => V): Evidence<V> {
  return value.availability === 'available'
    ? { availability: 'available', value: project(value.value) }
    : { availability: value.availability }
}

function receipt(value: ReceiptSummary): ReceiptSummary {
  return {
    ...value,
    operationId: uuid(value.operationId),
    revision: nullable(value.revision, integer),
    executions: list(value.executions, uuid),
  }
}

function execution(value: WireExecution): ExecutionEvidence {
  const { owner } = value
  if (owner === 'native') {
    const { commandStatus, observation, dispatchFailure } = value.detail
    return {
      owner,
      delivery: commandStatus,
      state: observation.progress,
      ...(dispatchFailure ? { dispatchFailure: dispatchFailure.reason } : {}),
      ...('receipts' in observation && Array.isArray(observation.receipts)
        ? { nativeReceipts: observation.receipts.length }
        : {}),
      effect: observation.effect,
      ...('effectReason' in observation && typeof observation.effectReason === 'string'
        ? { reason: observation.effectReason }
        : {}),
    }
  }
  if (owner === 'retirement')
    return {
      owner,
      stages: value.channels.map((channel) => ({
        name: `${channel.device} · ${channel.channel}`,
        state: channel.stage,
        effect: channel.effect,
      })),
    }
  if (owner === 'offboarding')
    return {
      owner,
      state: value.identity,
      complete: value.complete,
      stages: value.devices.map((device) => ({ name: device.device, state: device.phase })),
    }
  const state = 'state' in value ? value.state : undefined
  const run =
    schema.getApiV1OperationDiagnosticsOperationsByOwnerByOperationIdResponse.validateRunState(
      state,
    )
      ? state
      : null
  const delivery =
    run?.delivery.kind ??
    ('delivery' in value && typeof value.delivery === 'string' ? value.delivery : undefined)
  const progress = run?.execution ?? (typeof state === 'string' ? state : undefined)
  const effect =
    owner === 'access' && value.result
      ? value.result.effect.state
      : 'effect' in value && typeof value.effect === 'string'
        ? value.effect
        : undefined
  return {
    owner,
    ...(delivery ? { delivery } : {}),
    ...(progress ? { state: progress } : {}),
    ...(effect ? { effect } : {}),
    ...(run ? { cancellation: run.cancellation } : {}),
    ...(owner === 'collection' && value.report
      ? {
          collectionReport: {
            result: value.report.result,
            reason: value.report.reason,
            sealedAt: value.report.sealedAt,
            projectionPending: value.report.projectionPending,
          },
        }
      : {}),
  }
}

function detail(value: WireDetail): OperationDetail {
  return {
    operation: locator(value.operation),
    originalResult: evidence(value.originalResult, receipt),
    auditEvidence: evidence(value.auditEvidence, page),
    requestEvidence: evidence(value.requestEvidence, page),
    executionEvidence: evidence(value.executionEvidence, execution),
    currentResourceUrl: value.currentResourceUrl,
  }
}

export function createOperationDiagnosticsAdapter(
  transport: HttpTransport,
  context: DiagnosticsContext,
): DiagnosticsPort {
  const operations = endpoints[context]
  const discovery = schema.getApiV1OperationDiagnosticsQuery.validateRoot
  const lookup = schema.getApiV1OperationDiagnosticsOperationsByOwnerByOperationIdQuery.validateRoot
  return {
    search: (query, signal) =>
      operations.search(transport, { query: requestInput(query, discovery), signal }, page),
    request: (requestId, query, signal) =>
      operations.request(
        transport,
        { pathParams: { requestId }, query: requestInput(query, discovery), signal },
        page,
      ),
    operation: ({ owner, operationId, actor, instance, device, target }, options, signal) =>
      operations.operation(
        transport,
        {
          pathParams: { owner, operationId },
          query: requestInput({ actor, instance, device, target, ...options }, lookup),
          signal,
        },
        detail,
      ),
  }
}
