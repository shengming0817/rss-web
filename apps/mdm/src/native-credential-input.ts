import type {
  Action,
  FileVaultConfiguration,
  Material,
  Version,
} from '@rss/mdm-recovery-credentials'
export interface NativeCredentialFields {
  kind: Action['kind']
  deadline: string
  material?: Version
  recipient?: string
  expectedRevision?: number
  noExisting?: boolean
  useCurrent?: boolean
  current?: Version
  clear?: boolean
  operation?: string
  unlockPassword?: string
}
/** Author the formal action only. Configuration and material CAS never substitute for each other. */
export function nativeCredentialAction(
  value: NativeCredentialFields,
  configuration: FileVaultConfiguration | null,
  selected: Material | null,
): Action {
  const material = () =>
    value.material ?? (selected ? { id: selected.id, version: selected.version } : undefined)
  function exact(): Version {
    const result = material()
    if (!result) throw new Error('Exact material required')
    return { id: result.id, version: result.version }
  }
  function fileVaultRevision(): number {
    if (!configuration) throw new Error('Read native FileVault configuration first')
    return configuration.materialRevision
  }
  switch (value.kind) {
    case 'configure_filevault':
      return { kind: value.kind }
    case 'collect_filevault':
      return {
        kind: value.kind,
        expectedRevision: fileVaultRevision(),
        recipient: value.recipient || null,
      }
    case 'rotate_filevault':
      return { kind: value.kind, expectedRevision: fileVaultRevision() }
    case 'reconcile_filevault':
      return { kind: value.kind, material: exact(), recipient: value.recipient || null }
    case 'set_recovery_lock': {
      const expectedRevision = value.noExisting ? 0 : value.expectedRevision
      if (expectedRevision === undefined || (!value.noExisting && expectedRevision < 1))
        throw new Error('Explicit material CAS required')
      const current = value.useCurrent ? value.current : null
      if (value.useCurrent && !current) throw new Error('Exact current material required')
      return {
        kind: value.kind,
        expectedRevision,
        current: current ? { id: current.id, version: current.version } : null,
        clear: value.clear ?? false,
      }
    }
    case 'reconcile_recovery_lock':
      if (!value.operation) throw new Error('Original set operation required')
      return { kind: value.kind, material: exact(), operation: value.operation }
    case 'verify_recovery_lock':
      return { kind: value.kind, material: exact() }
    default:
      throw new Error('Unsupported credential action')
  }
}
