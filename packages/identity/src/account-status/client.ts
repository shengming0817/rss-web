import type { HttpTransport } from '@rss/api'
import { identityEndpoints } from '@rss/api/endpoints/identity'
import { decodeAccountStatusGetResponse, decodeAccountStatusSetResponse } from './decoders'
import type {
  AccountStatusCallOptions,
  AccountStatusGetResponse,
  AccountStatusSetRequest,
  AccountStatusSetResponse,
} from './types'
import { ACCOUNT_STATUSES } from './types'
import { isAccountStatusUserId } from './user-id'

export interface AccountStatusApi {
  get(userId: string, options?: AccountStatusCallOptions): Promise<AccountStatusGetResponse>
  set(
    userId: string,
    request: AccountStatusSetRequest,
    options?: AccountStatusCallOptions,
  ): Promise<AccountStatusSetResponse>
}

const statuses: ReadonlySet<string> = new Set(ACCOUNT_STATUSES)

function invalidUserId(): Promise<never> {
  return Promise.reject(new Error('userId must be a canonical non-nil UUID'))
}

function validRequest(value: unknown): value is AccountStatusSetRequest {
  if (typeof value !== 'object' || value === null) return false
  const keys = Reflect.ownKeys(value)
  return (
    keys.length === 1 &&
    keys[0] === 'targetStatus' &&
    statuses.has((value as { targetStatus?: unknown }).targetStatus as string)
  )
}

function signal(options?: AccountStatusCallOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

export function createAccountStatusApi(transport: HttpTransport): AccountStatusApi {
  return Object.freeze({
    get(userId: string, options?: AccountStatusCallOptions) {
      if (!isAccountStatusUserId(userId)) return invalidUserId()
      return transport.request({
        ...identityEndpoints.accountStatusGet,
        pathParams: { userId },
        decode: decodeAccountStatusGetResponse,
        session: 'required',
        ...signal(options),
      })
    },
    set(userId: string, request: AccountStatusSetRequest, options?: AccountStatusCallOptions) {
      if (!isAccountStatusUserId(userId)) return invalidUserId()
      if (!validRequest(request)) {
        return Promise.reject(new Error('request must contain exactly one reviewed account status'))
      }
      return transport.request({
        ...identityEndpoints.accountStatusSet,
        pathParams: { userId },
        body: { targetStatus: request.targetStatus },
        decode: decodeAccountStatusSetResponse,
        session: 'required',
        ...signal(options),
      })
    },
  })
}
