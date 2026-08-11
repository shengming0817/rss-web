const PREVIEW_MODES: ReadonlySet<string> = new Set(['development', 'test', 'demo'])

export function isConfigCatalogPreviewEnabled(mode: string, value: unknown): boolean {
  return PREVIEW_MODES.has(mode) && value === 'true'
}
