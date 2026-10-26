import { it, expect } from 'vitest'
import { defineComponent } from 'vue'
import { identityRouter } from './router'
import { fixture, TENANT } from '../tests/support'
it('injects Vuetify-compatible views without replacing the existing session owner', () => {
  const f = fixture(),
    login = defineComponent({ template: '<form/>' }),
    error = defineComponent({ template: '<p/>' })
  const host = {
    path: '/login',
    tenant: TENANT,
    brand: 'DA',
    descriptionKey: 'identity.login',
    origin: 'https://example.test',
    switchHref: '/login',
    switchLabelKey: 'identity.login',
  }
  const router = identityRouter(f.session, [], host, { login, error, includeManagement: false })
  expect(router.getRoutes().find((r) => r.name === 'login')?.components?.['default']).toBe(login)
  expect(router.getRoutes().find((r) => r.name === 'resume')?.components?.['default']).toBe(login)
  expect(router.getRoutes().find((r) => r.name === 'error')?.components?.['default']).toBe(error)
  expect(router.getRoutes().some((r) => r.name === 'accounts')).toBe(false)
  expect(
    identityRouter(f.session)
      .getRoutes()
      .some((r) => r.name === 'accounts'),
  ).toBe(true)
})
