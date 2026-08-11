import { flushPromises, mount } from '@vue/test-utils'
import type { SettingsApi } from '@rss/settings'
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
})
