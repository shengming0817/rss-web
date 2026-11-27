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

type WirePage = api.getApiV1TenantsByTenantOperationDiagnosticsContract.Output
type WireDetail =
  api.getApiV1TenantsByTenantOperationDiagnosticsOperationsByOwnerByOperationIdContract.Output
type WireExecution = Extract<
  WireDetail['executionEvidence'],
  { availability: 'available' }
>['value']

const endpoints = {
  mdm: {
    search: api.getApiV1TenantsByTenantOperationDiagnostics,
    request: api.getApiV1TenantsByTenantOperationDiagnosticsRequestsByRequestId,
    operation: api.getApiV1TenantsByTenantOperationDiagnosticsOperationsByOwnerByOperationId,
  },
  da: {
    search: api.getApiV1TenantsByTenantDeviceAccessOperationDiagnostics,
    request: api.getApiV1TenantsByTenantDeviceAccessOperationDiagnosticsRequestsByRequestId,
    operation:
      api.getApiV1TenantsByTenantDeviceAccessOperationDiagnosticsOperationsByOwnerByOperationId,
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
  if (owner === 'inventory_report')
    return {
      owner,
      inventoryReport: { observation: value.observation, projection: value.projection },
    }
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
    schema.getApiV1TenantsByTenantOperationDiagnosticsOperationsByOwnerByOperationIdResponse.validateRunState(
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
            id: uuid(value.report.id),
            result: value.report.result,
            reason: value.report.reason,
            sealedAt: value.report.sealedAt,
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
  tenant: string,
): DiagnosticsPort {
  const operations = endpoints[context === 'da' ? 'da' : 'mdm']
  const discovery = schema.getApiV1TenantsByTenantOperationDiagnosticsQuery.validateRoot
  const lookup =
    schema.getApiV1TenantsByTenantOperationDiagnosticsOperationsByOwnerByOperationIdQuery
      .validateRoot
  return {
    search: (query, signal) => {
      const input = { query: requestInput({ limit: 100, ...query }, discovery), signal }
      return context === 'management'
        ? api.getApiV1TenantAdministrationOperationDiagnostics(transport, input, page)
        : operations.search(transport, { ...input, pathParams: { tenant } }, page)
    },
    request: (requestId, query, signal) => {
      const input = {
        query: requestInput({ limit: 100, ...query }, discovery),
        signal,
      }
      return context === 'management'
        ? api.getApiV1TenantAdministrationOperationDiagnosticsRequestsByRequestId(
            transport,
            { ...input, pathParams: { requestId } },
            page,
          )
        : operations.request(transport, { ...input, pathParams: { tenant, requestId } }, page)
    },
    operation: ({ owner, operationId, actor, instance, device, target }, options, signal) => {
      const input = {
        query: requestInput({ actor, instance, device, target, ...options }, lookup),
        signal,
      }
      return context === 'management'
        ? api.getApiV1TenantAdministrationOperationDiagnosticsOperationsByOwnerByOperationId(
            transport,
            { ...input, pathParams: { owner, operationId } },
            detail,
          )
        : operations.operation(
            transport,
            { ...input, pathParams: { tenant, owner, operationId } },
            detail,
          )
    },
  }
}
