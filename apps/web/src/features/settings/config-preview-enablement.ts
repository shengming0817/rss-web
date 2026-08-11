const CONFIG_PREVIEW_MODES: ReadonlySet<string> = new Set(['development', 'test', 'demo'])

export function isConfigPreviewEnabled(mode: string, value: unknown): boolean {
  return CONFIG_PREVIEW_MODES.has(mode) && value === 'true'
}
