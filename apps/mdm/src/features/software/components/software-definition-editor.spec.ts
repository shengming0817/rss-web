import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { mdmI18n } from '../../../i18n'
import { softwareIdentity } from '../../policies/clients/software-definition'
import SoftwareDefinitionEditor from './SoftwareDefinitionEditor.vue'
it('assembles the actual canonical material and preserves resource-owned invocation identity after a corrected JSON error', async () => {
  const wrapper = mount(SoftwareDefinitionEditor, { global: { plugins: [mdmI18n()] } })
  await wrapper.get('input[id$="-package"]').setValue('Private.App')
  await wrapper.get('input[id$="-source"]').setValue('private-source')
  await wrapper.get('input[id$="-source-digest"]').setValue('01'.repeat(32))
  const input = wrapper.get('textarea[id$="-behavior"]')
  const behavior = JSON.parse((input.element as HTMLTextAreaElement).value)
  behavior.detect.productCode = '{11111111-1111-4111-8111-111111111111}'
  behavior.scope = 'user'
  behavior.install.runAs = behavior.upgradeInvocation.runAs = 'logged_in_user'
  await input.setValue('{')
  const artifact = { reference: 'file', length: 1, sha256: Array<number>(32).fill(1) }
  expect(() => wrapper.vm.read(artifact)).toThrow()
  expect((input.element as HTMLTextAreaElement).validity.customError).toBe(true)
  await input.setValue(JSON.stringify(behavior))
  expect((input.element as HTMLTextAreaElement).validity.valid).toBe(true)
  const material = wrapper.vm.read(artifact)
  expect(material).toMatchObject({
    source: { id: 'private-source', revision: '1' },
    package: 'Private.App',
    provenance: { kind: 'private' },
    artifacts: { installer: { ...artifact, origin: null } },
    behavior,
    export: { kind: 'disabled' },
  })
  expect(softwareIdentity(material)).toEqual({
    runAs: 'logged_in_user',
    scope: 'user',
    deployment: null,
  })
  await input.setValue(JSON.stringify({ ...behavior, kind: 'unknown' }))
  expect(() => wrapper.vm.read(artifact)).toThrow()
  wrapper.unmount()
})
