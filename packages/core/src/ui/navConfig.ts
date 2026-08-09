/**
 * NAV_GROUPS — typed navigation configuration for AppShell.
 *
 * labelKey format: `nav.<item>` — resolved by vue-i18n at render time.
 * pill values: 'live' | 'preview' | 'new' | 'reserved'
 *   - 'live':     enabled, no pill shown
 *   - 'new':      enabled, green-ish pill (new feature)
 *   - 'preview':  enabled but visually weakened
 *   - 'reserved': not yet implemented, disabled / placeholder
 *
 * PRD §5.1.1 defines 6 groups:
 *   meta | plan | build | access | operate | reserved
 */

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

export const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'meta',
    labelKey: 'nav.group.meta',
    items: [{ key: 'coverage', labelKey: 'nav.coverage', to: '/coverage', pill: 'new' }],
  },
  {
    groupKey: 'plan',
    labelKey: 'nav.group.plan',
    items: [
      { key: 'products', labelKey: 'nav.products', to: '/products', pill: 'reserved' },
      { key: 'backlog', labelKey: 'nav.backlog', to: '/backlog', pill: 'reserved' },
      { key: 'inbox', labelKey: 'nav.inbox', to: '/inbox', pill: 'reserved' },
      { key: 'board', labelKey: 'nav.board', to: '/board', pill: 'reserved' },
      { key: 'sprint', labelKey: 'nav.sprint', to: '/sprint', pill: 'reserved' },
    ],
  },
  {
    groupKey: 'build',
    labelKey: 'nav.group.build',
    items: [
      { key: 'workflow', labelKey: 'nav.workflow', to: '/workflow', pill: 'reserved' },
      { key: 'dag', labelKey: 'nav.dag', to: '/dag', pill: 'reserved' },
      { key: 'ai', labelKey: 'nav.ai', to: '/ai', pill: 'reserved' },
      { key: 'sandboxes', labelKey: 'nav.sandboxes', to: '/sandboxes', pill: 'reserved' },
      { key: 'deps', labelKey: 'nav.deps', to: '/deps', pill: 'live' },
      { key: 'contracts', labelKey: 'nav.contracts', to: '/contracts', pill: 'live' },
    ],
  },
  {
    groupKey: 'access',
    labelKey: 'nav.group.access',
    items: [
      { key: 'identities', labelKey: 'nav.identities', to: '/access/identities', pill: 'live' },
      { key: 'policies', labelKey: 'nav.policies', to: '/access/policies', pill: 'live' },
      { key: 'decisions', labelKey: 'nav.decisions', to: '/access/decisions', pill: 'reserved' },
    ],
  },
  {
    groupKey: 'operate',
    labelKey: 'nav.group.operate',
    items: [
      { key: 'audit', labelKey: 'nav.audit', to: '/audit', pill: 'live' },
      { key: 'config', labelKey: 'nav.config', to: '/config', pill: 'live' },
      { key: 'flags', labelKey: 'nav.flags', to: '/flags', pill: 'live' },
      { key: 'cells', labelKey: 'nav.cells', to: '/cells', pill: 'live' },
      { key: 'groups', labelKey: 'nav.groups', to: '/groups', pill: 'live' },
    ],
  },
  {
    groupKey: 'reserved',
    labelKey: 'nav.group.reserved',
    items: [
      { key: 'observe', labelKey: 'nav.observe', to: '/observe', pill: 'preview' },
      { key: 'billing', labelKey: 'nav.billing', to: '/billing', pill: 'preview' },
      { key: 'secrets', labelKey: 'nav.secrets', to: '/secrets', pill: 'preview' },
    ],
  },
] as const satisfies NavGroup[]
