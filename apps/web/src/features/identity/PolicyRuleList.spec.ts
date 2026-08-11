import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { PolicyView } from '@rss/identity'
import { createWebI18n } from '../../i18n'
import PolicyRuleList from './PolicyRuleList.vue'

describe('PolicyRuleList', () => {
  it('exposes operator discriminants, effect and obligations without evaluating them', () => {
    const policy = {
      policyId: 'policy' as never,
      version: 1 as never,
      contractId: 'contract',
      permission: 'permission',
      effectiveFrom: 1,
      rules: [
        {
          condition: {
            attribute: 'principal.kind',
            operator: {
              family: 'equality',
              predicate: 'eq',
              operand: { kind: 'attribute', valueType: 'string', attribute: 'principal.kind' },
            },
          },
          effect: 'allow',
          obligations: { rowScope: 'tenant', fieldMask: ['subject'] },
        },
      ],
    } satisfies PolicyView
    const wrapper = mount(PolicyRuleList, {
      props: { policy },
      global: { plugins: [createWebI18n()] },
    })
    for (const value of [
      'principal.kind',
      'equality',
      'eq',
      'attribute',
      'string',
      'allow',
      'tenant',
      'subject',
    ]) {
      expect(wrapper.text()).toContain(value)
    }
    expect(wrapper.html()).not.toContain('v-html')
  })

  it('preserves typed set element boundaries', () => {
    const policy = {
      policyId: 'policy' as never,
      version: 1 as never,
      contractId: 'contract',
      permission: 'permission',
      effectiveFrom: 1,
      rules: [
        {
          condition: {
            attribute: 'resource.tags',
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
    const wrapper = mount(PolicyRuleList, {
      props: { policy },
      global: { plugins: [createWebI18n()] },
    })

    expect(wrapper.findAll('.policy-set li').map((item) => item.text())).toEqual(['a,b', 'c'])
  })
})
