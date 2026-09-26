import type { RouteRecordRaw } from 'vue-router'
import type { ModuleId } from './services/workspace'
export interface MdmFeature {
  entry: RouteRecordRaw & { name: string }
  routes?: RouteRecordRaw[]
}
/** Unique module keys and the entry route itself avoid a second route-name inventory. */
export const features: Partial<Record<ModuleId, MdmFeature>> = {}
