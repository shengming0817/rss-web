import type { HttpTransport } from '@rss/api'
import { auditEndpoints } from '@rss/api/endpoints/audit'
import { decodeAuditEntriesPage } from './decoders'
import { isAuditTargetTenantId } from './target-tenant'
import type {
  AuditEntriesPage,
  ListAuditEntriesOptions,
  ListTenantAuditEntriesOptions,
} from './types'

export interface AuditApi {
  listEntries(options?: ListAuditEntriesOptions): Promise<AuditEntriesPage>
  listTenantEntries(
    tenantId: string,
    options?: ListTenantAuditEntriesOptions,
  ): Promise<AuditEntriesPage>
}

function validLimit(limit: number | undefined): boolean {
  return limit === undefined || (Number.isInteger(limit) && limit >= 1 && limit <= 500)
}

function query(options?: ListAuditEntriesOptions | ListTenantAuditEntriesOptions) {
  return { limit: options?.limit, cursor: options?.cursor }
}

function signalOption(options?: ListAuditEntriesOptions | ListTenantAuditEntriesOptions) {
  return options?.signal === undefined ? {} : { signal: options.signal }
}

export function createAuditApi(transport: HttpTransport): AuditApi {
  return Object.freeze({
    listEntries(options?: ListAuditEntriesOptions) {
      if (!validLimit(options?.limit))
        return Promise.reject(new Error('audit limit must be an integer from 1 to 500'))
      return transport.request({
        ...auditEndpoints.listEntries,
        decode: decodeAuditEntriesPage,
        session: 'required',
        query: query(options),
        ...signalOption(options),
      })
    },
    listTenantEntries(tenantId: string, options?: ListTenantAuditEntriesOptions) {
      if (!isAuditTargetTenantId(tenantId))
        return Promise.reject(new Error('target tenant must be a canonical non-nil UUID'))
      if (!validLimit(options?.limit))
        return Promise.reject(new Error('audit limit must be an integer from 1 to 500'))
      return transport.request({
        ...auditEndpoints.listTenantEntries,
        pathParams: { tenantId },
        decode: decodeAuditEntriesPage,
        session: 'required-no-replay',
        query: query(options),
        ...signalOption(options),
      })
    },
  })
}
