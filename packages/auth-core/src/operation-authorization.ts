/** Exact contexts for the formally supported uses of the single operation cookie. */
export interface MaterialDisclosureContext {
  readonly purpose: 'mdm.device_access.disclose'
  readonly device: string
  readonly material: string
  readonly version: number
  readonly operationId: string
}
export type OperationAuthorizationContext =
  | MaterialDisclosureContext
  | {
      readonly purpose: 'mdm.device_access.change'
      readonly device: string
      readonly binding: string
      readonly operationId: string
      readonly inputKey: string
    }
  | {
      readonly purpose: 'mdm.enterprise.configuration'
      readonly operationId: string
      readonly inputKey: string
    }
export interface OperationAuthorizationChallenge {
  readonly id: string
  readonly publicKey: Readonly<Record<string, unknown>>
}
export interface OperationAuthorizationPort {
  finish(id: string, response: unknown): Promise<number>
  cancelCeremony(id: string): Promise<void>
  cancelAuthorization(): Promise<void>
  classify(error: unknown): 'denied' | 'unavailable' | 'unknown' | 'cancelled'
}
export interface OperationAuthorizationState {
  readonly status:
    | 'idle'
    | 'challenging'
    | 'authorized'
    | 'consumed'
    | 'expired'
    | 'cancelled'
    | 'denied'
    | 'unavailable'
    | 'unknown'
    | 'cancelling'
    | 'cancellation_unconfirmed'
  readonly context: OperationAuthorizationContext | null
  readonly expiresAt: number | null
}
function uuid(value: string): void {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Invalid disclosure identifier')
}
function key(context: OperationAuthorizationContext): string {
  uuid(context.operationId)
  if (
    context.purpose === 'mdm.device_access.change' ||
    context.purpose === 'mdm.enterprise.configuration'
  ) {
    if (!/^[0-9a-f]{64}$/.test(context.inputKey)) throw new Error('Invalid operation input key')
    if (context.purpose === 'mdm.device_access.change') {
      uuid(context.binding)
      if (
        !context.device ||
        new TextEncoder().encode(context.device).length > 256 ||
        /\p{Cc}/u.test(context.device)
      )
        throw new Error('Invalid operation device')
      return JSON.stringify([
        context.purpose,
        context.operationId,
        context.device,
        context.binding,
        context.inputKey,
      ])
    }
    return JSON.stringify([context.purpose, context.operationId, context.inputKey])
  }
  if (
    context.purpose !== 'mdm.device_access.disclose' ||
    !context.device ||
    new TextEncoder().encode(context.device).length > 256 ||
    /\p{Cc}/u.test(context.device) ||
    !Number.isSafeInteger(context.version) ||
    context.version < 1
  )
    throw new Error('Invalid disclosure context')
  uuid(context.material)
  uuid(context.operationId)
  return JSON.stringify([
    context.purpose,
    context.device,
    context.material,
    context.version,
    context.operationId,
  ])
}
interface Attempt {
  readonly context: OperationAuthorizationContext
  readonly key: string
  readonly scope: string
  readonly controller: AbortController
  ceremony: string | null
  finish: Promise<number> | null
  cancelled: boolean
  cleanup: Promise<void> | null
}
/** Local ceremony ownership only. Authority remains the HttpOnly, server-verified operation cookie. */
export function createOperationAuthorization(
  port: OperationAuthorizationPort,
  scope: () => string | null,
  now: () => number = Date.now,
) {
  let state: OperationAuthorizationState = Object.freeze({
      status: 'idle',
      context: null,
      expiresAt: null,
    }),
    active: Attempt | null = null
  const listeners = new Set<() => void>()
  function publish(
    status: OperationAuthorizationState['status'],
    attempt: Attempt | null,
    expiresAt: number | null = null,
  ) {
    state = Object.freeze({ status, context: attempt?.context ?? null, expiresAt })
    listeners.forEach((listener) => listener())
  }
  function current(attempt: Attempt) {
    return (
      active === attempt &&
      !attempt.cancelled &&
      !attempt.controller.signal.aborted &&
      scope() === attempt.scope
    )
  }
  async function cleanup(attempt: Attempt): Promise<void> {
    if (attempt.cleanup) return attempt.cleanup
    attempt.cleanup = (async () => {
      // Await an already-dispatched finish before clearing its cookie; never race a late proof.
      if (attempt.finish) await attempt.finish.catch(() => {})
      if (scope() !== attempt.scope) return
      if (attempt.ceremony && !attempt.finish) await port.cancelCeremony(attempt.ceremony)
      await port.cancelAuthorization()
    })()
    return attempt.cleanup
  }
  async function cancel(): Promise<void> {
    const attempt = active
    if (!attempt) {
      publish('idle', null)
      return
    }
    attempt.cancelled = true
    attempt.controller.abort()
    publish('cancelling', attempt)
    try {
      await cleanup(attempt)
      if (active === attempt) {
        active = null
        publish('cancelled', attempt)
      }
    } catch (error) {
      attempt.cleanup = null
      if (active === attempt) publish('cancellation_unconfirmed', attempt)
      throw error
    }
  }
  return Object.freeze({
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    async authorize(
      context: OperationAuthorizationContext,
      begin: (signal: AbortSignal) => Promise<OperationAuthorizationChallenge>,
      authenticate: (
        options: Readonly<Record<string, unknown>>,
        signal: AbortSignal,
      ) => Promise<unknown>,
    ) {
      const contextKey = key(context),
        bound = scope()
      if (!bound) throw new Error('Session required')
      if (active && active.scope !== bound) {
        active.cancelled = true
        active.controller.abort()
        active = null
      }
      if (active) throw new Error('Cancel the current operation authorization first')
      const attempt: Attempt = {
        context: Object.freeze(
          context.purpose === 'mdm.device_access.disclose'
            ? {
                purpose: context.purpose,
                device: context.device,
                material: context.material,
                version: context.version,
                operationId: context.operationId,
              }
            : context.purpose === 'mdm.device_access.change'
              ? {
                  purpose: context.purpose,
                  device: context.device,
                  binding: context.binding,
                  operationId: context.operationId,
                  inputKey: context.inputKey,
                }
              : {
                  purpose: context.purpose,
                  operationId: context.operationId,
                  inputKey: context.inputKey,
                },
        ),
        key: contextKey,
        scope: bound,
        controller: new AbortController(),
        ceremony: null,
        finish: null,
        cancelled: false,
        cleanup: null,
      }
      active = attempt
      publish('challenging', attempt)
      try {
        const challenge = await begin(attempt.controller.signal)
        uuid(challenge.id)
        attempt.ceremony = challenge.id
        if (!current(attempt)) {
          // A hidden page may have cancelled before begin returned its ceremony ID.
          if (scope() === bound) await port.cancelCeremony(challenge.id)
          throw new Error('Operation authorization abandoned')
        }
        const response = await authenticate(challenge.publicKey, attempt.controller.signal)
        if (!current(attempt)) throw new Error('Operation authorization abandoned')
        attempt.finish = port.finish(challenge.id, response)
        const expiresAt = await attempt.finish
        if (!current(attempt)) throw new Error('Operation authorization abandoned')
        if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now()) {
          publish('expired', attempt)
          return
        }
        publish('authorized', attempt, expiresAt)
      } catch (error) {
        if (active !== attempt || attempt.cancelled || scope() !== bound) throw error
        if (attempt.finish) {
          const failure = port.classify(error)
          publish(failure === 'denied' ? 'denied' : 'unknown', attempt)
        } else {
          try {
            await cleanup(attempt)
            active = null
            publish(port.classify(error), attempt)
          } catch {
            attempt.cleanup = null
            publish('cancellation_unconfirmed', attempt)
          }
        }
        throw error
      }
    },
    /** Call once immediately before the explicit exact material POST; no automatic disclosure. */
    consume(context: OperationAuthorizationContext): void {
      const attempt = active
      if (
        !attempt ||
        !current(attempt) ||
        state.status !== 'authorized' ||
        attempt.key !== key(context)
      )
        throw new Error('No authorization for this exact disclosure')
      if (state.expiresAt === null || state.expiresAt * 1000 <= now()) {
        publish('expired', attempt)
        throw new Error('Operation authorization expired')
      }
      publish('consumed', attempt)
      // Keep the owner until explicit cleanup. A second page cannot overwrite a pending disclosure proof.
    },
    expire(): void {
      if (
        active &&
        state.status === 'authorized' &&
        state.expiresAt !== null &&
        state.expiresAt * 1000 <= now()
      )
        publish('expired', active)
    },
    cancel,
  })
}
export type OperationAuthorization = ReturnType<typeof createOperationAuthorization>
