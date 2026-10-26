import { expect, it } from 'vitest'
import { defaultSchedule, policyAction, policyDefinition } from '../../policies/clients/model'
it('requires canonical response channels and preserves explicit channel selection', () => {
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
  expect(() => policyAction(action)).toThrow()
  const available = { ...action, channel: 'agent', intent: 'available_install' }
  const selfService = {
    published: true,
    access: { kind: 'device' },
    allowAi: false,
    riskLevel: 1,
    presentation: {
      displayName: 'App',
      description: '',
      prerequisites: '',
      sideEffects: '',
      category: 'Apps',
      keywords: [],
    },
  }
  expect(
    policyDefinition({
      customEvent: null,
      alias: null,
      scope: action.rollout.stages[0]!.scope,
      action: available,
      selfService,
    }).selfService,
  ).toMatchObject({ riskLevel: 1, allowAi: false })
  expect(policyAction({ ...action, channel: 'agent' })).toMatchObject({ channel: 'agent' })
  expect(policyAction({ ...action, channel: 'mdm' })).toMatchObject({ channel: 'mdm' })
  expect(() => policyAction({ ...action, channel: 'automatic' })).toThrow()
})
