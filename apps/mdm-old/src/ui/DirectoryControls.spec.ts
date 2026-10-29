import { it, expect, vi } from 'vitest'
import { reactive, ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import { mdmI18n } from '../i18n'
import DirectoryControls from './DirectoryControls.vue'
it('connects domain-owned draft edits and explicit navigation without submitting a parent form', async () => {
  const draft = reactive({ filter: '', sort: '', fields: ['id'], limit: 50 })
  const query = {
    draft,
    columns: ['id', 'name'],
    maximum: 100,
    trail: ref([undefined] as (string | undefined)[]),
    next: ref<string | null>('YQ'),
    previous: computed<string | undefined>(() => undefined),
    navigate: vi.fn(),
    updateDraft: (v: Partial<typeof draft>) => Object.assign(draft, v),
  }
  const i18n = mdmI18n(),
    w = mount(DirectoryControls, { props: { query }, global: { plugins: [i18n] } })
  const inputs = w.findAll('input')
  await inputs[0]!.setValue("name=icontains='abc'")
  await inputs[1]!.setValue('-name')
  await inputs[2]!.setValue(1)
  await w.get('select').setValue(['id', 'name'])
  expect(draft).toEqual({
    filter: "name=icontains='abc'",
    sort: '-name',
    limit: 1,
    fields: ['id', 'name'],
  })
  for (const label of ['应用查询', '首页 / 重新查询', '上一页', '下一页'])
    await w
      .findAll('button')
      .find((b) => b.text() === label)!
      .trigger('click')
  expect(w.emitted('load')).toEqual([[], [undefined], [undefined], ['YQ']])
  expect(query.navigate).toHaveBeenCalledTimes(3)
  i18n.global.locale.value = 'en-US'
  await w.setProps({ busy: true })
  expect(w.text()).toContain('Filter expression')
  w.unmount()
})
