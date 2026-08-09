import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import MockAdapter from 'axios-mock-adapter'
import { http } from '@gocell/request'
import { useIdentitiesStore } from './useIdentitiesStore'
import { USERS_URL, type Identity } from '../api/identities'

const mkUser = (over: Partial<Identity> = {}): Identity => ({
  id: 'u-1',
  username: 'alice',
  email: 'alice@corp.example',
  status: 'active',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  ...over,
})

describe('useIdentitiesStore', () => {
  let mock: MockAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    mock = new MockAdapter(http)
  })

  afterEach(() => {
    mock.restore()
  })

  it('starts empty and not loading', () => {
    const store = useIdentitiesStore()
    expect(store.users).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.errorKey).toBeNull()
    expect(store.hasMore).toBe(false)
  })

  describe('fetchList', () => {
    it('toggles loading and populates users + pagination on success', async () => {
      mock.onGet(USERS_URL).reply(200, { data: [mkUser()], nextCursor: 'cur-2', hasMore: true })
      const store = useIdentitiesStore()

      const p = store.fetchList()
      expect(store.loading).toBe(true)
      await p

      expect(store.loading).toBe(false)
      expect(store.users).toHaveLength(1)
      expect(store.users[0]?.username).toBe('alice')
      expect(store.nextCursor).toBe('cur-2')
      expect(store.hasMore).toBe(true)
      expect(store.errorKey).toBeNull()
    })

    it('requests the first page with a limit', async () => {
      let seen: Record<string, unknown> | undefined
      mock.onGet(USERS_URL).reply((c) => {
        seen = c.params as Record<string, unknown>
        return [200, { data: [], nextCursor: '', hasMore: false }]
      })
      await useIdentitiesStore().fetchList()
      expect(seen).toMatchObject({ limit: expect.any(Number) })
      expect(seen).not.toHaveProperty('cursor')
    })

    it('maps a network failure to errors.network and leaves users untouched', async () => {
      mock.onGet(USERS_URL).networkError()
      const store = useIdentitiesStore()
      await store.fetchList()
      expect(store.errorKey).toBe('errors.network')
      expect(store.loading).toBe(false)
      expect(store.users).toEqual([])
    })

    it('maps a 403 envelope to its i18n error key', async () => {
      mock.onGet(USERS_URL).reply(403, { error: { code: 'ERR_AUTH_FORBIDDEN' } })
      const store = useIdentitiesStore()
      await store.fetchList()
      expect(store.errorKey).toBe('errors.ERR_AUTH_FORBIDDEN')
    })

    it('clears a prior error key on a subsequent successful fetch', async () => {
      const store = useIdentitiesStore()
      mock.onGet(USERS_URL).networkError()
      await store.fetchList()
      expect(store.errorKey).toBe('errors.network')

      mock.reset()
      mock.onGet(USERS_URL).reply(200, { data: [mkUser()], nextCursor: '', hasMore: false })
      await store.fetchList()
      expect(store.errorKey).toBeNull()
    })
  })

  describe('filteredUsers', () => {
    beforeEach(async () => {
      mock.onGet(USERS_URL).reply(200, {
        data: [
          mkUser({ id: 'u-1', username: 'alice', email: 'alice@corp.example' }),
          mkUser({ id: 'u-2', username: 'bob', email: 'bob@other.example' }),
        ],
        nextCursor: '',
        hasMore: false,
      })
      await useIdentitiesStore().fetchList()
    })

    it('returns all users when the filter is empty', () => {
      const store = useIdentitiesStore()
      expect(store.filteredUsers).toHaveLength(2)
    })

    it('filters by username substring, case-insensitively', () => {
      const store = useIdentitiesStore()
      store.filter = 'ALI'
      expect(store.filteredUsers.map((u) => u.id)).toEqual(['u-1'])
    })

    it('filters by email substring', () => {
      const store = useIdentitiesStore()
      store.filter = 'other.example'
      expect(store.filteredUsers.map((u) => u.id)).toEqual(['u-2'])
    })

    it('returns no rows when nothing matches', () => {
      const store = useIdentitiesStore()
      store.filter = 'zzz'
      expect(store.filteredUsers).toEqual([])
    })
  })

  describe('loadMore', () => {
    it('appends the next page using the stored cursor', async () => {
      const store = useIdentitiesStore()
      mock.onGet(USERS_URL).replyOnce(200, {
        data: [mkUser({ id: 'u-1' })],
        nextCursor: 'cur-2',
        hasMore: true,
      })
      await store.fetchList()

      let seen: Record<string, unknown> | undefined
      mock.onGet(USERS_URL).replyOnce((c) => {
        seen = c.params as Record<string, unknown>
        return [
          200,
          { data: [mkUser({ id: 'u-2', username: 'bob' })], nextCursor: '', hasMore: false },
        ]
      })
      await store.loadMore()

      expect(seen).toMatchObject({ cursor: 'cur-2' })
      expect(store.users.map((u) => u.id)).toEqual(['u-1', 'u-2'])
      expect(store.hasMore).toBe(false)
    })

    it('is a no-op when there is no next page', async () => {
      const store = useIdentitiesStore()
      await store.loadMore()
      expect(mock.history.get).toHaveLength(0)
    })
  })

  describe('mutations', () => {
    const okList = () =>
      mock.onGet(USERS_URL).reply(200, { data: [mkUser()], nextCursor: '', hasMore: false })

    it('create POSTs the body then refetches the list', async () => {
      const body = { username: 'bob', email: 'bob@corp.example', password: 'Secret!23' }
      mock.onPost(USERS_URL).reply(201, { data: mkUser({ id: 'u-2' }) })
      okList()
      await useIdentitiesStore().create(body)
      expect(JSON.parse(mock.history.post[0]?.data as string)).toEqual(body)
      expect(mock.history.get).toHaveLength(1)
    })

    it('edit PATCHes the item then refetches', async () => {
      mock.onPatch(`${USERS_URL}/u-1`).reply(200, { data: mkUser() })
      okList()
      await useIdentitiesStore().edit('u-1', { email: 'new@corp.example' })
      expect(mock.history.patch[0]?.url).toBe(`${USERS_URL}/u-1`)
      expect(mock.history.get).toHaveLength(1)
    })

    it('lock POSTs the lock sub-resource then refetches', async () => {
      mock.onPost(`${USERS_URL}/u-1/lock`).reply(200, { data: { status: 'locked' } })
      okList()
      await useIdentitiesStore().lock('u-1')
      expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/lock`)
      expect(mock.history.get).toHaveLength(1)
    })

    it('unlock POSTs the unlock sub-resource then refetches', async () => {
      mock.onPost(`${USERS_URL}/u-1/unlock`).reply(200)
      okList()
      await useIdentitiesStore().unlock('u-1')
      expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/unlock`)
      expect(mock.history.get).toHaveLength(1)
    })

    it('remove DELETEs the item then refetches', async () => {
      mock.onDelete(`${USERS_URL}/u-1`).reply(204)
      okList()
      await useIdentitiesStore().remove('u-1')
      expect(mock.history.delete[0]?.url).toBe(`${USERS_URL}/u-1`)
      expect(mock.history.get).toHaveLength(1)
    })

    it('changePassword POSTs to the password sub-resource WITHOUT refetching', async () => {
      mock.onPost(`${USERS_URL}/u-1/password`).reply(200, { data: {} })
      await useIdentitiesStore().changePassword('u-1', {
        oldPassword: 'old',
        newPassword: 'New!2345',
      })
      expect(mock.history.post[0]?.url).toBe(`${USERS_URL}/u-1/password`)
      expect(mock.history.get).toHaveLength(0)
    })

    it('refreshes the full loaded extent after a mutation (no collapse to page 1)', async () => {
      const many = (n: number, p: string) =>
        Array.from({ length: n }, (_, i) => mkUser({ id: `${p}-${i}`, username: `u${p}${i}` }))
      const store = useIdentitiesStore()
      mock.onGet(USERS_URL).replyOnce(200, { data: many(50, 'a'), nextCursor: 'c2', hasMore: true })
      await store.fetchList()
      mock.onGet(USERS_URL).replyOnce(200, { data: many(50, 'b'), nextCursor: '', hasMore: false })
      await store.loadMore()
      expect(store.users).toHaveLength(100)

      let seenLimit: unknown
      mock.onPost(`${USERS_URL}/a-0/lock`).reply(200, { data: { status: 'locked' } })
      mock.onGet(USERS_URL).reply((c) => {
        seenLimit = (c.params as Record<string, unknown>).limit
        return [200, { data: many(100, 'a'), nextCursor: '', hasMore: false }]
      })
      await store.lock('a-0')
      // refetch covers the loaded extent (100), not just the first page (50)
      expect(seenLimit).toBe(100)
      expect(store.users).toHaveLength(100)
    })

    it('re-throws and does NOT refetch when a mutation fails', async () => {
      mock.onPost(USERS_URL).networkError()
      const store = useIdentitiesStore()
      await expect(
        store.create({ username: 'x', email: 'x@y.z', password: 'Secret!23' }),
      ).rejects.toThrow()
      expect(mock.history.get).toHaveLength(0)
    })
  })
})
