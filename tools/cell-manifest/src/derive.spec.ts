/**
 * derive.spec.ts — FIXTURE-BASED unit tests for pure derivation logic.
 *
 * BLIND SPOTS (ai-robust §盲区自检 — forms NOT covered by this spec):
 *   1. Dynamic YAML runtime parse errors (index.ts handles, not derive.ts)
 *   2. File-system traversal order (index.ts; tested by determinism case here)
 *   3. slice.yaml contractUsages with extra fields (handler, group, field) — we
 *      only use `contract` + `role`; extra fields are silently ignored (correct)
 *   4. Cells with identical contract names across different slices — dedup
 *      keeps first occurrence (by slice order); tested explicitly below
 *
 * Reverse blind-spot checks (MUST assert 0 false matches):
 *   - Unknown role → NOT in produces/consumes
 *   - Waiver contract id → NOT in produces/consumes
 *   - Empty contractUsages → produces/consumes are [] not undefined
 *   - Cell with no slices → slices: []
 *   - Determinism: buildManifest twice → deep-equal
 */
import { describe, it, expect } from 'vitest'
import {
  humanizeDomain,
  parseCell,
  parseSlice,
  deriveProducesConsumes,
  buildManifest,
  renderManifestModule,
} from './derive'
import type { CellManifest } from './types'

// ─── humanizeDomain ──────────────────────────────────────────────────────────

describe('humanizeDomain', () => {
  it("strips trailing 'core' and title-cases remainder", () => {
    expect(humanizeDomain('accesscore')).toBe('Access')
    expect(humanizeDomain('auditcore')).toBe('Audit')
    expect(humanizeDomain('configcore')).toBe('Config')
  })

  it('title-cases whole id when no core suffix', () => {
    expect(humanizeDomain('foo')).toBe('Foo')
    expect(humanizeDomain('devboard')).toBe('Devboard')
  })
})

// ─── parseSlice ──────────────────────────────────────────────────────────────

describe('parseSlice', () => {
  it('parses a minimal slice with contractUsages', () => {
    const raw = {
      id: 'sessionlogin',
      belongsToCell: 'accesscore',
      consistencyLevel: 'L2',
      lifecycle: 'asset',
      contractUsages: [
        { contract: 'http.auth.login.v1', role: 'serve' },
        { contract: 'event.session.created.v1', role: 'publish' },
        { contract: 'http.config.get.v1', role: 'call' },
      ],
      verify: {
        unit: ['unit.sessionlogin.service'],
        contract: ['contract.http.auth.login.v1.serve'],
        waivers: [
          {
            contract: 'http.config.get.v1',
            owner: 'platform-team',
            reason: 'already covered',
            expiresAt: '2026-09-01',
          },
        ],
      },
      allowedFiles: ['cells/accesscore/slices/sessionlogin/**'],
    }
    const slice = parseSlice(raw)
    expect(slice.id).toBe('sessionlogin')
    expect(slice.belongsToCell).toBe('accesscore')
    expect(slice.consistencyLevel).toBe('L2')
    expect(slice.lifecycle).toBe('asset')
    expect(slice.contractUsages).toHaveLength(3)
    expect(slice.contractUsages[0]).toEqual({ contract: 'http.auth.login.v1', role: 'serve' })
    expect(slice.unitTests).toEqual(['unit.sessionlogin.service'])
    expect(slice.contractTests).toEqual(['contract.http.auth.login.v1.serve'])
    expect(slice.waivers).toHaveLength(1)
    expect(slice.waivers[0]?.expiresAt).toBe('2026-09-01')
  })

  it('handles empty contractUsages array', () => {
    const raw = {
      id: 'authorizationdecide',
      belongsToCell: 'accesscore',
      consistencyLevel: 'L0',
      lifecycle: 'asset',
      contractUsages: [],
      verify: { unit: [], contract: [], waivers: [] },
    }
    const slice = parseSlice(raw)
    expect(slice.contractUsages).toEqual([])
    expect(slice.waivers).toEqual([])
  })

  it('handles missing verify fields gracefully', () => {
    const raw = {
      id: 'simple',
      belongsToCell: 'somecore',
      consistencyLevel: 'L1',
      lifecycle: 'asset',
      contractUsages: [],
      verify: {},
    }
    const slice = parseSlice(raw)
    expect(slice.unitTests).toEqual([])
    expect(slice.contractTests).toEqual([])
    expect(slice.waivers).toEqual([])
  })
})

