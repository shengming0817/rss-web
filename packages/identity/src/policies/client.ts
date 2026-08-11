import type { HttpTransport } from '@rss/api'
import { identityEndpoints } from '@rss/api/endpoints/identity'
import {
  decodePoliciesListResponse,
  decodePolicyWriteFields,
  decodePolicyCreateResponse,
  decodePolicyDeactivateResponse,
  decodePolicyGetResponse,
  decodePolicyUpdateResponse,
} from './decoders'
import { parsePolicyCreateRequest } from './authoring'
import type { PolicyId } from './policy-id'
import type {
  PoliciesCallOptions,
  PoliciesListRequest,
  PoliciesListResponse,
  PolicyCreateRequest,
  PolicyCreateResponse,
  PolicyDeactivateRequest,
  PolicyDeactivateResponse,
  PolicyGetResponse,
  PolicyUpdateRequest,
  PolicyUpdateResponse,
} from './types'

export interface PoliciesApi {
  list(request?: PoliciesListRequest, options?: PoliciesCallOptions): Promise<PoliciesListResponse>
  get(policyId: PolicyId, options?: PoliciesCallOptions): Promise<PolicyGetResponse>
  create(request: PolicyCreateRequest, options?: PoliciesCallOptions): Promise<PolicyCreateResponse>
  update(
    policyId: PolicyId,
    request: PolicyUpdateRequest,
    options?: PoliciesCallOptions,
  ): Promise<PolicyUpdateResponse>
  deactivate(
    policyId: PolicyId,
    request: PolicyDeactivateRequest,
    options?: PoliciesCallOptions,
  ): Promise<PolicyDeactivateResponse>
}

function reject(): Promise<never> {
  return Promise.reject(new Error('invalid policies list input'))
}

function query(request?: PoliciesListRequest) {
  if (request === undefined) return undefined
  if (Reflect.ownKeys(request).some((key) => key !== 'limit' && key !== 'cursor')) return undefined
  if (
    request.limit !== undefined &&
    (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 500)
  ) {
    return undefined
  }
  if (request.cursor !== undefined && typeof request.cursor !== 'string') return undefined
  return { limit: request.limit, cursor: request.cursor }
}

function signal(options?: PoliciesCallOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

function updateBody(request: PolicyUpdateRequest): PolicyUpdateRequest {
  const keys = Reflect.ownKeys(request)
  const allowed = new Set([
    'expectedVersion',
    'contractId',
    'permission',
    'effectiveFrom',
    'effectiveUntil',
    'rules',
  ])
  if (
    keys.some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    !Number.isInteger(request.expectedVersion) ||
    request.expectedVersion < 1 ||
    request.expectedVersion > 2_147_483_647
  )
    throw new Error('invalid policy write input')
  return Object.freeze({
    expectedVersion: request.expectedVersion,
    ...decodePolicyWriteFields(
      {
        contractId: request.contractId,
        permission: request.permission,
        effectiveFrom: request.effectiveFrom,
        ...(request.effectiveUntil === undefined ? {} : { effectiveUntil: request.effectiveUntil }),
        rules: request.rules,
      },
      { requireRules: true },
    ),
  })
}

function deactivateBody(request: PolicyDeactivateRequest): PolicyDeactivateRequest {
  if (
    Reflect.ownKeys(request).some((key) => key !== 'expectedVersion') ||
    !Number.isInteger(request.expectedVersion) ||
    request.expectedVersion < 1 ||
    request.expectedVersion > 2_147_483_647
  )
    throw new Error('invalid policy write input')
  return Object.freeze({ expectedVersion: request.expectedVersion })
}

export function createPoliciesApi(transport: HttpTransport): PoliciesApi {
  return Object.freeze({
    list(request?: PoliciesListRequest, options?: PoliciesCallOptions) {
      const requestQuery = query(request)
      if (request !== undefined && requestQuery === undefined) return reject()
      return transport.request({
        ...identityEndpoints.policiesList,
        ...(requestQuery === undefined ? {} : { query: requestQuery }),
        decode: decodePoliciesListResponse,
        session: 'required',
        ...signal(options),
      })
    },
    get(policyId: PolicyId, options?: PoliciesCallOptions) {
      return transport.request({
        ...identityEndpoints.policiesGet,
        pathParams: { policyId },
        decode(value) {
          const response = decodePolicyGetResponse(value)
          if (response.data.policyId !== policyId) throw new Error('invalid policy response')
          return response
        },
        session: 'required',
        ...signal(options),
      })
    },
    create(request: PolicyCreateRequest, options?: PoliciesCallOptions) {
      const body = parsePolicyCreateRequest(request)
      return transport.request({
        ...identityEndpoints.policiesCreate,
        body,
        decode(value) {
          const response = decodePolicyCreateResponse(value)
          if (response.data.policyId !== body.policyId) throw new Error('invalid policy response')
          return response
        },
        session: 'required',
        ...signal(options),
      })
    },
    update(policyId: PolicyId, request: PolicyUpdateRequest, options?: PoliciesCallOptions) {
      const body = updateBody(request)
      return transport.request({
        ...identityEndpoints.policiesUpdate,
        pathParams: { policyId },
        body,
        decode(value) {
          const response = decodePolicyUpdateResponse(value)
          if (response.data.policyId !== policyId) throw new Error('invalid policy response')
          return response
        },
        session: 'required',
        ...signal(options),
      })
    },
    deactivate(
      policyId: PolicyId,
      request: PolicyDeactivateRequest,
      options?: PoliciesCallOptions,
    ) {
      const body = deactivateBody(request)
      return transport.request({
        ...identityEndpoints.policiesDeactivate,
        pathParams: { policyId },
        body,
        decode: decodePolicyDeactivateResponse,
        session: 'required',
        ...signal(options),
      })
    },
  })
}
