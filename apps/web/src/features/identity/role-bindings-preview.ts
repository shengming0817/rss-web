import { MOCK_SOURCE } from '@rss/shared'

export interface RoleBindingPreviewRow {
  readonly previewId: string
  readonly subject: string
  readonly roleId: string
  readonly roleName: string
  readonly source: typeof MOCK_SOURCE
}

function row(value: Omit<RoleBindingPreviewRow, 'source'>): RoleBindingPreviewRow {
  return Object.freeze({ ...value, source: MOCK_SOURCE })
}

export const ROLE_BINDINGS_PREVIEW_ROWS: readonly RoleBindingPreviewRow[] = Object.freeze([
  row({
    previewId: 'preview-binding-alpha-reader',
    subject: 'preview-subject-alpha',
    roleId: 'preview:reader',
    roleName: 'Synthetic reader',
  }),
  row({
    previewId: 'preview-binding-alpha-auditor',
    subject: 'preview-subject-alpha',
    roleId: 'preview:auditor',
    roleName: 'Synthetic auditor',
  }),
  row({
    previewId: 'preview-binding-beta-reader',
    subject: 'preview-subject-beta',
    roleId: 'preview:reader',
    roleName: 'Synthetic reader',
  }),
])

export interface RoleBindingPreviewGroup {
  readonly key: string
  readonly rows: readonly RoleBindingPreviewRow[]
}

export function groupRoleBindingsPreview(
  coordinate: 'subject' | 'roleId',
): readonly RoleBindingPreviewGroup[] {
  const rows = new Map<string, RoleBindingPreviewRow[]>()
  for (const binding of ROLE_BINDINGS_PREVIEW_ROWS) {
    const key = binding[coordinate]
    const group = rows.get(key) ?? []
    group.push(binding)
    rows.set(key, group)
  }
  return Object.freeze(
    [...rows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => Object.freeze({ key, rows: Object.freeze(values) })),
  )
}
