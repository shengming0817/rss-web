import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { AccountStatusApi } from '@rss/identity'

const ACCOUNT_STATUS_API: InjectionKey<AccountStatusApi> = Symbol('rss-account-status-api')

export function accountStatusApiPlugin(api: AccountStatusApi): Plugin {
  return { install: (app: App) => app.provide(ACCOUNT_STATUS_API, api) }
}

export function useAccountStatusApi(): AccountStatusApi {
  const api = inject(ACCOUNT_STATUS_API)
  if (api === undefined) throw new Error('Account Status API provider is unavailable')
  return api
}
