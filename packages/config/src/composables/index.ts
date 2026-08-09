/**
 * composables/index.ts — @gocell/config composables barrel.
 *
 * Exported via package.json#exports["./composables"].
 * Consumers: apps/web and other packages that need typed flag checks.
 *
 * Usage:
 *   import { useFlag, FLAG_KEYS, type FlagKey } from '@gocell/config/composables'
 *   const { enabled } = useFlag(FLAG_KEYS.auditChainVerify)
 */
export { useFlag } from './useFlag'
export { FLAG_KEYS, type FlagKey } from '../flags/registry'
