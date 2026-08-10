import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationPort } from '@rss/authorization'
import type { IdentitySession, VerifiedProfile } from '@rss/identity'
import type { RuntimeInventoryResponse } from '@rss/runtime'
import { decodeWireErrorForTest, networkErrorForTest } from '@rss/api/testing'
import { createWebI18n } from '../../i18n'
import {
  authorizationExperiencePlugin,
  createAuthorizationExperience,
} from '../authorization/authorization-context'
import { runtimeApiPlugin } from './runtime-context'
import { RUNTIME_INVENTORY_INTENT } from './runtime-intent'
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

const profile = {
  subject: 'subject-a',
  tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  kind: 'admin',
} as VerifiedProfile

function authorizationFixture(port: AuthorizationPort = createServerAuthorizationPort()) {
  const session = {
    getState: () => ({
      status: 'authenticated',
      profile,
      sessionExpiresAt: 2,
      accessExpiresAt: 1,
    }),
    subscribe: () => () => undefined,
  } as unknown as IdentitySession
  return createAuthorizationExperience({ port, session })
}

function mountDetails(
  inventory = vi.fn(async () => response),
  authorization = authorizationFixture(),
) {
  return {
    authorization,
    inventory,
    wrapper: mount(RuntimeDetailsView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          runtimeApiPlugin({ inventory }),
          authorizationExperiencePlugin(authorization),
        ],
      },
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
    expect(wrapper.find('main').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps retry focus while pending and moves it to the loaded page heading', async () => {
    let resolveRetry!: (value: RuntimeInventoryResponse) => void
    const inventory = vi
      .fn()
      .mockRejectedValueOnce(networkErrorForTest())
      .mockImplementationOnce(
        () =>
          new Promise<RuntimeInventoryResponse>((resolve) => {
            resolveRetry = resolve
          }),
      )
    const { wrapper } = mountDetails(inventory)
    await flushPromises()
    expect(wrapper.text()).not.toContain(digest)
    expect(wrapper.text()).toContain('服务暂时不可用')
    const recovery = wrapper.get('[data-action="recover"]')
    ;(recovery.element as HTMLButtonElement).focus()
    await recovery.trigger('click')
    expect(wrapper.get('[data-action="recover"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-action="recover"]').attributes('aria-busy')).toBe('true')
    expect(document.activeElement).toBe(recovery.element)
    resolveRetry(response)
    await flushPromises()
    expect(inventory).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain(digest)
    expect(document.activeElement).toBe(wrapper.get('h1').element)
    wrapper.unmount()
  })

  it('records an exact server forbidden outcome through the shared authorization owner', async () => {
    const port = createPreviewAuthorizationPort({
      enabled: true,
      scenarios: [
        {
          id: 'runtime-preview-allow',
          intent: RUNTIME_INVENTORY_INTENT,
          decision: 'allow',
        },
      ],
    })
    const authorization = authorizationFixture(port)
    const forbidden = decodeWireErrorForTest(403, {
      error: {
        code: 'ERR_CORE_FORBIDDEN',
        message: 'must never render',
        retryable: false,
        details: [],
        requestId: 'runtime-denied',
      },
    })
    const { wrapper } = mountDetails(vi.fn().mockRejectedValue(forbidden), authorization)
    await flushPromises()
    expect(authorization.getOutcome(RUNTIME_INVENTORY_INTENT)).toEqual({
      status: 'forbidden',
      requestId: 'runtime-denied',
    })
    expect(authorization.getHint(RUNTIME_INVENTORY_INTENT)).toMatchObject({
      decision: 'unknown',
    })
    expect(wrapper.text()).toContain('访问被拒绝')
    expect(wrapper.text()).not.toContain('must never render')
    wrapper.unmount()
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
