/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_s00f36fe53926740ce43d from './s00f36fe53926740ce43d.validator.js'
import type * as s00f36fe53926740ce43d from './s00f36fe53926740ce43d'
export type Input = {
  body: WireInput<s00f36fe53926740ce43d.Root>
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = void
export type * as Body from './s00f36fe53926740ce43d'

export const postApiV1AppleAccountEnrollmentFinish = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:POST:/api/v1/apple/account-enrollment/finish',
    method: 'POST',
    path: '/api/v1/apple/account-enrollment/finish',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: true,
    contentType: 'application/x-www-form-urlencoded',
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [308],
  },
  checks: { headers: {}, path: null, query: null, body: v_s00f36fe53926740ce43d },
  responses: [
    r.r1f2bd62c1f33c4711d10,
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
    r.rb1899397c99b83c4fd0d,
    r.r04a5a2d175185ab20964,
    r.rebe37170e434df4fff5a,
    r.r2c22f90173c9f547e301,
    r.r59e08eb3295b36e9295a,
    r.r7fe05fa2b3db67e83f91,
    r.re6a95f5be5fbcc1879d2,
    r.r6e4ad8cabfacf1dc3438,
    r.r9f47e72b39956683d7f0,
    r.r6e465724f79ab4ff6311,
  ],
})
