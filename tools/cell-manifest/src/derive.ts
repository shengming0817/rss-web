/**
 * @gocell/cell-manifest — 纯派生逻辑（与文件 IO 解耦，便于单测）。
 *
 * Derives CellManifest from parsed cell.yaml + slices/[*]/slice.yaml objects.
 * No fs / YAML IO dependencies — those belong to index.ts (IO layer).
 *
 * BLIND SPOTS (ai-robust §盲区自检 — 本模块不覆盖的形态):
 *   1. 未知 contractUsage role（如 'observe'）— silently ignored（produces/consumes 不含）
 *      反向自检：derive.spec.ts '[blind-spot] unknown role'
 *   2. Waiver contract 字段 — only in verify.waivers, never in contractUsages →
 *      waivers passthrough, never enters produces/consumes
 *      反向自检：derive.spec.ts '[blind-spot] waiver contract id'
 *   3. Empty contractUsages → []（not undefined）
 *      反向自检：derive.spec.ts '[blind-spot] empty contractUsages'
 *   4. Cell with no slices → slices: []
 *      反向自检：derive.spec.ts '[blind-spot] cell with no slices'
 *   5. schema.primary absent or null → schemaPrimary: null
 *   6. verify.smoke absent → smokeTests: []
 */

import type {
  CellEntry,
  CellManifest,
  CellSlice,
  CellWaiver,
  ConsistencyLevel,
  ContractRole,
  ContractUsage,
  DurabilityMode,
} from './types'

// ─── Type guards ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isConsistencyLevel(v: unknown): v is ConsistencyLevel {
  return v === 'L0' || v === 'L1' || v === 'L2' || v === 'L3'
}

function isDurabilityMode(v: unknown): v is DurabilityMode {
  return v === 'durable' || v === 'demo'
}

function isContractRole(v: unknown): v is ContractRole {
  return v === 'serve' || v === 'call' || v === 'publish' || v === 'subscribe'
}

// ─── humanizeDomain ──────────────────────────────────────────────────────────

/**
 * Derive a human-readable domain label from a cell id.
 * 'accesscore' → strip trailing 'core' → 'access' → title-case → 'Access'
 * 'foo' (no core suffix) → title-case whole → 'Foo'
 */
export function humanizeDomain(id: string): string {
  const stripped = id.endsWith('core') ? id.slice(0, -4) : id
  const base = stripped.length > 0 ? stripped : id
  return base.charAt(0).toUpperCase() + base.slice(1)
}

// ─── parseSlice ──────────────────────────────────────────────────────────────

/**
 * Parse a raw (unknown-typed) slice YAML object into a typed CellSlice.
 * Called by index.ts after YAML.parse; also called by specs with inline fixtures.
 */
export function parseSlice(raw: unknown): CellSlice {
  if (!isRecord(raw)) throw new Error(`slice must be an object, got: ${typeof raw}`)

  const id = typeof raw['id'] === 'string' ? raw['id'] : ''
  const belongsToCell = typeof raw['belongsToCell'] === 'string' ? raw['belongsToCell'] : ''
  const consistencyLevel = isConsistencyLevel(raw['consistencyLevel'])
    ? raw['consistencyLevel']
    : 'L0'
  const lifecycle = typeof raw['lifecycle'] === 'string' ? raw['lifecycle'] : ''

  // Parse contractUsages — only keep known roles
  const contractUsages: ContractUsage[] = []
  const rawUsages = raw['contractUsages']
  if (Array.isArray(rawUsages)) {
    for (const usage of rawUsages) {
      if (!isRecord(usage)) continue
      const contract = typeof usage['contract'] === 'string' ? usage['contract'] : null
      const role = usage['role']
      if (contract !== null && isContractRole(role)) {
        contractUsages.push({ contract, role })
      }
      // Unknown roles are silently ignored (blind-spot #1)
    }
  }

  // Parse verify section
  const verify = isRecord(raw['verify']) ? raw['verify'] : {}
  const unitTests = isStringArray(verify['unit']) ? verify['unit'] : []
  const contractTests = isStringArray(verify['contract']) ? verify['contract'] : []

  const waivers: CellWaiver[] = []
  const rawWaivers = verify['waivers']
  if (Array.isArray(rawWaivers)) {
    for (const w of rawWaivers) {
      if (!isRecord(w)) continue
      if (
        typeof w['contract'] === 'string' &&
        typeof w['owner'] === 'string' &&
        typeof w['reason'] === 'string' &&
        typeof w['expiresAt'] === 'string'
      ) {
        waivers.push({
          contract: w['contract'],
          owner: w['owner'],
          reason: w['reason'],
          expiresAt: w['expiresAt'], // preserved as-is (string, NOT coerced to Date)
        })
      }
    }
  }

  return {
    id,
    belongsToCell,
    consistencyLevel,
    lifecycle,
    contractUsages,
    unitTests,
    contractTests,
    waivers,
  }
}

