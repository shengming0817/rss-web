import { freeze, identifier, revision, uuid } from '@rss/mdm-inventory'
import type { AuditFact, AuditPage, AuditQuery } from './model'
import { validateAuditQuery } from './query'

export type DiagnosticsContext = 'mdm' | 'da' | 'management'

export interface OperationCoordinates {
  readonly actor?: string
  readonly instance?: string
  readonly device?: string
  readonly target?: string
}

export interface OperationAddress extends OperationCoordinates {
  readonly owner: string
  readonly operationId: string
}

export interface OperationLocator extends OperationAddress {
  readonly product: 'mdm' | 'da'
}

export interface DiagnosticQuery extends AuditQuery {
  readonly owner?: string
}

export interface DiagnosticFact {
  readonly fact: AuditFact
  readonly operation: OperationLocator | null
  readonly operationConfirmed: boolean
}

export interface DiagnosticPage extends Omit<AuditPage, 'items'> {
  readonly items: readonly DiagnosticFact[]
}

export type Evidence<T> =
  | { readonly availability: 'available'; readonly value: T }
  | {
      readonly availability:
        | 'not_requested'
        | 'not_found'
        | 'no_durable_evidence'
        | 'restricted'
        | 'unavailable'
        | 'expired'
    }

export interface ReceiptSummary {
  readonly operationId: string
  readonly object: string | null
  readonly revision: number | null
  readonly state: string | null
  readonly accepted: boolean | null
  readonly enabled: boolean | null
  readonly recordedAt: number | null
  readonly completedAt: number | null
  readonly executions: readonly string[]
  readonly stages: readonly { phase: string; revision: number | null; state: string | null }[]
}

export interface ExecutionEvidence {
  readonly owner: string
  readonly delivery?: string
  readonly state?: string
  readonly effect?: string
  readonly reason?: string
  readonly dispatchFailure?: string
  readonly nativeReceipts?: number
  readonly cancellation?: string
  readonly complete?: boolean
  readonly collectionReport?: {
    readonly result: string
    readonly reason: string | null
    readonly sealedAt: number | null
    readonly projectionPending: boolean
  }
  readonly stages?: readonly { name: string; state: string; effect?: string }[]
}

export interface OperationDetail {
  readonly operation: OperationLocator
  readonly originalResult: Evidence<ReceiptSummary>
  readonly auditEvidence: Evidence<DiagnosticPage>
  readonly requestEvidence: Evidence<DiagnosticPage>
  readonly executionEvidence: Evidence<ExecutionEvidence>
  readonly currentResourceUrl: string | null
}

export interface EvidenceQuery {
  readonly includeAudit?: boolean
  readonly cursor?: string
}

export interface DiagnosticsPort {
  search(query: DiagnosticQuery, signal?: AbortSignal): Promise<DiagnosticPage>
  request(id: string, query: DiagnosticQuery, signal?: AbortSignal): Promise<DiagnosticPage>
  operation(
    address: OperationAddress,
    evidence: EvidenceQuery,
    signal?: AbortSignal,
  ): Promise<OperationDetail>
}

export function validateDiagnosticQuery(query: DiagnosticQuery): void {
  validateAuditQuery(query)
  if (query.owner !== undefined) identifier(query.owner, 64)
}

const deviceOwners = new Set([
  'device_control',
  'device_control_request',
  'device_action',
  'software_deployment',
  'software_action',
  'installation',
  'recovery_command',
  'configuration',
  'script',
  'collection_execution',
  'enrollment_task',
  'device_access_task',
  'credential_task',
  'device_access',
  'policy_event',
  'policy_event_member',
  'collection',
])
const invocationOwners = new Set([
  'script_invocation',
  'software_invocation',
  'enrollment_invocation',
])

export function requiredOperationCoordinates(
  owner: string,
): readonly (keyof OperationCoordinates)[] {
  if (invocationOwners.has(owner)) return ['actor', 'device']
  if (owner === 'filevault') return ['device']
  if (deviceOwners.has(owner)) return ['device']
  if (owner === 'registration_recovery') return ['device']
  if (owner === 'content' || owner === 'software_source_snapshot') return ['target']
  return []
}

export function operationAllowsInstance(owner: string): boolean {
  return !invocationOwners.has(owner)
}

export function validateOperationAddress(address: OperationAddress): void {
  identifier(address.owner, 64)
  uuid(address.operationId)
  if (address.instance !== undefined && !operationAllowsInstance(address.owner))
    throw new Error('Self-service invocation has no instance coordinate')
  if (requiredOperationCoordinates(address.owner).some((field) => address[field] === undefined))
    throw new Error('Missing required operation coordinate')
  for (const value of [address.actor, address.device, address.target])
    if (value !== undefined) identifier(value, 256)
  if (address.instance !== undefined) uuid(address.instance)
}

export function createOperationDiagnostics(port: DiagnosticsPort) {
  return Object.freeze({
    search(query: DiagnosticQuery, signal?: AbortSignal) {
      validateDiagnosticQuery(query)
      return port.search(freeze(query), signal)
    },
    async request(id: string, query: DiagnosticQuery, signal?: AbortSignal) {
      uuid(id)
      validateDiagnosticQuery(query)
      if (query.requestId !== undefined && query.requestId !== id)
        throw new Error('Conflicting request coordinates')
      const page = await port.request(id, freeze(query), signal)
      if (page.items.some(({ fact }) => fact.requestId !== id))
        throw new Error('Wrong HTTP request association')
      return page
    },
    async operation(address: OperationAddress, evidence: EvidenceQuery = {}, signal?: AbortSignal) {
      validateOperationAddress(address)
      if (
        evidence.cursor !== undefined &&
        (!evidence.includeAudit || !evidence.cursor || evidence.cursor.length > 4096)
      )
        throw new Error('Invalid evidence continuation')
      const detail = await port.operation(freeze(address), freeze(evidence), signal)
      const coordinates = [
        'actor',
        'instance',
        'device',
        'target',
      ] as const
      if (
        coordinates.some(
          (key) =>
            address[key] !== undefined &&
            detail.operation[key] !== undefined &&
            address[key] !== detail.operation[key],
        ) ||
        detail.operation.owner !== address.owner ||
        detail.operation.operationId !== address.operationId ||
        (detail.originalResult.availability === 'available' &&
          detail.originalResult.value.operationId !== address.operationId)
      )
        throw new Error('Wrong operation result')
      return detail
    },
  })
}

export type OperationDiagnostics = ReturnType<typeof createOperationDiagnostics>
