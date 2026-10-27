import { selectControl } from '../vuetify-test-controls'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import SelfServiceEditor from './SelfServiceEditor.vue'
import ScriptDefinitionEditor from './ScriptDefinitionEditor.vue'
import type { ScriptSpec } from '../clients/resources'
import { defaultSchedule, initialSelfService, nativeSchedule, selfService } from '../clients/model'
it('edits a native schedule with explicit UTC bounds, weekly window and missed-trigger policy', async () => {
  const model = reactive(defaultSchedule()),
    w = mount(NativeScheduleEditor, {
      attachTo: document.body,
      props: { modelValue: model },
      global: { plugins: [mdmI18n()] },
    })
  await w.get('[id$="-not-before"]').setValue('2026-01-01T00:00:00')
  await w.get('[data-field=until-enabled] input').setValue(true)
  await w.get('[id$="-until"]').setValue('2026-12-01T00:00:00')
  await selectControl(w, '[id$="-trigger"]').setValue('once')
  await w.get('[id$="-at"]').setValue('2026-04-01T12:00:00')
  await selectControl(w, '[id$="-trigger"]').setValue('interval')
  await w.get('[id$="-anchor"]').setValue('2026-01-01T00:00:00')
  await w.get('[id$="-seconds"]').setValue(7200)
  await selectControl(w, '[id$="-trigger"]').setValue('check_in')
  await w.get('[id$="-minimum"]').setValue(120)
  await selectControl(w, '[id$="-trigger"]').setValue('registration')
  expect(model.trigger).toEqual({ kind: 'registration' })
  await selectControl(w, '[id$="-trigger"]').setValue('weekly')
  await w.get('[id$="-zone"]').setValue('Asia/Shanghai')
  await w.get('[id$="-weekday"]').setValue(2)
  await w.get('[id$="-minute"]').setValue(90)
  await w.get('[id$="-jitter"]').setValue(15)
  await selectControl(w, '[data-field=misfire]').setValue('skip')
  await w.get('[id$="-lateness"]').setValue(90)
  await w.findAll('input[type=checkbox]')[1]!.setValue(true)
  await w.get('[id$="-window-zone"]').setValue('Asia/Shanghai')
  await w.get('[id$="-window-start"]').setValue(1380)
  await w.get('[id$="-window-end"]').setValue(60)
  await w.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  expect(nativeSchedule(model)).toMatchObject({
    trigger: { kind: 'weekly', zone: 'Asia/Shanghai', weekday: 2, minute: 90 },
    misfire: { kind: 'skip', maxLatenessSeconds: 90 },
    jitterSeconds: 15,
    window: { startMinute: 1380, endMinute: 60, weekdays: [1, 2, 3, 4, 5, 7] },
  })
  await w.get('[data-field=until-enabled] input').setValue(false)
  expect(model.until).toBeNull()
  await selectControl(w, '[data-field=misfire]').setValue('coalesce_one')
  expect(model.misfire).toEqual({ kind: 'coalesce_one' })
  w.unmount()
})
it('edits explicit self-service access, descriptions and human/AI confirmation policy without losing metadata', async () => {
  const model = reactive(initialSelfService()),
    w = mount(SelfServiceEditor, {
      attachTo: document.body,
      props: { modelValue: model },
      global: { plugins: [mdmI18n()], stubs: { SelfServiceSelectors: true } },
    })
  await w.get('[data-field=published] input').setValue(true)
  await selectControl(w, '[data-field=access]').setValue('users')
  expect(model.access).toEqual({ kind: 'users', selectors: [] })
  await selectControl(w, '[data-field=access]').setValue('authenticated_user')
  await w.get('[data-field=displayName] input').setValue('Diagnostic request')
  await w.get('[id$="-description"]').setValue('Investigate device health')
  await w.get('[id$="-prerequisites"]').setValue('Logged in')
  await w.get('[id$="-effects"]').setValue('Collects diagnostic output')
  await w.get('[data-field=category] input').setValue('Support')
  await w.get('[id$="-keywords"]').setValue(' health \n diagnostics \n')
  await w.get('[data-field=allowAi] input').setValue(false)
  await selectControl(w, '[data-field=riskLevel]').setValue(1)
  expect(selfService(model)).toMatchObject({
    published: true,
    access: { kind: 'authenticated_user' },
    presentation: {
      displayName: 'Diagnostic request',
      description: 'Investigate device health',
      prerequisites: 'Logged in',
      sideEffects: 'Collects diagnostic output',
      category: 'Support',
      keywords: ['health', 'diagnostics'],
    },
    allowAi: false,
    riskLevel: 1,
  })
  await w.get('[data-field=published] input').setValue(false)
  expect(model.published).toBe(false)
  w.unmount()
})

it('validates native JSON fields through the script editor component root before a version is saved', async () => {
  const model: ScriptSpec = {
    profile: 'power_shell7',
    sql: null,
    runAs: 'system',
    encoding: 'utf8',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    bindings: {},
    output: { type: 'object', properties: {}, additionalProperties: false },
    purpose: { kind: 'action' },
    timeoutSeconds: 60,
    outputBytes: 16384,
    maxRows: 1,
  }
  const w = mount(ScriptDefinitionEditor, {
    attachTo: document.body,
    props: { modelValue: model },
    global: { plugins: [mdmI18n()] },
  })
  try {
    expect(w.vm.valid()).toBe(true)
    const parameters = w.get('textarea[id$="-parameters"]')
    await parameters.setValue('{')
    expect(w.vm.valid()).toBe(false)
    await parameters.setValue(JSON.stringify(model.parameters))
    expect(w.vm.valid()).toBe(true)
  } finally {
    w.unmount()
  }
})
