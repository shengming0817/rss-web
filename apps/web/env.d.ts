/// <reference types="vite/client" />

declare const __RSS_WEB_REVISION__: string

interface ImportMetaEnv {
  readonly VITE_ROLE_BINDINGS_PREVIEW?: string
  readonly VITE_CONFIG_CATALOG_PREVIEW?: string
  readonly VITE_CONFIG_HISTORY_PREVIEW?: string
}
