import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import { isConfigCatalogPreviewKey } from '@rss/settings/preview'

export interface ConfigCatalogDraftHandoff {
  stage(key: string): boolean
  consume(): { readonly key: string } | undefined
}

export function createConfigCatalogDraftHandoff(): ConfigCatalogDraftHandoff {
  let staged: string | undefined
  return Object.freeze({
    stage(key: string) {
      if (!isConfigCatalogPreviewKey(key)) return false
      staged = key
      return true
    },
    consume() {
      const key = staged
      staged = undefined
      return key === undefined ? undefined : Object.freeze({ key })
    },
  })
}

const CONFIG_CATALOG_DRAFT: InjectionKey<ConfigCatalogDraftHandoff> = Symbol(
  'rss-config-catalog-draft',
)

export function configCatalogDraftPlugin(handoff: ConfigCatalogDraftHandoff): Plugin {
  return { install: (app: App) => app.provide(CONFIG_CATALOG_DRAFT, handoff) }
}

export function useConfigCatalogDraftHandoff(): ConfigCatalogDraftHandoff {
  const handoff = inject(CONFIG_CATALOG_DRAFT)
  if (handoff === undefined) throw new Error('Config Catalog draft handoff is unavailable')
  return handoff
}

export function useOptionalConfigCatalogDraftHandoff(): ConfigCatalogDraftHandoff | undefined {
  return inject(CONFIG_CATALOG_DRAFT, undefined)
}
