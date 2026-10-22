<script setup lang="ts">
import { UiButton, UiStepIndicator } from '@rss/core/components'
import { computed, onMounted, ref, watch, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { importRequest } from '../clients/imports'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const editor = ref<HTMLFormElement>()
function next() {
  const panel = editor.value?.querySelector<HTMLElement>(`[data-step="${step.value}"]`)
  if (
    panel &&
    [
      ...panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input,textarea,select',
      ),
    ].some((v) => !v.reportValidity())
  )
    return
  step.value++
}
const step = ref(0),
  confirmedReplay = ref(false),
  sources = ref<Awaited<ReturnType<typeof runtime.software.lifecycle.sources>>>(),
  chosenSource = ref(''),
  pending = ref<ReturnType<typeof operation<ReturnType<typeof importRequest>>>>(),
  installerType = ref('msi'),
  installerScope = ref('machine'),
  installerId = ref(''),
  manifestFiles = ref('manifest.json'),
  brewPath = ref(''),
  bottleTag = ref(''),
  sourceLength = ref<number>(),
  source = ref(''),
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
  behavior = ref('{}'),
  artifacts = ref('{}'),
  dependencies = ref('[]'),
  signatures = ref('[]'),
  reboot = ref<'forbid' | 'report'>('report'),
  downgrade = ref(false),
  nativeExport = ref(false),
  result = ref<Awaited<ReturnType<typeof runtime.software.imports.import>>>(),
  observed = ref<Awaited<ReturnType<typeof runtime.policies.resources.read>>>()
