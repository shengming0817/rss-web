export type NavPill = 'live' | 'preview' | 'new' | 'reserved'

export interface NavItem {
  key: string
  labelKey: string
  to: string
  pill?: NavPill
}

export interface NavGroup {
  groupKey: string
  labelKey: string
  items: NavItem[]
}

// Only implemented, RSS-owned surfaces are navigable. Future products must add
// a real route and test instead of reserving a disabled menu entry.
export const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'access',
    labelKey: 'nav.group.access',
    items: [
      { key: 'identities', labelKey: 'nav.identities', to: '/access/identities' },
      { key: 'policies', labelKey: 'nav.policies', to: '/access/policies' },
    ],
  },
  {
    groupKey: 'operate',
    labelKey: 'nav.group.operate',
    items: [
      { key: 'audit', labelKey: 'nav.audit', to: '/audit' },
      { key: 'config', labelKey: 'nav.config', to: '/config' },
    ],
  },
] as const satisfies NavGroup[]
