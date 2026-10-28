/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'

import type * as s0d37321a22d626fe59dd from './s0d37321a22d626fe59dd'
export type Input = { signal?: AbortSignal | undefined; timeoutMs?: number | undefined }
export type Output = s0d37321a22d626fe59dd.Root

export type * as Response from './s0d37321a22d626fe59dd'
export const getLivez = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:GET:/livez',
    method: 'GET',
    path: '/livez',
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
  responses: [r.rb705019f2b7ec8a5d5c9],
})