const chosen = computed(() =>
  sources.value?.items.find((v) => `${v.source.id}/${v.source.revision}` === chosenSource.value),
)
function loadSources(after?: string) {
  void run(
    () => runtime.software.lifecycle.sources(after),
    (v) => {
      sources.value = v
    },
  )
}
watch(chosenSource, () => {
  source.value = chosen.value?.source.id ?? ''
  sourceRevision.value = chosen.value?.source.revision ?? ''
  platform.value = chosen.value?.source.protocol.kind === 'brew_tap' ? 'macos' : 'windows'
})
onMounted(() => loadSources())
function writeOriginal() {
  if (!pending.value || busy.value) return
  const original = structuredClone(toRaw(pending.value))
  void runWrite(
    () => runtime.software.imports.import(original),
    (v) => {
      result.value = v
      pending.value = undefined
      confirmedReplay.value = false
      step.value = 3
    },
  )
}
function replay() {
  if (confirmedReplay.value && uncertain.value) writeOriginal()
}
async function submit() {
  if (busy.value || uncertain.value || !chosen.value || step.value !== 2) return
  let input: ReturnType<typeof importRequest> | undefined
  try {
    const selected =
        chosen.value?.source.protocol.kind === 'brew_tap'
          ? {
              kind: 'brew',
              path: brewPath.value,
              bottleTag: bottleTag.value,
              sourceLength: sourceLength.value ?? null,
            }
          : {
              kind: 'winget',
              installerType: installerType.value,
              scope: installerScope.value,
              installerId: installerId.value || null,
              files: manifestFiles.value
                .split('\n')
                .map((v) => v.trim())
                .filter(Boolean),
            },
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
      pending.value = operation(input, expectedRevision.value)
      confirmedReplay.value = false
      writeOriginal()
    }
  } catch {
    failure.value = 'invalidRequest'
  }
}
function inspect() {
  void run(
    () =>
      runtime.policies.resources.read(
        pending.value?.input.resource ?? result.value?.resource ?? resource.value,
      ),
    (v) => {
      observed.value = v
    },
  )
}
watch(
  () => deviceBinding(runtime),
  () => {
    pending.value = undefined
    confirmedReplay.value = false
    sources.value = undefined
    chosenSource.value = ''
    step.value = 0
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
    <p v-if="failure === 'unsupported'" role="alert">
      {{ t('software.ux.contentPrerequisite') }}
      <RouterLink
        :to="{ name: 'settings-material', params: { tenant: runtime.tenant, material: 'storage' } }"
        >{{ t('settings.integrations') }}</RouterLink
      >
    </p>
    <UiStepIndicator
      :steps="['source', 'coordinates', 'verify', 'deliver'].map((v) => t(`software.ux.${v}`))"
      :current="step"
      :label="t('software.ux.journey')"
    />
    <UiButton v-if="step > 0 && !result" :disabled="busy || uncertain" @click="step--">{{
      t('console.back')
    }}</UiButton>
    <section v-if="!result && step === 0" class="console-panel">
      <h2>{{ t('software.ux.source') }}</h2>
      <p>{{ t('software.ux.sourceHint') }}</p>
      <label for="import-source">{{ t('software.source') }}</label
      ><select
        id="import-source"
        v-model="chosenSource"
        class="ui-input"
        :disabled="busy || uncertain"
      >
        <option value="">{{ t('devices.select') }}</option>
        <option
          v-for="item in sources?.items"
          :key="`${item.source.id}/${item.source.revision}`"
          :value="`${item.source.id}/${item.source.revision}`"
          :disabled="item.source.protocol.kind === 'private' || item.lifecycle.state !== 'enabled'"
        >
          {{ item.source.id }} / {{ item.source.revision }} · {{ item.source.protocol.kind }} ·
          {{ t(`software.lifecycle_${item.lifecycle.state}`) }}
        </option>
      </select>
      <UiButton :disabled="busy || uncertain" @click="loadSources()">{{
        t('policies.reload')
      }}</UiButton>
      <UiButton
        v-if="sources?.nextCursor"
        :disabled="busy || uncertain"
        @click="loadSources(sources.nextCursor)"
        >{{ t('devices.next') }}</UiButton
      >
      <p v-if="sources && !sources.items.length">{{ t('policies.empty') }}</p>
      <div class="console-inline-actions">
        <RouterLink :to="{ name: 'software-sources', params: { tenant: runtime.tenant } }">{{
          t('software.sources')
        }}</RouterLink>
        <RouterLink
          :to="{
            name: 'policy-resources',
            params: { tenant: runtime.tenant },
            query: { kind: 'software', author: 'enterprise' },
          }"
          >{{ t('software.ux.enterprise') }}</RouterLink
        >
        <UiButton :disabled="busy || uncertain || !chosen" @click="step = 1">{{
          t('software.ux.next')
        }}</UiButton>
      </div>
    </section>
    <form v-if="!result" v-show="step > 0" ref="editor" @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <section v-show="step === 1" data-step="1" class="console-panel">
          <h2>{{ t('software.ux.coordinates') }}</h2>
          <p>{{ source }} / {{ sourceRevision }}</p>
          <label
            >{{ t('software.resource')
            }}<input v-model="resource" class="ui-input" required /></label
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
            >{{ t('software.package')
            }}<input v-model="packageId" class="ui-input" required /></label
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
            }}<input v-model.number="length" type="number" min="1" class="ui-input" required
          /></label>
          <template v-if="chosen?.source.protocol.kind === 'brew_tap'">
            <label
              >{{ t('software.ux.brewPath') }}<input v-model="brewPath" class="ui-input"
            /></label>
            <label
              >{{ t('software.ux.bottleTag') }}<input v-model="bottleTag" class="ui-input"
            /></label>
            <label
              >{{ t('software.ux.sourceLength')
              }}<input v-model.number="sourceLength" type="number" min="1" class="ui-input"
            /></label>
          </template>
          <template v-else>
            <label
              >{{ t('software.ux.installerType') }}<input v-model="installerType" class="ui-input"
            /></label>
            <label
              >{{ t('software.ux.installerScope')
              }}<select v-model="installerScope" class="ui-input">
                <option value="machine">machine</option>
                <option value="user">user</option>
              </select></label
            >
            <label
              >{{ t('software.ux.installerId') }}<input v-model="installerId" class="ui-input"
            /></label>
            <label
              >{{ t('software.ux.manifestFiles')
              }}<textarea v-model="manifestFiles" class="ui-input" />
            </label>
          </template>
          <UiButton type="button" :disabled="!chosen" @click="next">{{
            t('software.ux.next')
          }}</UiButton>
        </section>
        <section v-show="step === 2" class="console-panel">
          <h2>{{ t('software.ux.verify') }}</h2>
          <p>{{ t('software.ux.behaviorHint') }}</p>
          <label
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
          ><UiButton type="submit" :disabled="step !== 2 || !chosen">{{
            t('software.import')
          }}</UiButton>
        </section>
      </fieldset>
    </form>
    <h2 v-if="result">{{ t('software.ux.imported') }}</h2>
    <p v-if="result">{{ result.resource }} / {{ result.version }} · {{ result.storageRevision }}</p>
    <UiButton v-if="result || uncertain" :disabled="busy || !resource" @click="inspect">{{
      t('policies.verify')
    }}</UiButton>
    <p v-if="observed">{{ observed.id }} · {{ observed.revision }}</p>
    <section v-if="uncertain && pending" class="console-panel" role="status">
      <p>{{ t('software.importUnknownHint') }}</p>
      <p>
        {{ pending.operationId }} · {{ pending.input.resource }} /
        {{ pending.input.resourceVersion }} · {{ pending.input.source.id }} /
        {{ pending.input.source.revision }}
      </p>
      <label
        ><input v-model="confirmedReplay" type="checkbox" />{{
          t('software.publicationUnknown')
        }}</label
      >
      <UiButton :disabled="busy || !confirmedReplay" @click="replay">{{
        t('policies.replay')
      }}</UiButton>
    </section>
    <RouterLink
      v-if="result"
      :to="{
        name: 'software-catalog',
        params: { tenant: runtime.tenant },
        query: { resource: result.resource, version: result.version },
      }"
      >{{ t('software.catalog') }}</RouterLink
    ></PageFrame
  >
</template>
