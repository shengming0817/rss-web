import type { IdentitySessionError, IdentitySessionErrorCode } from './types'

class IdentitySessionErrorImpl extends Error implements IdentitySessionError {
  override readonly name = 'IdentitySessionError' as const

  constructor(readonly code: IdentitySessionErrorCode) {
    super(code)
  }
}

export function sessionError(code: IdentitySessionErrorCode): IdentitySessionError {
  return new IdentitySessionErrorImpl(code)
}

export function isIdentitySessionError(value: unknown): value is IdentitySessionError {
  return value instanceof IdentitySessionErrorImpl
}
