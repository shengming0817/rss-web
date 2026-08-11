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
  version: 7 as never,
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

  it('requires successful reconciliation before a conflict can be cleared or replaced', async () => {
    const command = createPolicyDeactivateCommand(snapshot)
    const conflict = wire(409, 'ERR_CORE_VERSION_CONFLICT', 'version conflict', true)
    const operation = createPolicyWriteOperation(vi.fn().mockRejectedValue(conflict))
    operation.prepare(command)
    await operation.submit()
    expect(operation.reset()).toBe(false)
    operation.prepare(createPolicyUpdateCommand(snapshot, fields))
    expect(operation.getState()).toMatchObject({ status: 'conflict', command })
    operation.reconciled(createPolicyDeactivateCommand(snapshot))
    expect(operation.getState()).toMatchObject({ status: 'conflict' })
    operation.reconciled(command)
    expect(operation.getState()).toEqual({ status: 'idle' })
  })

  it('requires confirmation and refuses to erase an in-flight command', async () => {
    const command = createPolicyDeactivateCommand(snapshot)
    let resolve!: (value: {
      action: 'deactivate'
      command: typeof command
      result: { deactivated: boolean; version: never }
    }) => void
    const pending = new Promise<{
      action: 'deactivate'
      command: typeof command
      result: { deactivated: boolean; version: never }
    }>((done) => {
      resolve = done
    })
    const execute = vi.fn().mockReturnValue(pending)
    const operation = createPolicyWriteOperation(execute)
    await operation.submit()
    expect(execute).not.toHaveBeenCalled()
    operation.prepare(command)
    const submission = operation.submit()
    expect(operation.reset()).toBe(false)
    resolve({ action: 'deactivate', command, result: { deactivated: true, version: 8 as never } })
    await submission
    expect(operation.getState()).toMatchObject({ status: 'success', action: 'deactivate', command })
  })
})
