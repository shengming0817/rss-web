import { uuid } from './authoring'
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface RecoveryOperation {
  readonly operationId: string
  readonly actor: string
  readonly instance: string
}
export interface AgentRequest {
  readonly id: string
  readonly device: string
  readonly source: string
  readonly state: string
  readonly operationId: string
  readonly actor: string | null
  readonly instance: string | null
  readonly registrationState: string | null
  readonly predecessor: string | null
  readonly issuance: string | null
  readonly issuanceState: string | null
  readonly issuanceOperation: string | null
  readonly issuer: string | null
  readonly activationOperation: string | null
  readonly activated: boolean
  readonly requirements: readonly string[]
  readonly createdAt: number
  readonly expiresAt: number
  readonly notBefore: number | null
  readonly notAfter: number | null
}
export interface WindowsRequest {
  readonly attempt: string
  readonly device: string
  readonly kind: 'enrollment' | 'renewal'
  readonly enrollmentId: string | null
  readonly operationId: string
  readonly registrationState: string | null
  readonly enrollmentState: string | null
  readonly predecessor: string | null
  readonly linked: boolean
  readonly activated: boolean
  readonly requirements: readonly string[]
  readonly signing: {
    readonly attempt: string
    readonly state: string
    readonly issuer: string
    readonly createdAt: number
    readonly deadline: number
    readonly notBefore: number
    readonly notAfter: number
    readonly successor: string | null
  }
}
export interface RequestHistoryPort {
  agents(device: string, cursor: string | null, signal?: AbortSignal): Promise<Page<AgentRequest>>
  agent(id: string, signal?: AbortSignal): Promise<AgentRequest>
  windows(
    device: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<Page<WindowsRequest>>
  windowsRequest(device: string, attempt: string, signal?: AbortSignal): Promise<WindowsRequest>
  windowsRecoveries(
    device: string,
    attempt: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<Page<RecoveryOperation>>
  windowsRecovery(
    device: string,
    attempt: string,
    operation: RecoveryOperation,
  ): Promise<{ readonly attempt: string; readonly fingerprint: string } | null>
}
function owned<T extends { readonly device: string }>(value: T, device: string): T {
  if (value.device !== device) throw new Error('Wrong original request device')
  return Object.freeze(value)
}
export function createRequestHistory(port: RequestHistoryPort) {
  return Object.freeze({
    async agents(device: string, cursor: string | null = null, signal?: AbortSignal) {
      const page = await port.agents(uuid(device), cursor, signal)
      return { ...page, items: page.items.map((row) => owned(row, device)) }
    },
    async agent(device: string, id: string, signal?: AbortSignal) {
      const value = owned(await port.agent(uuid(id), signal), uuid(device))
      if (value.id !== id) throw new Error('Wrong original Agent request')
      return value
    },
    async windows(device: string, cursor: string | null = null, signal?: AbortSignal) {
      const page = await port.windows(uuid(device), cursor, signal)
      return { ...page, items: page.items.map((row) => owned(row, device)) }
    },
    async windowsRequest(device: string, attempt: string, signal?: AbortSignal) {
      const value = owned(await port.windowsRequest(uuid(device), uuid(attempt), signal), device)
      if (value.attempt !== attempt || value.signing.attempt !== attempt)
        throw new Error('Wrong original Windows attempt')
      return value
    },
    windowsRecoveries: (
      device: string,
      attempt: string,
      cursor: string | null = null,
      signal?: AbortSignal,
    ) => port.windowsRecoveries(uuid(device), uuid(attempt), cursor, signal),
    async windowsRecovery(device: string, attempt: string, operation: RecoveryOperation) {
      uuid(operation.operationId)
      if (!operation.actor || !operation.instance)
        throw new Error('Original recovery identity required')
      const value = await port.windowsRecovery(
        uuid(device),
        uuid(attempt),
        Object.freeze(operation),
      )
      if (value !== null && value.attempt !== attempt)
        throw new Error('Wrong original Windows receipt')
      return value
    },
  })
}
