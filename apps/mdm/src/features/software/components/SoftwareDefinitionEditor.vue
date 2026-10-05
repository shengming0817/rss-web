<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Artifact } from '../../policies/clients/resources'
import { decodeSoftwareDefinition } from '../../policies/clients/software-definition'
const { t } = useI18n(),
  id = useId()
const source = ref(''),
  sourceRevision = ref('1'),
  sourceDigest = ref(''),
  packageId = ref(''),
  version = ref('1')
const reboot = ref<'forbid' | 'report'>('report'),
  downgrade = ref(false),
  artifacts = ref('{}'),
  dependencies = ref('[]')
const invocation = {
  runAs: 'system',
  arguments: [],
  environment: {},
  timeoutSeconds: 3600,
  outputBytes: 16384,
  exitCodes: { success: [0], reboot: [3010] },
}
const behavior = ref(
  JSON.stringify(
    {
      kind: 'msi',
      installer: 'installer',
      scope: 'system',
      install: invocation,
      upgradeInvocation: invocation,
      upgrade: 'in_place',
      uninstall: null,
      detect: { kind: 'msi_product', productCode: '', version: '1' },
    },
    null,
    2,
  ),
)
const provenance = ref('{"kind":"private"}'),
  signatures = ref('[]'),
  exportDefinition = ref('{"kind":"disabled"}')
function validateJson(event: Event) {
  const input = event.target as HTMLTextAreaElement
  try {
    JSON.parse(input.value)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('software.invalid'))
  }
}
function read(artifact: Artifact) {
  return decodeSoftwareDefinition({
    source: {
      id: source.value,
      revision: sourceRevision.value,
      sha256: Array.from({ length: 32 }, (_, i) =>
        parseInt(sourceDigest.value.slice(i * 2, i * 2 + 2), 16),
      ),
    },
    package: packageId.value,
    version: version.value,
    artifacts: { ...JSON.parse(artifacts.value), installer: { ...artifact, origin: null } },
    behavior: JSON.parse(behavior.value),
    provenance: JSON.parse(provenance.value),
    signatures: JSON.parse(signatures.value),
    export: JSON.parse(exportDefinition.value),
    dependencies: JSON.parse(dependencies.value),
    reboot: reboot.value,
    downgrade: downgrade.value ? 'allow' : 'deny',
  })
}
defineExpose({ read })
</script>
<template>
  <fieldset>
    <legend>{{ t('software.definition') }}</legend>
    <p>{{ t('software.budget') }}</p>
    <label :for="`${id}-package`">{{ t('software.package') }}</label
    ><input :id="`${id}-package`" v-model="packageId" required />
    <label :for="`${id}-version`">{{ t('software.version') }}</label
    ><input :id="`${id}-version`" v-model="version" required />
    <p>{{ t('software.sourceHint') }}</p>
    <label :for="`${id}-source`">{{ t('software.source') }}</label
    ><input :id="`${id}-source`" v-model="source" required />
    <label :for="`${id}-source-revision`">{{ t('software.sourceRevision') }}</label
    ><input :id="`${id}-source-revision`" v-model="sourceRevision" required />
    <label :for="`${id}-source-digest`">{{ t('software.sourceDigest') }}</label
    ><input :id="`${id}-source-digest`" v-model="sourceDigest" pattern="[a-fA-F0-9]{64}" required />
    <label :for="`${id}-behavior`">{{ t('software.behavior') }}</label
    ><textarea :id="`${id}-behavior`" v-model="behavior" required @input="validateJson" />
    <p>{{ t('policies.selfService.identityHint') }}</p>
    <label :for="`${id}-provenance`">{{ t('software.provenance') }}</label
    ><textarea :id="`${id}-provenance`" v-model="provenance" required @input="validateJson" />
    <label :for="`${id}-signatures`">{{ t('software.signatures') }}</label
    ><textarea :id="`${id}-signatures`" v-model="signatures" required @input="validateJson" />
    <label :for="`${id}-export`">{{ t('software.exportDefinition') }}</label
    ><textarea :id="`${id}-export`" v-model="exportDefinition" required @input="validateJson" />
    <label :for="`${id}-artifacts`">{{ t('software.artifacts') }}</label
    ><textarea :id="`${id}-artifacts`" v-model="artifacts" required @input="validateJson" />
    <label :for="`${id}-dependencies`">{{ t('software.dependencies') }}</label
    ><textarea :id="`${id}-dependencies`" v-model="dependencies" required @input="validateJson" />
    <label :for="`${id}-reboot`">{{ t('software.reboot') }}</label
    ><select :id="`${id}-reboot`" v-model="reboot">
      <option value="report">{{ t('software.report') }}</option>
      <option value="forbid">{{ t('software.forbid') }}</option>
    </select>
    <label><input v-model="downgrade" type="checkbox" />{{ t('software.downgrade') }}</label>
  </fieldset>
</template>
