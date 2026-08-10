import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { RolesApi } from '@rss/identity'

const ROLES_API: InjectionKey<RolesApi> = Symbol('rss-roles-api')

export function rolesApiPlugin(api: RolesApi): Plugin {
  return { install: (app: App) => app.provide(ROLES_API, api) }
}

export function useRolesApi(): RolesApi {
  const api = inject(ROLES_API)
  if (api === undefined) throw new Error('Roles API provider is unavailable')
  return api
}
