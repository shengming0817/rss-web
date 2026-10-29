import { expect, it, vi } from 'vitest'
import {
  createCompliance,
  validateDefinition,
  type Assessment,
  type CompliancePort,
  type Definition,
} from './index'

const id = '11111111-1111-4111-8111-111111111111',
  operation = '22222222-2222-4222-8222-222222222222',
  task = '33333333-3333-4333-8333-333333333333'
function definition(): Definition {
  return {
    presentation: { name: 'Encryption', description: '', custom: { off: false, count: 0 } },
    severity: 'high',
    enabled: true,
    platform: 'all',
    target: { kind: 'groups', ids: [task] },
    criteria: {
      selector: { kind: 'device' },
      quantifier: 'one',
      criteria: {
        kind: 'and',
        children: [
          {
            kind: 'predicate',
            field: 'custom.enabled',
            op: 'eq',
            value: { kind: 'boolean', value: false },
          },
          {
            kind: 'predicate',
            field: 'custom.count',
            op: 'ge',
            value: { kind: 'integer', value: 0 },
          },
        ],
      },
    },
  }
}
function assessment(): Assessment {
  return {
    ruleId: id,
    ruleVersion: 2,
    dictionaryVersion: 'dictionary',
    factWatermark: 5,
    evaluatedAt: 100,
    groups: [],
    status: 'unknown',
    reason: 'facts_unknown',
    condition: 'unknown',
    applicability: { platform: 'all', platformDecision: 'match', sources: [], groups: [] },
    explanations: [{ context: 'device', path: [0], outcome: 'conflict' }],
    evidence: [],
  }
}
function port(methods: Partial<CompliancePort>): CompliancePort {
  return new Proxy(methods as CompliancePort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected port call: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('accepts the backend evaluation task identity without substituting the write operation ID', async () => {
  const put = vi.fn(async (_id: string, change: Parameters<CompliancePort['put']>[1]) => {
      expect(Object.isFrozen(change.input.presentation)).toBe(true)
      return { id, revision: 3, task }
    }),
    compliance = createCompliance(port({ put }))
  const change = { operationId: operation, expectedRevision: 2, input: definition() }
  expect(await compliance.put(id, change)).toEqual({ id, revision: 3, task })
  expect(put).toHaveBeenCalledWith(id, change)
  expect(task).not.toBe(operation)
})
it('does not replay an unknown rule save or manufacture evaluation completion', async () => {
  const put = vi.fn(async () => {
      throw { status: 503, code: 'outcome_unknown' }
    }),
    compliance = createCompliance(port({ put }))
  await expect(
    compliance.put(id, { operationId: operation, expectedRevision: 0, input: definition() }),
  ).rejects.toMatchObject({ code: 'outcome_unknown' })
  expect(put).toHaveBeenCalledTimes(1)
})
it('retains previous assessments as historical when the current revision is pending', async () => {
  const current = {
      device: 'endpoint',
      status: 'pending' as const,
      reason: null,
      rules: [
        {
          ruleId: id,
          ruleVersion: 3,
          status: 'pending' as const,
          current: null,
          previous: assessment(),
        },
      ],
    },
    compliance = createCompliance(port({ current: async () => current }))
  expect(await compliance.current('endpoint')).toBe(current)
  expect(current.rules[0]?.previous?.ruleVersion).toBe(2)
  expect(current.rules[0]?.current).toBeNull()
})
it('rejects a current assessment bound to another rule revision and keeps no-rules unknown', async () => {
  const bad = createCompliance(
    port({
      current: async () => ({
        device: 'endpoint',
        status: 'unknown',
        reason: null,
        rules: [
          { ruleId: id, ruleVersion: 3, status: 'unknown', current: assessment(), previous: null },
        ],
      }),
    }),
  )
  await expect(bad.current('endpoint')).rejects.toThrow('Wrong current assessment')
  const empty = {
      device: 'endpoint',
      status: 'unknown' as const,
      reason: 'no_rules' as const,
      rules: [],
    },
    compliance = createCompliance(port({ current: async () => empty }))
  expect(await compliance.current('endpoint')).toEqual(empty)
})
it('keeps history time bounds with the opaque cursor and rejects an inverted range before HTTP', async () => {
  const history = vi.fn(async () => ({
      items: [{ ...assessment(), task, disposition: 'superseded' as const }],
      nextCursor: 'opaque/next',
    })),
    compliance = createCompliance(port({ history }))
  expect(
    (
      await compliance.history('endpoint', {
        from: 0,
        until: 100,
        cursor: 'opaque/current',
        limit: 1,
      })
    ).items[0]?.disposition,
  ).toBe('superseded')
  expect(history).toHaveBeenCalledWith('endpoint', {
    from: 0,
    until: 100,
    cursor: 'opaque/current',
    limit: 1,
  })
  expect(() => compliance.history('endpoint', { from: 101, until: 100 })).toThrow('history range')
  expect(history).toHaveBeenCalledTimes(1)
})
it('validates complex authoring structure and metadata without evaluating conditions', () => {
  validateDefinition(definition())
  expect(() =>
    validateDefinition({ ...definition(), target: { kind: 'groups', ids: [task, task] } }),
  ).toThrow('groups')
  expect(() =>
    validateDefinition({ ...definition(), presentation: { name: 'bad\nname' } }),
  ).toThrow('definition')
})
it('binds recompute and deletion receipts to the observed rule identity and revision', async () => {
  const compliance = createCompliance(
    port({
      recompute: async () => ({ task }),
      remove: async () => ({ id, revision: 3, deleted: true }),
    }),
  )
  expect(
    await compliance.recompute(id, { operationId: operation, expectedRevision: 2, input: {} }),
  ).toEqual({ task })
  expect(
    await compliance.remove(id, { operationId: operation, expectedRevision: 2, input: {} }),
  ).toEqual({ id, revision: 3, deleted: true })
  await expect(
    compliance.remove(id, { operationId: operation, expectedRevision: 0, input: {} }),
  ).rejects.toThrow('revision required')
})
