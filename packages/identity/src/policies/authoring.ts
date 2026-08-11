import { decodePolicyView } from './decoders'
import { parsePolicyId } from './policy-id'
import type {
  PolicyCreateRequest,
  PolicyDeactivateRequest,
  PolicyUpdateRequest,
  PolicyWriteFields,
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

function writeFields(input: Record<string, unknown>, policyId: string): PolicyWriteFields {
  const decoded = decodePolicyView({
    policyId,
    version: 1,
    contractId: input.contractId,
    permission: input.permission,
    effectiveFrom: input.effectiveFrom,
    ...(input.effectiveUntil === undefined ? {} : { effectiveUntil: input.effectiveUntil }),
    rules: input.rules,
  })
  if (decoded.rules.length === 0) throw new Error('invalid policy write input')
  return Object.freeze({
    contractId: decoded.contractId,
    permission: decoded.permission,
    effectiveFrom: decoded.effectiveFrom,
    ...(decoded.effectiveUntil === undefined ? {} : { effectiveUntil: decoded.effectiveUntil }),
    rules: decoded.rules,
  })
}

export function parsePolicyCreateRequest(value: unknown): PolicyCreateRequest {
  const input = exactRecord(
    value,
    ['policyId', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  const policyId = parsePolicyId(input.policyId)
  if (policyId === undefined) throw new Error('invalid policy write input')
  return Object.freeze({ policyId, ...writeFields(input, policyId) })
}

export function parsePolicyUpdateRequest(value: unknown): PolicyUpdateRequest {
  const input = exactRecord(
    value,
    ['expectedVersion', 'contractId', 'permission', 'effectiveFrom', 'rules'],
    ['effectiveUntil'],
  )
  return Object.freeze({
    expectedVersion: positiveInt32(input.expectedVersion),
    ...writeFields(input, 'policy-write-validation'),
  })
}

export function parsePolicyDeactivateRequest(value: unknown): PolicyDeactivateRequest {
  const input = exactRecord(value, ['expectedVersion'])
  return Object.freeze({ expectedVersion: positiveInt32(input.expectedVersion) })
}