// ─── parseCell ───────────────────────────────────────────────────────────────

describe('parseCell', () => {
  it('parses a full cell object', () => {
    const raw = {
      id: 'accesscore',
      type: 'core',
      consistencyLevel: 'L3',
      lifecycle: 'asset',
      durabilityMode: 'durable',
      owner: { team: 'platform', role: 'cell-owner' },
      schema: { primary: 'cell_access_core' },
      verify: { smoke: ['smoke.accesscore.startup'] },
      goStructName: 'AccessCore',
      l0Dependencies: [],
      requires: ['postgres', 'redis'],
    }
    const cell = parseCell(raw)
    expect(cell.id).toBe('accesscore')
    expect(cell.name).toBe('AccessCore')
    expect(cell.domain).toBe('Access')
    expect(cell.type).toBe('core')
    expect(cell.consistencyLevel).toBe('L3')
    expect(cell.lifecycle).toBe('asset')
    expect(cell.durabilityMode).toBe('durable')
    expect(cell.owner).toEqual({ team: 'platform', role: 'cell-owner' })
    expect(cell.goStructName).toBe('AccessCore')
    expect(cell.schemaPrimary).toBe('cell_access_core')
    expect(cell.requires).toEqual(['postgres', 'redis'])
    expect(cell.l0Dependencies).toEqual([])
    expect(cell.smokeTests).toEqual(['smoke.accesscore.startup'])
    // slices/produces/consumes/dependsOnCells/requiredByCells set later
    expect(cell.slices).toEqual([])
    expect(cell.produces).toEqual([])
    expect(cell.consumes).toEqual([])
    expect(cell.dependsOnCells).toEqual([])
    expect(cell.requiredByCells).toEqual([])
  })

  it('passes through durabilityMode durable and demo', () => {
    const durable = parseCell({
      id: 'a',
      type: 'core',
      consistencyLevel: 'L0',
      lifecycle: 'asset',
      durabilityMode: 'durable',
      owner: { team: 't', role: 'r' },
      schema: { primary: null },
      verify: { smoke: [] },
      goStructName: 'A',
      l0Dependencies: [],
      requires: [],
    })
    expect(durable.durabilityMode).toBe('durable')

    const demo = parseCell({
      id: 'b',
      type: 'core',
      consistencyLevel: 'L0',
      lifecycle: 'asset',
      durabilityMode: 'demo',
      owner: { team: 't', role: 'r' },
      schema: { primary: null },
      verify: { smoke: [] },
      goStructName: 'B',
      l0Dependencies: [],
      requires: [],
    })
    expect(demo.durabilityMode).toBe('demo')
  })

  it('handles null schemaPrimary', () => {
    const cell = parseCell({
      id: 'x',
      type: 'core',
      consistencyLevel: 'L0',
      lifecycle: 'asset',
      durabilityMode: 'durable',
      owner: { team: 't', role: 'r' },
      schema: { primary: null },
      verify: { smoke: [] },
      goStructName: 'X',
      l0Dependencies: [],
      requires: [],
    })
    expect(cell.schemaPrimary).toBeNull()
  })
})

// ─── deriveProducesConsumes ───────────────────────────────────────────────────

