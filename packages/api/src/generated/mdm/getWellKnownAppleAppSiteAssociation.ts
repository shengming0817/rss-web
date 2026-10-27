/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'

import type * as s3f0de9e147663c666433 from './s3f0de9e147663c666433'
export type Input = {
  headers?: Readonly<Record<string, string>> | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s3f0de9e147663c666433.Root
export const getWellKnownAppleAppSiteAssociation = /* @__PURE__ */ defineEndpoint<
  Input,
  Output
>({
  ...{
    operationId: 'browser:GET:/.well-known/apple-app-site-association',
    method: 'GET',
    path: '/.well-known/apple-app-site-association',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: true,
    contentType: null,
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [200],
  },
  checks: { headers: {}, path: null, query: null, body: null },
  responses: [
    r.rf6e05fa52884cff62389,
    r.r6d043326028c71341b5e,
    r.r064274b7074187f8a9a8,
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
    r.r39003ba2c5921cbf9272,
    r.rac2af69c2906ca09fa4a,
    r.r30810b5ab6480c053a24,
    r.rf1e1a1d4cba4fbd64f6a,
  ],
})
