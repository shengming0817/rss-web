/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'
import v_s2780e2776b10651fb19c from './s2780e2776b10651fb19c.validator.js'
import type * as s424694f490b3f87028e2 from './s424694f490b3f87028e2'
export type Input = {
  pathParams: { id: string }
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s424694f490b3f87028e2.Root

export type * as Response from './s424694f490b3f87028e2'
export const getApiV1AppleOrganizationsByIdAde = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:GET:/api/v1/apple/organizations/{id}/ade',
    method: 'GET',
    path: '/api/v1/apple/organizations/{id}/ade',
    captures: ['id'],
    pathShape: 'scalar',
    queryOwner: null,
    publicRead: false,
    contentType: null,
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [200],
  },
  checks: { headers: {}, path: v_s2780e2776b10651fb19c, query: null, body: null },
  responses: [
    r.r2017b02df3ae33adb56b,
    r.r4d2b7ae832aff8965d5e,
    r.rb313da3b8b6a2bed5fe8,
    r.rb8c380a38e5fb0fd6252,
    r.r39646a82254317a6c705,
    r.r98f5a67a37db33e1babf,
    r.re7b8e4f7fc546f340550,
    r.r7881359164df0ee420c4,
    r.r0227935ef770207ac8a5,
    r.r66c1afe7e0c0cc88a02d,
    r.rd7bf0f0f487a8bf883eb,
    r.rb082e0ed32b32c237fad,
    r.rf6eb75249132a970410a,
    r.rc3dc53163ecb374afaab,
    r.r2c22f90173c9f547e301,
    r.r59e08eb3295b36e9295a,
    r.r7fe05fa2b3db67e83f91,
    r.re6a95f5be5fbcc1879d2,
    r.r6e4ad8cabfacf1dc3438,
    r.r9f47e72b39956683d7f0,
    r.r6e465724f79ab4ff6311,
  ],
})
