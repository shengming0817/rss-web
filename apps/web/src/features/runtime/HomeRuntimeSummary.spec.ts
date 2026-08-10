import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createWebI18n } from '../../i18n'
import { runtimeApiPlugin } from './runtime-context'
import HomeRuntimeSummary from './HomeRuntimeSummary.vue'
import { decodeWireErrorForTest } from '@rss/api/testing'

const digest = `sha256:${'a'.repeat(64)}`
const response = {
  data: {
    schemaVersion: 1 as const,
    assemblyFingerprint: digest,
    runtimePlanFingerprint: digest,
    activatedWorkflows: [],
    domains: ['audit' as const],
    listeners: [],
    providerPosture: [{ id: 'ledger', state: 'unobserved' as const }],
    placements: [],
  },
}

function mountSummary(inventory: () => Promise<typeof response>) {
  return mount(HomeRuntimeSummary, {
    global: {
      plugins: [createWebI18n(), runtimeApiPlugin({ inventory })],
      stubs: { RouterLink: true },
    },
  })
}

describe('HomeRuntimeSummary', () => {
  it('shows reviewed facts without listener coordinates', async () => {
    const wrapper = mountSummary(async () => response)
    await flushPromises()
    expect(wrapper.text()).toContain(digest)
    expect(wrapper.text()).toContain('audit')
    expect(wrapper.text()).not.toContain('127.0.0.1')
    expect(wrapper.get('[data-source="rss"]')).toBeTruthy()
  })

  it('fails locally and retries only after a user action', async () => {
    const error = decodeWireErrorForTest(503, {
      error: {
        code: 'ERR_CORE_PROVIDER_UNAVAILABLE',
        message: 'raw backend secret',
        retryable: true,
        details: [],
        requestId: 'runtime-unavailable',
      },
    })
    const inventory = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(response)
    const wrapper = mountSummary(inventory)
    await flushPromises()
    expect(wrapper.get('[data-source="unavailable"]')).toBeTruthy()
    expect(wrapper.text()).not.toContain('raw backend secret')
    expect(wrapper.get('section.home-panel > header h2')).toBeTruthy()
    expect(wrapper.get('section.error-page h3')).toBeTruthy()
    expect(wrapper.get('section.error-page').attributes('aria-labelledby')).toBe(
      wrapper.get('section.error-page h3').attributes('id'),
    )
    expect(inventory).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-action="recover"]').trigger('click')
    await flushPromises()
    expect(inventory).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-source="rss"]')).toBeTruthy()
  })

  it('offers manual recovery for a transient read failure and aborts on unmount', async () => {
    let capturedSignal: AbortSignal | undefined
    const inventory = vi.fn(({ signal }: { signal?: AbortSignal } = {}) => {
      capturedSignal = signal
      return new Promise<typeof response>(() => undefined)
    })
    const wrapper = mountSummary(inventory)
    await flushPromises()
    expect(capturedSignal?.aborted).toBe(false)
    wrapper.unmount()
    expect(capturedSignal?.aborted).toBe(true)
  })
})
