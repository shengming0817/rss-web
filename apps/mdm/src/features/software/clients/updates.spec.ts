import { expect, it } from 'vitest'
import { updateDefinition, updateDevice } from './updates'
it('rejects unsupported patch reboot claims and contradictory gap evidence', () => {
  const definition = {
    title: 'Pilot',
    scope: '11111111-1111-4111-8111-111111111111',
    platform: 'windows',
    enabled: true,
    target: { kind: 'os', release: 'fixed' },
    deferDays: 0,
    deadline: 2000000000,
    notifyMinutes: 15,
    reboot: 'user',
    window: null,
  }
  expect(() => updateDefinition({ ...definition, reboot: 'maintenance' })).toThrow()
  expect(() => updateDefinition({ ...definition, deferDays: 366 })).toThrow()
  expect(() =>
    updateDefinition({
      ...definition,
      target: {
        kind: 'third_party',
        resource: {
          kind: 'software',
          id: 'app',
          version: '1',
          variants: { windows_x86_64: 'main' },
        },
        admissionOperation: definition.scope,
      },
    }),
  ).toThrow()
  const row = {
    device: 'device',
    registration: null,
    gap: 'unknown',
    observedAt: null,
    source: 'unavailable',
    phase: 'unsupported',
    effect: 'unverified',
    attempt: null,
    execution: null,
    notifiedAt: null,
    rebootRequestedAt: null,
    code: null,
    waiting: null,
  }
  expect(updateDevice(row).gap).toBe('unknown')
  expect(() => updateDevice({ ...row, gap: 'installed' })).toThrow()
  expect(() => updateDevice({ ...row, source: 'update_report', observedAt: 1 })).toThrow()
  expect(() => updateDevice({ ...row, effect: 'verified' })).toThrow()
  expect(() => updateDevice({ ...row, phase: 'verified' })).toThrow()
  const verified = {
    ...row,
    phase: 'verified',
    effect: 'verified',
    gap: 'installed',
    source: 'update_report',
    observedAt: 1,
    registration: { id: definition.scope, generation: 1, source: 'mdm.windows' },
  }
  expect(updateDevice(verified).effect).toBe('verified')
  for (const invalid of [
    { effect: 'unverified' },
    { gap: 'unknown' },
    { source: 'unavailable', observedAt: null, gap: 'unknown' },
    { registration: null },
  ])
    expect(() => updateDevice({ ...verified, ...invalid })).toThrow()
})
