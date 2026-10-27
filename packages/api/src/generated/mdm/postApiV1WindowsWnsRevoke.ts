/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_s389cd51e944f875ac7dd from './s389cd51e944f875ac7dd.validator.js'
import v_s419ad0a8895f8af9050d from './s419ad0a8895f8af9050d.validator.js'
import type * as s389cd51e944f875ac7dd from './s389cd51e944f875ac7dd'
import type * as s602f1501cb1c03087f20 from './s602f1501cb1c03087f20'
export type Input = {
  body: WireInput<s389cd51e944f875ac7dd.Root>
  headers?: Readonly<Record<string, string>> | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s602f1501cb1c03087f20.Root
export const postApiV1WindowsWnsRevoke = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:POST:/api/v1/windows/wns/revoke',
    method: 'POST',
    path: '/api/v1/windows/wns/revoke',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: false,
    contentType: 'application/json',
    requestHeaders: ['idempotency-key'],
    requiredHeaders: ['idempotency-key'],
    binary: false,
    statuses: [202],
  },
  checks: {
    headers: { 'idempotency-key': v_s419ad0a8895f8af9050d },
    path: null,
    query: null,
    body: v_s389cd51e944f875ac7dd,
  },
  responses: [
    r.r7672dfb9618c39f55910,
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
