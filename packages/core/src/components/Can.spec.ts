import { describe, it, expect } from 'vitest'
import { computed, ref, defineComponent, provide, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { PdpClient } from '../pdp/types'
import { PDP_INJECTION_KEY } from '../pdp/types'
import { _resetWarnFlagForTesting } from '../pdp/useDecision'
import Can from './Can.vue'

// Can consumes only can(); decide() is required by the PdpClient type but
// unused in these tests, so a constant stub keeps the literals type-complete.
const decide: PdpClient['decide'] = () => Promise.resolve({ effect: 'allow', reasonCode: '' })

function makeMockClient(allowed: boolean): PdpClient {
  return {
    can: () => computed(() => allowed),
    decide,
  }
}

/**
 * Mount Can inside a Wrapper that optionally provides PdpClient.
 * Can's provide/inject works via Wrapper → Can (parent → child).
 *
 * NOTE: Can.vue itself calls `useDecision` which calls `inject`.
 * For inject to find the provider, the provider must be a parent component.
 * The Wrapper acts as that parent here.
 */
function mountCanDirect(opts: {
  action: string
  resource?: string
  mode?: 'hide' | 'disable'
  clientAllowed: boolean
  noProvider?: boolean
}) {
  const { action, resource, mode, clientAllowed, noProvider = false } = opts

  const Wrapper = defineComponent({
    setup() {
      if (!noProvider) {
        provide(PDP_INJECTION_KEY, makeMockClient(clientAllowed))
      }
      return { action, resource, mode }
    },
    components: { Can },
    template: `
      <Can :action="action" :resource="resource" :mode="mode">
        <template #default="{ allowed }">
          <span data-testid="content" :data-allowed="String(allowed)">content</span>
        </template>
        <template #denied>
          <span data-testid="denied">denied fallback</span>
        </template>
      </Can>
    `,
  })

  return mount(Wrapper, { attachTo: document.body })
}

describe('Can.vue', () => {
  describe('mode=hide (default)', () => {
    it('renders default slot when allowed=true', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: true })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    })

    it('does not render default slot when allowed=false', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: false })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)
    })

    it('renders #denied slot when allowed=false and denied slot is provided', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: false })
      expect(wrapper.find('[data-testid="denied"]').exists()).toBe(true)
    })

    it('does not render #denied slot when allowed=true', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: true })
      expect(wrapper.find('[data-testid="denied"]').exists()).toBe(false)
    })
  })

  describe('mode=disable', () => {
    it('always renders the default slot content', () => {
      const wrapper = mountCanDirect({ action: 'write', clientAllowed: false, mode: 'disable' })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    })

    it('wraps with aria-disabled="true" when denied', () => {
      const wrapper = mountCanDirect({ action: 'write', clientAllowed: false, mode: 'disable' })
      const disabled = wrapper.find('[aria-disabled="true"]')
      expect(disabled.exists()).toBe(true)
    })

    it('does not have aria-disabled when allowed', () => {
      const wrapper = mountCanDirect({ action: 'write', clientAllowed: true, mode: 'disable' })
      const disabled = wrapper.find('[aria-disabled="true"]')
      expect(disabled.exists()).toBe(false)
    })

    it('applies inert attribute when denied', () => {
      const wrapper = mountCanDirect({ action: 'write', clientAllowed: false, mode: 'disable' })
      const inert = wrapper.find('[inert]')
      expect(inert.exists()).toBe(true)
    })
  })

  describe('scoped slot passes allowed', () => {
    it('passes allowed=true to scoped slot when allowed', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: true })
      const content = wrapper.find('[data-testid="content"]')
      expect(content.attributes('data-allowed')).toBe('true')
    })

    it('passes allowed=false to scoped slot when denied (mode=disable)', () => {
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: false, mode: 'disable' })
      const content = wrapper.find('[data-testid="content"]')
      expect(content.attributes('data-allowed')).toBe('false')
    })
  })

  describe('fail-closed (no provider)', () => {
    it('defaults to denied (not rendered in hide mode) when no provider', () => {
      const Wrapper = defineComponent({
        components: { Can },
        template: `
          <Can action="read">
            <template #default><span data-testid="content">content</span></template>
          </Can>
        `,
      })
      const wrapper = mount(Wrapper, { attachTo: document.body })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)
    })
  })

  describe('props', () => {
    it('accepts resource prop', () => {
      const wrapper = mountCanDirect({ action: 'read', resource: 'cell:123', clientAllowed: true })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    })

    it('defaults mode to hide', () => {
      // Without explicit mode, denied means hidden
      const wrapper = mountCanDirect({ action: 'read', clientAllowed: false })
      expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)
    })
  })

  describe('reactive allowed transition', () => {
    it('transitions from denied to allowed when client computed changes from false to true', async () => {
      // Reset warn-once flag so no-provider tests in other suites don't interfere
      _resetWarnFlagForTesting()

      const allowedRef = ref(false)

      // Client whose can() returns a computed backed by allowedRef
      const client: PdpClient = {
        can: () => computed(() => allowedRef.value),
        decide,
      }

      const Wrapper = defineComponent({
        setup() {
          provide(PDP_INJECTION_KEY, client)
          return {}
        },
        components: { Can },
        template: `
          <Can action="read" mode="disable">
            <template #default="{ allowed }">
              <span data-testid="content" :data-allowed="String(allowed)">content</span>
            </template>
          </Can>
        `,
      })

      const wrapper = mount(Wrapper, { attachTo: document.body })

      // Initially denied — inert container should be present
      expect(wrapper.find('[inert]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="content"]').attributes('data-allowed')).toBe('false')

      // Flip to allowed
      allowedRef.value = true
      await nextTick()

      // inert container should be gone; content rendered directly
      expect(wrapper.find('[inert]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="content"]').attributes('data-allowed')).toBe('true')
    })
  })
})
