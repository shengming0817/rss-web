import { afterEach, expect, it, vi } from 'vitest'
import { inject } from 'vue'
import { runtimeKey } from '@rss/auth'
import type { HttpTransport, RequestOptions } from '@rss/api/identity'
import { mdmKey } from './context'
import { startMdm } from './bootstrap'
vi.mock('@rss/api/mdm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rss/api/mdm')>()),
  createMdmTransport: () => ({ request: () => Promise.reject(new Error('Live unavailable')) }),
}))
const tenant = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const running: ReturnType<typeof startMdm>[] = []
afterEach(() => {
  for (const runtime of running) {
    runtime.session.clear()
    runtime.app.unmount()
    runtime.router.options.history.destroy()
  }
  running.length = 0
  document.body.innerHTML = ''
})
it('provides the same session owner to auth, MDM and protected routes', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const transport = {
    async request(options: RequestOptions<unknown>) {
      const value = options.path.endsWith('/context')
        ? {
            tenantId: tenant,
            principalId: id,
            sessionId: id,
            navigation: { manageAccounts: false, manageProviders: false },
          }
        : {
            session: { id, authTime: 1, idleExpiresAt: 4102444800, absoluteExpiresAt: 4102444900 },
            identity: { principalId: id, hasLocalPassword: true },
            csrfToken: 'a'.repeat(64),
          }
      return options.decode(value)
    },
  } as HttpTransport
  const runtime = startMdm(
    transport,
    { canonicalOrigin: 'https://mdm.example.test', oidcEnabled: false },
    tenant,
    false,
  )
  running.push(runtime)
  await runtime.router.isReady()
  runtime.app.runWithContext(() => {
    expect(inject(runtimeKey)?.session).toBe(runtime.session)
    expect(inject(mdmKey)?.session).toBe(runtime.session)
  })
  expect(runtime.router.currentRoute.value.name).toBe('workspace')
  await vi.waitFor(() => expect(document.body.textContent).toContain('当前无法读取导航'))
  expect(runtime.session.state.value.status).toBe('authenticated')
  await runtime.router.push(`/tenants/33333333-3333-4333-8333-333333333333/workspace`)
  expect(runtime.router.currentRoute.value.name).toBe('error')
})
