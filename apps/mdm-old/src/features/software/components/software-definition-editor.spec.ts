import { selectControl } from '../../policies/vuetify-test-controls'
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
  await wrapper.get('input[id$="-version"]').setValue('2')
  await wrapper.get('input[id$="-source-revision"]').setValue('3')
  await wrapper.get('textarea[id$="-provenance"]').setValue('{"kind":"private"}')
  await wrapper
    .get('textarea[id$="-signatures"]')
    .setValue(
      JSON.stringify([
        { artifact: 'installer', mechanism: 'authenticode', publisher: 'Private Publisher' },
      ]),
    )
  await wrapper.get('textarea[id$="-export"]').setValue(
    JSON.stringify({
      kind: 'winget',
      locale: 'en-US',
      name: 'Private App',
      publisher: 'Private Publisher',
      description: 'Managed application',
      license: 'Proprietary',
    }),
  )
  await wrapper.get('textarea[id$="-artifacts"]').setValue(
    JSON.stringify({
      metadata: {
        reference: 'metadata',
        length: 2,
        sha256: Array<number>(32).fill(2),
        origin: null,
      },
    }),
  )
  await wrapper
    .get('textarea[id$="-dependencies"]')
    .setValue(
      JSON.stringify([{ resource: 'dependency', version: '2', sha256: Array<number>(32).fill(2) }]),
    )
  await wrapper
    .get('textarea[id$="-material"]')
    .setValue('{"bundle_id":"private.app","format":"msi","installer":"installer"}')
  await selectControl(wrapper, '[id$="-reboot"]').setValue('forbid')
  await wrapper.get('input[type=checkbox]').setValue(true)
  const material = wrapper.vm.read(artifact)
  expect(material).toMatchObject({
    source: { id: 'private-source', revision: '3' },
    version: '2',
    reboot: 'forbid',
    downgrade: 'allow',
    signatures: [
      { artifact: 'installer', mechanism: 'authenticode', publisher: 'Private Publisher' },
    ],
    dependencies: [{ resource: 'dependency', version: '2', sha256: Array<number>(32).fill(2) }],
    package: 'Private.App',
    provenance: { kind: 'private' },
    artifacts: { installer: { ...artifact, origin: null } },
    behavior,
    export: { kind: 'winget', name: 'Private App', publisher: 'Private Publisher' },
    material: { bundle_id: 'private.app', format: 'msi', installer: 'installer' },
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
