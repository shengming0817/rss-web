/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'

import * as r from './responses'
import v_s419ad0a8895f8af9050d from './s419ad0a8895f8af9050d.validator.js'
import v_s62cc715dab3e12b24b71 from './s62cc715dab3e12b24b71.validator.js'
import v_sb63ed28107b020af7360 from './sb63ed28107b020af7360.validator.js'
import type * as s419ad0a8895f8af9050d from './s419ad0a8895f8af9050d'
import type * as sb63ed28107b020af7360 from './sb63ed28107b020af7360'
import type * as sea6c7bf019995a17adc7 from './sea6c7bf019995a17adc7'
export type Input = {
  pathParams: { id: string; account: string }
  body: WireInput<sb63ed28107b020af7360.Root>
  headers: { 'Idempotency-Key': s419ad0a8895f8af9050d.Root }
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = sea6c7bf019995a17adc7.Root
export type * as Body from './sb63ed28107b020af7360'
export type * as Response from './sea6c7bf019995a17adc7'
export const putApiV1AppleOrganizationsByIdAccountEnrollmentAccountsByAccount =
  /* @__PURE__ */ defineEndpoint<Input, Output>({
    ...{
      operationId:
        'browser:PUT:/api/v1/apple/organizations/{id}/account-enrollment/accounts/{account}',
      method: 'PUT',
      path: '/api/v1/apple/organizations/{id}/account-enrollment/accounts/{account}',
      captures: ['id', 'account'],
      pathShape: 'tuple',
      queryOwner: null,
      publicRead: false,
      contentType: 'application/json',
      requestHeaders: ['idempotency-key'],
      requiredHeaders: ['idempotency-key'],
      binary: false,
      statuses: [200],
    },
    checks: {
      headers: { 'idempotency-key': v_s419ad0a8895f8af9050d },
      path: v_s62cc715dab3e12b24b71,
      query: null,
      body: v_sb63ed28107b020af7360,
    },
    responses: [
      r.r469070082c068324d65c,
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
