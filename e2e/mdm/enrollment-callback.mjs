import assert from 'node:assert/strict'
// Custom native schemes have a null origin; compare the complete callback target.
export function assertNativeCallback(actual, expected) {
  const target = new URL(actual),
    agreed = new URL(expected)
  target.search = ''
  assert.equal(target.href, agreed.href)
}
