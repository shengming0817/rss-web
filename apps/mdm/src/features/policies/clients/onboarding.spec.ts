import { expect, it } from 'vitest'
import { defaultSchedule, policyAction } from './model'
it('requires an explicit release per target and rejects the old resource binding', () => {
  const input = {
    kind: 'ensure_agent_installed',
    packages: { windows_x86_64: '11111111-1111-4111-8111-111111111111' },
    schedule: defaultSchedule(),
    runLifetimeSeconds: 600,
  }
  expect(policyAction(input)).toEqual(input)
  for (const packages of [
    {},
    { windows_x86_64: 'latest' },
    { windows: '11111111-1111-4111-8111-111111111111' },
  ]) {
    expect(() => policyAction({ ...input, packages })).toThrow()
  }
  expect(() => policyAction({ ...input, resource: { kind: 'software' } })).toThrow()
})