// ─── parseCell ───────────────────────────────────────────────────────────────

/**
 * Parse a raw cell.yaml object into a partial CellEntry.
 * slices, produces, consumes, dependsOnCells, requiredByCells are set later
 * in buildManifest after all cells and slices are collected.
 */
export function parseCell(raw: unknown): Omit<
  CellEntry,
  'slices' | 'produces' | 'consumes' | 'dependsOnCells' | 'requiredByCells'
> & {
  slices: readonly CellSlice[]
  produces: readonly ContractUsage[]
  consumes: readonly ContractUsage[]
  dependsOnCells: readonly string[]
  requiredByCells: readonly string[]
} {
  if (!isRecord(raw)) throw new Error(`cell must be an object, got: ${typeof raw}`)

  const id = typeof raw['id'] === 'string' ? raw['id'] : ''
  const type = typeof raw['type'] === 'string' ? raw['type'] : ''
  const consistencyLevel = isConsistencyLevel(raw['consistencyLevel'])
    ? raw['consistencyLevel']
    : 'L0'
  const lifecycle = typeof raw['lifecycle'] === 'string' ? raw['lifecycle'] : ''
  const durabilityMode = isDurabilityMode(raw['durabilityMode']) ? raw['durabilityMode'] : 'durable'
  const goStructName = typeof raw['goStructName'] === 'string' ? raw['goStructName'] : id

  const owner = isRecord(raw['owner'])
    ? {
        team: typeof raw['owner']['team'] === 'string' ? raw['owner']['team'] : '',
        role: typeof raw['owner']['role'] === 'string' ? raw['owner']['role'] : '',
      }
    : { team: '', role: '' }

  const schema = isRecord(raw['schema']) ? raw['schema'] : {}
  const schemaPrimary = typeof schema['primary'] === 'string' ? schema['primary'] : null

  const verify = isRecord(raw['verify']) ? raw['verify'] : {}
  const smokeTests = isStringArray(verify['smoke']) ? verify['smoke'] : []

  const requires = isStringArray(raw['requires']) ? raw['requires'] : []
  const l0Dependencies = isStringArray(raw['l0Dependencies']) ? raw['l0Dependencies'] : []

  return {
    id,
    name: goStructName,
    domain: humanizeDomain(id),
    type,
    consistencyLevel,
    lifecycle,
    durabilityMode,
    owner,
    goStructName,
    schemaPrimary,
    requires,
    l0Dependencies,
    smokeTests,
    // These are set in buildManifest after cross-cell analysis
    slices: [],
    produces: [],
    consumes: [],
    dependsOnCells: [],
    requiredByCells: [],
  }
}

// ─── deriveProducesConsumes ───────────────────────────────────────────────────

/**
 * Derive produces/consumes for a cell from its slices.
 * - produces: role serve|publish, deduped by contract (first wins), sorted by contract
 * - consumes: role call|subscribe, deduped by contract (first wins), sorted by contract
 */
