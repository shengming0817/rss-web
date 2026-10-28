/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_scd3e4beea6a68705539f from './scd3e4beea6a68705539f.validator.js'
import type * as scd3e4beea6a68705539f from './scd3e4beea6a68705539f'
export type Input = {
  query: WireInput<scd3e4beea6a68705539f.Root>
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = void

export const getApiV1WindowsEntraTerms = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:GET:/api/v1/windows/entra/terms',
    method: 'GET',
    path: '/api/v1/windows/entra/terms',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: true,
    contentType: null,
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [302],
  },
  checks: { headers: {}, path: null, query: v_scd3e4beea6a68705539f, body: null },
  responses: [
    r.r64c02fa8488d43a62223,
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
