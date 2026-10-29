import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createFeatureRouter as createRouter } from '../../../../tests/feature-router'
import { selectControl } from '../vuetify-test-controls'
import { mdmKey } from '../../../context'
import { mdmI18n } from '../../../i18n'
import DeploymentsView from './SoftwarePoliciesView.vue'
import SoftwareResourceSelect from '../../software/components/SoftwareResourceSelect.vue'
it.each([false, true])(
  'consumes exact software bindings and preserves write outcome (success=%s)',
  async (success) => {
    const scope = '11111111-1111-4111-8111-111111111111',
      admission = '22222222-2222-4222-8222-222222222222'
    const change = vi.fn(
      async (id: string, body: { input: { action: string; definition?: unknown } }) => {
        if (!success) throw new Error('response lost')
        return {
          id,
          revision: change.mock.calls.length,
          version: 1,
          versionId: scope,
          enabled: body.input.action !== 'disable',
          definition: body.input.definition ?? change.mock.calls[0]![1].input.definition,
        }
      },
    )
    const assignments = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
    const rollout = vi.fn().mockResolvedValue({
      asOf: 10,
      versionId: scope,
      stages: [
        {
          scope,
          opensAt: 10,
          minimumVerifiedPercent: null,
          open: true,
          totalTargets: 2,
          reported: 1,
          verifiedSuccess: 1,
          failed: 0,
          unknown: 1,
          waitingUser: 0,
          waitingReboot: 0,
          unsupportedCapability: 0,
        },
      ],
    })
    const run = {
      taskId: admission,
      device: 'device-01',
      registrationId: scope,
      generation: 2,
      availableAt: 10,
      deadline: 100,
      state: { delivery: { kind: 'queued' }, execution: 'pending', cancellation: 'none' },
      effect: 'unverified',
      userAction: null,
      result: null,
    }
    const runs = {
      list: vi.fn().mockResolvedValue({ items: [run], nextCursor: null }),
      read: vi.fn().mockResolvedValue(run),
    }
    const read = vi.fn(async (id: string) => ({
      id,
      revision: 1,
      version: 1,
      versionId: scope,
      enabled: true,
      definition: change.mock.calls[0]![1].input.definition,
    }))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: DeploymentsView }],
    })
    await router.push('/')
    const wrapper = mount(DeploymentsView, {
      attachTo: document.body,
      global: {
        plugins: [router, mdmI18n()],
        stubs: { RouterLink: true },
        provide: {
          [mdmKey as symbol]: {
            tenant: scope,
            session: {
              state: ref({
                status: 'authenticated',
                tenant: scope,
                identity: { principalId: scope },
                session: { id: scope },
              }),
            },
            demo: true,
            policies: {
              policies: {
                list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
                preview: vi
                  .fn()
                  .mockResolvedValue({ items: [], nextCursor: null, scopeResult: scope }),
                change,
                read,
                assignments,
              },
              runs,
              resources: {
                read: vi.fn().mockResolvedValue({
                  id: 'app',
                  kind: 'software',
                  versions: [
                    {
                      id: '1',
                      state: 'active',
                      variants: [
                        {
                          platform: 'windows',
                          architecture: 'x86_64',
                          key: 'main',
                          declaration: {
                            kind: 'software',
                            definition: {
                              source: { id: 'private', revision: '1', sha256: Array(32).fill(1) },
                              package: 'App',
                              version: '1',
                              provenance: { kind: 'private' },
                              artifacts: {
                                installer: {
                                  reference: 'installer',
                                  origin: null,
                                  length: 1,
                                  sha256: Array(32).fill(1),
                                },
                              },
                              material: { bundle_id: null, format: 'msi', installer: 'installer' },
                              behavior: {
                                kind: 'msi',
                                installer: 'installer',
                                scope: 'system',
                                install: {
                                  runAs: 'system',
                                  arguments: [],
                                  environment: {},
                                  timeoutSeconds: 60,
                                  outputBytes: 1024,
                                  exitCodes: { success: [0], reboot: [] },
                                },
                                upgradeInvocation: {
                                  runAs: 'system',
                                  arguments: [],
                                  environment: {},
                                  timeoutSeconds: 60,
                                  outputBytes: 1024,
                                  exitCodes: { success: [0], reboot: [] },
                                },
                                upgrade: 'in_place',
                                uninstall: null,
                                detect: {
                                  kind: 'msi_product',
                                  productCode: '{11111111-1111-4111-8111-111111111111}',
                                  version: '1',
                                },
                              },
                              signatures: [],
                              reboot: 'report',
                              downgrade: 'deny',
                              dependencies: [],
                              export: { kind: 'disabled' },
                            },
                          },
                        },
                      ],
                    },
                  ],
                }),
              },
            },
            software: {
              rollout: { read: rollout },
              lifecycle: {
                version: vi
                  .fn()
                  .mockResolvedValue({ lifecycle: { state: 'enabled', operation: admission } }),
              },
            },
          },
        },
      },
    })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '新建')!
      .trigger('click')
    await wrapper.get('#deployment-resource').setValue('app')
    await wrapper.get('[data-action="bind-version"]').trigger('click')
    await flushPromises()
    const picker = wrapper.findComponent(SoftwareResourceSelect)
    picker.vm.$emit('update:resource', 'another-app')
    picker.vm.$emit('change')
    await flushPromises()
    expect(wrapper.text()).not.toContain(admission)
    await wrapper.get('#deployment-resource').setValue('app')
    await wrapper.get('[data-action="bind-version"]').trigger('click')
    await flushPromises()
    expect(change).not.toHaveBeenCalled()
    if (success) {
      await wrapper.get('#deployment-version').setValue('1')
      await wrapper.get('[data-action="bind-version"]').trigger('click')
      await flushPromises()
      await selectControl(wrapper, '#variant-windows_x86_64').setValue('main')
      await selectControl(wrapper, '#deployment-intent').setValue('required_uninstall')
      await selectControl(wrapper, '#deployment-intent').setValue('required_install')
      await wrapper.get('[data-wizard-step="0"] input[type=checkbox]').setValue(false)
      await wrapper.get('[data-wizard-step="0"] input[type=checkbox]').setValue(true)
    }
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一步')!
      .trigger('click')
    await wrapper.get('#deployment-scope').setValue(scope)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一步')!
      .trigger('click')
    expect(wrapper.find('[data-field="stage-scope"]').exists()).toBe(false)
    if (success) {
      await selectControl(wrapper, '#deployment-rollout-mode').setValue('staged')
      await wrapper.get('[data-field="stage-scope"] input').setValue(scope)
      await wrapper.get('#deployment-lifetime').setValue(7200)
      await wrapper.get('[id$="-not-before"]').setValue('2027-01-01T00:00:00')
      await wrapper.get('#stage-0-at').setValue('2027-01-01T00:00:00')
      const click = async (text: string) => {
        await wrapper
          .findAll('button')
          .find((b) => b.text() === text)!
          .trigger('click')
        await flushPromises()
      }
      await click('增加阶段')
      await wrapper.get('#stage-1-scope').setValue(admission)
      await wrapper.get('#stage-1-at').setValue('2027-01-02T00:00:00')
      await wrapper.get('#stage-1-gate').setValue('')
      await wrapper.get('#stage-1-gate').setValue(95)
      await click('删除')
      expect(wrapper.find('#stage-1-scope').exists()).toBe(false)
      await click('增加阶段')
      await wrapper.get('#stage-1-scope').setValue(admission)
      await wrapper.get('#stage-1-gate').setValue(95)
    }
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '下一步')!
      .trigger('click')
    expect(change).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-form="deployment"] button[type=submit]').attributes('disabled'),
    ).toBeDefined()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '预览目标准入')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('[data-form="deployment"]').trigger('submit')
    await flushPromises()
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0]![1]).toMatchObject({
      expectedRevision: 0,
      input: {
        definition: {
          action: {
            delivery: { kind: 'direct' },
            resource: { id: 'app', version: '1', variants: { windows_x86_64: 'main' } },
          },
        },
      },
    })
    if (success) {
      expect(change.mock.calls[0]![1].input.definition).toMatchObject({
        action: {
          runLifetimeSeconds: 7200,
          rollout: {
            stages: [
              { scope, opensAt: 1798761600, minimumVerifiedPercent: null },
              { scope: admission, opensAt: 1798848000, minimumVerifiedPercent: 95 },
            ],
          },
        },
      })
      const click = async (text: string) => {
        const button = wrapper.findAll('button').find((b) => b.text() === text)
        expect(button, text).toBeDefined()
        await button!.trigger('click')
        await flushPromises()
      }
      await wrapper.get('[data-action="toggle-policy"]').trigger('click')
      await flushPromises()
      expect(change.mock.calls.at(-1)?.[1].input).toEqual({ action: 'disable' })
      await wrapper.get('[data-action="toggle-policy"]').trigger('click')
      await flushPromises()
      expect(change.mock.calls.at(-1)?.[1].input).toEqual({ action: 'enable' })
      await click('设备准入')
      expect(assignments).toHaveBeenCalledWith(change.mock.calls[0]![0], { cursor: undefined })
      await click('分批进度')
      expect(rollout).toHaveBeenCalledWith(change.mock.calls[0]![0])
      expect(wrapper.get('[role=progressbar][aria-valuenow]').attributes('aria-valuenow')).toBe(
        '50',
      )
      await click('运行历史')
      expect(runs.list).toHaveBeenCalledWith(change.mock.calls[0]![0], { cursor: undefined })
      await click('读取运行证据')
      expect(runs.read).toHaveBeenCalledWith(change.mock.calls[0]![0], admission)
      await click('编辑')
      await click('取消')
      await wrapper.get('[data-action="read-policy"]').trigger('click')
      await flushPromises()
      expect(read).toHaveBeenCalledWith(change.mock.calls[0]![0])
      wrapper.unmount()
      return
    }
    expect(change.mock.calls[0]![1].input.definition).toMatchObject({
      customEvent: null,
      alias: null,
      scope,
      action: {
        rollout: { stages: [{ scope, opensAt: expect.any(Number), minimumVerifiedPercent: null }] },
      },
    })
    await wrapper.get('[data-action="read-policy"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-form="deployment"] > fieldset').attributes('disabled')).toBeDefined()
    expect(change).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('同一操作')
    wrapper.unmount()
  },
)
