<script setup lang="ts">
const props = defineProps<{ disabled?: boolean }>()
import { VCheckbox, VSelect, VTextField, VTextarea } from 'vuetify/components'
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
const material = ref('{"bundle_id":null,"format":"msi","installer":"installer"}')
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
    material: JSON.parse(material.value),
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
    <VTextField
      :id="`${id}-package`"
      v-model="packageId"
      :label="t('software.package')"
      required
      :disabled="props.disabled"
    />
    <VTextField
      :id="`${id}-version`"
      v-model="version"
      :label="t('software.version')"
      required
      :disabled="props.disabled"
    />
    <p>{{ t('software.sourceHint') }}</p>
    <VTextField
      :id="`${id}-source`"
      v-model="source"
      :label="t('software.source')"
      required
      :disabled="props.disabled"
    />
    <VTextField
      :id="`${id}-source-revision`"
      v-model="sourceRevision"
      :label="t('software.sourceRevision')"
      required
      :disabled="props.disabled"
    />
    <VTextField
      :id="`${id}-source-digest`"
      v-model="sourceDigest"
      :label="t('software.sourceDigest')"
      pattern="[a-fA-F0-9]{64}"
      required
      :disabled="props.disabled"
    />
    <VTextarea
      :id="`${id}-behavior`"
      v-model="behavior"
      :label="t('software.behavior')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <p>{{ t('policies.selfService.identityHint') }}</p>
    <VTextarea
      :id="`${id}-provenance`"
      v-model="provenance"
      :label="t('software.provenance')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VTextarea
      :id="`${id}-signatures`"
      v-model="signatures"
      :label="t('software.signatures')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VTextarea
      :id="`${id}-export`"
      v-model="exportDefinition"
      :label="t('software.exportDefinition')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VTextarea
      :id="`${id}-artifacts`"
      v-model="artifacts"
      :label="t('software.artifacts')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VTextarea
      :id="`${id}-dependencies`"
      v-model="dependencies"
      :label="t('software.dependencies')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VTextarea
      :id="`${id}-material`"
      v-model="material"
      :label="t('software.material')"
      required
      auto-grow
      :disabled="props.disabled"
      @input="validateJson"
    />
    <VSelect
      :id="`${id}-reboot`"
      v-model="reboot"
      :label="t('software.reboot')"
      :items="[
        { title: t('software.report'), value: 'report' },
        { title: t('software.forbid'), value: 'forbid' },
      ]"
      :disabled="props.disabled"
    />
    <VCheckbox v-model="downgrade" :label="t('software.downgrade')" :disabled="props.disabled" />
  </fieldset>
</template>
