export { createIdentitySession } from './controller'
export { isIdentitySessionError } from './errors'
export { classifyPasswordChangeFailure } from './password-change-failure'
export type {
  IdentitySession,
  IdentitySessionConfig,
  IdentitySessionError,
  IdentitySessionErrorCode,
  IdentitySessionListener,
  IdentitySessionState,
  SessionOperationOptions,
  VerifiedProfile,
  VerifiedProfileKind,
} from './types'
export type {
  PasswordChangeFailureDisposition,
  PasswordChangeFailureKind,
} from './password-change-failure'
