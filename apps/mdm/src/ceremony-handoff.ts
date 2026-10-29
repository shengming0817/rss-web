import type { MaterialAuthorization } from '@rss/auth-core'
/** Order the two actual WebAuthn consumers of the app's one HttpOnly operation cookie. */
export function createCeremonyHandoff(
  material: MaterialAuthorization,
  cancelPasskeyAuthorization: () => Promise<void>,
) {
  let passkey: Promise<unknown> | null = null
  return {
    async runPasskeyCeremony<T>(work: () => Promise<T>): Promise<T> {
      if (passkey) throw { cause: 'client', code: 'action_busy' }
      const running = (async () => {
        await material.cancel()
        return work()
      })()
      passkey = running
      try {
        return await running
      } finally {
        if (passkey === running) passkey = null
      }
    },
    authorizeMaterial(
      context: Parameters<MaterialAuthorization['authorize']>[0],
      begin: Parameters<MaterialAuthorization['authorize']>[1],
      authenticate: Parameters<MaterialAuthorization['authorize']>[2],
    ) {
      const previous = passkey
      return material.authorize(
        context,
        async (signal) => {
          if (previous) await previous.catch(() => {})
          if (signal.aborted) throw { cause: 'client', code: 'authentication_cancelled' }
          await cancelPasskeyAuthorization()
          if (signal.aborted) throw { cause: 'client', code: 'authentication_cancelled' }
          return begin(signal)
        },
        authenticate,
      )
    },
  }
}
