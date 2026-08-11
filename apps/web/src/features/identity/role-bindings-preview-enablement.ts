const MODES: readonly string[] = ['development', 'test', 'demo']

export function isRoleBindingsPreviewEnabled(mode: string, value: unknown): boolean {
  return MODES.includes(mode) && value === 'true'
}
