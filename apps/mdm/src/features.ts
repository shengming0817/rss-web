import type { RouteRecordRaw } from 'vue-router'
import type { ModuleId } from './services/workspace'
import { policyFeature } from './features/policies/routes'
import { deviceFeature } from './features/devices/routes'
import { softwareFeature } from './features/software/routes'
import { securityFeature } from './features/security/routes'
import { operationsFeature } from './features/operations/routes'
export interface MdmFeature {
  entry: RouteRecordRaw & { name: string }
  routes?: RouteRecordRaw[]
}
/** Unique module keys and the entry route itself avoid a second route-name inventory. */
export const features: Partial<Record<ModuleId, MdmFeature>> = {
  devices: deviceFeature,
  software: softwareFeature,
  policies: policyFeature,
  security: securityFeature,
  operations: operationsFeature,
}
