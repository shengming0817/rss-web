/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'
import v_s93ddaf583a2133fb6a6f from './s93ddaf583a2133fb6a6f.validator.js'
import type * as sa6bbea59fc348f9bfd9f from './sa6bbea59fc348f9bfd9f'
export type Input = {
  pathParams: { device: string }
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = sa6bbea59fc348f9bfd9f.Root

export type * as Response from './sa6bbea59fc348f9bfd9f'
export const getApiV1TaskSigningTrustDevicesByDeviceObservation =
  /* @__PURE__ */ defineEndpoint<Input, Output>({
    ...{
      operationId: 'browser:GET:/api/v1/task-signing/trust/devices/{device}/observation',
      method: 'GET',
      path: '/api/v1/task-signing/trust/devices/{device}/observation',
      captures: ['device'],
      pathShape: 'scalar',
      queryOwner: null,
      publicRead: false,
      contentType: null,
      requestHeaders: [],
      requiredHeaders: [],
      binary: false,
      statuses: [200],
    },
    checks: { headers: {}, path: v_s93ddaf583a2133fb6a6f, query: null, body: null },
    responses: [
      r.r035327ed41a323d9cbf3,
      r.r188b9270e0a9d6de1391,
      r.r6fd7bf70daf3205eeddb,
      r.rfb2ac9dae112f89656c6,
      r.r84b25be71d7060f6b5ba,
      r.rb8c380a38e5fb0fd6252,
      r.rfbd826120791529cbfaf,
      r.r41795b7fefab0d0e6dd5,
      r.r03d3a9869d4549b92f61,
      r.r301ade83b18ac5e0cece,
      r.ra79ac9696c7c24e2052c,
      r.red4d573e81cff163152f,
      r.re0aca704b1cd612d5903,
      r.rd64ee575e0373e1482b8,
      r.r001f2f498258e1d8d0bf,
      r.rfa093387f929d01103f2,
      r.rce69806e32695cc14703,
      r.r7c8075de83e68acf6669,
      r.r2f33b697e087ceb60584,
      r.r08d414b9c43db101b2a2,
      r.rc3a85faf300b051d18e5,
      r.rca3fdd50ef999f8b294f,
      r.r9aac66f4ae1c07fc08c6,
      r.re8fc013cf83515fcc746,
      r.rd21bcf23800a122db946,
      r.ree1895a2d7942e7ef217,
      r.rdc5501da1eb07d1dcbab,
      r.rb5b329e77976af91d178,
      r.r4a897df1d9cd4c304acc,
      r.rf9b9abcb1f33e47e5323,
      r.r8806d3dc805e1c87cba9,
      r.r78d94afbb46c3f1e364d,
      r.r47d40619131cc5e661b8,
      r.rf521e34e95b9bbbaad07,
      r.r256ce42b0f320bfb24b6,
      r.r811fcd715cc81c061c38,
      r.rb21af670265b909bd843,
      r.rf89d3998d3d4bdeaa7dd,
      r.rca4a649f5903682781d9,
      r.r847cc05a5bf77be14077,
      r.rf59f46e6771d1e600c1b,
      r.r1a44fe07f59d5ed2f20f,
      r.r7fe05fa2b3db67e83f91,
      r.re84dcaeab440ce9e81cf,
      r.r1291a1c3bf3dd380ae13,
      r.rd219ff4de4ab4d8cd332,
      r.r9627ca7115b88d10c2df,
    ],
  })
