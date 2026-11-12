import type { DirectoryQuery, Page } from '@rss/mdm-devices'
export type Subject =
  | {
      readonly kind: 'rss_login'
      readonly binding: string
      readonly bindingGeneration: number
      readonly sid: string
    }
  | { readonly kind: 'bitlocker'; readonly volume: string; readonly protector: string }
  | { readonly kind: 'local_administrator'; readonly sid: string }
  | { readonly kind: 'filevault'; readonly custody: string; readonly epoch: number }
  | { readonly kind: 'recovery_lock' }
  | { readonly kind: 'lock_pin'; readonly operation: string }
export interface MaterialRef {
  readonly device: string
  readonly id: string
  readonly version: number
}
export interface Material {
  readonly id: string
  readonly binding: {
    readonly device: string
    readonly subject: Subject
  }
  readonly version: number
  readonly current: boolean
  readonly validity: 'unverified' | 'verified' | 'unknown' | 'superseded' | 'revoked'
  readonly escrowed: boolean
  readonly operation: string
  readonly createdAt: number
  readonly invalidatedAt: number | null
}
export interface MaterialRow extends Partial<Omit<Material, 'id' | 'version'>> {
  readonly id: string
  readonly version: number
}
/** Collection authorization, escrow custody and material revisions are different facts. */
export interface FileVaultConfiguration {
  readonly enabled: boolean
  readonly revision: number
  readonly custodyId: string | null
  readonly custodyEpoch: number
  readonly recipientId: string | null
  readonly recipientCertificate: string | null
  readonly materialRevision: number
}
export interface ConfigureFileVault {
  readonly operationId: string
  readonly expectedRevision: number
  readonly enabled: boolean
  readonly recipientId: string
}
export interface Version {
  readonly id: string
  readonly version: number
}
export const actionKinds = [
  'configure_filevault',
  'reconcile_filevault',
  'collect_filevault',
  'rotate_filevault',
  'set_recovery_lock',
  'reconcile_recovery_lock',
  'verify_recovery_lock',
] as const
/** Secrets are not part of the frozen operation intent. */
export type Action =
  | { readonly kind: 'configure_filevault' }
  | {
      readonly kind: 'reconcile_filevault'
      readonly material: Version
      readonly recipient: string | null
    }
  | {
      readonly kind: 'collect_filevault'
      readonly expectedRevision: number
      readonly recipient: string | null
    }
  | { readonly kind: 'rotate_filevault'; readonly expectedRevision: number }
  | {
      readonly kind: 'set_recovery_lock'
      readonly expectedRevision: number
      readonly current: Version | null
      readonly clear: boolean
    }
  | {
      readonly kind: 'reconcile_recovery_lock'
      readonly material: Version
      readonly operation: string
    }
  | { readonly kind: 'verify_recovery_lock'; readonly material: Version }
export interface OperationIntent {
  readonly device: string
  readonly operationId: string
  readonly deadline: number
  readonly action: Action
}
export interface Accepted {
  readonly operationId: string
  readonly commandId: string
  readonly revision: number
  readonly accepted: true
}
export type CommandStatus =
  | 'queued'
  | 'published'
  | 'received'
  | 'applied'
  | 'rejected'
  | 'timed_out'
  | 'superseded'
  | 'cancelled'
export interface CredentialOperation {
  readonly operationId: string
  readonly commandId: string
  readonly revision: number
  readonly inputVersion: string
  readonly deadline: number
  readonly task: string
  readonly commandStatus: CommandStatus
  readonly authorization: 'authorized' | 'blocked' | 'not_applicable'
  readonly authorizationReason:
    | 'lifecycle_blocked'
    | 'registration_changed'
    | 'input_mismatch'
    | 'source_invalid'
    | null
  readonly dispatchFailure: string | null
  readonly observation: {
    readonly scope: 'native_command' | 'profile_presence'
    readonly progress: CommandStatus | 'succeeded' | 'failed' | 'unknown'
    readonly effect: 'unverified' | 'unknown'
    readonly result:
      | 'query_result'
      | 'acknowledged'
      | 'deferred'
      | 'pending_restart'
      | 'in_progress'
      | 'rejected'
      | 'unknown'
      | 'matched'
      | 'mismatched'
      | null
    readonly receipts: readonly {
      readonly phase: 'resolve_device' | 'resolve_security' | 'execute' | 'observe'
      readonly state: 'pending' | 'sent' | 'not_now' | 'acknowledged' | 'error' | 'superseded'
      readonly receivedAt: number | null
      readonly accepted: boolean
    }[]
  }
}
export interface Disclosure {
  readonly material: Material
  readonly secret: string
}
export interface LoginDisclosure {
  readonly operationId: string
  readonly target: MaterialRef
}
export interface MaterialChallenge {
  readonly id: string
  readonly publicKey: Readonly<Record<string, unknown>>
}
export interface RecoveryCredentialsPort {
  list(
    device: string,
    query: DirectoryQuery<keyof Material>,
    signal?: AbortSignal,
  ): Promise<Page<MaterialRow>>
  material(target: MaterialRef, signal?: AbortSignal): Promise<Material>
  configuration(device: string): Promise<FileVaultConfiguration>
  configure(device: string, input: ConfigureFileVault): Promise<FileVaultConfiguration>
  link(device: string, operationId: string, otherDevice: string): Promise<FileVaultConfiguration>
  reveal(target: MaterialRef, signal?: AbortSignal): Promise<Disclosure>
  beginLoginDisclosure(input: LoginDisclosure, signal?: AbortSignal): Promise<MaterialChallenge>
  revealLogin(input: LoginDisclosure, signal?: AbortSignal): Promise<Disclosure>
  revoke(target: MaterialRef): Promise<Material>
  create(input: OperationIntent, unlockPassword?: string): Promise<Accepted>
  operation(device: string, id: string): Promise<CredentialOperation>
}
