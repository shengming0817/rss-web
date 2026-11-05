import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createSession, type AuthPort } from '@rss/auth-core'
import { decodeIdentityError } from '@rss/api/identity'
import { decodeMdmError } from '@rss/api/mdm'
import { CredentialWriteNotDispatched } from '@rss/device-access/model'
import { DaContext, identityKey, type DaRuntime } from '../context'
import { useRead } from './read'
import { useMutation } from './mutation'
import { useDirectory } from './directory'
import { useRevisionReview } from './revision-review'
import { errorMessage, uncertain, needsProof } from './status'
import { decodeHost } from '../config'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const tenant = '11111111-1111-4111-8111-111111111111',
  id = '22222222-2222-4222-8222-222222222222'
const roots = new Set<Root>(),
  owners: ReturnType<typeof createSession>[] = []
afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  owners.splice(0).forEach((s) => s.dispose())
  vi.restoreAllMocks()
})
async function runtime() {
  const envelope = {
    session: { id, issuedAt: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
    identity: { principalId: id, hasLocalPassword: true },
    csrfToken: 'a'.repeat(64),
  }
  const session = createSession(
    {
      login: async () => envelope,
      context: async () => ({
        tenantId: tenant,
        principalId: id,
        sessionId: id,
        navigation: { manageAccounts: false, manageProviders: false },
      }),
      classify: () => 'rejected',
    } as unknown as AuthPort,
    { oidcEnabled: false },
  )
  await session.login(tenant, 'user', 'secret')
  owners.push(session)
  return { session, writes: new Map() } as unknown as DaRuntime
}
async function harness<T>(r: DaRuntime, work: () => T) {
  let output!: T
  const root = createRoot(document.createElement('div'))
  roots.add(root)
  function Probe() {
    output = work()
    return null
  }
  async function render() {
    await act(async () => {
      root.render(
        <DaContext.Provider value={r}>
          <Probe />
        </DaContext.Provider>,
      )
    })
  }
  await render()
  return {
    get output() {
      return output
    },
    render,
    unmount: async () => {
      await act(async () => root.unmount())
      roots.delete(root)
    },
  }
}
it('fences reads on object change, identity loss and unmount', async () => {
  const r = await runtime()
  let device = 'one'
  const signals: AbortSignal[] = [],
    completions: ((v: string) => void)[] = []
  const hook = await harness(r, () =>
    useRead((signal) => {
      signals.push(signal)
      return new Promise<string>((resolve) => completions.push(resolve))
    }, device),
  )
  device = 'two'
  await hook.render()
  expect(signals[0]?.aborted).toBe(true)
  await act(async () => {
    completions[1]?.('second')
  })
  expect(hook.output.data).toBe('second')
  await act(async () => {
    completions[0]?.('first')
  })
  expect(hook.output.data).toBe('second')
  await act(async () => r.session.clear())
  expect(hook.output.data).toBeUndefined()
  expect(identityKey(r.session)).toBeNull()
  await hook.unmount()
  expect(signals[1]?.aborted).toBe(true)
})
it('clears old authorized data on a denied reload', async () => {
  const r = await runtime(),
    load = vi
      .fn()
      .mockResolvedValueOnce('authorized')
      .mockRejectedValueOnce(decodeMdmError(403, { code: 'permission_denied' }))
  const h = await harness(r, () => useRead<string>(load))
  expect(h.output.data).toBe('authorized')
  await act(async () => {
    await h.output.reload()
  })
  expect(h.output.data).toBeUndefined()
  expect(h.output.error).toContain('权限')
})
it('retains no secret input and locks unknown operations across remount and directory refresh', async () => {
  const r = await runtime(),
    work = vi.fn(async () => {
      throw new Error('lost secret')
    })
  const a = await harness(r, () => useMutation('device/binding/new'))
  await act(async () => {
    await a.output.run(work)
  })
  const original = a.output.state.id
  await a.unmount()
  const b = await harness(r, () => useMutation('device/binding/new'))
  expect(b.output.state.id).toBe(original)
  expect(b.output.locked).toBe(true)
  await act(async () => {
    await b.output.run(work)
    await b.output.query(async () => null)
  })
  expect(work).toHaveBeenCalledTimes(1)
  expect(b.output.state.state).toBe('unknown')
  expect(JSON.stringify([...r.writes.values()])).not.toContain('lost secret')
  await act(async () => {
    await b.output.query(
      async () => ({ done: true }),
      (v) => v.done,
    )
  })
  expect(b.output.locked).toBe(false)
})
it('reuses the original locator only after an explicitly rejected purpose authentication request', async () => {
  const r = await runtime(),
    h = await harness(r, () => useMutation('binding'))
  await act(async () => {
    await h.output.run(async () => {
      throw decodeIdentityError(403, { code: 'reauthentication_required' })
    })
  })
  const original = h.output.state.id
  expect(h.output.state.proof).toBe(true)
  const work = vi.fn(async (_id: string, _signal: AbortSignal) => 42)
  await act(async () => {
    await h.output.run(work)
  })
  expect(work.mock.calls[0]?.[0]).toBe(original)
})
it('fences a mutation before effect cleanup when the identity has changed', async () => {
  const r = await runtime(),
    h = await harness(r, () => useMutation('one')),
    work = vi.fn(async () => 1)
  await act(async () => {
    r.session.clear()
    await h.output.run(work)
  })
  expect(work).not.toHaveBeenCalled()
})
it('keeps a dispatched write unknown when its component departs', async () => {
  const r = await runtime(),
    h = await harness(r, () => useMutation('one'))
  let complete!: (v: number) => void
  let pending!: Promise<number | undefined>
  await act(async () => {
    pending = h.output.run(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
  })
  await h.unmount()
  complete(1)
  expect(await pending).toBeUndefined()
  expect([...r.writes.values()][0]?.state).toBe('unknown')
})
it('keeps accepted cursor coordinates separate from edited query drafts and failed navigation', async () => {
  const r = await runtime(),
    load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], summaries: null, nextCursor: 'YQ' })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], summaries: null, nextCursor: null })
  const h = await harness(r, () => useDirectory(['id'], 100, load))
  await act(async () => {
    h.output.updateDraft({ filter: "id=='draft'" })
  })
  await act(async () => {
    await h.output.following()
  })
  expect(load.mock.calls[1]?.[0]).toMatchObject({ cursor: 'YQ', limit: 50 })
  expect(load.mock.calls[1]?.[0].filter).toBeUndefined()
  load.mockRejectedValueOnce(new Error('offline'))
  await act(async () => {
    await h.output.previous()
  })
  expect(h.output.cursor).toBe('YQ')
  expect(h.output.data).toBeUndefined()
})
it('rejects repeated cursor responses and malformed directory drafts without accepting a new position', async () => {
  const r = await runtime(),
    load = vi.fn().mockResolvedValue({ items: [], summaries: null, nextCursor: 'YQ' })
  const h = await harness(r, () => useDirectory(['id'], 100, load))
  await act(async () => {
    await h.output.following()
  })
  expect(h.output.error).toBeTruthy()
  expect(h.output.cursor).toBeUndefined()
  await act(async () => {
    h.output.updateDraft({ sort: 'id,' })
  })
  await act(async () => {
    await h.output.apply()
  })
  expect(load).toHaveBeenCalledTimes(2)
  expect(h.output.error).toBeTruthy()
})
it('requires explicit adoption of a reread CAS version and preserves a separate draft', async () => {
  const r = await runtime(),
    draft = { name: 'mine' },
    h = await harness(r, () =>
      useRevisionReview({ id: 'a', revision: 1 }, async () => ({ id: 'a', revision: 2 })),
    )
  await act(async () => {
    await h.output.refresh()
  })
  expect(h.output.revision).toBe(1)
  expect(h.output.current?.revision).toBe(2)
  expect(draft.name).toBe('mine')
  await act(async () => {
    h.output.accept()
  })
  expect(h.output.revision).toBe(2)
})
it('validates static host configuration and gives closed error classifications', () => {
  const config = {
    canonicalOrigin: 'https://app.test',
    tenant,
    managementTenant: id,
    serviceId: id,
  }
  expect(decodeHost(config, 'https://app.test').tenant).toBe(tenant)
  for (const value of [
    null,
    [],
    { ...config, tenant: id },
    { ...config, extra: true },
    { ...config, serviceId: 'bad' },
  ])
    expect(() => decodeHost(value, 'https://app.test')).toThrow()
  expect(errorMessage(new Error('SECRET'))).not.toContain('SECRET')
  expect(uncertain(new Error())).toBe(true)
  expect(uncertain(new CredentialWriteNotDispatched('cancelled'))).toBe(false)
  expect(needsProof(decodeIdentityError(403, { code: 'reauthentication_required' }))).toBe(true)
})
it('keeps conflicts blocked until an explicitly accepted reread', async () => {
  const r = await runtime(),
    h = await harness(r, () => useMutation('binding'))
  await act(async () => {
    await h.output.run(async () => {
      throw decodeMdmError(409, { code: 'operation_conflict' })
    })
  })
  expect(h.output.state.review).toBe(true)
  const work = vi.fn(async () => 42)
  await act(async () => {
    await h.output.run(work)
  })
  expect(work).not.toHaveBeenCalled()
  await act(async () => {
    h.output.acceptRevision()
    await h.output.run(work)
  })
  expect(work).toHaveBeenCalledTimes(1)
})
it('serializes original queries and fences their late result from a newly selected object', async () => {
  const r = await runtime()
  let key = 'one',
    finish!: (v: { state: string }) => void
  const h = await harness(r, () => useMutation(key))
  await act(async () => {
    await h.output.run(async () => {
      throw new Error('lost')
    })
  })
  const query = vi.fn(
    () =>
      new Promise<{ state: string }>((resolve) => {
        finish = resolve
      }),
  )
  let pending!: Promise<unknown>
  await act(async () => {
    pending = h.output.query(query)
    await h.output.query(query)
  })
  expect(query).toHaveBeenCalledTimes(1)
  key = 'two'
  await h.render()
  await act(async () => {
    finish({ state: 'completed' })
    await pending
  })
  expect(h.output.state.state).toBe('idle')
})
it('supports disabled reads and rejects an absent or mismatched revision baseline', async () => {
  const r = await runtime(),
    load = vi.fn(async () => 'manual')
  const disabled = await harness(r, () => useRead(load, '', false))
  expect(load).not.toHaveBeenCalled()
  await act(async () => {
    await disabled.output.reload()
  })
  expect(disabled.output.data).toBe('manual')
  const baseline = await harness(r, () =>
    useRevisionReview({ id: 'a', revision: 1 }, async () => ({ id: 'other', revision: 3 })),
  )
  expect(baseline.output.accept()).toBe(false)
  await act(async () => {
    await baseline.output.refresh()
  })
  expect(baseline.output.current).toBeUndefined()
  expect(baseline.output.revision).toBe(1)
  expect(baseline.output.error).toBeTruthy()
})
it('validates field projection and page bounds before dispatch and restores accepted query coordinates', async () => {
  const r = await runtime(),
    load = vi.fn().mockResolvedValue({ items: [], summaries: null, nextCursor: null })
  const h = await harness(r, () => useDirectory(['id'], 100, load))
  await act(async () => {
    h.output.updateDraft({ fields: [] })
  })
  await act(async () => {
    await h.output.apply()
  })
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => {
    h.output.updateDraft({ fields: ['id'], limit: 101 })
  })
  await act(async () => {
    await h.output.apply()
  })
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => {
    await h.output.restore({
      query: { fields: ['id'], limit: 2, cursor: 'YQ' },
      trail: [undefined],
    })
  })
  expect(h.output.cursor).toBe('YQ')
  expect(h.output.trail).toEqual([undefined])
  expect(h.output.draft.limit).toBe(2)
  await act(async () => {
    await h.output.first()
  })
  expect(h.output.cursor).toBeUndefined()
})
