export const purposes = ['windows', 'apple', 'agent'] as const
export type Purpose = (typeof purposes)[number]
export interface Issuer {
  readonly digest: string
  readonly mode: 'prepared' | 'active' | 'verify_only'
  readonly certificate: string
  readonly root: string
  readonly crl: string
  readonly rootCrl: string
  readonly provisioner: string
  readonly kid: string
}
/** Current process-loaded public material, not desired state or a write receipt. */
export interface Trust {
  readonly serviceId: string
  readonly origin: string
  readonly tenant: string
  readonly purpose: Purpose
  readonly revision: number
  readonly issuers: readonly Issuer[]
}
export interface Prepare {
  readonly id: string
  readonly purpose: Purpose
  readonly expectedRevision: number
  readonly candidate: Trust
}
export interface Transition {
  readonly id: string
  readonly purpose: Purpose
  readonly expectedRevision: number
  readonly action: 'activate' | 'retire'
}
export interface RotationReceipt {
  readonly operation: string
  readonly revision: number
  readonly state: 'distributing' | 'activated' | 'retired'
}
export interface CrlPublication {
  readonly operation: string
  readonly purpose: Purpose
  readonly publications: readonly {
    readonly issuer: string
    readonly crl: string
    readonly rootCrl: string
  }[]
}
export interface SigningRecovery {
  readonly operation: string
  readonly attempt: string
  readonly chain: readonly string[]
}
export interface Observation {
  readonly operation: string
  readonly device: string
  readonly sequence: number
  readonly target: { readonly revision: number; readonly digest: string } | null
  readonly actual: { readonly revision: number; readonly digest: string } | null
  readonly state: 'received' | 'applied' | 'failed' | 'unknown'
  readonly reason:
    | 'transport'
    | 'validation'
    | 'storage'
    | 'credential'
    | 'installation'
    | 'restart'
    | null
  readonly observedAt: number
  readonly receivedAt: number
}
/** Secret is supplied only to submission; never retained in the original operation record. */
export interface RegistrationRecovery {
  readonly device: string
  readonly operationId: string
  readonly platform: 'windows' | 'macos'
  readonly csr: string
}
export interface GrantReceipt {
  readonly grantId: string
  readonly state: 'pending' | 'available' | 'consumed' | 'revoked' | 'expired'
  readonly expiresAt: number
  readonly platform: 'windows' | 'macos'
}
export interface IssuanceRecovery {
  readonly issuance: string
  readonly operationId: string
  readonly certificateChain: readonly string[]
}
export interface IssuanceCandidate {
  readonly issuanceId: string
  /** Original device signing operation, distinct from the administrator recovery operation. */
  readonly originalSigningOperationId: string
  readonly certificateChain: readonly string[]
  readonly activateBefore: number
}
export interface DevicePkiPort {
  trust(purpose: Purpose): Promise<Trust>
  prepare(input: Prepare): Promise<RotationReceipt>
  transition(input: Transition): Promise<RotationReceipt>
  publish(input: CrlPublication): Promise<void>
  recoverSigning(
    input: SigningRecovery,
  ): Promise<{ readonly attempt: string; readonly fingerprint: string }>
  observation(device: string): Promise<Observation | null>
  registrationRecovery(device: string, operation: string): Promise<GrantReceipt | null>
  recoverRegistration(input: RegistrationRecovery, secret: string): Promise<GrantReceipt>
  recoverIssuance(input: IssuanceRecovery): Promise<IssuanceCandidate>
  issuanceRecovery(
    issuance: string,
    administrativeOperationId: string,
  ): Promise<IssuanceCandidate | null>
}