export function deriveProducesConsumes(slices: readonly CellSlice[]): {
  produces: ContractUsage[]
  consumes: ContractUsage[]
} {
  const producedSet = new Map<string, ContractUsage>()
  const consumedSet = new Map<string, ContractUsage>()

  for (const slice of slices) {
    for (const usage of slice.contractUsages) {
      if (usage.role === 'serve' || usage.role === 'publish') {
        if (!producedSet.has(usage.contract)) {
          producedSet.set(usage.contract, { contract: usage.contract, role: usage.role })
        }
      } else if (usage.role === 'call' || usage.role === 'subscribe') {
        if (!consumedSet.has(usage.contract)) {
          consumedSet.set(usage.contract, { contract: usage.contract, role: usage.role })
        }
      }
      // Unknown roles silently ignored (blind-spot #1)
    }
  }

  const produces = [...producedSet.values()].sort((a, b) =>
    a.contract < b.contract ? -1 : a.contract > b.contract ? 1 : 0,
  )
  const consumes = [...consumedSet.values()].sort((a, b) =>
    a.contract < b.contract ? -1 : a.contract > b.contract ? 1 : 0,
  )

  return { produces, consumes }
}

// ─── buildManifest ────────────────────────────────────────────────────────────

type RawCellWithSlices = {
  cell: unknown
  slices: unknown[]
}

/**
 * Build a complete CellManifest from raw cell+slices pairs.
 * Steps:
 * 1. Parse all cells and slices
 * 2. Compute produces/consumes per cell
 * 3. Build contract → producingCellId map
 * 4. Compute cross-cell dependsOnCells / requiredByCells
 * 5. Sort cells by id (byId lookup is derived at runtime in useCellsStore)
 */
export function buildManifest(rawCells: RawCellWithSlices[]): CellManifest {
  // Step 1: parse cells + slices
  const entries: CellEntry[] = rawCells.map(({ cell, slices }) => {
    const parsed = parseCell(cell)
    const parsedSlices = slices.map(parseSlice)
    const { produces, consumes } = deriveProducesConsumes(parsedSlices)
    return {
      ...parsed,
      slices: parsedSlices,
      produces,
      consumes,
      dependsOnCells: [], // filled below
      requiredByCells: [], // filled below
    }
  })

  // Step 2: build contract → producingCellId map (first producer wins)
  const contractProducer = new Map<string, string>()
  for (const entry of entries) {
    for (const p of entry.produces) {
      if (!contractProducer.has(p.contract)) {
        contractProducer.set(p.contract, entry.id)
      }
    }
  }

  // Step 3: compute cross-cell deps
  const dependsOnMap = new Map<string, Set<string>>()
  const requiredByMap = new Map<string, Set<string>>()
  for (const entry of entries) {
    dependsOnMap.set(entry.id, new Set())
    requiredByMap.set(entry.id, new Set())
  }

  for (const entry of entries) {
    for (const c of entry.consumes) {
      const producer = contractProducer.get(c.contract)
      if (producer !== undefined && producer !== entry.id) {
        // entry depends on producer
        dependsOnMap.get(entry.id)?.add(producer)
        // producer is required by entry
        requiredByMap.get(producer)?.add(entry.id)
      }
      // self-served contracts are excluded (blind-spot #4 self-dep guard)
    }
  }

  // Step 4: compose final entries with sorted deps, sorted by id
  const finalEntries: CellEntry[] = entries
    .map((entry) => ({
      ...entry,
      dependsOnCells: [...(dependsOnMap.get(entry.id) ?? [])].sort(),
      requiredByCells: [...(requiredByMap.get(entry.id) ?? [])].sort(),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    cells: finalEntries,
    generatedFrom: 'gocell/corecells/**/{cell.yaml,slices/*/slice.yaml}',
  }
}

// ─── renderManifestModule ─────────────────────────────────────────────────────

/**
 * Render the generated TypeScript module text for cells.generated.ts.
 * Uses JSON.stringify for deterministic output (manifest object is already sorted).
 */
export function renderManifestModule(m: CellManifest): string {
  return [
    '/* eslint-disable */',
    '// AUTO-GENERATED by tools/cell-manifest — DO NOT EDIT BY HAND.',
    '// Source: gocell/corecells/**',
    '// Regenerate: pnpm cell-manifest (CI guards via git diff --exit-code)',
    "import type { CellManifest } from './types'",
    '',
    `export const CELL_MANIFEST: CellManifest = ${JSON.stringify(m, null, 2)}`,
    '',
  ].join('\n')
}
