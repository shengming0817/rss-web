import { describe, expect, it } from 'vitest'
import { addresses, currentEvidence, receivedAt, scalarText, utc } from './presentation'
import type { DeviceView } from './clients/device-views'
import type { Evidence } from './clients/asset-model'
const evidence: Evidence = {
  scope: { kind: 'device' },
  source: 'agent.builtin',
  dataset: 'network',
  registration: 'registration',
  registrationGeneration: 3,
  epoch: 'epoch',
  snapshotId: 'snapshot',
  observedAt: 10,
  receivedAt: 20,
  actor: null,
}
const view = {
  endpoints: [
    {
      id: 'a',
      channels: [
        { channel: 'agent', status: 'active', registrationId: 'registration', generation: 3 },
      ],
    },
  ],
  fields: { name: { sources: [{ endpoint: 'a', fact: { evidence } }] } },
  lists: { network: { sources: [{ endpoint: 'a', evidence: { ...evidence, receivedAt: 21 } }] } },
} as unknown as DeviceView
it('uses only current registration generations for received timestamps', () => {
  expect(currentEvidence(view, 'a', evidence)).toBe(true)
  expect(currentEvidence(view, 'a', { ...evidence, registrationGeneration: 2 })).toBe(false)
  expect(currentEvidence(view, 'a', { ...evidence, source: 'manual' })).toBe(false)
  expect(currentEvidence(view, 'other', evidence)).toBe(false)
  expect(receivedAt(view, 'a')).toBe(21)
  expect(receivedAt(view, 'other')).toBeNull()
})
it('shows address arrays and native Windows observations without treating them as online status', () => {
  expect(
    addresses([
      {
        kind: 'object',
        value: {
          addresses: {
            kind: 'array',
            value: [
              { kind: 'string', value: '10.0.0.1' },
              { kind: 'integer', value: 3 },
            ],
          },
        },
      },
      {
        kind: 'object',
        value: {
          ipv4: { kind: 'string', value: '10.0.0.1' },
          ipv6: { kind: 'string', value: '::1' },
        },
      },
      { kind: 'string', value: 'other' },
    ]),
  ).toEqual(['10.0.0.1', '::1'])
})
describe('UTC and structured facts', () => {
  it('keeps missing dates explicit and renders nested values', () => {
    expect(utc(null)).toBe('—')
    expect(utc(Number.NaN)).toBe('—')
    expect(utc(0)).toBe('1970-01-01 00:00:00 UTC')
    expect(
      scalarText({
        kind: 'object',
        value: {
          enabled: { kind: 'boolean', value: false },
          times: { kind: 'array', value: [{ kind: 'time', value: 0 }] },
        },
      }),
    ).toContain('enabled: false · times: 1970-01-01')
  })
})
