import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'
import { useCellsFilter } from './useCellsFilter'
import type { CellEntry } from '../manifest/types'

const makeCell = (overrides: Partial<CellEntry>): CellEntry => ({
  id: 'testcore',
  name: 'TestCore',
  domain: 'Test',
  type: 'core',
  consistencyLevel: 'L2',
  lifecycle: 'asset',
  durabilityMode: 'durable',
  owner: { team: 'platform', role: 'cell-owner' },
  goStructName: 'TestCore',
  schemaPrimary: null,
  requires: [],
  l0Dependencies: [],
  smokeTests: [],
  slices: [],
  produces: [],
  consumes: [],
  dependsOnCells: [],
  requiredByCells: [],
  ...overrides,
})

const CELLS: readonly CellEntry[] = [
  makeCell({ id: 'accesscore', name: 'AccessCore', domain: 'Access' }),
  makeCell({ id: 'auditcore', name: 'AuditCore', domain: 'Audit' }),
  makeCell({ id: 'configcore', name: 'ConfigCore', domain: 'Config' }),
]

describe('useCellsFilter', () => {
  it('empty query + domain=all → returns all cells', () => {
    const cells = ref(CELLS)
    const { filtered } = useCellsFilter(cells)
    expect(filtered.value).toHaveLength(3)
  })

  it('domain filter excludes cells from other domains', () => {
    const cells = ref(CELLS)
    const { domain, filtered } = useCellsFilter(cells)
    domain.value = 'Access'
    expect(filtered.value).toHaveLength(1)
    expect(filtered.value[0]?.id).toBe('accesscore')
  })

  it('query matches id substring (case-insensitive)', () => {
    const cells = ref(CELLS)
    const { query, filtered } = useCellsFilter(cells)
    query.value = 'AUDIT'
    expect(filtered.value).toHaveLength(1)
    expect(filtered.value[0]?.id).toBe('auditcore')
  })

  it('query matches name substring (case-insensitive)', () => {
    const cells = ref(CELLS)
    const { query, filtered } = useCellsFilter(cells)
    query.value = 'configc'
    expect(filtered.value).toHaveLength(1)
    expect(filtered.value[0]?.id).toBe('configcore')
  })

  it('combined domain + query = intersection', () => {
    const cells = ref(CELLS)
    const { query, domain, filtered } = useCellsFilter(cells)
    domain.value = 'Access'
    query.value = 'core'
    // 'core' matches all ids, but domain=Access limits to 1
    expect(filtered.value).toHaveLength(1)
    expect(filtered.value[0]?.domain).toBe('Access')
  })

  it('combined domain + query with no match → empty', () => {
    const cells = ref(CELLS)
    const { query, domain, filtered } = useCellsFilter(cells)
    domain.value = 'Audit'
    query.value = 'config'
    expect(filtered.value).toHaveLength(0)
  })

  it('domains list includes "all" first then unique sorted domain names', () => {
    const cells = ref(CELLS)
    const { domains } = useCellsFilter(cells)
    expect(domains.value[0]).toBe('all')
    expect(domains.value.slice(1)).toEqual(['Access', 'Audit', 'Config'])
  })

  it('domains are unique even when cells share the same domain', () => {
    const dupCells: readonly CellEntry[] = [
      makeCell({ id: 'a', domain: 'Access' }),
      makeCell({ id: 'b', domain: 'Access' }),
      makeCell({ id: 'c', domain: 'Audit' }),
    ]
    const cells = ref(dupCells)
    const { domains } = useCellsFilter(cells)
    const domainList = domains.value.filter((d) => d !== 'all')
    expect(domainList).toEqual(['Access', 'Audit'])
  })

  it('accepts ComputedRef<readonly CellEntry[]>', () => {
    const source = ref(CELLS)
    const computedCells = computed(() => source.value)
    const { filtered } = useCellsFilter(computedCells)
    expect(filtered.value).toHaveLength(3)
  })

  it('query="" (empty string) with domain=all returns all', () => {
    const cells = ref(CELLS)
    const { query, filtered } = useCellsFilter(cells)
    query.value = ''
    expect(filtered.value).toHaveLength(3)
  })
})
