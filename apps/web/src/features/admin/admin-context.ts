import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { AuditApi } from '@rss/audit'
import type { RuntimeApi } from '@rss/runtime'

export interface AdminClients {
  readonly audit: AuditApi
  readonly runtime: RuntimeApi
}

const ADMIN_CLIENTS: InjectionKey<AdminClients> = Symbol('rss-admin-clients')

export function provideAdminClients(app: App, clients: AdminClients): void {
  app.provide(ADMIN_CLIENTS, Object.freeze(clients))
}

export function adminClientsPlugin(clients: AdminClients): Plugin {
  return { install: (app) => provideAdminClients(app, clients) }
}

export function useAdminClients(): AdminClients {
  const clients = inject(ADMIN_CLIENTS)
  if (clients === undefined) throw new Error('Admin clients provider is unavailable')
  return clients
}
