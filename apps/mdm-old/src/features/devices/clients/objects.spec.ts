import { expect, it } from 'vitest'
import { deviceObject, objectKey, objectRef } from './objects'
it('keeps endpoint and association coordinates distinct and preserves original registration evidence', () => {
  const id = '11111111-1111-4111-8111-111111111111',
    endpoint = objectRef({ kind: 'endpoint', id }),
    association = objectRef({ kind: 'association', id })
  expect(objectKey(endpoint)).not.toBe(objectKey(association))
  const input = {
    object: association,
    associationVersion: 2,
    verified: true,
    members: [{ device: 'original', channel: 'mdm', registrationId: id, generation: 3 }],
  }
  expect(deviceObject(input)).toEqual(input)
  for (const bad of [
    'device-01',
    { kind: 'device', id },
    { kind: 'association', id: 'device-01' },
    { kind: 'endpoint', id, authority: true },
  ])
    expect(() => objectRef(bad)).toThrow()
  expect(() =>
    deviceObject({ ...input, members: [{ ...input.members[0], generation: 0 }] }),
  ).toThrow()
})
