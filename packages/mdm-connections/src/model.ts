export interface Window {
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface Download {
  readonly bytes: ArrayBuffer
  readonly contentType: string
  readonly filename: string
}
export interface StorageReceipt {
  readonly operationId: string
  readonly revision: number
  readonly profile: string
  readonly state: 'pending' | 'qualified' | 'rejected'
  readonly failureReason: string | null
  readonly revoked: boolean
  readonly qualifiedAt: number | null
  readonly expiresAt: number | null
}
export interface StorageDirectory {
  readonly revision: number
  readonly activeRevision: number | null
  readonly versionCount: number
  readonly current: StorageReceipt | null
  readonly latest: StorageReceipt | null
  readonly applied: StorageReceipt | null
}
export type StorageSource =
  | { readonly kind: 'generate' }
  | {
      readonly kind: 'import'
      readonly access_key: string
      readonly secret_key: string
      readonly session_token: string | null
      readonly expires_at: number | null
    }
export interface StorageIntent {
  readonly operationId: string
  readonly expectedRevision: number
  readonly profile: string
  readonly sourceKind: StorageSource['kind']
}
export interface Migration {
  readonly operationId: string
  readonly sourceGeneration: string
  readonly targetGeneration: string
  readonly expectedStorageRevision: number
  readonly targetRevision: number
  readonly phase: 'requested' | 'preparing' | 'ready' | 'committed' | 'cancelled'
  readonly blockedReason: string | null
  readonly sourceObjects: number
  readonly verifiedObjects: number
  readonly verifiedBytes: number
  readonly nextAction: string
  readonly observedAt: number | null
}
export interface Migrations {
  readonly storageRevision: number
  readonly activeGeneration: string
  readonly maintenance: string
  readonly operation: Migration | null
  readonly history: readonly Migration[]
}
export interface MigrationIntent {
  readonly operationId: string
  readonly expectedStorageRevision: number
  readonly targetRevision: number
}
export interface MailReceipt {
  readonly operationId: string
  readonly revision: number
  readonly profile: string
  readonly state: 'pending' | 'submitting' | 'accepted' | 'failed' | 'unknown'
  readonly attemptedAt: number | null
  readonly acceptedAt: number | null
  readonly failureReason: string | null
}
export interface MailDirectory {
  readonly revision: number
  readonly selectedRevision: number | null
  readonly versionCount: number
  readonly current: MailReceipt | null
  readonly latest: MailReceipt | null
}
export interface MailIntent {
  readonly operationId: string
  readonly expectedRevision: number
  readonly profile: string
  readonly sender: string
  readonly recipient: string
  readonly username: string
}
export interface WnsReceipt {
  readonly operationId: string
  readonly revision: number
  readonly packageFamilyName: string
  readonly qualifiedAt: number | null
  readonly attemptedAt: number | null
  readonly failureReason: string | null
  readonly selected: boolean
  readonly revoked: boolean
}
export type WnsOperation =
  | { readonly kind: 'material'; readonly receipt: WnsReceipt }
  | {
      readonly kind: 'revocation'
      readonly receipt: {
        readonly operationId: string
        readonly revision: number
        readonly materialRevision: number
      }
    }
export interface WnsDirectory {
  readonly revision: number
  readonly desiredRevision: number | null
  readonly versionCount: number
  readonly current: WnsReceipt | null
  readonly latest: WnsReceipt | null
  readonly applied: WnsReceipt | null
}
export interface WnsIntent {
  readonly operationId: string
  readonly expectedRevision: number
  readonly packageFamilyName: string
  readonly sid: string
}
export type ApplePurpose = 'apns' | 'profile' | 'managed_account'
export interface AppleMaterial {
  readonly revision: number
  readonly keyId: string
  readonly publicKeyDigest: string
  readonly csr: string
  readonly certificateChainPem: string | null
  readonly certificateDigest: string | null
  readonly topic: string | null
  readonly expiresAt: number | null
  readonly revoked: boolean
}
export interface AppleDirectory {
  readonly revision: number
  readonly desiredRevision: number | null
  readonly accountBindings: Readonly<Record<string, number>>
  readonly materials: Readonly<Record<string, AppleMaterial>>
  readonly runtimeObservation: 'separate'
}
export type AppleReceipt =
  | {
      readonly operationId: string
      readonly revision: number
      readonly state: 'awaiting_certificate'
      readonly keyId: string
      readonly csr: string
      readonly publicKeyDigest: string
    }
  | {
      readonly operationId: string
      readonly revision: number
      readonly state: 'validated'
      readonly keyId: string
      readonly certificateDigest: string
      readonly expiresAt: number
    }
  | {
      readonly operationId: string
      readonly revision: number
      readonly state: 'pending_application'
      readonly desiredRevision: number
    }
  | {
      readonly operationId: string
      readonly revision: number
      readonly state: 'revoked'
      readonly materialRevision: number
    }
export type AppleCommand =
  | {
      readonly kind: 'key'
      readonly expectedRevision: number
      readonly sourceKind: 'generate' | 'import'
    }
  | {
      readonly kind: 'certificate'
      readonly expectedRevision: number
      readonly keyRevision: number
      readonly certificateChainPem: string
    }
  | {
      readonly kind: 'apply'
      readonly expectedRevision: number
      readonly materialRevision: number
      readonly accountAlias: string | null
    }
  | {
      readonly kind: 'revoke'
      readonly expectedRevision: number
      readonly materialRevision: number
    }
export interface ConnectionConfiguration {
  readonly wireVersion: 1
  readonly serviceId: string
  readonly tenantId: string
  readonly revision: number
  readonly preferredOrigin: string
  readonly origins: readonly string[]
  readonly keyId: string
}
export interface SignedConnections {
  readonly configuration: ConnectionConfiguration
  readonly signature: string
}
export interface AgentDirectory {
  readonly serviceId: string
  readonly draft: { readonly configuration: ConnectionConfiguration } | null
  readonly published: SignedConnections | null
  readonly verificationKeys: Readonly<Record<string, string>>
  readonly deployments: readonly {
    readonly origin: string
    readonly hostId: string
    readonly revision: number
    readonly observedAt: number
    readonly configurationRevision: number
  }[]
  readonly convergence: {
    readonly targetRevision: number | null
    readonly activeDevices: number
    readonly confirmedDevices: number
  }
  readonly retirementBlockers: { readonly configurations: number; readonly installations: number }
}
export type AgentOperation =
  | {
      readonly action: 'saved'
      readonly draft: { readonly configuration: ConnectionConfiguration }
    }
  | { readonly action: 'published'; readonly configuration: SignedConnections }
export interface AgentIntent {
  readonly operationId: string
  readonly expectedRevision: number
  readonly preferredOrigin: string
  readonly origins: readonly string[]
}
export interface ConnectionObservation {
  readonly device: string
  readonly targetRevision: number | null
  readonly acknowledgement: {
    readonly operationId: string
    readonly revision: number
    readonly digest: string
    readonly origin: string
  } | null
  readonly receivedAt: number | null
  readonly failure: {
    readonly report: {
      readonly operationId: string
      readonly revision: number
      readonly reason: string
    }
    readonly origin: string
    readonly receivedAt: number
  } | null
}
export interface ConnectionDevice {
  readonly device: string
  readonly installedRevision: number | null
  readonly origin: string | null
  readonly receivedAt: number | null
}
export interface StoragePort {
  read(): Promise<StorageDirectory>
  history(query: Window): Promise<Page<StorageReceipt>>
  operation(id: string): Promise<StorageReceipt>
  save(intent: StorageIntent, source: StorageSource): Promise<StorageReceipt>
  migrations(): Promise<Migrations>
  requestMigration(intent: MigrationIntent): Promise<Migration>
  migration(id: string): Promise<Migration>
  cancelMigration(id: string): Promise<Migration>
}
export interface MailPort {
  read(): Promise<MailDirectory>
  history(query: Window): Promise<Page<MailReceipt>>
  operation(id: string): Promise<MailReceipt>
  save(intent: MailIntent, password: string): Promise<MailReceipt>
}
export interface WnsPort {
  read(): Promise<WnsDirectory>
  history(query: Window): Promise<Page<WnsReceipt>>
  operation(id: string): Promise<WnsOperation>
  save(intent: WnsIntent, secret: string): Promise<WnsOperation>
  revoke(id: string, expectedRevision: number, materialRevision: number): Promise<WnsOperation>
}
export interface AppleMaterialsPort {
  read(purpose: ApplePurpose): Promise<AppleDirectory>
  history(purpose: ApplePurpose, query: Window): Promise<Page<AppleMaterial>>
  operation(id: string): Promise<AppleReceipt>
  submit(
    purpose: ApplePurpose,
    id: string,
    command: AppleCommand,
    privateKeyPem?: string,
  ): Promise<AppleReceipt>
}
export interface AgentConnectionsPort {
  read(): Promise<AgentDirectory>
  save(intent: AgentIntent): Promise<{ readonly configuration: ConnectionConfiguration }>
  publish(id: string, expectedRevision: number): Promise<SignedConnections>
  operation(id: string): Promise<AgentOperation | null>
  download(): Promise<{ readonly file: Download; readonly document: SignedConnections }>
  devices(
    revision: number,
    after?: string,
  ): Promise<{
    readonly targetRevision: number
    readonly items: readonly ConnectionDevice[]
    readonly next: string | null
  }>
  observation(device: string): Promise<ConnectionObservation | null>
}
/** Narrow observations only; host lifecycle and the complete settings catalog have other owners. */
export interface ConnectionEvidencePort {
  catalog(): Promise<
    readonly {
      readonly id: string
      readonly status:
        | 'unknown'
        | 'unconfigured'
        | 'configured'
        | 'loaded'
        | 'pending'
        | 'unavailable'
      readonly revision: number | null
      readonly desiredRevision: number | null
      readonly appliedRevision: number | null
      readonly reason: string | null
    }[]
  >
  loaded(): Promise<
    readonly {
      readonly name: 'windows' | 'apple' | 'agent' | 'windows_push' | 'agent_bootstrap' | 'signing'
      readonly state: 'disabled' | 'waiting' | 'ready' | 'degraded'
      readonly mounted: boolean
      readonly loadedMaterials: Readonly<Record<string, number>>
      readonly reasons: readonly string[]
    }[]
  >
}
export interface ConnectionsPorts {
  readonly storage: StoragePort
  readonly mail: MailPort
  readonly wns: WnsPort
  readonly apple: AppleMaterialsPort
  readonly agent: AgentConnectionsPort
  readonly evidence: ConnectionEvidencePort
}
