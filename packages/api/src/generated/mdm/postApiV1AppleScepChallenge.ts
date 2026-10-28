/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_s2c1f1f6c101efe8843f2 from './s2c1f1f6c101efe8843f2.validator.js'
import v_s93ddaf583a2133fb6a6f from './s93ddaf583a2133fb6a6f.validator.js'
import type * as s246e6834ed9fb29c7d99 from './s246e6834ed9fb29c7d99'
import type * as s2c1f1f6c101efe8843f2 from './s2c1f1f6c101efe8843f2'
import type * as s93ddaf583a2133fb6a6f from './s93ddaf583a2133fb6a6f'
export type Input = {
  body: WireInput<s2c1f1f6c101efe8843f2.Root>
  headers?:
    | {
        'X-Smallstep-Signature'?: s93ddaf583a2133fb6a6f.Root
        'X-Smallstep-Webhook-Id'?: s93ddaf583a2133fb6a6f.Root
      }
    | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s246e6834ed9fb29c7d99.Root
export type * as Body from './s2c1f1f6c101efe8843f2'
export type * as Response from './s246e6834ed9fb29c7d99'
export const postApiV1AppleScepChallenge = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:POST:/api/v1/apple/scep/challenge',
    method: 'POST',
    path: '/api/v1/apple/scep/challenge',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: true,
    contentType: 'application/json',
    requestHeaders: ['x-smallstep-signature', 'x-smallstep-webhook-id'],
    requiredHeaders: [],
    binary: false,
    statuses: [200],
  },
  checks: {
    headers: {
      'x-smallstep-signature': v_s93ddaf583a2133fb6a6f,
      'x-smallstep-webhook-id': v_s93ddaf583a2133fb6a6f,
    },
    path: null,
    query: null,
    body: v_s2c1f1f6c101efe8843f2,
  },
  responses: [
    r.r586bf03be7d4cecc165e,
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
    r.r2c22f90173c9f547e301,
    r.r59e08eb3295b36e9295a,
    r.r7fe05fa2b3db67e83f91,
    r.re6a95f5be5fbcc1879d2,
    r.r6e4ad8cabfacf1dc3438,
    r.r9f47e72b39956683d7f0,
    r.r6e465724f79ab4ff6311,
  ],
})
