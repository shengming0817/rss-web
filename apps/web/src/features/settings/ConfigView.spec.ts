import { flushPromises, mount } from '@vue/test-utils'
import type { SettingsApi } from '@rss/settings'
import { networkErrorForTest } from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import { createWebI18n } from '../../i18n'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import ConfigView from './ConfigView.vue'
import { settingsApiPlugin } from './settings-context'

const execute = vi.fn((_intent: unknown, operation: () => Promise<unknown>) => operation())
const authorization = {
  getHint: vi.fn(() => ({ decision: 'unknown', source: 'server' })),
  getOutcome: vi.fn(() => ({ status: 'idle' })),
  execute,
  subscribe: vi.fn(() => () => undefined),
  dispose: vi.fn(),
} as never

function api(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    get: vi.fn().mockResolvedValue({ data: { key: 'app.k', value: 'sensitive', version: 2 } }),
    publish: vi.fn().mockResolvedValue({ data: { key: 'app.k', version: 3 } }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as SettingsApi
}

describe('ConfigView', () => {
  it('marks manual/RSS sources and clears the publish value before awaiting the server', async () => {
    let resolve!: (value: { data: { key: string; version: number } }) => void
    const publish = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const wrapper = mount(ConfigView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          settingsApiPlugin(api({ publish })),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await wrapper.get('#config-key').setValue('app.k')
    await flushPromises()
    await wrapper.get('#config-value').setValue('never-render-after-send')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '准备发布')!
      .trigger('click')
    await wrapper.get('[data-action="confirm-config"]').trigger('click')
    expect((wrapper.get('#config-value').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.text()).not.toContain('never-render-after-send')
    expect(execute).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledOnce()
    resolve({ data: { key: 'app.k', version: 3 } })
    await flushPromises()
    expect(wrapper.text()).toContain('RSS 已确认发布')
    wrapper.unmount()
  })

  it('preserves key bytes and disables browser text assistance for opaque values', async () => {
    const settings = api()
    const wrapper = mount(ConfigView, {
      global: {
        plugins: [
          createWebI18n(),
          settingsApiPlugin(settings),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    const value = wrapper.get('#config-value')
    expect(value.attributes()).toMatchObject({
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    })
    await wrapper.get('#config-key').setValue(' app.k ')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(settings.get).toHaveBeenCalledWith(
      ' app.k ',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    wrapper.unmount()
  })

  it('locks every write control after an unknown publish until explicit GET succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(networkErrorForTest())
      .mockResolvedValueOnce({ data: { key: 'app.k', value: 'sensitive', version: 2 } })
    const settings = api({ get, publish: vi.fn().mockRejectedValue(networkErrorForTest()) })
    const wrapper = mount(ConfigView, {
      global: {
        plugins: [
          createWebI18n(),
          settingsApiPlugin(settings),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await wrapper.get('#config-key').setValue('app.k')
    await wrapper.get('#config-value').setValue('secret')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '准备发布')!
      .trigger('click')
    await wrapper.get('[data-action="confirm-config"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('发布结果未知')
    expect(wrapper.get('#config-key').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#config-value').attributes('disabled')).toBeDefined()
    for (const label of ['读取当前配置', '准备发布', '准备删除']) {
      expect(
        wrapper
          .findAll('button')
          .find((button) => button.text() === label)
          ?.attributes('disabled'),
      ).toBeDefined()
    }

    await wrapper.get('button.v1-btn:not([disabled])').trigger('click')
    await flushPromises()
    expect(settings.get).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('发布结果未知')
    expect(wrapper.get('#config-key').attributes('disabled')).toBeDefined()

    await wrapper.get('button.v1-btn:not([disabled])').trigger('click')
    await flushPromises()
    expect(settings.get).toHaveBeenCalledTimes(2)
    expect(wrapper.get('#config-key').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
