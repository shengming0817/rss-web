import { it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { fixture, accountValue, ID } from '../tests/support'
import { identityI18n } from './i18n'
import { runtimeKey } from './context'
import { useAccountDirectory } from './useAccountDirectory'
async function setup() {
  const f = fixture()
  await f.login()
  let d!: ReturnType<typeof useAccountDirectory>
  const w = mount(
    defineComponent({
      setup() {
        d = useAccountDirectory()
        return () => null
      },
    }),
    { global: { plugins: [identityI18n()], provide: { [runtimeKey as symbol]: f } } },
  )
  return { f, d, w }
}
it('freezes source and all query fields on continuation, then applies drafts on the first page', async () => {
  const { f, d, w } = await setup()
  d.query.source = ID
  d.query.fields = ['principalId']
  d.query.filter = "enabled=='true'"
  d.query.sort = 'principalId'
  d.query.limit = 1
  f.replies.push({ accounts: [{ principalId: accountValue.principalId }], nextCursor: 'YWJj' })
  await d.run(() => d.load())
  d.query.source = 'local'
  d.query.filter = "login=='draft'"
  d.query.fields = ['principalId', 'email']
  d.query.limit = 25
  f.replies.push({ accounts: [{ principalId: ID }], nextCursor: null })
  await d.run(() => d.navigate(d.next.value!))
  const continued = f.request.mock.calls.at(-1)![0].query
  expect(continued).toMatchObject({
    source: ID,
    filter: "enabled=='true'",
    fields: 'principalId',
    limit: '1',
    cursor: 'YWJj',
  })
  expect(d.trail.value).toEqual([undefined])
  f.replies.push(new Error('offline'))
  await d.run(() => d.navigate(d.previous.value))
  expect(d.trail.value).toEqual([undefined])
  expect(d.rows.value).toEqual([])
  f.replies.push({ accounts: [{ principalId: ID, email: null }], nextCursor: null })
  await d.run(() => d.load())
  expect(f.request.mock.calls.at(-1)![0].query).toMatchObject({
    source: 'local',
    filter: "login=='draft'",
    fields: 'principalId,email',
    limit: '25',
  })
  expect(d.trail.value).toEqual([])
  w.unmount()
  f.session.clear()
})
it('rejects repeated cursors and drops pending pages after identity loss', async () => {
  const { f, d, w } = await setup()
  f.replies.push({ accounts: [accountValue], nextCursor: 'YWJj' })
  await d.run(() => d.load())
  f.replies.push({ accounts: [accountValue], nextCursor: 'YWJj' })
  await d.run(() => d.navigate('YWJj'))
  expect(d.error.value).toBeTruthy()
  expect(d.trail.value).toEqual([])
  let finish!: (v: unknown) => void
  f.replies.push(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = d.run(() => d.navigate('YWJj'))
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  f.session.clear()
  finish({ accounts: [accountValue], nextCursor: null })
  await pending
  expect(d.rows.value).toEqual([])
  expect(d.applied.value).toBeUndefined()
  expect(d.error.value).toBe('')
  w.unmount()
})
