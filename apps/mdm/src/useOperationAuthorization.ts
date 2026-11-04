import { useRef, useSyncExternalStore } from 'react'
import type { OperationAuthorizationContext } from '@rss/auth-core'
import type { AuthorizationChallenge } from '@rss/mdm-device-access'
import type { Runtime } from './runtime'
import { useProtectedDelivery } from './useProtectedDelivery'
export function useOperationAuthorization(
  runtime: Runtime,
  context: OperationAuthorizationContext | null,
  permitted: boolean,
  clear: () => void,
) {
  const owner = runtime.operationAuthorization,
    state = useSyncExternalStore(owner.subscribe, owner.getSnapshot),
    current = useRef(context)
  current.current = context
  const delivery = useProtectedDelivery(() => {
    clear()
    const target = current.current
    if (target && owner.getSnapshot().context?.operationId === target.operationId)
      void owner.cancel().catch(() => {})
  }, permitted)
  return {
    delivery,
    state,
    authorized:
      !!context &&
      state.status === 'authorized' &&
      state.context?.operationId === context.operationId &&
      state.context?.purpose === context.purpose,
    async authorize(begin: (signal: AbortSignal) => Promise<AuthorizationChallenge>) {
      if (
        !context ||
        !permitted ||
        typeof PublicKeyCredential === 'undefined' ||
        typeof PublicKeyCredential.parseRequestOptionsFromJSON !== 'function'
      )
        throw { cause: 'client', code: 'authentication_unavailable' }
      const epoch = delivery.capture()
      await runtime.authorizeOperation(context, begin, async (options, signal) => {
        const result = await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
            options as unknown as PublicKeyCredentialRequestOptionsJSON,
          ),
          signal,
        })
        if (
          !(result instanceof PublicKeyCredential) ||
          !delivery.isCurrent(epoch) ||
          signal.aborted
        )
          throw new DOMException('Cancelled', 'AbortError')
        return result.toJSON()
      })
    },
    consume() {
      if (!context || !permitted) throw new Error('Operation context required')
      owner.consume(context)
    },
    async cancel() {
      if (context && owner.getSnapshot().context?.operationId === context.operationId)
        await owner.cancel()
    },
  }
}
