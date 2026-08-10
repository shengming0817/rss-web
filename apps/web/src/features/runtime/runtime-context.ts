import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { RuntimeApi } from '@rss/runtime'

const RUNTIME_API: InjectionKey<RuntimeApi> = Symbol('rss-runtime-api')

export function runtimeApiPlugin(api: RuntimeApi): Plugin {
  return { install: (app: App) => app.provide(RUNTIME_API, api) }
}

export function useRuntimeApi(): RuntimeApi {
  const api = inject(RUNTIME_API)
  if (api === undefined) throw new Error('Runtime API provider is unavailable')
  return api
}
