import { createRuntimeApi, type RuntimeInventoryResponse } from './index'
import type { HttpTransport } from '@rss/api'

declare const transport: HttpTransport
const api = createRuntimeApi(transport)
void api.inventory({ signal: new AbortController().signal })
// @ts-expect-error Runtime calls cannot accept headers or tenant coordinates.
void api.inventory({ headers: { 'X-Tenant-ID': 'forbidden' } })

declare const response: RuntimeInventoryResponse
if (response.data.providerPosture[0]?.state === 'unobserved') void response.data.schemaVersion
// @ts-expect-error Listener deployment endpoints are validated and discarded before public facts.
void response.data.listeners[0]?.endpoint
// @ts-expect-error Placement SPIFFE identities are never part of the public facts surface.
void response.data.placements[0]?.spiffeIdentity
