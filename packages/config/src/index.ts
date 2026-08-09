// config domain public API
export { useConfigStore } from './stores'
export type { ConfigEntry } from './api/config'

// flags domain public API — stores and types only
// useFlag / FLAG_KEYS / FlagKey are exposed exclusively via @gocell/config/composables
export { useFlagsStore } from './stores'
export type { FeatureFlag } from './api/flags'
