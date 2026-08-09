import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { buildContractRegistry, contractKind, useContractsRegistry } from './useContractsRegistry'
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

const FIXTURE: CellEntry[] = [
  makeCell({
    id: 'configcore',
    produces: [
      { contract: 'http.config.get.v1', role: 'serve' },
      { contract: 'event.config.entry-upserted.v1', role: 'publish' },
    ],
    consumes: [{ contract: 'event.config.entry-upserted.v1', role: 'subscribe' }],
  }),
  makeCell({
    id: 'accesscore',
    produces: [{ contract: 'event.user.created.v1', role: 'publish' }],
    consumes: [{ contract: 'http.config.get.v1', role: 'call' }],
  }),
  makeCell({
    id: 'auditcore',
    produces: [],
    consumes: [
      { contract: 'event.user.created.v1', role: 'subscribe' },
      { contract: 'event.config.entry-upserted.v1', role: 'subscribe' },
    ],
  }),
]

describe('contractKind', () => {
  it('classifies event.* contracts as event', () => {
    expect(contractKind('event.user.created.v1')).toBe('event')
  })
  it('classifies http.* contracts as http', () => {
    expect(contractKind('http.config.get.v1')).toBe('http')
  })
})

describe('buildContractRegistry', () => {
  it('aggregates a served contract to its serving cell', () => {
    const reg = buildContractRegistry(FIXTURE)
    const entry = reg.find((e) => e.contract === 'http.config.get.v1')
    expect(entry).toBeDefined()
    expect(entry!.servers).toEqual(['configcore'])
    expect(entry!.callers).toEqual(['accesscore'])
    expect(entry!.kind).toBe('http')
  })

  it('aggregates a published event to its publisher and subscribers', () => {
    const reg = buildContractRegistry(FIXTURE)
    const entry = reg.find((e) => e.contract === 'event.user.created.v1')
    expect(entry!.servers).toEqual(['accesscore'])
    expect(entry!.callers).toEqual(['auditcore'])
    expect(entry!.kind).toBe('event')
  })

  it('handles a contract both produced and consumed by overlapping cells', () => {
    const reg = buildContractRegistry(FIXTURE)
    const entry = reg.find((e) => e.contract === 'event.config.entry-upserted.v1')
    // configcore both publishes and subscribes; auditcore subscribes
    expect(entry!.servers).toEqual(['configcore'])
    expect(entry!.callers).toEqual(['auditcore', 'configcore'])
  })

  it('returns entries sorted by contract id', () => {
    const reg = buildContractRegistry(FIXTURE)
    const ids = reg.map((e) => e.contract)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)))
  })

  it('produces exactly one entry per unique contract', () => {
    const reg = buildContractRegistry(FIXTURE)
    const ids = reg.map((e) => e.contract)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(3)
  })

  it('returns an empty registry for no cells', () => {
    expect(buildContractRegistry([])).toEqual([])
  })
})

describe('useContractsRegistry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds a registry from the real manifest store', () => {
    const { registry } = useContractsRegistry()
    expect(registry.value.length).toBeGreaterThan(0)
    // http.config.get.v1 is served by configcore, called by accesscore in the real manifest
    const entry = registry.value.find((e) => e.contract === 'http.config.get.v1')
    expect(entry).toBeDefined()
    expect(entry!.servers).toContain('configcore')
    expect(entry!.callers).toContain('accesscore')
  })

  it('filters by free-text query against contract id', () => {
    const { filtered, query } = useContractsRegistry()
    const before = filtered.value.length
    query.value = 'http.auth.login'
    expect(filtered.value.length).toBeLessThan(before)
    expect(filtered.value.every((e) => e.contract.includes('http.auth.login'))).toBe(true)
  })

  it('filters by free-text query against a cell id', () => {
    const { filtered, query } = useContractsRegistry()
    query.value = 'auditcore'
    expect(filtered.value.length).toBeGreaterThan(0)
    expect(
      filtered.value.every(
        (e) => e.servers.includes('auditcore') || e.callers.includes('auditcore'),
      ),
    ).toBe(true)
  })

  it('filters by kind', () => {
    const { filtered, kindFilter } = useContractsRegistry()
    kindFilter.value = 'event'
    expect(filtered.value.every((e) => e.kind === 'event')).toBe(true)
    kindFilter.value = 'http'
    expect(filtered.value.every((e) => e.kind === 'http')).toBe(true)
  })

  it('selects and resolves a contract for the detail panel', () => {
    const { select, selectedEntry, selectedContract } = useContractsRegistry()
    expect(selectedEntry.value).toBeNull()
    select('http.config.get.v1')
    expect(selectedContract.value).toBe('http.config.get.v1')
    expect(selectedEntry.value?.contract).toBe('http.config.get.v1')
    select(null)
    expect(selectedEntry.value).toBeNull()
  })
})
