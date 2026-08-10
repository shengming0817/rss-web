import type { HttpTransport } from '@rss/api'
import { auditEndpoints } from '@rss/api/endpoints/audit'
import { decodeAuditEntriesPage } from './decoders'
import type { AuditEntriesPage, ListAuditEntriesOptions } from './types'

export interface AuditApi {
  listEntries(options?: ListAuditEntriesOptions): Promise<AuditEntriesPage>
}

export function createAuditApi(transport: HttpTransport): AuditApi {
  return Object.freeze({
    listEntries(options?: ListAuditEntriesOptions) {
      const limit = options?.limit
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500))
        return Promise.reject(new Error('audit limit must be an integer from 1 to 500'))
      return transport.request({
        ...auditEndpoints.listEntries,
        decode: decodeAuditEntriesPage,
        session: 'required',
        query: { limit, cursor: options?.cursor },
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      })
    },
  })
}
