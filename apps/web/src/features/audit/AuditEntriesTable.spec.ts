import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { AuditEntry } from '@rss/audit'
import { createWebI18n } from '../../i18n'
import AuditEntriesTable from './AuditEntriesTable.vue'

const entry: AuditEntry = {
  seq: 7,
  tenantId: 'sensitive-tenant',
  actor: 'sensitive-actor',
  actorKind: 'admin',
  action: 'audit:list-cross-tenant',
  resourceKind: 'tenant',
  resourceId: 'sensitive-resource',
  outcome: 'success',
  recordedAt: 1_800_000_000,
  entryHash: 'opaque-fingerprint',
}

describe('AuditEntriesTable', () => {
  it('renders safe facts and opaque hash while keeping projected sensitive fields hidden', async () => {
    const wrapper = mount(AuditEntriesTable, {
      props: { rows: [entry] },
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.text()).toContain('audit:list-cross-tenant')
    expect(wrapper.text()).toContain('opaque-fingerprint')
    expect(wrapper.text()).toContain('浏览器未验证')
    expect(wrapper.html()).not.toContain('sensitive-tenant')
    expect(wrapper.html()).not.toContain('sensitive-actor')
    expect(wrapper.html()).not.toContain('sensitive-resource')
    expect(wrapper.find('[data-action="export-audit"]').exists()).toBe(false)

    await wrapper.findAll('[data-action="reveal-sensitive"]')[1]!.trigger('click')
    expect(wrapper.text()).toContain('sensitive-actor')
    expect(wrapper.html()).not.toContain('sensitive-tenant')
    expect(wrapper.html()).not.toContain('sensitive-resource')
  })
})
