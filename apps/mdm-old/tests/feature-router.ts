import { createRouter, type RouterOptions } from 'vue-router'
import { features } from '../src/features'
/** Mount component fixtures against the actual product route identities. */
export function createFeatureRouter(options: RouterOptions) {
  const router = createRouter(options)
  for (const feature of Object.values(features))
    for (const route of [feature.entry, ...(feature.routes ?? [])])
      if (route.name && !router.hasRoute(route.name)) router.addRoute(route)
  return router
}
