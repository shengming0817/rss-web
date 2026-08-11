import { decodePolicyWriteFields } from './decoders'
import { parsePolicyId } from './policy-id'
import { sealPolicyVersion } from './policy-version'
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

function writeFields(input: Record<string, unknown>): PolicyWriteFields {
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

export function parsePolicyUpdateRequestInternal(value: unknown): PolicyUpdateRequest {
  const input = exactRecord(
    value,
    ['expectedVersion', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  return Object.freeze({
    expectedVersion: sealPolicyVersion(positiveInt32(input.expectedVersion)),
    ...writeFields(input),
  })
}

export function parsePolicyDeactivateRequestInternal(value: unknown): PolicyDeactivateRequest {
  const input = exactRecord(value, ['expectedVersion'])
  return Object.freeze({ expectedVersion: sealPolicyVersion(positiveInt32(input.expectedVersion)) })
}

export function createPolicyUpdateRequest(
  snapshot: PolicyView,
  fields: PolicyWriteFields,
): PolicyUpdateRequest {
  return parsePolicyUpdateRequestInternal({ expectedVersion: snapshot.version, ...fields })
}

export function createPolicyDeactivateRequest(snapshot: PolicyView): PolicyDeactivateRequest {
  return Object.freeze({ expectedVersion: snapshot.version })
}
