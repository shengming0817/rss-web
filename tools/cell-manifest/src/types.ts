/**
 * Manifest shape — the tool's self-contained copy of the type set.
 *
 * Canonical runtime source: `packages/devboard/src/manifest/types.ts`. This tool
 * is a standalone node script (mirrors `tools/codegen`, which is likewise
 * self-contained) and must not reach into a package's `src/`. Drift between this
 * copy and the canonical types is caught by an AI-robust **Hard** guard: the
 * generated `cells.generated.ts` is annotated `: CellManifest` imported from
 * devboard's `./types`, so any shape mismatch fails `@gocell/devboard typecheck`
 * (excess/missing property checks on the typed const literal).
 */
export type ConsistencyLevel = 'L0' | 'L1' | 'L2' | 'L3'
export type DurabilityMode = 'durable' | 'demo'
export type ContractRole = 'serve' | 'call' | 'publish' | 'subscribe'

export interface ContractUsage {
  readonly contract: string
  readonly role: ContractRole
}

export interface CellWaiver {
  readonly contract: string
  readonly owner: string
  readonly reason: string
  readonly expiresAt: string
}

export interface CellSlice {
  readonly id: string
  readonly belongsToCell: string
  readonly consistencyLevel: ConsistencyLevel
  readonly lifecycle: string
  readonly contractUsages: readonly ContractUsage[]
  readonly unitTests: readonly string[]
  readonly contractTests: readonly string[]
  readonly waivers: readonly CellWaiver[]
}

export interface CellEntry {
  readonly id: string
  readonly name: string
  readonly domain: string
  readonly type: string
  readonly consistencyLevel: ConsistencyLevel
  readonly lifecycle: string
  readonly durabilityMode: DurabilityMode
  readonly owner: { readonly team: string; readonly role: string }
  readonly goStructName: string
  readonly schemaPrimary: string | null
  readonly requires: readonly string[]
  readonly l0Dependencies: readonly string[]
  readonly smokeTests: readonly string[]
  readonly slices: readonly CellSlice[]
  readonly produces: readonly ContractUsage[]
  readonly consumes: readonly ContractUsage[]
  readonly dependsOnCells: readonly string[]
  readonly requiredByCells: readonly string[]
}

export interface CellManifest {
  readonly cells: readonly CellEntry[]
  readonly generatedFrom: string
}
