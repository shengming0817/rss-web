import { it, expect } from 'vitest'
import { localProfile, profileReceipt } from './profile'
import { fixture, TENANT, ID } from '../../tests/support'
const value = {
  displayName: null,
  username: 'member',
  email: null,
  extensions: { remote: false, amount: 0 },
  maxAgeSeconds: 14400,
}
it('local authority values and receipts remain strict and separate from login state', async () => {
  expect(localProfile({ revision: 0, value: null })).toEqual({ revision: 0, value: null })
  expect(localProfile({ revision: 2, value }).value?.extensions).toEqual({
    remote: false,
    amount: 0,
  })
  expect(() => localProfile({ revision: 2, value: { ...value, emailVerified: true } })).toThrow()
  expect(() => localProfile({ revision: 2, value: { ...value, maxAgeSeconds: 59 } })).toThrow()
  expect(profileReceipt(null, ID)).toBeNull()
  expect(() => profileReceipt({ operationId: ID, revision: 0 }, ID)).toThrow()
  const f = fixture()
  await f.login()
  const oldSession = f.session.state.value.session?.id
  f.replies.push({ revision: 2, value })
  await f.api.localProfile(ID)
  f.replies.push({ operationId: ID, revision: 3 })
  await f.api.saveLocalProfile(ID, ID, 2, value)
  expect(f.request.mock.calls.at(-1)?.[0]).toMatchObject({
    method: 'PUT',
    path: `/api/v1/identity/tenants/{tenant}/accounts/${ID}/profile`,
    pathParams: { tenant: TENANT },
    body: { operationId: ID, expectedRevision: 2, value },
  })
  expect(f.session.state.value.session?.id).toBe(oldSession)
  f.replies.push({ operationId: ID, revision: 3 })
  expect((await f.api.localProfileOperation(ID, ID))?.revision).toBe(3)
  f.session.clear()
})
