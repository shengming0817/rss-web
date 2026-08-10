import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { createPreviewAuthorizationPort } from '@rss/authorization/preview'
import type { AuthorizationIntent } from '@rss/authorization'
import type { IdentitySession } from '@rss/identity'
import AuthorizationHintGate from './AuthorizationHintGate.vue'
import {
  authorizationExperiencePlugin,
  createAuthorizationExperience,
} from './authorization-context'

const intent: AuthorizationIntent = {
  contractId: 'runtime.inventory',
  permission: 'runtime:read',
}
const otherIntent: AuthorizationIntent = {
  contractId: 'audit.list-entries',
  permission: 'audit:entries:read',
}

function mountGate(decision: 'allow' | 'deny' | 'unknown') {
  const port = createPreviewAuthorizationPort({
    enabled: true,
    scenarios: [
      { id: `${decision}-runtime`, intent, decision },
      { id: 'allow-audit', intent: otherIntent, decision: 'allow' },
    ],
  })
  const session = {
    getState: () => ({ status: 'anonymous' }),
    subscribe: () => () => undefined,
  } as unknown as IdentitySession
  const experience = createAuthorizationExperience({ port, session })
  let executeOperation: (<T>(operation: () => Promise<T>) => Promise<T>) | undefined
  const wrapper = mount(AuthorizationHintGate, {
    props: { intent },
    slots: {
      default: ({
        execute,
        hint,
      }: {
        execute: <T>(operation: () => Promise<T>) => Promise<T>
        hint: { source: { kind: string } }
      }) => {
        executeOperation = execute
        return h('button', { 'data-source': hint.source.kind }, 'request')
      },
      denied: '<p role="status">preview denied</p>',
      forbidden: '<p role="alert">server forbidden</p>',
    },
    global: { plugins: [authorizationExperiencePlugin(experience)] },
  })
  return {
    execute: <T>(operation: () => Promise<T>) => executeOperation!(operation),
    experience,
    wrapper,
  }
}

describe('AuthorizationHintGate', () => {
  it('fails closed when the composition root did not provide an experience', () => {
    expect(() => mount(AuthorizationHintGate, { props: { intent } })).toThrow(
      'Authorization experience provider is unavailable',
    )
  })

  it.each(['allow', 'unknown'] as const)(
    'keeps %s hints operable for real server checks',
    (decision) => {
      const { wrapper } = mountGate(decision)
      expect(wrapper.get('button').attributes('data-source')).toBe('preview')
    },
  )

  it('suppresses the operable slot for an explicitly denied Preview hint', () => {
    const { wrapper } = mountGate('deny')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('preview denied')
  })

  it('renders the final forbidden slot after a real server denial', async () => {
    const { experience, wrapper } = mountGate('allow')
    const forbidden = decodeWireErrorForTest(403, {
      error: {
        code: 'ERR_CORE_FORBIDDEN',
        message: 'must not render',
        retryable: false,
        details: [],
        requestId: 'request-id',
      },
    })

    await expect(experience.execute(intent, () => Promise.reject(forbidden))).rejects.toBe(
      forbidden,
    )
    await nextTick()

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe('server forbidden')
  })

  it('binds hint, outcome, and execution to an updated intent prop', async () => {
    const { execute, experience, wrapper } = mountGate('allow')
    await wrapper.setProps({ intent: otherIntent })
    const forbidden = decodeWireErrorForTest(403, {
      error: {
        code: 'ERR_CORE_FORBIDDEN',
        message: 'must not render',
        retryable: false,
        details: [],
        requestId: 'request-id',
      },
    })

    await expect(execute(() => Promise.reject(forbidden))).rejects.toBe(forbidden)
    await nextTick()

    expect(experience.getOutcome(intent)).toEqual({ status: 'idle' })
    expect(experience.getOutcome(otherIntent)).toMatchObject({ status: 'forbidden' })
    expect(wrapper.get('[role="alert"]').text()).toBe('server forbidden')
  })
})
