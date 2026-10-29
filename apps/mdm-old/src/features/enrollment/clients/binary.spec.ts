import { expect, it } from 'vitest'
import { attachment } from './binary'

function response() {
  return {
    bytes: new Uint8Array([1, 2, 3]).buffer,
    status: 201,
    contentType: 'application/json',
    contentDisposition: 'attachment; filename="configuration.json"',
    contentLength: '3',
    contentRange: null,
    etag: '"fixed"',
  }
}
it('retains the sole executor response framing while validating the complete named attachment', () => {
  const value = response()
  expect(attachment(value, 'application/json', 'configuration.json', 16384)).toEqual(value)
  expect(attachment(value, 'application/json', 'configuration.json', 16384).bytes).toBe(value.bytes)
})
it('erases malformed metadata or a wrongly named attachment instead of exposing it as a configuration', () => {
  for (const override of [
    { status: '201' },
    { contentLength: 3 },
    { contentDisposition: 'attachment; filename="other.json"' },
  ]) {
    const value = { ...response(), ...override }
    expect(() => attachment(value, 'application/json', 'configuration.json', 16384)).toThrow(
      /Invalid/,
    )
    expect(new Uint8Array(value.bytes)).toEqual(new Uint8Array(3))
  }
})
it('preserves transport representation headers without recomputing them from decoded attachment bytes', () => {
  const value = { ...response(), contentLength: '2' }
  expect(attachment(value, 'application/json', 'configuration.json', 16384)).toEqual(value)
})
