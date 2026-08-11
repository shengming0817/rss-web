import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { PolicyView } from '@rss/identity'
import { createWebI18n } from '../../i18n'
import PolicyEditor from './PolicyEditor.vue'

const snapshot = {
  policyId: 'policy-edit' as never,
  version: 7 as never,
  contractId: 'identity.policies-get',
  permission: 'identity:policy:read',
  effectiveFrom: 1_700_000_000,
  rules: [
    {
      condition: {
        attribute: 'principal.kind',
        operator: {
          family: 'membership',
          predicate: 'in',
          operand: { kind: 'set', valueType: 'string', values: ['a,b', 'c'] },
        },
      },
      effect: 'allow',
    },
  ],
} satisfies PolicyView

describe('PolicyEditor', () => {
  it('builds a strictly parsed create command only after local validation', async () => {
    const wrapper = mount(PolicyEditor, {
      props: { mode: 'create' },
      global: { plugins: [createWebI18n()] },
    })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('policy-create')
    await inputs[1]!.setValue('identity.policies-list')
    await inputs[2]!.setValue('identity:policy:read')
    await inputs[3]!.setValue('1700000000')
    await inputs[5]!.setValue('principal.kind')
    await inputs[6]!.setValue('user')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('prepare')?.[0]?.[0]).toMatchObject({
      action: 'create',
      request: { policyId: 'policy-create', effectiveFrom: 1_700_000_000 },
    })
  })

  it('retains set element boundaries and captures the decoded CAS version', async () => {
    const wrapper = mount(PolicyEditor, {
      props: { mode: 'update', snapshot },
      global: { plugins: [createWebI18n()] },
    })
    expect(
      wrapper
        .findAll('.policy-editor__set input')
        .map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['a,b', 'c'])
    expect(wrapper.text()).not.toContain('expectedVersion')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('prepare')?.[0]?.[0]).toMatchObject({
      action: 'update',
      policyId: 'policy-edit',
      request: { expectedVersion: 7 },
    })
  })

  it('announces an invalid draft and disables all actions while busy', async () => {
    const wrapper = mount(PolicyEditor, {
      props: { mode: 'create', busy: true },
      global: { plugins: [createWebI18n()] },
    })
    expect(wrapper.get('form').attributes('aria-busy')).toBe('true')
    expect(
      wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
    await wrapper.setProps({ busy: false })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('contractId')
    const invalid = wrapper.get('[data-field-path="contractId"]')
    expect(invalid.attributes('aria-invalid')).toBe('true')
    expect(invalid.attributes('aria-describedby')).toBe(
      wrapper.get('[role="alert"]').attributes('id'),
    )
    expect(wrapper.emitted('prepare')).toBeUndefined()
  })

  it('associates a dynamic typed-operand error with the first invalid control', async () => {
    const wrapper = mount(PolicyEditor, {
      attachTo: document.body,
      props: { mode: 'update', snapshot },
      global: { plugins: [createWebI18n()] },
    })
    const values = wrapper.findAll('.policy-editor__set input')
    await values[1]!.setValue('a,b')
    await wrapper.get('form').trigger('submit')
    const invalid = wrapper.get('[data-field-path="rules.0.values.1"]')
    expect(invalid.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(invalid.element)
    expect(wrapper.get('[role="alert"]').text()).toContain('rules.0.values.1')
    expect(wrapper.emitted('prepare')).toBeUndefined()
    wrapper.unmount()
  })
})
