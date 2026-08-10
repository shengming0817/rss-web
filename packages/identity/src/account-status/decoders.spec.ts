import { describe, expect, it } from 'vitest'
import { decodeAccountStatusGetResponse, decodeAccountStatusSetResponse } from './decoders'

describe('Account Status strict decoders', () => {
  it.each(['active', 'suspended', 'locked', 'deactivated'] as const)(
    'decodes the closed %s status',
    (status) => {
      expect(decodeAccountStatusGetResponse({ data: { status } })).toEqual({ data: { status } })
      expect(decodeAccountStatusSetResponse({ data: { status, changed: false } })).toEqual({
        data: { status, changed: false },
      })
    },
  )

  it.each([
    {},
    { data: {} },
    { data: { status: 'ACTIVE' } },
    { data: { status: 'active', extra: true } },
    { data: { status: 'active' }, extra: true },
  ])('rejects a drifting get response %#', (value) => {
    expect(() => decodeAccountStatusGetResponse(value)).toThrow('invalid account status response')
  })

  it.each([
    {},
    { data: { status: 'active' } },
    { data: { status: 'active', changed: 'yes' } },
    { data: { status: 'active', changed: true, extra: true } },
    { data: { status: 'unknown', changed: true } },
  ])('rejects a drifting set response %#', (value) => {
    expect(() => decodeAccountStatusSetResponse(value)).toThrow('invalid account status response')
  })
})
