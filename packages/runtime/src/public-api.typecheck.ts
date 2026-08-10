import { createRuntimeApi, type RuntimeInventoryResponse } from './index'
import type { HttpTransport } from '@rss/api'

declare const transport: HttpTransport
const api = createRuntimeApi(transport)
void api.inventory({ signal: new AbortController().signal })
// @ts-expect-error Runtime calls cannot accept headers or tenant coordinates.
void api.inventory({ headers: { 'X-Tenant-ID': 'forbidden' } })

declare const response: RuntimeInventoryResponse
if (response.data.providerPosture[0]?.state === 'unobserved') void response.data.schemaVersion
