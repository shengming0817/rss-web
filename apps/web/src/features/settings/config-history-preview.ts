import { isConfigPreviewEnabled } from './config-preview-enablement'

export function isConfigHistoryPreviewEnabled(mode: string, value: unknown): boolean {
  return isConfigPreviewEnabled(mode, value)
}
