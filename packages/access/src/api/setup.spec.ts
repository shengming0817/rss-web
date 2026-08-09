import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { fetchSetupStatus, createAdmin, SETUP_STATUS_URL, SETUP_ADMIN_URL } from './setup'

const adminResponse = {
  id: 'u-1',
  username: 'admin',
  email: 'admin@corp.example',
  createdAt: '2026-05-29T00:00:00Z',
}

describe('setup api', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('fetchSetupStatus', () => {
    it('returns false when the system has no admin (needs setup)', async () => {
      mock.onGet(SETUP_STATUS_URL).reply(200, { data: { hasAdmin: false } })
      expect(await fetchSetupStatus()).toBe(false)
    })

    it('returns true when an admin already exists', async () => {
      mock.onGet(SETUP_STATUS_URL).reply(200, { data: { hasAdmin: true } })
      expect(await fetchSetupStatus()).toBe(true)
    })

    it('rejects on network failure', async () => {
      mock.onGet(SETUP_STATUS_URL).networkError()
      await expect(fetchSetupStatus()).rejects.toThrow()
    })
  })

  describe('createAdmin', () => {
    const operator = { username: 'ops', password: 'rootpass' }
    const body = { username: 'admin', email: 'admin@corp.example', password: 'SecretPass!23' }

    it('returns the created admin payload on 201', async () => {
      mock.onPost(SETUP_ADMIN_URL).reply(201, { data: adminResponse })
      expect(await createAdmin(operator, body)).toEqual(adminResponse)
    })

    it('sends the operator credentials as an HTTP Basic Auth header', async () => {
      let seenAuth: string | undefined
      mock.onPost(SETUP_ADMIN_URL).reply((config) => {
        seenAuth = config.headers?.['Authorization'] as string | undefined
        return [201, { data: adminResponse }]
      })
      await createAdmin(operator, body)
      expect(seenAuth).toBe(`Basic ${btoa('ops:rootpass')}`)
    })

    it('sends the admin identity as the JSON request body', async () => {
      let seenBody: string | undefined
      mock.onPost(SETUP_ADMIN_URL).reply((config) => {
        seenBody = config.data as string
        return [201, { data: adminResponse }]
      })
      await createAdmin(operator, body)
      expect(JSON.parse(seenBody ?? '{}')).toEqual(body)
    })

    it.each([
      [401, 'ERR_AUTH_BOOTSTRAP_FAILED'],
      [409, 'ERR_AUTH_ADMIN_ALREADY_EXISTS'],
      [410, 'ERR_SETUP_ALREADY_INITIALIZED'],
      [429, 'ERR_RATE_LIMITED'],
      [400, 'ERR_VALIDATION'],
      [413, 'ERR_REQUEST_TOO_LARGE'],
    ] as const)('rejects with the response error on %i', async (status, code) => {
      mock.onPost(SETUP_ADMIN_URL).reply(status, { error: { code, message: 'm', details: [] } })
      await expect(createAdmin(operator, body)).rejects.toMatchObject({
        response: { status },
      })
    })
  })
})
