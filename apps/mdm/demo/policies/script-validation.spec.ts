import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { validateScriptVariant, validateScriptParameters } from './script-validation'
import type { ScriptSpec, Variant } from '../../src/features/policies/clients/resources'
it('validates the published finite schema/binding contract with a standard schema validator', () => {
  const definition: ScriptSpec = {
    profile: 'power_shell7',
    sql: null,
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
  const variant: Variant & { declaration: Extract<Variant['declaration'], { kind: 'script' }> } = {
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

it('binds current osquery metadata to the exact canonical SQL artifact', () => {
  const sql = 'SELECT version FROM osquery_info',
    bytes = new TextEncoder().encode(sql)
  const variant: Variant = {
    key: 'default',
    platform: 'windows',
    architecture: 'x86_64',
    declaration: {
      kind: 'script',
      artifact: {
        reference: 'query.sql',
        length: bytes.length,
        sha256: [...createHash('sha256').update(bytes).digest()],
      },
      definition: {
        profile: 'osquery',
        sql,
        runAs: 'system',
        encoding: 'utf8',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        bindings: {},
        output: { type: 'array' },
        purpose: { kind: 'collection', mappings: { 'custom.osquery.version': '/0/version' } },
        timeoutSeconds: 30,
        outputBytes: 1024,
        maxRows: 1,
      },
    },
  }
  expect(() => validateScriptVariant(variant)).not.toThrow()
  if (variant.declaration.kind !== 'script') throw new Error('Wrong fixture')
  const declaration = variant.declaration
  expect(() =>
    validateScriptVariant({
      ...variant,
      declaration: {
        ...declaration,
        artifact: { ...declaration.artifact, length: bytes.length + 1 },
      },
    }),
  ).toThrow()
  expect(() =>
    validateScriptVariant({
      ...variant,
      declaration: {
        ...declaration,
        definition: { ...declaration.definition, sql: sql + ' LIMIT 1' },
      },
    }),
  ).toThrow()
})
