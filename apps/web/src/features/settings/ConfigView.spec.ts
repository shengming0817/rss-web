import { flushPromises, mount } from '@vue/test-utils'
import type { SettingsApi } from '@rss/settings'
import { networkErrorForTest } from '@rss/api/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebI18n } from '../../i18n'
import { authorizationExperiencePlugin } from '../authorization/authorization-context'
import ConfigView from './ConfigView.vue'
import { settingsApiPlugin } from './settings-context'
import {
  configCatalogDraftPlugin,
  createConfigCatalogDraftHandoff,
} from './config-catalog-draft-context'

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
    rollback: vi.fn().mockResolvedValue({ data: { key: 'app.k', version: 4, sourceVersion: 1 } }),
    ...overrides,
  } as SettingsApi
}

describe('ConfigView', () => {
  beforeEach(() => vi.clearAllMocks())
  it('consumes a staged Mock key as an unsubmitted Manual draft', async () => {
    const settings = api()
    const handoff = createConfigCatalogDraftHandoff()
    handoff.stage('preview.example.appearance.theme')
    const wrapper = mount(ConfigView, {
      global: {
        plugins: [
          createWebI18n(),
          settingsApiPlugin(settings),
          authorizationExperiencePlugin(authorization),
          configCatalogDraftPlugin(handoff),
        ],
      },
    })
    expect((wrapper.get('#config-key').element as HTMLInputElement).value).toBe(
      'preview.example.appearance.theme',
    )
    expect(wrapper.text()).toContain('尚未向 RSS 发出请求')
    expect(settings.get).not.toHaveBeenCalled()
    expect(settings.publish).not.toHaveBeenCalled()
    expect(settings.delete).not.toHaveBeenCalled()
    expect(settings.rollback).not.toHaveBeenCalled()
    expect((wrapper.get('#config-value').element as HTMLTextAreaElement).value).toBe('')
    expect((wrapper.get('#config-rollback-version').element as HTMLInputElement).value).toBe('')

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(settings.get).toHaveBeenCalledOnce()
  })

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
    expect(wrapper.get('#config-rollback-version').attributes('disabled')).toBeDefined()
    for (const label of ['读取当前配置', '准备发布', '准备删除', '准备回滚']) {
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

  it('accepts only a canonical explicit rollback coordinate and confirms without a history preview', async () => {
    const settings = api()
    const wrapper = mount(ConfigView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          settingsApiPlugin(settings),
          authorizationExperiencePlugin(authorization),
        ],
      },
    })
    await wrapper.get('#config-key').setValue('app.k')
    const prepare = () =>
      wrapper
        .findAll('button')
        .find((button) => button.text() === '准备回滚')!
        .trigger('click')

    for (const invalid of ['', '0', '-1', '1.5', '1e3', '9007199254740992']) {
      await wrapper.get('#config-rollback-version').setValue(invalid)
      await prepare()
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    }

    await wrapper.get('#config-rollback-version').setValue('1')
    await wrapper.get('#config-value').setValue('must-not-enter-confirmation')
    await prepare()
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).toContain('app.k')
    expect(dialog.text()).toContain('1')
    expect(dialog.text()).not.toContain('must-not-enter-confirmation')
    await dialog.get('[data-action="confirm-config"]').trigger('click')
    await flushPromises()
    expect(settings.rollback).toHaveBeenCalledWith(
      'app.k',
      { toVersion: 1 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(wrapper.text()).toContain('源版本 1')
    expect(wrapper.text()).toContain('新版本 4')
    wrapper.unmount()
  })
})
