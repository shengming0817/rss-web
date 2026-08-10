import { describe, expect, it, vi } from 'vitest'
import { decodeWireErrorForTest, networkErrorForTest } from '@rss/api/testing'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationIntent } from '@rss/authorization'
import type { IdentitySession, IdentitySessionState, VerifiedProfile } from '@rss/identity'
import { createAuthorizationExperience } from './authorization-context'

const intent: AuthorizationIntent = {
  contractId: 'identity.policies-update',
  permission: 'identity:policy:update',
  resourceId: 'policy-1',
}
const otherIntent: AuthorizationIntent = {
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
  resourceId: 'policy-2',
}

const profile = {
  subject: 'subject-a',
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  kind: 'user',
} as VerifiedProfile

function wire(status: number, code: string) {
  return decodeWireErrorForTest(status, {
    error: {
      code,
      message: 'must never reach the UI',
      retryable: false,
      details: [],
      requestId: 'request-id',
    },
  })
}

function sessionFixture() {
  let state: IdentitySessionState = {
    status: 'authenticated',
    profile,
    sessionExpiresAt: 2,
    accessExpiresAt: 1,
  }
  const listeners = new Set<(next: IdentitySessionState) => void>()
  return {
    session: {
      getState: () => state,
      subscribe: (listener: (next: IdentitySessionState) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    } as unknown as IdentitySession,
    publish(next: IdentitySessionState) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

function previewFixture() {
  return createPreviewAuthorizationPort({
    enabled: true,
    scenarios: [{ id: 'allow-policy-edit', intent, decision: 'allow' }],
  })
}

function multiPreviewFixture() {
  return createPreviewAuthorizationPort({
    enabled: true,
    scenarios: [
      { id: 'allow-policy-edit', intent, decision: 'allow' },
      { id: 'allow-policy-read', intent: otherIntent, decision: 'allow' },
    ],
  })
}

describe('server-authoritative authorization experience', () => {
  it('invalidates a local allow only for an exact sanitized RSS forbidden error', async () => {
    const { session } = sessionFixture()
    const port = previewFixture()
    const experience = createAuthorizationExperience({ port, session })
    const forbidden = wire(403, 'ERR_CORE_FORBIDDEN')
    const operation = vi.fn().mockRejectedValue(forbidden)

    await expect(experience.execute(intent, operation)).rejects.toBe(forbidden)

    expect(operation).toHaveBeenCalledOnce()
    expect(experience.getHint(intent)).toMatchObject({ decision: 'unknown' })
    expect(experience.getOutcome(intent)).toEqual({
      status: 'forbidden',
      requestId: 'request-id',
    })
    expect(
      experience.getOutcome({ ...intent, tenantId: 'tenant-b' } as AuthorizationIntent),
    ).toEqual({ status: 'idle' })
  })

  it.each([
    wire(401, 'ERR_CORE_UNAUTHENTICATED'),
    wire(403, 'ERR_SOME_OTHER_CODE'),
    wire(409, 'ERR_CORE_CONFLICT'),
    networkErrorForTest(),
    new Error('untrusted failure'),
    Object.assign(new Error('spoofed forbidden'), {
      cause: 'wire',
      code: 'ERR_CORE_FORBIDDEN',
      requestId: 'spoofed',
      status: 403,
    }),
  ])('does not invalidate hints for non-authoritative denial coordinates', async (error) => {
    const { session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })

    await expect(experience.execute(intent, () => Promise.reject(error))).rejects.toBe(error)

    expect(experience.getHint(intent)).toMatchObject({ decision: 'allow' })
    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
  })

  it('does not record authority-bearing structural extras as an exact denied intent', async () => {
    const { session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })
    const unsafeIntent = { ...intent, tenantId: 'tenant-b' }

    await expect(
      experience.execute(unsafeIntent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
    ).rejects.toBeDefined()

    expect(experience.getHint(intent)).toMatchObject({ decision: 'allow' })
    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
  })

  it('clears recent denial after a successful exact operation without restoring the invalid hint', async () => {
    const { session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })
    await expect(
      experience.execute(intent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
    ).rejects.toBeDefined()

    await expect(experience.execute(intent, () => Promise.resolve('ok'))).resolves.toBe('ok')

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getHint(intent)).toMatchObject({ decision: 'unknown' })
  })

  it('keeps final denial outcomes isolated for multiple exact intents', async () => {
    const { session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: multiPreviewFixture(), session })
    for (const deniedIntent of [intent, otherIntent]) {
      await expect(
        experience.execute(deniedIntent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
      ).rejects.toBeDefined()
    }

    expect(experience.getOutcome(intent)).toMatchObject({ status: 'forbidden' })
    expect(experience.getOutcome(otherIntent)).toMatchObject({ status: 'forbidden' })

    await experience.execute(intent, () => Promise.resolve())
    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getOutcome(otherIntent)).toMatchObject({ status: 'forbidden' })
  })

  it('does not let an older success clear a newer denial for the same intent', async () => {
    const { session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })
    let resolveOlder!: (value: string) => void
    const older = experience.execute(
      intent,
      () =>
        new Promise<string>((resolve) => {
          resolveOlder = resolve
        }),
    )
    await expect(
      experience.execute(intent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
    ).rejects.toBeDefined()

    resolveOlder('older-success')
    await expect(older).resolves.toBe('older-success')

    expect(experience.getOutcome(intent)).toMatchObject({ status: 'forbidden' })
  })

  it('resets UX-only outcomes and Preview invalidations when session authority changes', async () => {
    const { publish, session } = sessionFixture()
    const port = previewFixture()
    const experience = createAuthorizationExperience({ port, session })
    const listener = vi.fn()
    experience.subscribe(listener)
    await expect(
      experience.execute(intent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
    ).rejects.toBeDefined()

    publish({ status: 'expired' })

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getHint(intent)).toMatchObject({ decision: 'allow' })
    expect(listener).toHaveBeenCalled()
  })

  it('does not carry a forbidden UX outcome across verified principals', async () => {
    const { publish, session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })
    await expect(
      experience.execute(intent, () => Promise.reject(wire(403, 'ERR_CORE_FORBIDDEN'))),
    ).rejects.toBeDefined()

    publish({
      status: 'authenticated',
      profile: { ...profile, subject: 'subject-b' } as VerifiedProfile,
      sessionExpiresAt: 4,
      accessExpiresAt: 3,
    })

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getHint(intent)).toMatchObject({ decision: 'allow' })
  })

  it('fences a late forbidden completion from an earlier session authority', async () => {
    const { publish, session } = sessionFixture()
    const experience = createAuthorizationExperience({ port: previewFixture(), session })
    let rejectOperation!: (error: unknown) => void
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject
    })
    const pending = experience.execute(intent, () => operation)

    publish({ status: 'expired' })
    const forbidden = wire(403, 'ERR_CORE_FORBIDDEN')
    rejectOperation(forbidden)
    await expect(pending).rejects.toBe(forbidden)

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getHint(intent)).toMatchObject({ decision: 'allow' })
  })

  it('keeps disposal terminal when a pending forbidden operation completes late', async () => {
    const { session } = sessionFixture()
    const port = previewFixture()
    const experience = createAuthorizationExperience({ port, session })
    let rejectOperation!: (error: unknown) => void
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject
    })
    const pending = experience.execute(intent, () => operation)

    experience.dispose()
    const forbidden = wire(403, 'ERR_CORE_FORBIDDEN')
    rejectOperation(forbidden)
    await expect(pending).rejects.toBe(forbidden)

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(port.preview(intent)).toMatchObject({ decision: 'allow' })
  })
})
