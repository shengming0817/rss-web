import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { AuditApi } from '@rss/audit'

const AUDIT_API: InjectionKey<AuditApi> = Symbol('rss-audit-api')

export function auditApiPlugin(api: AuditApi): Plugin {
  return { install: (app: App) => app.provide(AUDIT_API, api) }
}

export function useAuditApi(): AuditApi {
  const api = inject(AUDIT_API)
  if (api === undefined) throw new Error('Audit API provider is unavailable')
  return api
}
