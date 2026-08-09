import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { Decision } from '@gocell/core'
import { createPdpClient } from './createPdpClient'
import type { DecideFn } from './decideSource'

const ALLOW: Decision = { effect: 'allow', reasonCode: '' }
const DENY: Decision = { effect: 'deny', reasonCode: 'role-missing' }
const TTL_MS = 5 * 60 * 1000

/** A vi.fn typed as a DecideFn so call assertions are available. */
function makeDecideFn(): ReturnType<typeof vi.fn> & DecideFn {
  return vi.fn() as unknown as ReturnType<typeof vi.fn> & DecideFn
}

describe('createPdpClient (mock-first PDP)', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('can() — reactive boolean (fail-closed)', () => {
    it('returns false initially (fail-closed during pending)', () => {
      const decide = makeDecideFn()
      decide.mockReturnValue(new Promise(() => {})) // never resolves
      const client = createPdpClient({ decide })
      expect(client.can('read', 'cells').value).toBe(false)
    })

    it('becomes true when the decision is allow', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValueOnce(ALLOW)
      const client = createPdpClient({ decide })
      const ref = client.can('read', 'cells')

      expect(ref.value).toBe(false) // initially pending → false
      await flushPromises()
      expect(ref.value).toBe(true)
      expect(decide).toHaveBeenCalledWith({ action: 'read', resource: 'cells' })
    })

    it('stays false when the decision is deny (fail-closed)', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValueOnce(DENY)
      const client = createPdpClient({ decide })
      const ref = client.can('delete', 'cells')

      await flushPromises()
      expect(ref.value).toBe(false)
    })

    it('stays false when the decision source rejects (fail-closed on error)', async () => {
      const decide = makeDecideFn()
      decide.mockRejectedValueOnce(new Error('boom'))
      const client = createPdpClient({ decide })
      const ref = client.can('write', 'policy')

      await flushPromises()
      expect(ref.value).toBe(false)
    })

    it('without resource passes resource undefined to the decision source', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValueOnce(ALLOW)
      const client = createPdpClient({ decide })
      const ref = client.can('list')
      void ref.value

      await flushPromises()
      expect(ref.value).toBe(true)
      expect(decide).toHaveBeenCalledWith({ action: 'list', resource: undefined })
    })
  })

  describe('caching', () => {
    it('same key second can() within TTL does not re-decide; returns same ComputedRef', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValue(ALLOW)
      const client = createPdpClient({ decide })

      const ref1 = client.can('read', 'cells')
      expect(ref1.value).toBe(false)
      await flushPromises()
      expect(ref1.value).toBe(true)

      const ref2 = client.can('read', 'cells')
      expect(ref2).toBe(ref1) // identity: same ComputedRef instance
      expect(ref2.value).toBe(true)
      await flushPromises()
      expect(decide).toHaveBeenCalledTimes(1)
    })

    it('different keys each trigger a separate decision', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValue(ALLOW)
      const client = createPdpClient({ decide })

      void client.can('read', 'cells').value
      await flushPromises()
      void client.can('write', 'policy').value
      await flushPromises()

      expect(decide).toHaveBeenCalledTimes(2)
    })

    it('TTL expiry triggers a fresh decision after 5 minutes', async () => {
      vi.useFakeTimers()
      const decide = makeDecideFn()
      decide.mockResolvedValue(ALLOW)
      const client = createPdpClient({ decide })

      const ref = client.can('read', 'cells')
      void ref.value // pending → fires decision
      await flushPromises()
      expect(decide).toHaveBeenCalledTimes(1)

      expect(ref.value).toBe(true)

      // Reading the resolved value makes Vue cache the computed. TTL still has
      // to invalidate that cached value without relying on Date.now() reactivity.
      await vi.advanceTimersByTimeAsync(TTL_MS + 1)
      expect(ref.value).toBe(false) // expired → re-fetch pending, fail-closed
      await flushPromises()

      expect(decide).toHaveBeenCalledTimes(2)
      expect(ref.value).toBe(true)
    })
  })

  describe('single-flight', () => {
    it('two concurrent decide() calls share one in-flight decision', async () => {
      let resolve!: (d: Decision) => void
      const pending = new Promise<Decision>((r) => {
        resolve = r
      })
      const decide = makeDecideFn()
      decide.mockReturnValueOnce(pending)
      const client = createPdpClient({ decide })

      const p1 = client.decide('read', 'cells')
      const p2 = client.decide('read', 'cells')
      expect(decide).toHaveBeenCalledTimes(1)

      resolve(ALLOW)
      expect(await p1).toEqual(ALLOW)
      expect(await p2).toEqual(ALLOW)
      expect(decide).toHaveBeenCalledTimes(1)
    })
  })

  describe('decide() — async structured decision', () => {
    it('resolves to the structured allow decision (awaits, never pending)', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValueOnce(ALLOW)
      const client = createPdpClient({ decide })
      expect(await client.decide('read', 'cells')).toEqual(ALLOW)
    })

    it('resolves to the structured deny decision with reasonCode', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValueOnce(DENY)
      const client = createPdpClient({ decide })
      expect(await client.decide('delete', 'policy')).toEqual({
        effect: 'deny',
        reasonCode: 'role-missing',
      })
    })

    it('maps a decision-source error to deny with reasonCode "error"', async () => {
      const decide = makeDecideFn()
      decide.mockRejectedValueOnce(new Error('network'))
      const client = createPdpClient({ decide })
      expect(await client.decide('read', 'cells')).toEqual({
        effect: 'deny',
        reasonCode: 'error',
      })
    })
  })

  describe('shared cache between can() and decide()', () => {
    it('decide() populates the cache so a later can() needs no extra decision', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValue(ALLOW)
      const client = createPdpClient({ decide })

      await client.decide('read', 'cells')
      expect(decide).toHaveBeenCalledTimes(1)

      const ref = client.can('read', 'cells')
      expect(ref.value).toBe(true) // immediately from cache, no pending flicker
      await flushPromises()
      expect(decide).toHaveBeenCalledTimes(1)
    })

    it('can() populates the cache so a later decide() returns it without re-deciding', async () => {
      const decide = makeDecideFn()
      decide.mockResolvedValue(DENY)
      const client = createPdpClient({ decide })

      const ref = client.can('write', 'config')
      expect(ref.value).toBe(false) // pending
      await flushPromises()
      expect(ref.value).toBe(false) // deny → false
      expect(decide).toHaveBeenCalledTimes(1)

      expect(await client.decide('write', 'config')).toEqual({
        effect: 'deny',
        reasonCode: 'role-missing',
      })
      expect(decide).toHaveBeenCalledTimes(1) // served from cache
    })
  })

  describe('default decision source (no options)', () => {
    it('fails closed → deny for any action when no decide source is injected', async () => {
      const client = createPdpClient()
      expect(await client.decide('read', 'identity')).toEqual({
        effect: 'deny',
        reasonCode: 'error',
      })

      const ref = client.can('read', 'identity')
      expect(ref.value).toBe(false) // first .value read triggers the lazy fetch
      await flushPromises()
      expect(ref.value).toBe(false) // stays denied — never fail-open
    })
  })
})
