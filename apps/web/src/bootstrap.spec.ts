/**
 * bootstrap.spec.ts — setupAxios 装配回调形状测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@gocell/access'
import { setupAxios } from '@gocell/request'

vi.mock('@gocell/request', () => ({
  setupAxios: vi.fn(),
  http: { get: vi.fn() },
}))

vi.mock('@gocell/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gocell/access')>()
  return {
    ...actual,
    createPdpClient: vi.fn(() => ({ can: vi.fn(), decide: vi.fn() })),
  }
})

const mockedSetupAxios = vi.mocked(setupAxios)

async function invokeBootstrapSetupAxios(): Promise<{
  getToken: () => string | null
  onRefresh: () => Promise<string | null>
  onAuthFail: () => void
}> {
  // Import bootstrap after mocks are in place
  const { configureAxios } = await import('./bootstrap')
  const router = { push: vi.fn().mockResolvedValue(undefined) }
  configureAxios(router as unknown as Parameters<typeof configureAxios>[0])

  expect(mockedSetupAxios).toHaveBeenCalledOnce()
  const opts = mockedSetupAxios.mock.calls[0]![0]
  return opts as {
    getToken: () => string | null
    onRefresh: () => Promise<string | null>
    onAuthFail: () => void
  }
}

describe('bootstrap configureAxios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module cache so each test gets a fresh import
    vi.resetModules()
    setActivePinia(createPinia())
  })

  it('getToken reads accessToken from authStore', async () => {
    const { getToken } = await invokeBootstrapSetupAxios()
    const auth = useAuthStore()

    expect(getToken()).toBeNull()

    auth.setSession({
      userId: 'u1',
      accessToken: 'my-token',
      refreshToken: 'rt',
      passwordResetRequired: false,
      expiresAt: '2099-01-01T00:00:00Z',
      sessionId: 'sid-1',
    })
    expect(getToken()).toBe('my-token')
  })

  it('onRefresh delegates to authStore.refresh()', async () => {
    const { onRefresh } = await invokeBootstrapSetupAxios()
    const auth = useAuthStore()
    const spy = vi.spyOn(auth, 'refresh').mockResolvedValue('new-token')

    const result = await onRefresh()

    expect(spy).toHaveBeenCalledOnce()
    expect(result).toBe('new-token')
  })

  it('onAuthFail clears session and attempts push to login route', async () => {
    const router = { push: vi.fn().mockResolvedValue(undefined) }
    const { configureAxios } = await import('./bootstrap')
    configureAxios(router as unknown as Parameters<typeof configureAxios>[0])
    const opts = mockedSetupAxios.mock.calls[0]![0] as {
      onAuthFail: () => void
    }

    const auth = useAuthStore()
    auth.setSession({
      userId: 'u1',
      accessToken: 'tok',
      refreshToken: 'rt',
      passwordResetRequired: false,
      expiresAt: '2099-01-01T00:00:00Z',
      sessionId: 'sid-1',
    })
    const clearSpy = vi.spyOn(auth, 'clearSession')

    opts.onAuthFail()

    expect(clearSpy).toHaveBeenCalledOnce()
    expect(router.push).toHaveBeenCalledWith({ name: 'login', query: { reason: 'expired' } })
  })

  it('setupAxios is called with exact refreshPath /sessions/refresh', async () => {
    await invokeBootstrapSetupAxios()
    const opts = mockedSetupAxios.mock.calls[0]![0]
    expect(opts.refreshPath).toBe('/sessions/refresh')
  })
})

describe('bootstrap bootstrapSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    setActivePinia(createPinia())
  })

  it('calls authStore.refresh() exactly once', async () => {
    const { bootstrapSession } = await import('./bootstrap')
    const auth = useAuthStore()
    const spy = vi.spyOn(auth, 'refresh').mockResolvedValue(null)

    await bootstrapSession()

    expect(spy).toHaveBeenCalledOnce()
  })

  it('is idempotent: concurrent calls share one in-flight refresh', async () => {
    const { bootstrapSession } = await import('./bootstrap')
    const auth = useAuthStore()
    const spy = vi.spyOn(auth, 'refresh').mockResolvedValue(null)

    await Promise.all([bootstrapSession(), bootstrapSession()])

    expect(spy).toHaveBeenCalledOnce()
  })

  it('resolves without throwing on a cold load with no valid cookie (refresh fails)', async () => {
    const { bootstrapSession } = await import('./bootstrap')
    const auth = useAuthStore()
    // No httpOnly cookie / logged out → refresh resolves null and clears state.
    vi.spyOn(auth, 'refresh').mockResolvedValue(null)

    await expect(bootstrapSession()).resolves.toBeUndefined()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('restores the session before mount when refresh succeeds via cookie (warm cold-load)', async () => {
    const { bootstrapSession } = await import('./bootstrap')
    const auth = useAuthStore()
    // A valid httpOnly cookie → refresh writes the restored session.
    vi.spyOn(auth, 'refresh').mockImplementation(async () => {
      auth.setSession({
        userId: 'u1',
        accessToken: 'restored-tok',
        refreshToken: 'rt2',
        passwordResetRequired: false,
        expiresAt: '2099-01-01T00:00:00Z',
        sessionId: 's2',
      })
      return 'restored-tok'
    })

    await bootstrapSession()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.accessToken).toBe('restored-tok')
  })
})
