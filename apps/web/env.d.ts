/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 基址；开发期由 vite proxy 转发 /api（见 .env.development）。 */
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
