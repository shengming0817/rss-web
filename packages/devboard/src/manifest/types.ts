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
  readonly name: string // = goStructName
  readonly domain: string // derived: id minus trailing 'core', title-cased
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
  readonly produces: readonly ContractUsage[] // role serve|publish, deduped by contract, sorted by contract
  readonly consumes: readonly ContractUsage[] // role call|subscribe, deduped by contract, sorted by contract
  readonly dependsOnCells: readonly string[] // derived cross-cell, sorted, self excluded
  readonly requiredByCells: readonly string[] // reverse, sorted
}

export interface CellManifest {
  readonly cells: readonly CellEntry[] // sorted by id
  readonly generatedFrom: string // static note, NOT a timestamp (determinism)
}
