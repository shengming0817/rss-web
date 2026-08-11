import type { HttpTransport } from '@rss/api'
import { identityEndpoints } from '@rss/api/endpoints/identity'
import { decodePoliciesListResponse, decodePolicyGetResponse } from './decoders'
import type { PolicyId } from './policy-id'
import type {
  PoliciesCallOptions,
  PoliciesListRequest,
  PoliciesListResponse,
  PolicyGetResponse,
} from './types'

export interface PoliciesApi {
  list(request?: PoliciesListRequest, options?: PoliciesCallOptions): Promise<PoliciesListResponse>
  get(policyId: PolicyId, options?: PoliciesCallOptions): Promise<PolicyGetResponse>
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
        decode: decodePolicyGetResponse,
        session: 'required',
        ...signal(options),
      })
    },
  })
}
