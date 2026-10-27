/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_se567b14aa549227198dd from './se567b14aa549227198dd.validator.js'
import type * as s9d72cac75a8cd66b3d99 from './s9d72cac75a8cd66b3d99'
import type * as se567b14aa549227198dd from './se567b14aa549227198dd'
export type Input = {
  query?: WireInput<se567b14aa549227198dd.Root> | undefined
  headers?: Readonly<Record<string, string>> | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s9d72cac75a8cd66b3d99.Root
export const getApiV1WindowsWnsVersions = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:GET:/api/v1/windows/wns/versions',
    method: 'GET',
    path: '/api/v1/windows/wns/versions',
    captures: [],
    pathShape: null,
    queryOwner: {
      kind: 'window',
      schema: {
        context: [],
        default_limit: 64,
        id: 'wns_versions',
        max_limit: 200,
        order: 'revision DESC',
      },
    },
    publicRead: false,
    contentType: null,
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [200],
  },
  checks: { headers: {}, path: null, query: v_se567b14aa549227198dd, body: null },
  responses: [
    r.r90e2278485136e1dc9df,
    r.r4d2b7ae832aff8965d5e,
    r.rb313da3b8b6a2bed5fe8,
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
