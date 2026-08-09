import { describe, it, expect } from 'vitest'
import { RESPONSE_ENVELOPES, responseEnvelopeFor } from './responseEnvelopes'

describe('RESPONSE_ENVELOPES snapshot', () => {
  it('keys are http.* contract ids', () => {
    for (const key of Object.keys(RESPONSE_ENVELOPES)) {
      expect(key).toMatch(/^http\./)
    }
  })

  it('every entry has a valid kind matching its status class', () => {
    for (const entries of Object.values(RESPONSE_ENVELOPES)) {
      for (const e of entries) {
        expect(['2xx', '4xx', '5xx']).toContain(e.kind)
        const cls = `${Math.floor(e.status / 100)}xx`
        expect(e.kind).toBe(cls)
      }
    }
  })

  it('each contract has exactly one 2xx success entry', () => {
    for (const entries of Object.values(RESPONSE_ENVELOPES)) {
      expect(entries.filter((e) => e.kind === '2xx')).toHaveLength(1)
    }
  })
})

describe('responseEnvelopeFor', () => {
  it('returns entries for a known contract', () => {
    const entries = responseEnvelopeFor('http.auth.login.v1')
    expect(entries).not.toBeNull()
    expect(entries!.length).toBeGreaterThan(0)
  })

  it('returns null for a contract without a snapshot', () => {
    expect(responseEnvelopeFor('event.user.created.v1')).toBeNull()
  })
})
