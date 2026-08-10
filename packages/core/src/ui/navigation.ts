import type { RouteLocationRaw } from 'vue-router'
import type { SourceMeta } from '@rss/shared'

export interface ShellNavigationItem {
  readonly id: string
  readonly label: string
  readonly to: RouteLocationRaw
  readonly source: SourceMeta
}
