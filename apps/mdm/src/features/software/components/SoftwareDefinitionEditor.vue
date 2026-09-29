<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Artifact } from '../../policies/clients/resources'
import {
  decodeSoftwareDefinition,
  softwareFormats,
} from '../../policies/clients/software-definition'
const { t } = useI18n(),
  id = useId()
const format = ref<(typeof softwareFormats)[number]>('msi'),
  source = ref(''),
  sourceRevision = ref('1'),
  sourceDigest = ref(''),
  packageId = ref(''),
  version = ref('1'),
  reboot = ref<'forbid' | 'report'>('report'),
  downgrade = ref(false),
  ownership = ref(false),
  detection = ref<'msi_product' | 'pkg_receipt' | 'script'>('msi_product'),
  detectIdentity = ref(''),
  detectVersion = ref('1'),
  artifacts = ref('{}'),
  dependencies = ref('[]'),
  bundle = ref('{}')
const command = {
  executor: 'msi',
  entry: null,
  runAs: 'system',
  arguments: [],
  environment: {},
  timeoutSeconds: 3600,
  outputBytes: 16384,
}
const install = ref(JSON.stringify(command, null, 2)),
  uninstall = ref('null'),
  detectCommand = ref(
    JSON.stringify({ ...command, executor: 'power_shell7', entry: 'detect' }, null, 2),
  )
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
    format: format.value,
    primary: 'installer',
    artifacts: { ...JSON.parse(artifacts.value), installer: { ...artifact, origin: null } },
    install: JSON.parse(install.value),
    uninstall: JSON.parse(uninstall.value),
    detect:
      detection.value === 'script'
        ? { kind: 'script', command: JSON.parse(detectCommand.value) }
        : {
            kind: detection.value,
            ...(detection.value === 'msi_product'
              ? { productCode: detectIdentity.value }
              : { receipt: detectIdentity.value }),
            version: detectVersion.value,
          },
    reboot: reboot.value,
    downgrade: downgrade.value ? 'allow' : 'deny',
    ownership: ownership.value ? 'allow_user_existing' : 'managed_only',
    dependencies: JSON.parse(dependencies.value),
    bundle: format.value === 'bundle' ? JSON.parse(bundle.value) : null,
  })
}
defineExpose({ read })
</script>
<template>
  <fieldset>
    <legend>{{ t('software.definition') }}</legend>
    <p>{{ t('software.budget') }}</p>
    <label :for="`${id}-format`">{{ t('software.format') }}</label>
    <select :id="`${id}-format`" v-model="format">
      <option v-for="item in softwareFormats" :key="item" :value="item">
        {{ item === 'bundle' ? 'RSS ZIP' : item }}
      </option>
    </select>
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
    <p>{{ t('software.commandHint') }}</p>
    <label :for="`${id}-install`">{{ t('software.install') }}</label
    ><textarea :id="`${id}-install`" v-model="install" required @input="validateJson" />
    <label :for="`${id}-uninstall`">{{ t('software.uninstall') }}</label
    ><textarea :id="`${id}-uninstall`" v-model="uninstall" required @input="validateJson" />
    <label :for="`${id}-detection`">{{ t('software.detection') }}</label
    ><select :id="`${id}-detection`" v-model="detection">
      <option
        v-for="item in ['msi_product', 'pkg_receipt', 'script'] as const"
        :key="item"
        :value="item"
      >
        {{ t(`software.${item}`) }}
      </option>
    </select>
    <template v-if="detection !== 'script'"
      ><label :for="`${id}-detect-identity`">{{ t('software.detectIdentity') }}</label
      ><input :id="`${id}-detect-identity`" v-model="detectIdentity" required /><label
        :for="`${id}-detect-version`"
        >{{ t('software.detectVersion') }}</label
      ><input :id="`${id}-detect-version`" v-model="detectVersion" required
    /></template>
    <template v-else
      ><label :for="`${id}-detect-command`">{{ t('software.detectCommand') }}</label
      ><textarea
        :id="`${id}-detect-command`"
        v-model="detectCommand"
        required
        @input="validateJson"
      />
    </template>
    <label :for="`${id}-artifacts`">{{ t('software.artifacts') }}</label
    ><textarea :id="`${id}-artifacts`" v-model="artifacts" required @input="validateJson" />
    <label :for="`${id}-dependencies`">{{ t('software.dependencies') }}</label
    ><textarea :id="`${id}-dependencies`" v-model="dependencies" required @input="validateJson" />
    <template v-if="format === 'bundle'"
      ><label :for="`${id}-bundle`">{{ t('software.bundle') }}</label
      ><textarea :id="`${id}-bundle`" v-model="bundle" required @input="validateJson" />
    </template>
    <label :for="`${id}-reboot`">{{ t('software.reboot') }}</label
    ><select :id="`${id}-reboot`" v-model="reboot">
      <option value="report">{{ t('software.report') }}</option>
      <option value="forbid">{{ t('software.forbid') }}</option>
    </select>
    <label><input v-model="downgrade" type="checkbox" />{{ t('software.downgrade') }}</label
    ><label><input v-model="ownership" type="checkbox" />{{ t('software.ownership') }}</label>
  </fieldset>
</template>
