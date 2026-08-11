import { decodePolicyWriteFields } from './decoders'
import { parsePolicyId } from './policy-id'
import type {
  PolicyCreateRequest,
  PolicyDeactivateRequest,
  PolicyUpdateRequest,
  PolicyWriteFields,
  PolicyView,
} from './types'

const INT32_MAX = 2_147_483_647

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid policy write input')
  }
  const input = value as Record<string, unknown>
  const allowed = new Set([...required, ...optional])
  if (
    Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(input, key))
  ) {
    throw new Error('invalid policy write input')
  }
  return input
}

function positiveInt32(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > INT32_MAX) {
    throw new Error('invalid policy write input')
  }
  return value as number
}

function writeFields(
  input: Readonly<{
    contractId?: unknown
    permission?: unknown
    effectiveFrom?: unknown
    effectiveUntil?: unknown
    rules?: unknown
  }>,
): PolicyWriteFields {
  return decodePolicyWriteFields(
    {
      contractId: input.contractId,
      permission: input.permission,
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveUntil === undefined ? {} : { effectiveUntil: input.effectiveUntil }),
      rules: input.rules,
    },
    { requireRules: true },
  )
}

export function parsePolicyCreateRequest(value: unknown): PolicyCreateRequest {
  const input = exactRecord(
    value,
    ['policyId', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  const policyId = parsePolicyId(input.policyId)
  if (policyId === undefined) throw new Error('invalid policy write input')
  return Object.freeze({ policyId, ...writeFields(input) })
}

export function createPolicyUpdateRequest(
  snapshot: PolicyView,
  fields: PolicyWriteFields,
): PolicyUpdateRequest {
  positiveInt32(snapshot.version)
  return Object.freeze({ expectedVersion: snapshot.version, ...writeFields(fields) })
}

export function createPolicyDeactivateRequest(snapshot: PolicyView): PolicyDeactivateRequest {
  positiveInt32(snapshot.version)
  return Object.freeze({ expectedVersion: snapshot.version })
}
