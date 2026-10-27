import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { expect, it, onTestFinished, vi } from 'vitest'
import { VCombobox, VSelect, VSwitch, VTextField } from 'vuetify/components'
import { mdmKey } from '../../src/context'
import { mdmI18n } from '../../src/i18n'
import { demoKey } from '../context'
import { TENANT } from '../scenario'
import { fixtureIds } from './state'
import { registerDemoSoftwareAssetRoutes } from './routes'
import { softwareAssetsHttp } from './test-support'
async function fixture(section = 'assets') {
  const http = await softwareAssetsHttp(),
    router = createRouter({ history: createMemoryHistory(), routes: [] })
  registerDemoSoftwareAssetRoutes(router)
  router.addRoute({
    path: `/tenants/:tenant/software`,
    component: defineComponent({ render: () => h('div', 'Available resources') }),
  })
  await router.push(`/tenants/${TENANT}/software/${section}`)
  const runtime = {
    tenant: TENANT,
    transport: http.transport,
    session: {
      state: ref({
        status: 'authenticated',
        tenant: TENANT,
        identity: { principalId: '22222222-2222-4222-8222-222222222222' },
        session: { id: crypto.randomUUID() },
      }),
    },
  }
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router, mdmI18n()],
      provide: { [mdmKey as symbol]: runtime, [demoKey as symbol]: runtime },
    },
  })
  onTestFinished(() => wrapper.unmount())
  await vi.waitFor(() => expect(wrapper.text()).toContain('Acme Editor'))
  return { ...http, wrapper, router }
}
function field(w: VueWrapper, label: string) {
  const fields = [
    ...w.findAllComponents(VSelect),
    ...w.findAllComponents(VCombobox),
    ...w.findAllComponents(VSwitch),
    ...w.findAllComponents(VTextField),
  ]
  const value = fields.find((field) => field.props().label === label)
  if (!value) throw new Error(`Missing visible field ${label}`)
  return value
}
function click(label: string, root: ParentNode = document) {
  const target = [...root.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (!target) throw new Error(`Missing visible button ${label}`)
  if (target.disabled) throw new Error(`Disabled visible button ${label}`)
  target.click()
}
const row = (w: VueWrapper, name: string) =>
  w.findAll('tbody tr').find((row) => row.text().includes(name))!
it('browses complete asset pages and original device evidence, then queries same-item filters with a separate fixed assessment', async () => {
  const { wrapper } = await fixture()
  expect(wrapper.text()).toContain('MOCK 演示')
  expect(wrapper.findAll('select')).toHaveLength(0)
  await vi.waitFor(() => expect(row(wrapper, 'Acme Editor').findAll('td')[2]!.text()).toBe('2'))
  click('设备与证据')
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('user:501'),
  )
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain('user:502')
  expect(dialog.textContent).toContain('device.software.windows.win32')
  click('下一页', dialog)
  await vi.waitFor(() => expect(dialog.textContent).toContain('B · Design Mac'))
  expect(dialog.textContent).toContain('超出允许范围')
  click('关闭详情', dialog)
  await field(wrapper, '软件名称/标识').setValue('plugin')
  await field(wrapper, '版本（可选精确）').setValue('2.0')
  expect(wrapper.text()).toContain('筛选已变化')
  click('查询安装资产')
  await vi.waitFor(() => expect(row(wrapper, 'Acme Editor').findAll('td')[2]!.text()).toBe('0'))
  expect(row(wrapper, 'Acme Editor').text()).toContain('固定范围确认安装设备: 2 / 2')
}, 15_000)
it('edits risk, tags, thresholds, allowed groups and mappings through Vuetify and changes the linked query results', async () => {
  const { wrapper, router } = await fixture('standards')
  click('编辑')
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  await field(wrapper, '名称').setValue('Acme Workspace')
  await field(wrapper, '风险等级').setValue('low')
  await field(wrapper, '分类标记').setValue(['approved'])
  await field(wrapper, '启用数量预警').setValue(false)
  await field(wrapper, '允许安装的设备组（并集）').setValue([fixtureIds.pending])
  click('保存')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Acme Workspace'))
  expect(row(wrapper, 'Acme Workspace').text()).toContain('低')
  await router.push(`/tenants/${TENANT}/software/assets`)
  await vi.waitFor(() =>
    expect(row(wrapper, 'Acme Workspace')?.text()).toContain('允许范围无法判断'),
  )
  expect(row(wrapper, 'Acme Workspace').text()).toContain('预警关闭')
  await router.push(`/tenants/${TENANT}/software/mappings`)
  await vi.waitFor(() => expect(wrapper.text()).toContain('acme.editor.plugin'))
  click('新建映射')
  await nextTick()
  await field(wrapper, '标准软件').setValue(fixtureIds.utilities)
  await field(wrapper, '原生/包标识（精确）').setValue('acme.editor.plugin')
  await field(wrapper, '发布者（精确）').setValue('Acme')
  click('保存')
  await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(5))
  await router.push(`/tenants/${TENANT}/software/assets`)
  await vi.waitFor(() => expect(row(wrapper, 'Acme Workspace')?.text()).toContain('预警关闭'))
  click('下一页')
  await vi.waitFor(() => expect(wrapper.text()).toContain('acme.editor.plugin'))
  expect(row(wrapper, 'acme.editor.plugin').text()).toContain('冲突')
}, 15_000)
it('keeps original-write recovery reachable after a lost response and removes stale data on forbidden reads', async () => {
  const { wrapper, scenario } = await fixture('standards')
  click('编辑')
  await nextTick()
  await field(wrapper, '名称').setValue('Committed original')
  scenario.set('unknown')
  click('保存')
  await vi.waitFor(() => expect(wrapper.text()).toContain('写入结果未知'))
  expect(
    [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '新建标准软件',
    )?.disabled,
  ).toBe(true)
  scenario.set('normal')
  click('核实原操作')
  await vi.waitFor(() => expect(wrapper.text()).toContain('原操作已核实'))
  await vi.waitFor(() => expect(row(wrapper, 'Committed original')).toBeDefined())
  expect(wrapper.text()).not.toContain('请求失败')
  scenario.set('forbidden')
  click('重新读取配置')
  await vi.waitFor(() => expect(wrapper.text()).toContain('没有读取权限'))
  expect(wrapper.text()).not.toContain('Committed original')
}, 15_000)

it.each(['unknown', 'conflict'] as const)(
  'exposes original-write recovery after a %s mapping write from asset evidence',
  async (failure) => {
    const { wrapper, scenario } = await fixture()
    click('设备与证据')
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('user:501'),
    )
    click('新建映射', document.querySelector('[role="dialog"]')!)
    await nextTick()
    scenario.set(failure)
    click('保存')
    const recovery = failure === 'unknown' ? '核实原操作' : '重新读取并编辑'
    await vi.waitFor(() => expect(wrapper.text()).toContain(recovery))
    expect(
      wrapper.findAllComponents({ name: 'VDialog' }).some((dialog) => dialog.props('modelValue')),
    ).toBe(false)
    scenario.set('normal')
    click(recovery)
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(failure === 'unknown' ? '原操作已核实' : 'Acme Editor'),
    )
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === '查询安装资产',
        )?.disabled,
      ).toBe(false),
    )
  },
  15_000,
)
