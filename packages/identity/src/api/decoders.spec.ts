import { describe, expect, it } from 'vitest'
import {
  decodeLoginResponse,
  decodeLogoutAllResponse,
  decodeLogoutResponse,
  decodeProfileResponse,
  decodePasswordChangeResponse,
  decodeRefreshResponse,
} from './decoders'
import { loginResponseFixture } from '../../test/fixtures/login'
import { refreshResponseFixture } from '../../test/fixtures/refresh'
import { profileResponseFixture } from '../../test/fixtures/profile'
import { logoutAllResponseFixture, logoutResponseFixture } from '../../test/fixtures/logout'
import { passwordChangeResponseFixture } from '../../test/fixtures/password-change'

describe('Identity response decoders', () => {
  it('decodes login and refresh as distinct exact envelopes', () => {
    expect(decodeLoginResponse(loginResponseFixture)).toEqual(loginResponseFixture)
    expect(decodeRefreshResponse(refreshResponseFixture)).toEqual(refreshResponseFixture)
    expect(() => decodeRefreshResponse(loginResponseFixture)).toThrow()
    expect(() => decodeLoginResponse(refreshResponseFixture)).toThrow()
  })

  it.each([
    { ...loginResponseFixture, extra: true },
    { data: { ...loginResponseFixture.data, accessToken: 1 } },
    { data: { ...loginResponseFixture.data, sessionId: undefined } },
    { data: { ...loginResponseFixture.data, expiresAt: 1.5 } },
    { data: { ...loginResponseFixture.data, accessExpiresAt: Number.MAX_SAFE_INTEGER + 1 } },
  ])('rejects malformed login responses %#', (value) => {
    expect(() => decodeLoginResponse(value)).toThrow()
  })

  it.each([
    { ...refreshResponseFixture, extra: true },
    { data: { ...refreshResponseFixture.data, refreshToken: false } },
    { data: { ...refreshResponseFixture.data, accessExpiresAt: 1.5 } },
    { data: { ...refreshResponseFixture.data, extra: true } },
  ])('rejects malformed refresh responses %#', (value) => {
    expect(() => decodeRefreshResponse(value)).toThrow()
  })

  it.each(['user', 'device', 'admin', 'superAdmin', 'service', 'anonymous'])(
    'accepts profile kind %s from the schema',
    (kind) => {
      expect(decodeProfileResponse({ data: { ...profileResponseFixture.data, kind } })).toEqual({
        data: { ...profileResponseFixture.data, kind },
      })
    },
  )

  it.each([
    { data: { ...profileResponseFixture.data, kind: 'operator' } },
    { data: { ...profileResponseFixture.data, tenantId: undefined } },
    { data: { ...profileResponseFixture.data, extra: true } },
    { ...profileResponseFixture, extra: true },
  ])('rejects malformed profile responses %#', (value) => {
    expect(() => decodeProfileResponse(value)).toThrow()
  })

  it('keeps logout contract identities separate and accepts either boolean', () => {
    expect(decodeLogoutResponse(logoutResponseFixture)).toEqual(logoutResponseFixture)
    expect(decodeLogoutAllResponse(logoutAllResponseFixture)).toEqual(logoutAllResponseFixture)
    expect(decodeLogoutResponse({ data: { loggedOut: false } })).toEqual({
      data: { loggedOut: false },
    })
  })

  it.each([
    {},
    { data: {} },
    { data: { loggedOut: 'true' } },
    { data: { loggedOut: true, extra: true } },
    { data: { loggedOut: true }, extra: true },
  ])('rejects malformed logout responses %#', (value) => {
    expect(() => decodeLogoutResponse(value)).toThrow()
    expect(() => decodeLogoutAllResponse(value)).toThrow()
  })

  it('decodes the password-change response as an exact envelope', () => {
    expect(decodePasswordChangeResponse(passwordChangeResponseFixture)).toEqual(
      passwordChangeResponseFixture,
    )
    expect(decodePasswordChangeResponse({ data: { changed: false } })).toEqual({
      data: { changed: false },
    })
  })

  it.each([
    {},
    { data: {} },
    { data: { changed: 'true' } },
    { data: { changed: true, extra: true } },
    { data: { changed: true }, extra: true },
  ])('rejects malformed password-change responses %#', (value) => {
    expect(() => decodePasswordChangeResponse(value)).toThrow()
  })
})
