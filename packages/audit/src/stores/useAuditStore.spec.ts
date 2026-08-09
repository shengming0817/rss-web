import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { useAuditStore } from './useAuditStore'
import { AUDIT_URL } from '../api/audit'
import type { AuditEntry } from '../api/audit'

const mkEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'evt-001',
  eventId: 'eid-001',
  eventType: 'slice.merge',
  actorId: 'dario@gocell.dev',
  timestamp: '2026-06-01T12:48:55Z',
  ...over,
})

const page1 = {
  data: [mkEntry({ id: 'evt-001' })],
  nextCursor: 'cur-2',
  hasMore: true,
}
const page2 = {
  data: [mkEntry({ id: 'evt-002', eventType: 'flag.flip' })],
  nextCursor: '',
  hasMore: false,
}

describe('useAuditStore', () => {
  let mock: MockAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
    vi.restoreAllMocks()
  })

  it('starts with empty state and is not loading', () => {
    const store = useAuditStore()
    expect(store.entries).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
    expect(store.hasMore).toBe(false)
    expect(store.filter).toBe('')
    expect(store.actorKind).toBe('all')
    expect(store.actionNs).toBe('all')
  })

  describe('fetchList', () => {
    it('toggles loading and populates entries on success', async () => {
      mock.onGet(AUDIT_URL).reply(200, page1)
      const store = useAuditStore()

      const p = store.fetchList()
      expect(store.loading).toBe(true)
      await p

      expect(store.loading).toBe(false)
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0]?.id).toBe('evt-001')
      expect(store.nextCursor).toBe('cur-2')
      expect(store.hasMore).toBe(true)
      expect(store.errorKey).toBeNull()
    })

    it('swallows errors into errorKey (does not throw)', async () => {
      mock.onGet(AUDIT_URL).networkError()
      const store = useAuditStore()
      await expect(store.fetchList()).resolves.toBeUndefined()
      expect(store.errorKey).not.toBeNull()
      expect(store.loading).toBe(false)
    })

    it('replaces entries on a re-fetch (not appends)', async () => {
      mock.onGet(AUDIT_URL).replyOnce(200, page1).onGet(AUDIT_URL).replyOnce(200, page2)
      const store = useAuditStore()
      await store.fetchList()
      await store.fetchList()
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0]?.eventType).toBe('flag.flip')
    })
  })

  describe('loadMore', () => {
    it('appends entries and updates cursor', async () => {
      mock.onGet(AUDIT_URL).replyOnce(200, page1).onGet(AUDIT_URL).replyOnce(200, page2)
      const store = useAuditStore()
      await store.fetchList()
      await store.loadMore()
      expect(store.entries).toHaveLength(2)
      expect(store.hasMore).toBe(false)
    })

    it('is a no-op when hasMore is false', async () => {
      mock.onGet(AUDIT_URL).reply(200, { data: [], nextCursor: '', hasMore: false })
      const store = useAuditStore()
      await store.fetchList()
      const getSpy = vi.spyOn(http, 'get')
      await store.loadMore()
      expect(getSpy).not.toHaveBeenCalled()
    })

    it('swallows errors into errorKey', async () => {
      mock.onGet(AUDIT_URL).replyOnce(200, page1).onGet(AUDIT_URL).networkError()
      const store = useAuditStore()
      await store.fetchList()
      await expect(store.loadMore()).resolves.toBeUndefined()
      expect(store.errorKey).not.toBeNull()
    })
  })

  describe('filteredEntries (client-side filtering)', () => {
    beforeEach(async () => {
      mock.onGet(AUDIT_URL).reply(200, {
        data: [
          mkEntry({ id: 'e1', eventType: 'slice.merge', actorId: 'dario@gocell.dev' }),
          mkEntry({ id: 'e2', eventType: 'flag.flip', actorId: 'sb-790' }),
          mkEntry({ id: 'e3', eventType: 'config.publish', actorId: 'sa:platform-bot' }),
        ],
        nextCursor: '',
        hasMore: false,
      })
    })

    it('returns all entries when no filter is set', async () => {
      const store = useAuditStore()
      await store.fetchList()
      expect(store.filteredEntries).toHaveLength(3)
    })

    it('filters by free text (eventType match)', async () => {
      const store = useAuditStore()
      await store.fetchList()
      store.filter = 'slice'
      expect(store.filteredEntries).toHaveLength(1)
      expect(store.filteredEntries[0]?.id).toBe('e1')
    })

    it('filters by free text (actorId match)', async () => {
      const store = useAuditStore()
      await store.fetchList()
      store.filter = 'dario'
      expect(store.filteredEntries).toHaveLength(1)
      expect(store.filteredEntries[0]?.id).toBe('e1')
    })

    it('filters by actorKind', async () => {
      const store = useAuditStore()
      await store.fetchList()
      store.actorKind = 'sandbox'
      expect(store.filteredEntries).toHaveLength(1)
      expect(store.filteredEntries[0]?.id).toBe('e2')
    })

    it('filters by actionNs namespace prefix', async () => {
      const store = useAuditStore()
      await store.fetchList()
      store.actionNs = 'flag'
      expect(store.filteredEntries).toHaveLength(1)
      expect(store.filteredEntries[0]?.id).toBe('e2')
    })

    it('applies all three filters together', async () => {
      const store = useAuditStore()
      await store.fetchList()
      store.filter = 'platform'
      store.actorKind = 'service'
      store.actionNs = 'config'
      expect(store.filteredEntries).toHaveLength(1)
      expect(store.filteredEntries[0]?.id).toBe('e3')
    })
  })

  describe('entriesByDay', () => {
    it('groups entries by day', async () => {
      mock.onGet(AUDIT_URL).reply(200, {
        data: [
          mkEntry({
            id: 'e1',
            occurredAt: '2026-06-02T10:00:00Z',
            timestamp: '2026-06-02T10:00:00Z',
          }),
          mkEntry({
            id: 'e2',
            occurredAt: '2026-06-01T10:00:00Z',
            timestamp: '2026-06-01T10:00:00Z',
          }),
        ],
        nextCursor: '',
        hasMore: false,
      })
      const store = useAuditStore()
      await store.fetchList()
      const groups = store.entriesByDay
      expect(groups.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('chainStatus', () => {
    it('returns unavailable when entries have no hash fields (contract gap)', async () => {
      mock.onGet(AUDIT_URL).reply(200, page1)
      const store = useAuditStore()
      await store.fetchList()
      expect(store.chainStatus.status).toBe('unavailable')
    })
  })
})
