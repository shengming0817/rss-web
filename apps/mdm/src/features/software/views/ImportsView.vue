<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { importRequest } from '../clients/imports'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const source = ref(''),
  sourceRevision = ref('1'),
  resource = ref(''),
  version = ref('1'),
  expectedRevision = ref(0),
  packageId = ref(''),
  packageVersion = ref(''),
  platform = ref<'windows' | 'macos'>('windows'),
  architecture = ref<'x86_64' | 'aarch64'>('x86_64'),
  variant = ref('main'),
  length = ref(1),
  selection = ref(
    '{"kind":"winget","installerType":"msi","scope":"machine","installerId":null,"files":["manifest.json"]}',
  ),
  behavior = ref('{}'),
  artifacts = ref('{}'),
  dependencies = ref('[]'),
  signatures = ref('[]'),
  reboot = ref<'forbid' | 'report'>('report'),
  downgrade = ref(false),
  nativeExport = ref(false),
  result = ref<Awaited<ReturnType<typeof runtime.software.imports.import>>>(),
  observed = ref<Awaited<ReturnType<typeof runtime.policies.resources.read>>>()
async function submit() {
  if (busy.value || uncertain.value) return
  let input: ReturnType<typeof importRequest> | undefined
  try {
    const selected = JSON.parse(selection.value),
      b = JSON.parse(behavior.value),
      a = JSON.parse(artifacts.value),
      d = JSON.parse(dependencies.value),
      s = JSON.parse(signatures.value)
    const found = await run(
      () => runtime.software.lifecycle.source(source.value, sourceRevision.value),
      (v) => {
        input = importRequest({
          asOfUnixSeconds: Math.floor(Date.now() / 1000),
          source: v.snapshot,
          resource: resource.value,
          resourceVersion: version.value,
          package: packageId.value,
          packageVersion: packageVersion.value,
          platform: platform.value,
          architecture: architecture.value,
          variant: variant.value,
          selection: selected,
          behavior: b,
          installerLength: length.value,
          additionalArtifacts: a,
          dependencies: d,
          signatures: s,
          reboot: reboot.value,
          downgrade: downgrade.value ? 'allow' : 'deny',
          nativeExport: nativeExport.value,
        })
      },
    )
    if (found && input) {
      const body = operation(input, expectedRevision.value)
      void runWrite(
        () => runtime.software.imports.import(body),
        (v) => {
          result.value = v
        },
      )
    }
  } catch {
    failure.value = 'invalidRequest'
  }
}
function inspect() {
  void run(
    () => runtime.policies.resources.read(resource.value),
    (v) => {
      observed.value = v
    },
  )
}
watch(
  () => deviceBinding(runtime),
  () => {
    result.value = undefined
    observed.value = undefined
    resource.value = ''
    source.value = ''
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.imports')" :busy="busy" :failure="failure"
    ><p>{{ t('software.importDirectHint') }}</p>
    <form @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <label>{{ t('software.source') }}<input v-model="source" class="ui-input" required /></label
        ><label
          >{{ t('software.sourceRevision')
          }}<input v-model="sourceRevision" class="ui-input" required /></label
        ><label
          >{{ t('software.resource') }}<input v-model="resource" class="ui-input" required /></label
        ><label
          >{{ t('software.version') }}<input v-model="version" class="ui-input" required /></label
        ><label
          >{{ t('policies.revision')
          }}<input
            v-model.number="expectedRevision"
            type="number"
            min="0"
            class="ui-input"
            required /></label
        ><label
          >{{ t('software.package') }}<input v-model="packageId" class="ui-input" required /></label
        ><label
          >{{ t('software.packageVersion')
          }}<input v-model="packageVersion" class="ui-input" required /></label
        ><label
          >{{ t('software.platform')
          }}<select v-model="platform" class="ui-input">
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
          </select></label
        ><label
          >{{ t('software.architecture')
          }}<select v-model="architecture" class="ui-input">
            <option value="x86_64">x86_64</option>
            <option value="aarch64">aarch64</option>
          </select></label
        ><label
          >{{ t('software.variant') }}<input v-model="variant" class="ui-input" required /></label
        ><label
          >{{ t('software.installerLength')
          }}<input v-model.number="length" type="number" min="1" class="ui-input" required /></label
        ><label
          >{{ t('software.importSelection')
          }}<textarea v-model="selection" class="ui-input" required /></label
        ><label
          >{{ t('software.behavior')
          }}<textarea v-model="behavior" class="ui-input" required /></label
        ><label
          >{{ t('software.artifacts')
          }}<textarea v-model="artifacts" class="ui-input" required /></label
        ><label
          >{{ t('software.dependencies')
          }}<textarea v-model="dependencies" class="ui-input" required /></label
        ><label
          >{{ t('software.signatures')
          }}<textarea v-model="signatures" class="ui-input" required /></label
        ><label
          >{{ t('software.reboot')
          }}<select v-model="reboot" class="ui-input">
            <option value="forbid">{{ t('software.rebootForbid') }}</option>
            <option value="report">{{ t('software.rebootReport') }}</option>
          </select></label
        ><label
          ><input v-model="downgrade" type="checkbox" />{{ t('software.allowDowngrade') }}</label
        ><label
          ><input v-model="nativeExport" type="checkbox" />{{ t('software.nativeExport') }}</label
        ><UiButton type="submit">{{ t('software.import') }}</UiButton>
      </fieldset>
    </form>
    <p v-if="result">{{ result.resource }} / {{ result.version }} · {{ result.storageRevision }}</p>
    <UiButton :disabled="busy || !resource" @click="inspect">{{ t('policies.verify') }}</UiButton>
    <p v-if="observed">{{ observed.id }} · {{ observed.revision }}</p>
    <p v-if="uncertain">{{ t('software.importUnknownHint') }}</p>
    <RouterLink
      v-if="result"
      :to="{
        name: 'software-catalog',
        params: { tenant: runtime.tenant },
        query: { resource: result.resource },
      }"
      >{{ t('software.catalog') }}</RouterLink
    ></PageFrame
  >
</template>
