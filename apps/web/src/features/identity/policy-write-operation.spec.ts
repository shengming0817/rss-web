import { describe, expect, it, vi } from 'vitest'
import { decodeWireErrorForTest } from '@rss/api/testing'
import type { PolicyView } from '@rss/identity'
import {
  createPolicyDeactivateCommand,
  createPolicyUpdateCommand,
  createPolicyWriteOperation,
} from './policy-write-operation'

const snapshot = {
  policyId: 'policy-write' as never,
  version: 7,
  contractId: 'identity.policies-list',
  permission: 'identity:policy:read',
  effectiveFrom: 1,
  rules: [
    {
      condition: {
        attribute: 'principal.kind',
        operator: {
          family: 'equality' as const,
          predicate: 'eq' as const,
          operand: { kind: 'literal' as const, valueType: 'string' as const, value: 'admin' },
        },
      },
      effect: 'allow' as const,
    },
  ],
} satisfies PolicyView

const fields = {
  contractId: snapshot.contractId,
  permission: snapshot.permission,
  effectiveFrom: snapshot.effectiveFrom,
  rules: snapshot.rules,
}

function wire(status: number, code: string, message: string, retryable: boolean) {
  return decodeWireErrorForTest(status, {
    error: { code, message, retryable, details: [], requestId: 'policy-write-rid' },
  })
}

describe('Policy write operation', () => {
  it('captures update and deactivate CAS only from a decoded detail snapshot', () => {
    expect(createPolicyUpdateCommand(snapshot, fields)).toMatchObject({
      policyId: 'policy-write',
      request: { expectedVersion: 7 },
    })
    expect(createPolicyDeactivateCommand(snapshot)).toMatchObject({
      policyId: 'policy-write',
      request: { expectedVersion: 7 },
    })
  })

  it.each([
    [
      'version conflict',
      wire(409, 'ERR_CORE_VERSION_CONFLICT', 'version conflict', true),
      'conflict',
    ],
    [
      'outbox conflict',
      wire(409, 'ERR_CORE_OUTBOX_FACT_CONFLICT', 'outbox fact conflict', false),
      'conflict',
    ],
    ['internal', wire(500, 'ERR_CORE_INTERNAL', 'internal error', false), 'unknown'],
    ['network', new Error('network outcome unknown'), 'unknown'],
    ['forbidden', wire(403, 'ERR_CORE_FORBIDDEN', 'forbidden', false), 'error'],
  ] as const)('keeps one draft and classifies %s without replay', async (_name, error, status) => {
    const execute = vi.fn().mockRejectedValue(error)
    const operation = createPolicyWriteOperation(execute)
    const command = createPolicyDeactivateCommand(snapshot)
    operation.prepare(command)
    await operation.submit()
    expect(execute).toHaveBeenCalledOnce()
    expect(operation.getState()).toMatchObject({ status, command })
  })

  it('requires confirmation and fences late completion after reset', async () => {
    let resolve!: (value: PolicyView) => void
    const pending = new Promise<PolicyView>((done) => {
      resolve = done
    })
    const execute = vi.fn().mockReturnValue(pending)
    const operation = createPolicyWriteOperation(execute)
    await operation.submit()
    expect(execute).not.toHaveBeenCalled()
    operation.prepare(createPolicyDeactivateCommand(snapshot))
    const submission = operation.submit()
    operation.reset()
    resolve(snapshot)
    await submission
    expect(operation.getState()).toEqual({ status: 'idle' })
  })
})
