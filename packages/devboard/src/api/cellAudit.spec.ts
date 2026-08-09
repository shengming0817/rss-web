import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { fetchCellAudit, CELL_AUDIT_URL } from './cellAudit'

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

describe('cellAudit · fetchCellAudit', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('GETs CELL_AUDIT_URL and returns the response envelope', async () => {
    mock.onGet(CELL_AUDIT_URL).reply(200, page)
    const res = await fetchCellAudit()
    expect(res).toEqual(page)
  })

  it('forwards limit param as a query parameter', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CELL_AUDIT_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await fetchCellAudit({ limit: 20 })
    expect(seenParams).toEqual({ limit: 20 })
  })

  it('sends no query params when called without args', async () => {
    let seenParams: Record<string, unknown> | undefined
    mock.onGet(CELL_AUDIT_URL).reply((config) => {
      seenParams = config.params as Record<string, unknown>
      return [200, page]
    })
    await fetchCellAudit()
    expect(seenParams).toEqual({})
  })

  it('rejects on network failure', async () => {
    mock.onGet(CELL_AUDIT_URL).networkError()
    await expect(fetchCellAudit()).rejects.toThrow()
  })
})
