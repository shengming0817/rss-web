/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_s049226c2108ac14aeb07 from './s049226c2108ac14aeb07.validator.js'
import v_s2780e2776b10651fb19c from './s2780e2776b10651fb19c.validator.js'
import type * as s049226c2108ac14aeb07 from './s049226c2108ac14aeb07'
import type * as s64e73751a3138750a005 from './s64e73751a3138750a005'
export type Input = {
  pathParams: { tenant: string }
  body: WireInput<s049226c2108ac14aeb07.Root>
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s64e73751a3138750a005.Root
export type * as Body from './s049226c2108ac14aeb07'
export type * as Response from './s64e73751a3138750a005'
export const postApiV1ApplePlatformSsoByTenantBrowserBegin = /* @__PURE__ */ defineEndpoint<
  Input,
  Output
>({
  ...{
    operationId: 'browser:POST:/api/v1/apple/platform-sso/{tenant}/browser/begin',
    method: 'POST',
    path: '/api/v1/apple/platform-sso/{tenant}/browser/begin',
    captures: ['tenant'],
    pathShape: 'scalar',
    queryOwner: null,
    publicRead: true,
    contentType: 'application/json',
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [200],
  },
  checks: {
    headers: {},
    path: v_s2780e2776b10651fb19c,
    query: null,
    body: v_s049226c2108ac14aeb07,
  },
  responses: [
    r.r382302da707900e68779,
    r.r6d043326028c71341b5e,
    r.r064274b7074187f8a9a8,
    r.r064348e295a85280f5a3,
    r.rf1cf0bcde60e03ef8f99,
    r.r4433a56a8c5acca70a3e,
    r.rb87862a45feda8817d7e,
    r.r2094dd83ac082c81bc25,
    r.r53e729a5a63f99207900,
    r.rf938859da8aff8ef7bac,
    r.r5b9e10efd173eb5c00fd,
    r.r5636a6be7fe4946ec48f,
    r.r0ee9664500fcee6f748d,
    r.rff84f33c9d05e62b983e,
    r.reb90011772fa26ac6485,
    r.r96d3f92f3261d506c4e5,
    r.r5d8ff3a664f36c580afc,
    r.r39003ba2c5921cbf9272,
    r.rac2af69c2906ca09fa4a,
    r.r30810b5ab6480c053a24,
    r.rf1e1a1d4cba4fbd64f6a,
  ],
})
