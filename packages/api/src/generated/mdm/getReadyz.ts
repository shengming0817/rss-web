/* Generated. Do not edit. */
import { defineEndpoint } from '../../mdm-endpoint'

import * as r from './responses'

import type * as s0054b9a64feea4192670 from './s0054b9a64feea4192670'
import type * as s2ba1b38c2dac7fee8936 from './s2ba1b38c2dac7fee8936'
export type Input = {
  headers?: Readonly<Record<string, string>> | undefined
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}
export type Output = s2ba1b38c2dac7fee8936.Root | s0054b9a64feea4192670.Root
export const getReadyz = /* @__PURE__ */ defineEndpoint<Input, Output>({
  ...{
    operationId: 'browser:GET:/readyz',
    method: 'GET',
    path: '/readyz',
    captures: [],
    pathShape: null,
    queryOwner: null,
    publicRead: true,
    contentType: null,
    requestHeaders: [],
    requiredHeaders: [],
    binary: false,
    statuses: [200, 503],
  },
  checks: { headers: {}, path: null, query: null, body: null },
  responses: [r.r6a40742c8e7741d5bde4, r.r79334f24d978fb0ce11a],
})
