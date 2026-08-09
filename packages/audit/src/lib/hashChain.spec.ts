import { describe, it, expect } from 'vitest'
import { verifyChain } from './hashChain'

describe('verifyChain', () => {
  it('returns unavailable when entries is empty', () => {
    expect(verifyChain([])).toEqual({ status: 'unavailable' })
  })

  it('returns unavailable when entries have no hash field', () => {
    // exactOptionalPropertyTypes: don't pass explicit undefined; just omit the field
    const entries = [{}, {}]
    expect(verifyChain(entries)).toEqual({ status: 'unavailable' })
  })

  it('returns unavailable when only one entry and hash field absent', () => {
    expect(verifyChain([{}])).toEqual({ status: 'unavailable' })
  })

  it('returns ok when single entry has a hash (no chain to verify)', () => {
    expect(verifyChain([{ hash: '0xabc' }])).toEqual({ status: 'ok' })
  })

  it('returns ok when chain is intact (entries[i].prevHash === entries[i+1].hash)', () => {
    // entries are newest-first: entries[0].prev should equal entries[1].hash
    const entries = [
      { hash: '0x9999', prevHash: '0x8888' },
      { hash: '0x8888', prevHash: '0x7777' },
      { hash: '0x7777' },
    ]
    expect(verifyChain(entries)).toEqual({ status: 'ok' })
  })

  it('returns broken with brokenAt when chain link is broken', () => {
    const entries = [
      { hash: '0x9999', prevHash: '0x0000' }, // broken: prevHash != entries[1].hash
      { hash: '0x8888', prevHash: '0x7777' },
      { hash: '0x7777' },
    ]
    const result = verifyChain(entries)
    expect(result.status).toBe('broken')
    expect(result.brokenAt).toBe(0)
  })

  it('reports brokenAt as the index of the first broken link', () => {
    const entries = [
      { hash: '0xd', prevHash: '0xc' }, // ok
      { hash: '0xc', prevHash: '0xa' }, // broken: prevHash 0xa != entries[2].hash 0xb
      { hash: '0xb' },
    ]
    const result = verifyChain(entries)
    expect(result.status).toBe('broken')
    expect(result.brokenAt).toBe(1)
  })

  it('returns unavailable when some entries lack hash (mixed)', () => {
    const entries = [
      { hash: '0x9' },
      {}, // no hash
    ]
    expect(verifyChain(entries)).toEqual({ status: 'unavailable' })
  })
})
