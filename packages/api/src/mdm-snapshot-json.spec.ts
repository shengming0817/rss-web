import { expect, it } from 'vitest'
import { decodeSnapshotResponse, encodeSnapshotRequest } from './mdm-snapshot-json'

const original = String.raw`{"integer":9007199254740993,"fraction":0.123456789123456789,"number":1e400,"escape":"\u4e2d","nested":[true,{"data":"[}"}]}`
it('preserves the JSON value token on both sides of the snapshot envelope', () => {
  const request = encodeSnapshotRequest({
    expectedRevision: 4,
    input: { document: ' ' + original + '\n' },
  })
  expect(request).toBe('{"expectedRevision":4,"input":{"document":' + original + '}}')
  expect(
    decodeSnapshotResponse('{"revision":5,"document":' + original + '}', 'document', 200),
  ).toEqual({ revision: 5, document: original })
  expect(decodeSnapshotResponse('{"data":"\\u4e2d","revision":5}', 'data', 200)).toEqual({
    data: '"\\u4e2d"',
    revision: 5,
  })
})
it('rejects incomplete JSON, trailing tokens, and duplicate raw response leaves', () => {
  for (const document of ['[1,]', '0 true', '/* comment */null', '{"value":0'])
    expect(() => encodeSnapshotRequest({ input: { document } })).toThrow()
  expect(() => decodeSnapshotResponse('{"data":1,"data":2}', 'data', 200)).toThrow()
  expect(decodeSnapshotResponse('{"code":"forbidden"}', 'data', 403)).toEqual({ code: 'forbidden' })
})
