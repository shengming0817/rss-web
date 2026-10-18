import { expect, it } from 'vitest'
import { defaultSchedule, policyAction } from '../../policies/clients/model'
it('normalizes the management default and preserves an explicitly selected software channel', () => {
  const action = {
    kind: 'software',
    delivery: { kind: 'direct' },
    resource: {
      kind: 'software',
      id: 'app',
      version: '1',
      variants: { windows_x86_64: 'default' },
    },
    intent: 'required_install',
    schedule: defaultSchedule(),
    runLifetimeSeconds: 3600,
    rollout: {
      stages: [
        { scope: '11111111-1111-4111-8111-111111111111', opensAt: 0, minimumVerifiedPercent: null },
      ],
    },
  }
  expect(policyAction(action)).toMatchObject({ channel: 'agent' })
  expect(policyAction({ ...action, channel: 'mdm' })).toMatchObject({ channel: 'mdm' })
  expect(() => policyAction({ ...action, channel: 'automatic' })).toThrow()
})
