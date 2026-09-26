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
