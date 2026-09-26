import { describe, expect, it } from 'vitest'
import { createScenario, TENANT } from './scenario'
describe('HTTP demo state', () => {
  it('requires login, rotates CSRF and resets deterministically', async () => {
    const scenario = createScenario()
    expect((await scenario.handle('GET', `/api/v2/tenants/${TENANT}/session`)).status).toBe(401)
    const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login: 'demo',
      password: 'demo',
    })
    expect(login.status).toBe(200)
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(200)
    scenario.reset()
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(401)
  })
  it('keeps explicit denied, unavailable and unknown scenarios distinct', async () => {
    const scenario = createScenario()
    const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
      login: 'demo',
      password: 'demo',
    })
    scenario.set('forbidden')
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(403)
    scenario.set('offline')
    expect((await scenario.handle('GET', '/api/mdm-candidate/v1/workspace')).status).toBe(503)
    scenario.set('unknown')
    expect(
      (
        await scenario.handle(
          'POST',
          '/api/mdm-candidate/v1/workspace/change',
          {},
          {
            'x-csrf-token': (login.body as { csrfToken: string }).csrfToken,
            'x-identity-request': '1',
          },
        )
      ).body,
    ).toEqual({
      code: 'operation_unknown',
    })
  })
})

it('enforces CSRF, rotates it on refresh, and clears authenticated state after logout', async () => {
  const scenario = createScenario()
  const login = await scenario.handle('POST', `/api/v2/tenants/${TENANT}/login`, {
    login: 'demo',
    password: 'demo',
  })
  const token = (login.body as { csrfToken: string }).csrfToken
  expect((await scenario.handle('POST', `/api/v2/tenants/${TENANT}/session/refresh`)).status).toBe(
    403,
  )
  const refresh = await scenario.handle(
    'POST',
    `/api/v2/tenants/${TENANT}/session/refresh`,
    {},
    { 'x-csrf-token': token, 'x-identity-request': '1' },
  )
  const next = (refresh.body as { csrfToken: string }).csrfToken
  expect(next).not.toBe(token)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v2/tenants/${TENANT}/session/logout`,
        {},
        { 'x-csrf-token': token, 'x-identity-request': '1' },
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await scenario.handle(
        'POST',
        `/api/v2/tenants/${TENANT}/session/logout`,
        {},
        { 'x-csrf-token': next, 'x-identity-request': '1' },
      )
    ).status,
  ).toBe(204)
  expect((await scenario.handle('GET', `/api/v2/tenants/${TENANT}/session`)).status).toBe(401)
})