describe('deriveProducesConsumes', () => {
  it('serve role → produces', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'http.foo.v1', role: 'serve' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([{ contract: 'http.foo.v1', role: 'serve' }])
    expect(consumes).toEqual([])
  })

  it('publish role → produces', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'event.bar.v1', role: 'publish' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([{ contract: 'event.bar.v1', role: 'publish' }])
    expect(consumes).toEqual([])
  })

  it('call role → consumes', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'http.other.v1', role: 'call' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([])
    expect(consumes).toEqual([{ contract: 'http.other.v1', role: 'call' }])
  })

  it('subscribe role → consumes', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'event.baz.v1', role: 'subscribe' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([])
    expect(consumes).toEqual([{ contract: 'event.baz.v1', role: 'subscribe' }])
  })

  it('slice with both serve+call → appears in both produces and consumes', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L2',
        lifecycle: 'asset',
        contractUsages: [
          { contract: 'http.auth.login.v1', role: 'serve' },
          { contract: 'http.config.get.v1', role: 'call' },
        ],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces.map((p) => p.contract)).toContain('http.auth.login.v1')
    expect(consumes.map((c) => c.contract)).toContain('http.config.get.v1')
  })

  it('deduplicates by contract, first wins, sorted by contract', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [
          { contract: 'http.z.v1', role: 'serve' },
          { contract: 'http.a.v1', role: 'serve' },
          { contract: 'http.z.v1', role: 'serve' }, // duplicate
        ],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces } = deriveProducesConsumes(slices)
    expect(produces.map((p) => p.contract)).toEqual(['http.a.v1', 'http.z.v1'])
    expect(produces).toHaveLength(2)
  })

  it('dedup across multiple slices: first slice wins', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'event.x.v1', role: 'publish' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
      parseSlice({
        id: 's2',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'event.x.v1', role: 'publish' }], // duplicate across slices
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces } = deriveProducesConsumes(slices)
    expect(produces).toHaveLength(1)
    expect(produces[0]?.contract).toBe('event.x.v1')
  })

  // ── REVERSE BLIND-SPOT CHECKS (0 false-positive assertions) ─────────────────

  it('[blind-spot] unknown role e.g. "observe" → NOT in produces/consumes', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'event.observe.v1', role: 'observe' as 'serve' }],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([])
    expect(consumes).toEqual([])
  })

  it('[blind-spot] waiver contract id → NOT in produces/consumes', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [{ contract: 'http.known.v1', role: 'serve' }],
        verify: {
          unit: [],
          contract: [],
          waivers: [
            {
              contract: 'http.waived.v1',
              owner: 'team',
              reason: 'reason',
              expiresAt: '2027-01-01',
            },
          ],
        },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces.map((p) => p.contract)).not.toContain('http.waived.v1')
    expect(consumes.map((c) => c.contract)).not.toContain('http.waived.v1')
  })

  it('[blind-spot] empty contractUsages → produces/consumes are [] not undefined', () => {
    const slices = [
      parseSlice({
        id: 's1',
        belongsToCell: 'c',
        consistencyLevel: 'L0',
        lifecycle: 'asset',
        contractUsages: [],
        verify: { unit: [], contract: [], waivers: [] },
      }),
    ]
    const { produces, consumes } = deriveProducesConsumes(slices)
    expect(produces).toEqual([])
    expect(consumes).toEqual([])
    expect(Array.isArray(produces)).toBe(true)
    expect(Array.isArray(consumes)).toBe(true)
  })
})

// ─── buildManifest ────────────────────────────────────────────────────────────

