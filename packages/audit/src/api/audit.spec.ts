import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { listAudit, AUDIT_URL } from './audit'

const page = {
  data: [
    {
      id: 'evt-001',
      eventId: 'eid-001',
      eventType: 'slice.merge',
      actorId: 'dario@gocell.dev',
      subjectId: 'auditcore/persist@a7f3',
      correlationId: 'corr-abc',
      occurredAt: '2026-06-01T12:48:55Z',
      timestamp: '2026-06-01T12:48:56Z',
      payload: { pr: 2241, sha: 'a7f37c1' },
    },
  ],
  nextCursor: 'cur-2',
  hasMore: true,
}

describe('audit api · listAudit', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs the audit collection URL and returns the list envelope', async () => {
    mock.onGet(AUDIT_URL).reply(200, page)
    const res = await listAudit()
    expect(res).toEqual(page)
  })

  it('forwards cursor + limit as query params', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(AUDIT_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await listAudit({ cursor: 'cur-1', limit: 25 })
    expect(seenParams).toEqual({ cursor: 'cur-1', limit: 25 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(AUDIT_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await listAudit()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure (interceptor maps the error upstream)', async () => {
    mock.onGet(AUDIT_URL).networkError()
    await expect(listAudit()).rejects.toThrow()
  })
})
