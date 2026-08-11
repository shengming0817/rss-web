import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { PoliciesApi } from '@rss/identity'

const POLICIES_API: InjectionKey<PoliciesApi> = Symbol('rss-policies-api')

export function policiesApiPlugin(api: PoliciesApi): Plugin {
  return { install: (app: App) => app.provide(POLICIES_API, api) }
}

export function usePoliciesApi(): PoliciesApi {
  const api = inject(POLICIES_API)
  if (api === undefined) throw new Error('Policies API provider is unavailable')
  return api
}
