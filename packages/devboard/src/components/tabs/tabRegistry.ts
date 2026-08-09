import { markRaw, type Component } from 'vue'
import OverviewTab from './OverviewTab.vue'
import InterfacesTab from './InterfacesTab.vue'
import WiringTab from './WiringTab.vue'
import InventoryTab from './InventoryTab.vue'
import SlicesTab from './SlicesTab.vue'
import ContractsTab from './ContractsTab.vue'
import DependenciesTab from './DependenciesTab.vue'
import TasksTab from './TasksTab.vue'
import ConfigurationTab from './ConfigurationTab.vue'
import AuditTab from './AuditTab.vue'
import GroupsTab from './GroupsTab.vue'
import AITab from './AITab.vue'

/**
 * tabRegistry — single source of truth for the cell-detail tab set.
 *
 * Order matches the design reference (dev-cell.jsx:281). Each tab takes the
 * uniform `cell: CellEntry` prop. `CellDetailView` renders only the active
 * tab's component (single live tabpanel — avoids 12 simultaneous mounts and
 * the Audit/Config fetches firing for hidden panels). `CellTabBar` consumes
 * only the `{ id, labelKey }` projection (`CELL_TAB_DEFS`).
 *
 * Components are `markRaw`-wrapped so they are never made reactive when held
 * in a computed.
 */
export interface CellTab {
  readonly id: string
  readonly labelKey: string
  readonly component: Component
}

export const CELL_TABS: readonly CellTab[] = [
  { id: 'overview', labelKey: 'cells.tabs.overview', component: markRaw(OverviewTab) },
  { id: 'interfaces', labelKey: 'cells.tabs.interfaces', component: markRaw(InterfacesTab) },
  { id: 'wiring', labelKey: 'cells.tabs.wiring', component: markRaw(WiringTab) },
  { id: 'inventory', labelKey: 'cells.tabs.inventory', component: markRaw(InventoryTab) },
  { id: 'slices', labelKey: 'cells.tabs.slices', component: markRaw(SlicesTab) },
  { id: 'contracts', labelKey: 'cells.tabs.contracts', component: markRaw(ContractsTab) },
  { id: 'dependencies', labelKey: 'cells.tabs.dependencies', component: markRaw(DependenciesTab) },
  { id: 'tasks', labelKey: 'cells.tabs.tasks', component: markRaw(TasksTab) },
  {
    id: 'configuration',
    labelKey: 'cells.tabs.configuration',
    component: markRaw(ConfigurationTab),
  },
  { id: 'audit', labelKey: 'cells.tabs.audit', component: markRaw(AuditTab) },
  { id: 'groups', labelKey: 'cells.tabs.groups', component: markRaw(GroupsTab) },
  { id: 'ai', labelKey: 'cells.tabs.ai', component: markRaw(AITab) },
]

/** `{ id, labelKey }` projection for the (component-agnostic) tab bar. */
export const CELL_TAB_DEFS: readonly { id: string; labelKey: string }[] = CELL_TABS.map(
  ({ id, labelKey }) => ({ id, labelKey }),
)

/** Default tab id when the URL carries no (or an unknown) `?tab=`. */
export const DEFAULT_CELL_TAB = 'overview'

/** Whether `id` is a known tab. */
export function isCellTab(id: string): boolean {
  return CELL_TABS.some((tab) => tab.id === id)
}

/** Resolve a tab id to its component, falling back to the default tab. */
export function cellTabComponent(id: string): Component {
  const tab = CELL_TABS.find((t) => t.id === id) ?? CELL_TABS.find((t) => t.id === DEFAULT_CELL_TAB)
  if (!tab) throw new Error(`cellTabComponent: no tab "${id}" and no default tab registered`)
  return tab.component
}
