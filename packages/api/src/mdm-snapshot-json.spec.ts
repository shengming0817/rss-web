import { expect, it } from 'vitest'
import { decodeSnapshotResponse, encodeSnapshotRequest } from './mdm-snapshot-json'

const original =
  '{"integer":9007199254740993,"fraction":0.123456789123456789,"number":1e400,"escape":"\\u4e2d","nested":[true,{"data":"[}"}]}'
it('preserves the JSON value token on both sides of the snapshot envelope', () => {
  const request = encodeSnapshotRequest({ expectedRevision: 4, input: { document: original } })
  expect(request).toBe('{"expectedRevision":4,"input":{"document":' + original + '}}')
  expect(
    decodeSnapshotResponse(
      '{"revision":5,"document":' + original + ',"extraction":{}}',
      'document',
      200,
    ),
  ).toEqual({ revision: 5, document: original, extraction: {} })
  expect(decodeSnapshotResponse('{"data":"\\u4e2d","revision":5}', 'data', 200)).toEqual({
    data: '"\\u4e2d"',
    revision: 5,
  })
})
it('accepts a bounded deep value and checks the request budget before parsing it', () => {
  const document = '['.repeat(10000) + '0' + ']'.repeat(10000)
  const encoded = encodeSnapshotRequest({ input: { document } })
  expect(decodeSnapshotResponse(encoded.slice('{"input":'.length, -1), 'document', 200)).toEqual({
    document,
  })
  const budget = new Error('request too large')
  expect(() =>
    encodeSnapshotRequest({ input: { document: 'malformed' } }, () => {
      throw budget
    }),
  ).toThrow(budget)
})
it('rejects incomplete JSON, trailing tokens, and duplicate raw response leaves', () => {
  for (const document of [
    '[1,]',
    '0 true',
    '/* comment */null',
    '{"value":0',
    '{"a":1,}',
    '01',
    '1e-',
    '"\\uXX00"',
    '"unescaped\u0000"',
  ])
    expect(() => encodeSnapshotRequest({ input: { document } })).toThrow()
  expect(() => decodeSnapshotResponse('{"data":1,"data":2}', 'data', 200)).toThrow()
  expect(decodeSnapshotResponse('{"code":"forbidden"}', 'data', 403)).toEqual({ code: 'forbidden' })
})

it('preserves large trivia and escaped strings without decoding raw values', () => {
  const document = '[' + ' '.repeat(8 * 1024 * 1024) + '"' + '\\n'.repeat(1024 * 1024) + '"]'
  const encoded = encodeSnapshotRequest({ input: { document } })
  expect(encoded).toBe('{"input":{"document":' + document + '}}')
  expect(decodeSnapshotResponse('{"\\u0064ata":' + document + '}', 'data', 200)).toEqual({
    data: document,
  })
})
