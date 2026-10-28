/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'
import type { BinaryResponse } from '../../types'
import * as r from './responses'
import v_s2780e2776b10651fb19c from './s2780e2776b10651fb19c.validator.js'
import v_s9bb39261157ef43cd2f4 from './s9bb39261157ef43cd2f4.validator.js'
import type * as s9bb39261157ef43cd2f4 from './s9bb39261157ef43cd2f4'
export type Input = {
  pathParams: { tenant: string }
  body: WireInput<s9bb39261157ef43cd2f4.Root>
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = BinaryResponse
export type * as Body from './s9bb39261157ef43cd2f4'
export type * as Response from './s93ddaf583a2133fb6a6f'
export const postApiV1ApplePlatformSsoByTenantToken = /* @__PURE__ */ defineEndpoint<
  Input,
  Output
>({
  ...{
    operationId: 'browser:POST:/api/v1/apple/platform-sso/{tenant}/token',
    method: 'POST',
    path: '/api/v1/apple/platform-sso/{tenant}/token',
    captures: ['tenant'],
    pathShape: 'scalar',
    queryOwner: null,
    publicRead: true,
    contentType: 'application/x-www-form-urlencoded',
    requestHeaders: [],
    requiredHeaders: [],
    binary: true,
    statuses: [200],
  },
  checks: {
    headers: {},
    path: v_s2780e2776b10651fb19c,
    query: null,
    body: v_s9bb39261157ef43cd2f4,
  },
  responses: [
    r.r3721c857bb0c90578e2d,
    r.r85262e2c839873913d1d,
    r.r2bb69e2276c007ae88ab,
    r.r064348e295a85280f5a3,
    r.r5d8ff3a664f36c580afc,
    r.r8047ae745092e1b0f4a6,
  ],
})
