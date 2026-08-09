import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import FirstRunSetupView from './FirstRunSetupView.vue'
import { fetchSetupStatus, createAdmin } from '../api/setup'

const push = vi.fn()
const replace = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('../api/setup', () => ({
  fetchSetupStatus: vi.fn(),
  createAdmin: vi.fn(),
  SETUP_ADMIN_URL: '/api/v1/access/setup/admin',
}))

const mockedFetch = vi.mocked(fetchSetupStatus)
const mockedCreate = vi.mocked(createAdmin)

async function mountReady(): Promise<VueWrapper> {
  mockedFetch.mockResolvedValue(false) // needs setup
  const wrapper = mount(FirstRunSetupView)
  await flushPromises()
  return wrapper
}

async function fillOperator(w: VueWrapper) {
  await w.find('#op-username').setValue('ops')
  await w.find('#op-password').setValue('rootpass1')
}
async function fillAdmin(w: VueWrapper) {
  await w.find('#admin-username').setValue('admin')
  await w.find('#admin-email').setValue('admin@corp.example')
  await w.find('#admin-password').setValue('SecretPass!23')
  await w.find('#admin-confirm').setValue('SecretPass!23')
}
/** Walk preflight → planes → operator → admin → submit. */
async function walkToSubmit(w: VueWrapper) {
  await w.find('.wizard__next').trigger('click') // preflight → planes
  await w.find('.wizard__next').trigger('click') // planes → operator
  await fillOperator(w)
  await w.find('.wizard__next').trigger('click') // operator → admin
  await fillAdmin(w)
  await w.find('.wizard__next').trigger('click') // admin → submit
}

describe('FirstRunSetupView', () => {
  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    mockedFetch.mockReset()
    mockedCreate.mockReset()
  })

  it('queries setup status on mount and shows the wizard when setup is needed', async () => {
    const wrapper = await mountReady()
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.wizard').exists()).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })

  it('redirects to /login when an admin already exists (setup done)', async () => {
    mockedFetch.mockResolvedValue(true)
    mount(FirstRunSetupView)
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('shows a connection error (no redirect) when the status check fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network'))
    const wrapper = mount(FirstRunSetupView)
    await flushPromises()
    expect(wrapper.text()).toContain('access.firstRun.checkFailed')
    expect(replace).not.toHaveBeenCalled()
  })

  it('advances preflight → planes → operator and back', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click')
    expect(wrapper.text()).toContain('access.firstRun.steps.planes.title')
    await wrapper.find('.wizard__next').trigger('click')
    expect(wrapper.text()).toContain('access.firstRun.steps.operator.title')
    await wrapper.find('.wizard__back').trigger('click')
    expect(wrapper.text()).toContain('access.firstRun.steps.planes.title')
  })

  it('gates the operator step until both credentials are entered', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click')
    await wrapper.find('.wizard__next').trigger('click') // on operator
    expect(wrapper.find('.wizard__next').attributes('disabled')).toBeDefined()
    await fillOperator(wrapper)
    expect(wrapper.find('.wizard__next').attributes('disabled')).toBeUndefined()
  })

  it('gates the admin step on password confirmation match', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click')
    await wrapper.find('.wizard__next').trigger('click')
    await fillOperator(wrapper)
    await wrapper.find('.wizard__next').trigger('click') // on admin
    await wrapper.find('#admin-username').setValue('admin')
    await wrapper.find('#admin-email').setValue('admin@corp.example')
    await wrapper.find('#admin-password').setValue('SecretPass!23')
    await wrapper.find('#admin-confirm').setValue('different')
    expect(wrapper.find('.wizard__next').attributes('disabled')).toBeDefined()
    await wrapper.find('#admin-confirm').setValue('SecretPass!23')
    expect(wrapper.find('.wizard__next').attributes('disabled')).toBeUndefined()
  })

  it('keeps admin password fields masked', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click')
    await wrapper.find('.wizard__next').trigger('click')
    await fillOperator(wrapper)
    await wrapper.find('.wizard__next').trigger('click')
    expect(wrapper.find('#admin-password').attributes('type')).toBe('password')
    expect(wrapper.find('#admin-confirm').attributes('type')).toBe('password')
  })

  it('submits operator credentials + admin body to createAdmin', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      email: 'admin@corp.example',
      createdAt: 'x',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    expect(mockedCreate).toHaveBeenCalledWith(
      { username: 'ops', password: 'rootpass1' },
      { username: 'admin', email: 'admin@corp.example', password: 'SecretPass!23' },
    )
  })

  it('lands on the done step after a successful 201 and links to login', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockResolvedValue({
      id: 'u1',
      username: 'admin',
      email: 'admin@corp.example',
      createdAt: 'x',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('access.firstRun.steps.done.title')
    await wrapper.find('.wizard__login').trigger('click')
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('shows an inline error and stays on submit when bootstrap auth fails (401)', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
      i18nKey: 'errors.ERR_AUTH_BOOTSTRAP_FAILED',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    await flushPromises()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.text()).toContain('errors.ERR_AUTH_BOOTSTRAP_FAILED')
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('access.firstRun.steps.submit.title')
  })

  it('shows an inline error and stays on submit when the admin already exists (409)', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409 },
      i18nKey: 'errors.ERR_AUTH_ADMIN_ALREADY_EXISTS',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('errors.ERR_AUTH_ADMIN_ALREADY_EXISTS')
    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('access.firstRun.steps.submit.title')
  })

  it('shows an inline error and stays on submit when rate limited (429)', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429 },
      i18nKey: 'errors.ERR_RATE_LIMITED',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('errors.ERR_RATE_LIMITED')
    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('access.firstRun.steps.submit.title')
  })

  it('advances on Enter (form submit) when the operator step is valid', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click') // preflight → planes
    await wrapper.find('.wizard__next').trigger('click') // planes → operator
    await fillOperator(wrapper)
    await wrapper.find('form.frs-card').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('access.firstRun.steps.admin.title')
  })

  it('does not advance on Enter while the operator step is incomplete', async () => {
    const wrapper = await mountReady()
    await wrapper.find('.wizard__next').trigger('click')
    await wrapper.find('.wizard__next').trigger('click') // operator, empty
    await wrapper.find('form.frs-card').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('access.firstRun.steps.operator.title')
  })

  it('silently redirects to /login on 410 (already initialized)', async () => {
    const wrapper = await mountReady()
    await walkToSubmit(wrapper)
    mockedCreate.mockRejectedValue({
      isAxiosError: true,
      response: { status: 410 },
      i18nKey: 'errors.ERR_SETUP_ALREADY_INITIALIZED',
    })
    await wrapper.find('.wizard__submit').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('marks the current step with aria-current in the nav', async () => {
    const wrapper = await mountReady()
    const current = wrapper.find('.wizard__step[aria-current="step"]')
    expect(current.exists()).toBe(true)
  })

  it('moves focus to the step heading on step change (a11y soft-navigation)', async () => {
    mockedFetch.mockResolvedValue(false)
    const wrapper = mount(FirstRunSetupView, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('.wizard__next').trigger('click') // preflight → planes
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.find('.wizard__title').element)
    wrapper.unmount()
  })
})
