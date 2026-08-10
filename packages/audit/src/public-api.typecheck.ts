import { createAuditApi, type AuditEntriesPage } from './index'
import type { HttpTransport } from '@rss/api'

declare const transport: HttpTransport
const api = createAuditApi(transport)
void api.listEntries({ limit: 50, cursor: 'opaque', signal: new AbortController().signal })
// @ts-expect-error Ambient-tenant Audit cannot accept a tenant selector or header.
void api.listEntries({ tenantId: 'forbidden' })
void api.listTenantEntries('f47ac10b-58cc-4372-a567-0e02b2c3d479', {
  limit: 50,
  cursor: 'opaque',
  signal: new AbortController().signal,
})
void api.listTenantEntries('f47ac10b-58cc-4372-a567-0e02b2c3d479', {
  // @ts-expect-error Target Audit accepts no browser-authored headers or tenant authority override.
  headers: { 'X-Tenant-ID': 'forged' },
})

declare const page: AuditEntriesPage
void page.data[0]?.entryHash
