import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertNativeCallback } from './enrollment-callback.mjs'
test('accepts native result parameters only at the agreed app callback', () => {
  const target = 'ms-appx-web://microsoft.aad.brokerplugin/terms'
  assertNativeCallback(`${target}?IsAccepted=true&OpaqueBlob=opaque`, target)
  for (const result of [
    'ms-appx-web://other.app/terms?IsAccepted=true',
    'other-scheme://microsoft.aad.brokerplugin/terms?IsAccepted=true',
    `${target}?IsAccepted=true#other-target`,
  ])
    assert.throws(() => assertNativeCallback(result, target))
})