describe('buildManifest', () => {
  it('[blind-spot] cell with no slices → slices: []', () => {
    const manifest = buildManifest([
      {
        cell: {
          id: 'emptycore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 'platform', role: 'cell-owner' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'Empty',
          l0Dependencies: [],
          requires: [],
        },
        slices: [],
      },
    ])
    expect(manifest.cells[0]?.slices).toEqual([])
    expect(manifest.cells[0]?.produces).toEqual([])
    expect(manifest.cells[0]?.consumes).toEqual([])
  })

  it('cross-cell dependency: cell B consumes contract X served by cell A → B.dependsOnCells includes A', () => {
    const manifest = buildManifest([
      {
        cell: {
          id: 'acore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'A',
          l0Dependencies: [],
          requires: [],
        },
        slices: [
          {
            id: 'aslice',
            belongsToCell: 'acore',
            consistencyLevel: 'L0' as const,
            lifecycle: 'asset',
            contractUsages: [{ contract: 'http.contract.x.v1', role: 'serve' as const }],
            verify: { unit: [], contract: [], waivers: [] },
          },
        ],
      },
      {
        cell: {
          id: 'bcore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'B',
          l0Dependencies: [],
          requires: [],
        },
        slices: [
          {
            id: 'bslice',
            belongsToCell: 'bcore',
            consistencyLevel: 'L0' as const,
            lifecycle: 'asset',
            contractUsages: [{ contract: 'http.contract.x.v1', role: 'call' as const }],
            verify: { unit: [], contract: [], waivers: [] },
          },
        ],
      },
    ])
    const b = manifest.cells.find((c) => c.id === 'bcore')
    const a = manifest.cells.find((c) => c.id === 'acore')
    expect(b?.dependsOnCells).toContain('acore')
    expect(a?.requiredByCells).toContain('bcore')
  })

  it('self-served contract does NOT create a self-dep', () => {
    const manifest = buildManifest([
      {
        cell: {
          id: 'selfcore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'Self',
          l0Dependencies: [],
          requires: [],
        },
        slices: [
          {
            id: 'slice1',
            belongsToCell: 'selfcore',
            consistencyLevel: 'L0' as const,
            lifecycle: 'asset',
            contractUsages: [{ contract: 'http.self.v1', role: 'serve' as const }],
            verify: { unit: [], contract: [], waivers: [] },
          },
          {
            id: 'slice2',
            belongsToCell: 'selfcore',
            consistencyLevel: 'L0' as const,
            lifecycle: 'asset',
            contractUsages: [{ contract: 'http.self.v1', role: 'call' as const }],
            verify: { unit: [], contract: [], waivers: [] },
          },
        ],
      },
    ])
    const self = manifest.cells.find((c) => c.id === 'selfcore')
    expect(self?.dependsOnCells).toEqual([])
  })

  it('cells sorted by id in manifest.cells', () => {
    const manifest = buildManifest([
      {
        cell: {
          id: 'zcore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'Z',
          l0Dependencies: [],
          requires: [],
        },
        slices: [],
      },
      {
        cell: {
          id: 'acore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'A',
          l0Dependencies: [],
          requires: [],
        },
        slices: [],
      },
    ])
    expect(manifest.cells[0]?.id).toBe('acore')
    expect(manifest.cells[1]?.id).toBe('zcore')
  })

  it('generatedFrom is the static note (deterministic, no timestamp)', () => {
    const manifest = buildManifest([])
    expect(manifest.generatedFrom).toBe('gocell/corecells/**/{cell.yaml,slices/*/slice.yaml}')
  })

  it('[blind-spot] determinism: buildManifest twice on same input → deep-equal', () => {
    const input: {
      cell: Parameters<typeof buildManifest>[0][number]['cell']
      slices: Parameters<typeof buildManifest>[0][number]['slices']
    }[] = [
      {
        cell: {
          id: 'accesscore',
          type: 'core',
          consistencyLevel: 'L3' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 'platform', role: 'cell-owner' },
          schema: { primary: 'cell_access_core' },
          verify: { smoke: ['smoke.accesscore.startup'] },
          goStructName: 'AccessCore',
          l0Dependencies: [],
          requires: ['postgres'],
        },
        slices: [
          {
            id: 'sessionlogin',
            belongsToCell: 'accesscore',
            consistencyLevel: 'L2' as const,
            lifecycle: 'asset',
            contractUsages: [
              { contract: 'http.auth.login.v1', role: 'serve' as const },
              { contract: 'http.config.get.v1', role: 'call' as const },
            ],
            verify: { unit: [], contract: [], waivers: [] },
          },
        ],
      },
    ]
    const m1 = buildManifest(input)
    const m2 = buildManifest(input)
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2))
  })

  it('waivers passthrough: expiresAt preserved as-is (not coerced)', () => {
    const manifest = buildManifest([
      {
        cell: {
          id: 'wcore',
          type: 'core',
          consistencyLevel: 'L0' as const,
          lifecycle: 'asset',
          durabilityMode: 'durable' as const,
          owner: { team: 't', role: 'r' },
          schema: { primary: null },
          verify: { smoke: [] },
          goStructName: 'W',
          l0Dependencies: [],
          requires: [],
        },
        slices: [
          {
            id: 'wslice',
            belongsToCell: 'wcore',
            consistencyLevel: 'L0' as const,
            lifecycle: 'asset',
            contractUsages: [],
            verify: {
              unit: [],
              contract: [],
              waivers: [
                {
                  contract: 'http.x.v1',
                  owner: 'team',
                  reason: 'reason',
                  expiresAt: '2026-09-01',
                },
              ],
            },
          },
        ],
      },
    ])
    const slice = manifest.cells[0]?.slices[0]
    expect(slice?.waivers[0]?.expiresAt).toBe('2026-09-01')
    // expiresAt should be string, not Date
    expect(typeof slice?.waivers[0]?.expiresAt).toBe('string')
  })
})

// ─── renderManifestModule ─────────────────────────────────────────────────────

describe('renderManifestModule', () => {
  it('produces a TS module string with CELL_MANIFEST export', () => {
    const manifest: CellManifest = {
      cells: [],
      generatedFrom: 'gocell/corecells/**/{cell.yaml,slices/*/slice.yaml}',
    }
    const output = renderManifestModule(manifest)
    expect(output).toContain('/* eslint-disable */')
    expect(output).toContain('AUTO-GENERATED')
    expect(output).toContain('DO NOT EDIT BY HAND')
    expect(output).toContain("import type { CellManifest } from './types'")
    expect(output).toContain('export const CELL_MANIFEST: CellManifest =')
  })
})
