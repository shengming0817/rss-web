export const ACCOUNT_STATUSES = ['active', 'suspended', 'locked', 'deactivated'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export interface AccountStatusCallOptions {
  readonly signal?: AbortSignal
}

export interface AccountStatusGetData {
  readonly status: AccountStatus
}

export interface AccountStatusGetResponse {
  readonly data: AccountStatusGetData
}

export interface AccountStatusSetRequest {
  readonly targetStatus: AccountStatus
}

export interface AccountStatusSetData {
  readonly status: AccountStatus
  readonly changed: boolean
}

export interface AccountStatusSetResponse {
  readonly data: AccountStatusSetData
}
