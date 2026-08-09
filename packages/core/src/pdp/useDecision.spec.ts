import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, ref, defineComponent, provide } from 'vue'
import { mount } from '@vue/test-utils'
import type { PdpClient } from './types'
import { PDP_INJECTION_KEY } from './types'
import { useDecision, _resetWarnFlagForTesting } from './useDecision'

// useDecision consumes only can(); decide() is required by the PdpClient type
// but unused in these tests, so a constant stub keeps the literals type-complete.
const decide: PdpClient['decide'] = () => Promise.resolve({ effect: 'allow', reasonCode: '' })

/**
 * Vue's provide/inject is parent→child only.
 * We need Outer (provides) → Inner (injects via useDecision).
 * To capture the result from Inner, we use a closure ref.
 */
function createDecisionTest(
  providerClient: PdpClient | null,
  makeAction: () => string | (() => string),
  makeResource?: () => string | undefined | (() => string | undefined),
) {
  let result: ReturnType<typeof useDecision> | undefined

  const Inner = defineComponent({
    name: 'Inner',
    setup() {
      const action = makeAction()
      const resource = makeResource ? makeResource() : undefined
      result = useDecision(
        typeof action === 'function' ? action : () => action,
        typeof resource === 'function'
          ? resource
          : resource !== undefined
            ? () => resource
            : undefined,
      )
      return {}
    },
    template: '<div></div>',
  })

  const Outer = defineComponent({
    name: 'Outer',
    components: { Inner },
    setup() {
      if (providerClient) {
        provide(PDP_INJECTION_KEY, providerClient)
      }
      return {}
    },
    template: '<Inner />',
  })

  mount(Outer, { attachTo: document.body })
  return result!
}

/** Filter warns to only those from our code (not Vue runtime warns) */
function getOurWarns(warnSpy: ReturnType<typeof vi.spyOn>) {
  return warnSpy.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].includes('gocell/core'),
  )
}

describe('useDecision', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Reset module-level warn-once flag so each test starts clean
    _resetWarnFlagForTesting()
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('no provider (fail-closed)', () => {
    it('returns false when no PDP provider is injected', () => {
      const result = createDecisionTest(
        null,
        () => 'read',
        () => 'resource:*',
      )
      expect(result.value).toBe(false)
    })

    it('emits a console.warn (from our code) when no PDP provider is injected', () => {
      createDecisionTest(null, () => 'read')
      const ourWarns = getOurWarns(warnSpy)
      expect(ourWarns.length).toBeGreaterThan(0)
      expect(ourWarns[0]![0]).toContain('PDP')
    })

    it('warns only during setup, not on subsequent .value access', () => {
      const result = createDecisionTest(null, () => 'read')
      const warnCountAfterMount = getOurWarns(warnSpy).length
      // Access multiple times — should not produce more warns
      void result.value
      void result.value
      void result.value
      expect(getOurWarns(warnSpy).length).toBe(warnCountAfterMount)
    })
  })

  describe('with mock provider returning true', () => {
    it('returns true when provider.can() returns a computed true', () => {
      const client: PdpClient = {
        can: () => computed(() => true),
        decide,
      }
      const result = createDecisionTest(
        client,
        () => 'write',
        () => 'resource:123',
      )
      expect(result.value).toBe(true)
    })
  })

  describe('with mock provider returning false', () => {
    it('returns false when provider.can() returns a computed false', () => {
      const client: PdpClient = {
        can: () => computed(() => false),
        decide,
      }
      const result = createDecisionTest(
        client,
        () => 'delete',
        () => 'resource:456',
      )
      expect(result.value).toBe(false)
    })
  })

  describe('reactive action/resource', () => {
    it('recomputes when action getter changes', async () => {
      const action = ref('denied-action')
      const client: PdpClient = {
        can: (a) => computed(() => a === 'allowed-action'),
        decide,
      }

      let result: ReturnType<typeof useDecision> | undefined

      const Inner = defineComponent({
        name: 'InnerReactiveAction',
        setup() {
          result = useDecision(() => action.value)
          return {}
        },
        template: '<div></div>',
      })

      const Outer = defineComponent({
        name: 'OuterReactiveAction',
        components: { Inner },
        setup() {
          provide(PDP_INJECTION_KEY, client)
          return {}
        },
        template: '<Inner />',
      })

      mount(Outer, { attachTo: document.body })
      expect(result!.value).toBe(false)

      action.value = 'allowed-action'
      await Promise.resolve()
      expect(result!.value).toBe(true)
    })

    it('recomputes when resource getter changes', async () => {
      const resource = ref('res:denied')
      const client: PdpClient = {
        can: (_action, res) => computed(() => res === 'res:allowed'),
        decide,
      }

      let result: ReturnType<typeof useDecision> | undefined

      const Inner = defineComponent({
        name: 'InnerReactiveResource',
        setup() {
          result = useDecision('read', () => resource.value)
          return {}
        },
        template: '<div></div>',
      })

      const Outer = defineComponent({
        name: 'OuterReactiveResource',
        components: { Inner },
        setup() {
          provide(PDP_INJECTION_KEY, client)
          return {}
        },
        template: '<Inner />',
      })

      mount(Outer, { attachTo: document.body })
      expect(result!.value).toBe(false)

      resource.value = 'res:allowed'
      await Promise.resolve()
      expect(result!.value).toBe(true)
    })

    it('does not emit our warn when provider is present', () => {
      const client: PdpClient = {
        can: () => computed(() => true),
        decide,
      }
      createDecisionTest(client, () => 'read')
      const ourWarns = getOurWarns(warnSpy)
      expect(ourWarns.length).toBe(0)
    })
  })
})
