import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { RuntimeInventoryResponse } from '@rss/runtime'
import { networkErrorForTest } from '@rss/api/testing'
import { createWebI18n } from '../../i18n'
import { runtimeApiPlugin } from './runtime-context'
import RuntimeDetailsView from './RuntimeDetailsView.vue'

const digest = `sha256:${'a'.repeat(64)}`
const response: RuntimeInventoryResponse = {
  data: {
    schemaVersion: 1,
    assemblyFingerprint: digest,
    buildMetadata: { sourceRevision: 'b'.repeat(40), imageDigest: digest },
    runtimePlanFingerprint: digest,
    activatedWorkflows: [
      {
        mode: 'projection',
        id: 'audit-log',
        definitionVersion: 'v1',
        definitionSchemaDigest: digest,
        activation: 'shadow',
      },
    ],
    domains: ['identity', 'audit'],
    listeners: [{ id: 'admin-main', kind: 'admin', authScheme: 'rssAccessToken' }],
    providerPosture: [{ id: 'ledger', state: 'unobserved' }],
    placements: [{ domain: 'audit', workload: 'audit', mode: 'local', readiness: 'ready' }],
  },
}

function mountDetails(inventory = vi.fn(async () => response)) {
  return {
    inventory,
    wrapper: mount(RuntimeDetailsView, {
      global: { plugins: [createWebI18n(), runtimeApiPlugin({ inventory })] },
    }),
  }
}

describe('RuntimeDetailsView', () => {
  it('renders every reviewed fact group without deployment coordinates or copy actions', async () => {
    const { wrapper } = mountDetails()
    await flushPromises()
    expect(wrapper.get('h1').text()).toContain('运行时详情')
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      '版本与指纹',
      '领域',
      '监听器',
      'Provider 状态',
      '已激活工作流',
      'Placement',
    ])
    expect(wrapper.text()).toContain('unobserved')
    expect(wrapper.text()).toContain('rssAccessToken')
    expect(wrapper.text()).toContain('shadow')
    expect(wrapper.text()).toContain('launch 声明；浏览器未验证制品来源')
    expect(wrapper.text()).not.toContain('127.0.0.1')
    expect(wrapper.text()).not.toContain('spiffe://')
    expect(wrapper.find('[data-action="copy-runtime-coordinate"]').exists()).toBe(false)
    expect(wrapper.get('[data-source="rss"]')).toBeTruthy()
  })

  it('fails closed without stale facts and retries only after a user action', async () => {
    const inventory = vi
      .fn()
      .mockRejectedValueOnce(networkErrorForTest())
      .mockResolvedValueOnce(response)
    const { wrapper } = mountDetails(inventory)
    await flushPromises()
    expect(wrapper.text()).not.toContain(digest)
    expect(wrapper.text()).toContain('服务暂时不可用')
    await wrapper.get('[data-action="recover"]').trigger('click')
    await flushPromises()
    expect(inventory).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(digest)
  })

  it('aborts the active inventory read when leaving the view', async () => {
    let signal: AbortSignal | undefined
    const inventory = vi.fn(({ signal: next }: { signal?: AbortSignal } = {}) => {
      signal = next
      return new Promise<RuntimeInventoryResponse>(() => undefined)
    })
    const { wrapper } = mountDetails(inventory)
    await flushPromises()
    expect(signal?.aborted).toBe(false)
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
