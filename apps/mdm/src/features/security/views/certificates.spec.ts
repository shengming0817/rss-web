import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import CertificatesView from './CertificatesView.vue'
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  source = { registrationId: other, generation: 1, source: 'mdm.windows' },
  credential = {
    serial: 'SYNTHETIC-1',
    fingerprint: 'SYNTHETIC-2',
    subject: 'CN=Synthetic',
    notBefore: 90,
    notAfter: 200,
  },
  certificate = {
    id,
    revision: 1,
    device: 'device-01',
    profile: {
      id: other,
      name: 'Synthetic certificate',
      platform: 'windows',
      protocol: 'scep',
      issuer: 'Synthetic CA',
      purpose: 'device_identity',
    },
    source,
    issuance: null,
    installed: { credential, source, observedAt: 100 },
    validity: 'expiring',
    evaluatedAt: 100,
  }
async function setup(certificates: object, requests: object = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: CertificatesView }],
  })
  await router.push({ path: '/', query: { id } })
  const wrapper = mount(CertificatesView, {
    global: {
      plugins: [router, mdmI18n()],
      stubs: { RouterLink: true },
      provide: {
        [mdmKey as symbol]: { tenant: id, demo: true, security: { certificates, requests } },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}
it('keeps an unknown issuance frozen across reads and refreshes after its historical receipt', async () => {
  const read = vi.fn().mockResolvedValue({ certificate, asOf: 100 }),
    issue = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue({ certificate, asOf: 100 }),
    { wrapper } = await setup({ read, issue })
  await wrapper.get('[data-testid="issue-certificate"]').trigger('click')
  await flushPromises()
  const frozen = structuredClone(issue.mock.calls[0]![1])
  read.mockResolvedValue({
    certificate: {
      ...certificate,
      revision: 2,
      issuance: {
        operation: frozen.operationId,
        state: 'unknown',
        requestedAt: 100,
        resultAt: 101,
        credential: null,
      },
    },
    asOf: 101,
  })
  await wrapper.get('[data-testid="refresh-certificate"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="issue-certificate"]').attributes('disabled')).toBeDefined()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '重放同一操作')!
    .trigger('click')
  await flushPromises()
  expect(issue.mock.calls[1]![1]).toEqual(frozen)
  expect(wrapper.get('[data-testid="certificate-issuance"]').text()).toContain('未知')
  expect(wrapper.get('[data-testid="certificate-validity"]').text()).toContain('即将到期')
  wrapper.unmount()
})
it('pins deployment to the issued fingerprint and fences certificate responses after navigation', async () => {
  const issued = {
      ...certificate,
      revision: 3,
      issuance: {
        operation: other,
        state: 'issued',
        requestedAt: 98,
        resultAt: 99,
        credential: { ...credential, fingerprint: 'SYNTHETIC-new' },
      },
    },
    read = vi.fn().mockResolvedValue({ certificate: issued, asOf: 100 }),
    create = vi.fn().mockResolvedValue({ request: { id: other } }),
    { wrapper, router } = await setup({ read }, { create })
  await wrapper.get('[data-testid="deploy-certificate"]').trigger('click')
  await wrapper.get('textarea').setValue('Deploy the new synthetic credential')
  await wrapper.get('[data-testid="certificate-request"]').trigger('submit')
  await flushPromises()
  expect(create.mock.calls[0]![0].input.target).toEqual({
    kind: 'certificate_deploy',
    device: 'device-01',
    certificate: id,
    certificateRevision: 3,
    fingerprint: 'SYNTHETIC-new',
  })
  let finish!: (value: unknown) => void
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await wrapper.get('[data-testid="refresh-certificate"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('[data-testid="certificate-detail"]').exists()).toBe(false)
  read.mockResolvedValue({ certificate: { ...issued, id: other, device: 'device-02' }, asOf: 100 })
  await router.push({ path: '/', query: { id: other } })
  await flushPromises()
  finish({ certificate: issued, asOf: 100 })
  await flushPromises()
  expect(wrapper.get('[data-testid="certificate-detail"] h2').text()).toBe('device-02')
  wrapper.unmount()
})
