import type { Router } from 'vue-router'
import type { ShellNavigationItem } from '@rss/core'
import type { WebMessageSchema } from '../i18n/messages/zh-CN'

export type NavigationMessageKey = `navigation.${Extract<
  keyof WebMessageSchema['navigation'],
  string
>}`

export function createShellNavigation(
  router: Router,
  translate: (key: NavigationMessageKey) => string,
): readonly ShellNavigationItem[] {
  return Object.freeze(
    router
      .getRoutes()
      .filter((route) => route.name !== undefined && route.meta.navigation !== undefined)
      .sort(
        (left, right) =>
          left.meta.navigation!.order - right.meta.navigation!.order ||
          String(left.name).localeCompare(String(right.name)),
      )
      .map((route) => ({
        id: String(route.name),
        label: translate(route.meta.navigation!.labelKey),
        to: Object.freeze({ name: route.name! }),
        source: route.meta.navigation!.source,
      })),
  )
}
