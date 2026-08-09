import { describe, it, expect } from 'vitest'
import { SMART_GROUPS, cellFieldValue, evalPredicate, groupMembers } from './smartGroups'
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

const ACCESS = makeCell({
  id: 'accesscore',
  domain: 'Access',
  consistencyLevel: 'L3',
  dependsOnCells: ['configcore'],
  produces: [{ contract: 'http.auth.login.v1', role: 'serve' }],
  consumes: [
    { contract: 'http.config.get.v1', role: 'call' },
    { contract: 'event.role.assigned.v1', role: 'subscribe' },
    { contract: 'event.role.revoked.v1', role: 'subscribe' },
    { contract: 'event.config.entry-deleted.v1', role: 'subscribe' },
    { contract: 'event.config.entry-upserted.v1', role: 'subscribe' },
  ],
})
const CONFIG = makeCell({
  id: 'configcore',
  domain: 'Config',
  consistencyLevel: 'L3',
  durabilityMode: 'durable',
  dependsOnCells: [],
})
const AUDIT = makeCell({
  id: 'auditcore',
  domain: 'Audit',
  consistencyLevel: 'L2',
  dependsOnCells: ['accesscore', 'configcore'],
})

const CELLS = [ACCESS, CONFIG, AUDIT]

describe('cellFieldValue', () => {
  it('maps tier to consistencyLevel', () => {
    expect(cellFieldValue(ACCESS, 'tier')).toBe('L3')
  })
  it('maps dependsOnCount to dependsOnCells length', () => {
    expect(cellFieldValue(ACCESS, 'dependsOnCount')).toBe(1)
    expect(cellFieldValue(CONFIG, 'dependsOnCount')).toBe(0)
  })
  it('maps consumesCount to consumes length', () => {
    expect(cellFieldValue(ACCESS, 'consumesCount')).toBe(5)
  })
  it('maps domain and durability directly', () => {
    expect(cellFieldValue(ACCESS, 'domain')).toBe('Access')
    expect(cellFieldValue(CONFIG, 'durability')).toBe('durable')
  })
})

describe('evalPredicate', () => {
  it('eq matches string fields', () => {
    expect(evalPredicate(ACCESS, { field: 'domain', op: 'eq', value: 'Access' })).toBe(true)
    expect(evalPredicate(AUDIT, { field: 'domain', op: 'eq', value: 'Access' })).toBe(false)
  })
  it('gte matches numeric fields', () => {
    expect(evalPredicate(ACCESS, { field: 'consumesCount', op: 'gte', value: 5 })).toBe(true)
    expect(evalPredicate(AUDIT, { field: 'consumesCount', op: 'gte', value: 5 })).toBe(false)
  })
  it('numeric ops return false against non-numeric fields', () => {
    expect(evalPredicate(ACCESS, { field: 'domain', op: 'gte', value: 5 })).toBe(false)
  })
  it('neq inverts eq', () => {
    expect(evalPredicate(AUDIT, { field: 'domain', op: 'neq', value: 'Access' })).toBe(true)
  })
})

describe('groupMembers', () => {
  it('returns cells satisfying all predicates (real membership)', () => {
    const access = SMART_GROUPS.find((g) => g.id === 'sg-access')!
    expect(groupMembers(access, CELLS).map((c) => c.id)).toEqual(['accesscore'])
  })

  it('foundation group selects cells with no dependencies', () => {
    const foundation = SMART_GROUPS.find((g) => g.id === 'sg-foundation')!
    expect(groupMembers(foundation, CELLS).map((c) => c.id)).toEqual(['configcore'])
  })

  it('strong-consistency group selects L3 cells', () => {
    const strong = SMART_GROUPS.find((g) => g.id === 'sg-strong-consistency')!
    expect(
      groupMembers(strong, CELLS)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['accesscore', 'configcore'])
  })
})

describe('SMART_GROUPS definitions', () => {
  it('have unique ids and i18n name/desc keys', () => {
    const ids = SMART_GROUPS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of SMART_GROUPS) {
      expect(g.nameKey).toMatch(/^groups\.defs\./)
      expect(g.descKey).toMatch(/^groups\.defs\./)
      expect(g.predicates.length).toBeGreaterThan(0)
    }
  })
})
