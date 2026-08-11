import { isConfigPreviewEnabled } from './config-preview-enablement'

export function isConfigCatalogPreviewEnabled(mode: string, value: unknown): boolean {
  return isConfigPreviewEnabled(mode, value)
}
