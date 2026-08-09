import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { createHttpDecide, DECIDE_URL } from './httpDecide'

describe('createHttpDecide — real PDP decision source', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })
  afterEach(() => {
    mock.restore()
  })

  it('POSTs the translated permission name (no backend resource for coarse checks)', async () => {
    let sentBody: unknown
    mock.onPost(DECIDE_URL).reply((config) => {
      sentBody = JSON.parse(config.data as string)
      return [200, { data: { allowed: true } }]
    })

    const decide = createHttpDecide()
    await decide({ action: 'read', resource: 'identity' })

    // identity → user; coarse page check carries no backend resource id.
    expect(sentBody).toEqual({ action: 'user:read' })
  })

  it('maps allowed=true → allow with empty reasonCode', async () => {
    mock.onPost(DECIDE_URL).reply(200, { data: { allowed: true } })
    const decide = createHttpDecide()
    await expect(decide({ action: 'read', resource: 'cell' })).resolves.toEqual({
      effect: 'allow',
      reasonCode: '',
    })
  })

  it('maps allowed=false → deny with reasonCode role-missing (a policy deny is a 200)', async () => {
    mock.onPost(DECIDE_URL).reply(200, { data: { allowed: false } })
    const decide = createHttpDecide()
    await expect(decide({ action: 'write', resource: 'config' })).resolves.toEqual({
      effect: 'deny',
      reasonCode: 'role-missing',
    })
  })

  it('translates write-family <Can> actions before sending (delete identity → user:write)', async () => {
    let sentBody: unknown
    mock.onPost(DECIDE_URL).reply((config) => {
      sentBody = JSON.parse(config.data as string)
      return [200, { data: { allowed: true } }]
    })
    const decide = createHttpDecide()
    await decide({ action: 'delete', resource: 'identity' })
    expect(sentBody).toEqual({ action: 'user:write' })
  })

  it('rejects on HTTP error (e.g. 400 unregistered action, 503 PDP closed) for the client to fail-closed', async () => {
    mock.onPost(DECIDE_URL).reply(400, { error: { code: 'ERR_AUTH_RBAC_INVALID_INPUT' } })
    const decide = createHttpDecide()
    await expect(decide({ action: 'assign', resource: 'role' })).rejects.toThrow()
  })
})
