import { expect, it } from 'vitest'
import { createReceipts, ok } from './http'
import type { DemoRequest } from './scenario'
const author = '22222222-2222-4222-8222-222222222222'
const reviewer = '33333333-3333-4333-8333-333333333333'
it('replays an exact operation only for its original principal, across session renewal', () => {
  const receipts = createReceipts()
  const request: DemoRequest = {
    method: 'POST',
    path: '/approve',
    body: {},
    query: new URLSearchParams(),
    headers: {},
    actor: { principalId: author, sessionId: author },
  }
  let writes = 0
  const write = () => ok({ count: ++writes })
  expect(receipts.write(request, author, write).body).toEqual({ count: 1 })
  expect(
    receipts.write(
      { ...request, actor: { principalId: reviewer, sessionId: reviewer } },
      author,
      write,
    ).status,
  ).toBe(409)
  expect(
    receipts.write(
      { ...request, actor: { principalId: author, sessionId: reviewer } },
      author,
      write,
    ).body,
  ).toEqual({ count: 1 })
  expect(writes).toBe(1)
})
it('ends pages without an empty tail and bounds retained replay cursors', async () => {
  const { createPages } = await import('./http'),
    pages = createPages(),
    query = new URLSearchParams({ limit: '1' })
  const first = pages.page('items', [1, 2], query)
  const next = new URLSearchParams({ limit: '1', cursor: first.nextCursor! })
  expect(pages.page('items', [], next).items).toEqual([2])
  expect(pages.page('items', [], next).items).toEqual([2])
  expect(pages.page('items', [], next).nextCursor).toBeNull()
  for (let i = 0; i < 257; i++) pages.page('items', [1, 2], query)
  expect(() => pages.page('items', [], next)).toThrow('Invalid cursor')
})

it('continues fixed keyset windows without a snapshot cache and rejects a changed basis', async () => {
  const { windowPage } = await import('./directory')
  const request: DemoRequest = {
    method: 'POST',
    path: '/api/v1/policies/previews',
    actor: { principalId: author, sessionId: author },
    headers: {},
    body: {},
    query: new URLSearchParams({ limit: '1' }),
  }
  const position = (n: number) => [n]
  const first = windowPage([3, 1, 2], request, position, ['draft', null])
  expect(first.items).toEqual([1])
  const next = { ...request, query: new URLSearchParams({ limit: '1', cursor: first.nextCursor! }) }
  // Removal of the preceding row does not turn a keyset into an offset.
  const second = windowPage([2, 3], next, position, ['draft', null])
  expect(second.items).toEqual([2])
  expect(() => windowPage([2, 3], next, position, ['draft', 'returned-scope-result'])).toThrow(
    'Invalidated cursor',
  )
  expect(() =>
    windowPage([2, 3], { ...next, actor: { principalId: reviewer, sessionId: author } }, position, [
      'draft',
      null,
    ]),
  ).toThrow('Invalidated cursor')
  const last = windowPage(
    [2, 3],
    { ...next, query: new URLSearchParams({ cursor: second.nextCursor! }) },
    position,
    ['draft', null],
  )
  expect(last).toEqual({ items: [3], nextCursor: null })
  expect(windowPage([], request, position, []).nextCursor).toBeNull()
  expect(windowPage([1, 2, 3], request, position, [], true).items).toEqual([3])
  expect(() =>
    windowPage([], { ...request, query: new URLSearchParams({ after: 'old' }) }, position, []),
  ).toThrow()
})
