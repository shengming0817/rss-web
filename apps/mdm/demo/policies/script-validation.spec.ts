import { expect, it } from 'vitest'
import { validateScriptVariant, validateScriptParameters } from './script-validation'
import type { ScriptSpec, Variant } from '../../src/features/policies/clients/resources'
it('validates the published finite schema/binding contract with a standard schema validator', () => {
  const definition: ScriptSpec = {
    profile: 'power_shell7',
    runAs: 'system',
    encoding: 'utf8',
    parameters: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1 } },
      required: ['count'],
      additionalProperties: false,
    },
    bindings: { count: { kind: 'named', name: 'Count' } },
    output: { type: 'object' },
    purpose: { kind: 'action' },
    timeoutSeconds: 30,
    outputBytes: 1024,
    maxRows: 1,
  }
  const variant: Variant = {
    platform: 'windows',
    architecture: 'x86_64',
    key: 'main',
    declaration: {
      kind: 'script',
      artifact: { reference: 'script', length: 10, sha256: Array(32).fill(0) },
      definition,
    },
  }
  expect(() => validateScriptVariant(variant)).not.toThrow()
  expect(() => validateScriptParameters(definition, { count: 1 })).not.toThrow()
  for (const value of [{ count: 0 }, { count: '1' }, { count: 1, extra: true }, {}])
    expect(() => validateScriptParameters(definition, value)).toThrow()
  expect(() => validateScriptVariant({ ...variant, platform: 'macos' })).toThrow()
  expect(() =>
    validateScriptVariant({
      ...variant,
      declaration: {
        ...variant.declaration,
        kind: 'script',
        definition: { ...definition, bindings: {} },
      },
    }),
  ).toThrow()
})
