import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { SettingsApi } from '@rss/settings'

const SETTINGS_API: InjectionKey<SettingsApi> = Symbol('rss-settings-api')

export function settingsApiPlugin(api: SettingsApi): Plugin {
  return { install: (app: App) => app.provide(SETTINGS_API, api) }
}

export function useSettingsApi(): SettingsApi {
  const api = inject(SETTINGS_API)
  if (api === undefined) throw new Error('Settings API provider is unavailable')
  return api
}
