import { createAuditApi, type AuditEntriesPage } from './index'
import type { HttpTransport } from '@rss/api'

declare const transport: HttpTransport
const api = createAuditApi(transport)
void api.listEntries({ limit: 50, cursor: 'opaque', signal: new AbortController().signal })
// @ts-expect-error Ambient-tenant Audit cannot accept a tenant selector or header.
void api.listEntries({ tenantId: 'forbidden' })
// @ts-expect-error The non-idempotent cross-tenant read is not exposed by this slice.
void api.listTenantEntries('forbidden')

declare const page: AuditEntriesPage
void page.data[0]?.entryHash
