import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createServerAuthorizationPort } from '@rss/authorization'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationPort } from '@rss/authorization'
import type { IdentitySession, VerifiedProfile } from '@rss/identity'
import { decodeWireErrorForTest, networkErrorForTest } from '@rss/api/testing'
import { createWebI18n } from '../../i18n'
import {
  authorizationExperiencePlugin,
  createAuthorizationExperience,
} from '../authorization/authorization-context'
import { auditApiPlugin } from './audit-context'
import { auditTenantIntent } from './audit-intent'
import AuditEntriesView from './AuditEntriesView.vue'

const tenant = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const entry = (seq: number, action = `action-${seq}`) => ({
  seq,
  tenantId: `sensitive-tenant-${seq}`,
  actor: `sensitive-actor-${seq}`,
  actorKind: 'user',
  action,
  resourceKind: 'entry',
  resourceId: `sensitive-resource-${seq}`,
  outcome: 'success',
  recordedAt: 1_800_000_000 + seq,
  entryHash: `opaque-${seq}`,
})
const profile = { subject: 'subject', tenantId: tenant, kind: 'user' } as VerifiedProfile

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

function mountView({
  listEntries = vi.fn().mockResolvedValue({ data: [entry(1)], hasMore: false }),
  listTenantEntries = vi.fn().mockResolvedValue({ data: [entry(2)], hasMore: false }),
  authorization = authorizationFixture(),
} = {}) {
  return {
    authorization,
    listEntries,
    listTenantEntries,
    wrapper: mount(AuditEntriesView, {
      attachTo: document.body,
      global: {
        plugins: [
          createWebI18n(),
          auditApiPlugin({ listEntries, listTenantEntries }),
          authorizationExperiencePlugin(authorization),
        ],
      },
    }),
  }
}

describe('AuditEntriesView', () => {
  it('loads ambient once and waits for explicit target submission', async () => {
    const { listEntries, listTenantEntries, wrapper } = mountView()
    await flushPromises()
    expect(listEntries).toHaveBeenCalledOnce()
    expect(listTenantEntries).not.toHaveBeenCalled()
    expect(wrapper.html()).not.toContain('sensitive-actor-1')

    await wrapper.get('[data-field="target-tenant"]').setValue(tenant)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listTenantEntries).toHaveBeenCalledOnce()
    expect(listTenantEntries).toHaveBeenCalledWith(
      tenant,
      expect.objectContaining({ limit: 25, signal: expect.any(AbortSignal) }),
    )
    expect(listTenantEntries.mock.calls[0]?.[1]).not.toHaveProperty('cursor')
    expect(wrapper.text()).toContain('action-2')
    wrapper.unmount()
  })

  it('rejects a non-canonical or nil target before authorization and transport', async () => {
    const { listTenantEntries, wrapper } = mountView()
    await flushPromises()
    for (const value of [
      'F47AC10B-58CC-4372-A567-0E02B2C3D479',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      await wrapper.get('[data-field="target-tenant"]').setValue(value)
      await wrapper.get('form').trigger('submit')
    }
    await flushPromises()
    expect(listTenantEntries).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('requires one user action for each target page and coalesces a double next click', async () => {
    let resolveNext!: (value: unknown) => void
    const listTenantEntries = vi
      .fn()
      .mockResolvedValueOnce({ data: [entry(2)], hasMore: true, nextCursor: 'opaque-next' })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = resolve
          }),
      )
    const { wrapper } = mountView({ listTenantEntries })
    await flushPromises()
    await wrapper.get('[data-field="target-tenant"]').setValue(tenant)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const next = wrapper.get('[data-action="next-target-audit"]')
    ;(next.element as HTMLElement).focus()
    await next.trigger('click')
    await next.trigger('click')
    expect(listTenantEntries).toHaveBeenCalledTimes(2)
    resolveNext({ data: [entry(3)], hasMore: false })
    await flushPromises()
    expect(wrapper.text()).toContain('action-2')
    expect(wrapper.text()).toContain('action-3')
    expect(wrapper.text()).toContain('已加载最后一页审计条目。')
    expect(document.activeElement).toBe(wrapper.get('#target-audit-title').element)
    wrapper.unmount()
  })

  it('keeps ambient recovery focused while pending and moves focus to the panel after success', async () => {
    let resolveRetry!: (value: unknown) => void
    const listEntries = vi
      .fn()
      .mockRejectedValueOnce(networkErrorForTest())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve
          }),
      )
    const { wrapper } = mountView({ listEntries })
    await flushPromises()
    const ambient = wrapper.get('[data-section="ambient-audit"]')
    const recover = ambient.get('[data-action="recover"]')
    ;(recover.element as HTMLElement).focus()
    await recover.trigger('click')
    expect(document.activeElement).toBe(recover.element)
    expect(recover.attributes('disabled')).toBeDefined()
    expect(recover.attributes('aria-busy')).toBe('true')
    resolveRetry({ data: [entry(1)], hasMore: false })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#ambient-audit-title').element)
    expect(ambient.text()).toContain('已加载最后一页审计条目。')
    wrapper.unmount()
  })

  it('moves focus to the target panel after an explicit next-page failure', async () => {
    const listTenantEntries = vi
      .fn()
      .mockResolvedValueOnce({ data: [entry(2)], hasMore: true, nextCursor: 'next' })
      .mockRejectedValueOnce(networkErrorForTest())
    const { wrapper } = mountView({ listTenantEntries })
    await flushPromises()
    await wrapper.get('[data-field="target-tenant"]').setValue(tenant)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const next = wrapper.get('[data-action="next-target-audit"]')
    ;(next.element as HTMLElement).focus()
    await next.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('#target-audit-title').element)
    expect(wrapper.get('[data-section="target-audit"]').text()).toContain('NETWORK_ERROR')
    wrapper.unmount()
  })

  it('records a target-bound final 403, clears target rows, and offers no retry fallback', async () => {
    const intent = auditTenantIntent(tenant)
    const port = createPreviewAuthorizationPort({
      enabled: true,
      scenarios: [{ id: 'target-allow', intent, decision: 'allow' }],
    })
    const authorization = authorizationFixture(port)
    const forbidden = decodeWireErrorForTest(403, {
      error: {
        code: 'ERR_CORE_FORBIDDEN',
        message: 'raw target denial',
        retryable: false,
        details: [],
        requestId: 'target-denied',
      },
    })
    const listTenantEntries = vi.fn().mockRejectedValue(forbidden)
    const { wrapper } = mountView({ authorization, listTenantEntries })
    await flushPromises()
    await wrapper.get('[data-field="target-tenant"]').setValue(tenant)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(authorization.getOutcome(intent)).toEqual({
      status: 'forbidden',
      requestId: 'target-denied',
    })
    const target = wrapper.get('[data-section="target-audit"]')
    expect(target.text()).toContain('ERR_CORE_FORBIDDEN')
    expect(target.text()).not.toContain('raw target denial')
    expect(target.find('[data-action="recover"]').exists()).toBe(false)
    expect(listTenantEntries).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not automatically retry an uncertain target network outcome', async () => {
    const listTenantEntries = vi.fn().mockRejectedValue(networkErrorForTest())
    const { wrapper } = mountView({ listTenantEntries })
    await flushPromises()
    await wrapper.get('[data-field="target-tenant"]').setValue(tenant)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(listTenantEntries).toHaveBeenCalledOnce()
    expect(
      wrapper.get('[data-section="target-audit"]').find('[data-action="recover"]').exists(),
    ).toBe(false)
    wrapper.unmount()
  })
})
