/* Generated. Do not edit. */
import { defineEndpoint, type WireInput } from '../../mdm-endpoint'
import type { BinaryResponse } from '../../types'
import * as r from './responses'
import v_s2780e2776b10651fb19c from './s2780e2776b10651fb19c.validator.js'
import v_sf4589da9b8ae1e210328 from './sf4589da9b8ae1e210328.validator.js'
import type * as sf4589da9b8ae1e210328 from './sf4589da9b8ae1e210328'
export type Input = {
  pathParams: { id: string }
  body: WireInput<sf4589da9b8ae1e210328.Root>
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = BinaryResponse
export type * as Body from './sf4589da9b8ae1e210328'
export type * as Response from './s2db098654a77dbd75ff3'
export const postApiV1EnrollmentsByIdProfile = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:POST:/api/v1/enrollments/{id}/profile',
    method: 'POST',
    path: '/api/v1/enrollments/{id}/profile',
    captures: ['id'],
    pathShape: 'scalar',
    queryOwner: null,
    publicRead: true,
    contentType: 'application/json',
    requestHeaders: [],
    requiredHeaders: [],
    binary: true,
    statuses: [200],
  },
  checks: {
    headers: {},
    path: v_s2780e2776b10651fb19c,
    query: null,
    body: v_sf4589da9b8ae1e210328,
  },
  responses: [
    r.r11174d77e06c7dfd7023,
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
