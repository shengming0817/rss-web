import { expect, it } from 'vitest'
import { bootstrapAttempt, bootstrapDefinition } from './bootstrap'
it('rejects mixed source actions, embedded credential fields and contradictory installation claims', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const definition = {
    title: 'Guide',
    scope: id,
    platform: 'windows',
    enabled: true,
    action: { kind: 'request_mdm', instructions: 'Contact support' },
  }
  expect(bootstrapDefinition(definition).action.kind).toBe('request_mdm')
  expect(() =>
    bootstrapDefinition({ ...definition, action: { ...definition.action, password: 'forbidden' } }),
  ).toThrow()
  expect(() =>
    bootstrapDefinition({ ...definition, action: { ...definition.action, resource: {} } }),
  ).toThrow()
  const a = {
    id,
    policyRevision: 1,
    kind: 'request_mdm',
    source: { registrationId: id, generation: 1, source: 'agent.builtin' },
    createdAt: 1,
    deadline: 100,
    phase: 'acknowledged',
    delivery: 'received',
    installation: 'not_applicable',
    acknowledgedAt: 3,
    detectedAt: null,
    code: null,
  }
  expect(bootstrapAttempt(a).installation).toBe('not_applicable')
  expect(() => bootstrapAttempt({ ...a, installation: 'present' })).toThrow()
  expect(() => bootstrapAttempt({ ...a, acknowledgedAt: null })).toThrow()
  expect(() => bootstrapAttempt({ ...a, kind: 'install_agent', installation: 'present' })).toThrow()
})
