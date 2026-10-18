import { mount } from '@vue/test-utils'
import { reactive, type Component } from 'vue'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import ScheduleEditor from './ScheduleEditor.vue'
import WorkflowStepEditor from './WorkflowStepEditor.vue'
import SelfServiceEditor from './SelfServiceEditor.vue'
import { defaultSchedule, initialSelfService, nativeSchedule, selfService } from '../clients/model'
import { decodeSchedule, type Schedule } from '../clients/schedule'
import type { WorkflowStep } from '../clients/workflows'
import { catalog } from '../../../../demo/devices/fixtures'
it('edits a native schedule with explicit UTC bounds, weekly window and missed-trigger policy', async () => {
  const model = reactive(defaultSchedule()),
    w = mount(NativeScheduleEditor, {
      props: { modelValue: model },
      global: { plugins: [mdmI18n()] },
    })
  await w.get('[id$="-not-before"]').setValue('2026-01-01T00:00:00')
  await w.get('[data-field=until-enabled]').setValue(true)
  await w.get('[id$="-until"]').setValue('2026-12-01T00:00:00')
  await w.get('[id$="-trigger"]').setValue('once')
  await w.get('[id$="-at"]').setValue('2026-04-01T12:00:00')
  await w.get('[id$="-trigger"]').setValue('interval')
  await w.get('[id$="-anchor"]').setValue('2026-01-01T00:00:00')
  await w.get('[id$="-seconds"]').setValue(7200)
  await w.get('[id$="-trigger"]').setValue('check_in')
  await w.get('[id$="-minimum"]').setValue(120)
  await w.get('[id$="-trigger"]').setValue('registration')
  expect(model.trigger).toEqual({ kind: 'registration' })
  await w.get('[id$="-trigger"]').setValue('weekly')
  await w.get('[id$="-zone"]').setValue('Asia/Shanghai')
  await w.get('[id$="-weekday"]').setValue(2)
  await w.get('[id$="-minute"]').setValue(90)
  await w.get('[id$="-jitter"]').setValue(15)
  await w.get('[data-field=misfire]').setValue('skip')
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
  await w.get('[data-field=until-enabled]').setValue(false)
  expect(model.until).toBeNull()
  await w.get('[data-field=misfire]').setValue('coalesce_one')
  expect(model.misfire).toEqual({ kind: 'coalesce_one' })
  w.unmount()
})
it('keeps the workflow schedule finite and serializes edited calendar fields', async () => {
  const model = reactive<Schedule>({
    trigger: { kind: 'manual' },
    notBefore: 1767225600,
    until: 1796083200,
    jitterSeconds: 0,
    misfire: 'skip',
    window: null,
  })
  const w = mount(ScheduleEditor, {
    props: { modelValue: model },
    global: { plugins: [mdmI18n()] },
  })
  await w.get('[id$="-trigger"]').setValue('once')
  await w.get('[id$="-at"]').setValue('2026-04-01T00:00:00')
  await w.get('[id$="-trigger"]').setValue('interval')
  await w.get('[id$="-anchor"]').setValue('2026-01-01T00:00:00')
  await w.get('[id$="-seconds"]').setValue(7200)
  await w.get('[id$="-trigger"]').setValue('check_in')
  await w.get('[id$="-minimum"]').setValue(120)
  await w.get('[id$="-trigger"]').setValue('registration')
  await w.get('[id$="-trigger"]').setValue('weekly')
  await w.get('[id$="-zone"]').setValue('UTC')
  await w.get('[id$="-weekday"]').setValue(3)
  await w.get('[id$="-minute"]').setValue(200)
  await w.get('[id$="-not-before"]').setValue('2026-01-01T00:00:00')
  await w.get('[id$="-until"]').setValue('2026-12-01T00:00:00')
  await w.get('[id$="-jitter"]').setValue(5)
  await w.get('[id$="-misfire"]').setValue('coalesce_one')
  await w.get('input[type=checkbox]').setValue(true)
  await w.get('[id$="-window-zone"]').setValue('UTC')
  await w.get('[id$="-window-start"]').setValue(120)
  await w.get('[id$="-window-end"]').setValue(300)
  await w.findAll('input[type=checkbox]').at(-1)!.setValue(true)
  expect(decodeSchedule(model)).toMatchObject({
    trigger: { kind: 'weekly', weekday: 3, minute: 200 },
    jitterSeconds: 5,
    misfire: 'coalesce_one',
    window: { startMinute: 120, endMinute: 300, weekdays: [1, 2, 3, 4, 5, 7] },
  })
  w.unmount()
})
it('edits explicit self-service access, descriptions and human/AI confirmation policy without losing metadata', async () => {
  const model = reactive(initialSelfService()),
    w = mount(SelfServiceEditor, {
      props: { modelValue: model },
      global: { plugins: [mdmI18n()], stubs: { SelfServiceSelectors: true } },
    })
  await w.get('[data-field=published]').setValue(true)
  await w.get('[data-field=access]').setValue('users')
  expect(model.access).toEqual({ kind: 'users', selectors: [] })
  await w.get('[data-field=access]').setValue('authenticated_user')
  await w.get('[data-field=displayName]').setValue('Diagnostic request')
  await w.get('[id$="-description"]').setValue('Investigate device health')
  await w.get('[id$="-prerequisites"]').setValue('Logged in')
  await w.get('[id$="-effects"]').setValue('Collects diagnostic output')
  await w.get('[data-field=category]').setValue('Support')
  await w.get('[id$="-keywords"]').setValue(' health \n diagnostics \n')
  await w.get('[data-field=allowAi]').setValue(false)
  await w.get('[data-field=riskLevel]').setValue(1)
  expect(selfService(model)).toMatchObject({
    published: true,
    access: { kind: 'authenticated_user' },
    displayName: 'Diagnostic request',
    description: 'Investigate device health',
    prerequisites: 'Logged in',
    sideEffects: 'Collects diagnostic output',
    category: 'Support',
    keywords: ['health', 'diagnostics'],
    allowAi: false,
    riskLevel: 1,
  })
  await w.get('[data-field=published]').setValue(false)
  expect(model.published).toBe(false)
  w.unmount()
})
it('edits workflow native and script inputs while invalid JSON cannot replace the last valid parameters', async () => {
  const model = reactive<WorkflowStep>({
    id: crypto.randomUUID(),
    name: 'Step',
    action: { kind: 'approval' },
    condition: null,
    onFailure: 'stop',
  })
  const w = mount(WorkflowStepEditor as Component, {
    props: { modelValue: model, fields: catalog },
    global: { plugins: [mdmI18n()] },
  })
  await w.get('[id$="-name"]').setValue('Read details')
  await w.get('[id$="-kind"]').setValue('configuration')
  await w.get('[id$="-configuration"]').setValue('configuration')
  await w.get('[id$="-version"]').setValue(2)
  expect(model.action).toEqual({
    kind: 'configuration',
    configuration: 'configuration',
    version: 2,
  })
  await w.get('[id$="-kind"]').setValue('script')
  await w.get('[id$="-resource"]').setValue('script')
  await w.get('[id$="-version"]').setValue('2')
  await w.get('[id$="-variant"]').setValue('win')
  await w.get('[id$="-parameters"]').setValue('{"mode":"safe"}')
  await w.get('[id$="-parameters"]').setValue('{broken')
  expect(model.action).toMatchObject({
    kind: 'script',
    resource: 'script',
    version: '2',
    variant: 'win',
    parameters: { mode: 'safe' },
  })
  expect((w.get('[id$="-parameters"]').element as HTMLTextAreaElement).validationMessage).not.toBe(
    '',
  )
  await w.get('[id$="-kind"]').setValue('query')
  await w.get('[id$="-sql"]').setValue('SELECT version FROM os_version;')
  await w
    .findAll('button')
    .find((b) => b.text() === '添加字段映射')!
    .trigger('click')
  await w.get('[id$="-field-0"]').setValue(catalog[0]!.key)
  await w.get('[id$="-pointer-0"]').setValue('/0/version')
  await w.get('[id$="-failure"]').setValue('continue')
  expect(model).toMatchObject({
    action: {
      kind: 'query',
      sql: 'SELECT version FROM os_version;',
      mappings: [{ field: catalog[0]!.key, pointer: '/0/version' }],
    },
    onFailure: 'continue',
  })
  w.unmount()
})
