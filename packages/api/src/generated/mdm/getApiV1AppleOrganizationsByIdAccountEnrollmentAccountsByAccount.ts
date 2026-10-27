/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'
import v_s62cc715dab3e12b24b71 from './s62cc715dab3e12b24b71.validator.js'
import type * as s2a150818b4dbdf16a0b1 from './s2a150818b4dbdf16a0b1'
export type Input = {
  pathParams: { id: string; account: string }
  headers?: Readonly<Record<string, string>> | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s2a150818b4dbdf16a0b1.Root
export const getApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount =
  /* @__PURE__ */ defineEndpoint<Input, Output>({
    ...{
      operationId:
        'browser:GET:/api/v1/apple/organizations/{id}/account-enrollment/accounts/{account}',
      method: 'GET',
      path: '/api/v1/apple/organizations/{id}/account-enrollment/accounts/{account}',
      captures: ['id', 'account'],
      pathShape: 'tuple',
      queryOwner: null,
      publicRead: false,
      contentType: null,
      requestHeaders: [],
      requiredHeaders: [],
      binary: false,
      statuses: [200],
    },
    checks: { headers: {}, path: v_s62cc715dab3e12b24b71, query: null, body: null },
    responses: [
      r.r4fa3cedd18b75659dde2,
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
