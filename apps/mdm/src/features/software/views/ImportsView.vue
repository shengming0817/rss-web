<script setup lang="ts">
import { VBtn, VCheckbox, VSelect, VStepper, VTextField, VTextarea } from 'vuetify/components'
import { computed, onMounted, ref, watch, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { importRequest } from '../clients/imports'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
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
    () => runtime.software.lifecycle.sources({ cursor: after }),
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
  <MdmPage :title="t('software.imports')" :busy="busy" :failure="failure"
    ><p>{{ t('software.importDirectHint') }}</p>
    <p v-if="failure === 'unsupported'" role="alert">
      {{ t('software.ux.contentPrerequisite') }}
      <RouterLink
        :to="{ name: 'settings-material', params: { tenant: runtime.tenant, material: 'storage' } }"
        >{{ t('settings.integrations') }}</RouterLink
      >
    </p>
    <VStepper
      :model-value="step + 1"
      :items="['source', 'coordinates', 'verify', 'deliver'].map((v) => t(`software.ux.${v}`))"
      hide-actions
      :aria-label="t('software.ux.journey')"
      class="my-4"
    />
    <VBtn v-if="step > 0 && !result" :disabled="busy || uncertain" @click="step--">{{
      t('console.back')
    }}</VBtn>
    <section v-if="!result && step === 0" class="console-panel">
      <h2>{{ t('software.ux.source') }}</h2>
      <p>{{ t('software.ux.sourceHint') }}</p>
      <VSelect
        id="import-source"
        v-model="chosenSource"
        :label="t('software.source')"
        :disabled="busy || uncertain"
        :items="
          (sources?.items ?? []).map((item) => ({
            title: `${item.source.id} / ${item.source.revision} · ${item.source.protocol.kind} · ${t(`software.lifecycle_${item.lifecycle.state}`)}`,
            value: `${item.source.id}/${item.source.revision}`,
            props: {
              disabled:
                item.source.protocol.kind === 'private' || item.lifecycle.state !== 'enabled',
            },
          }))
        "
      />
      <VBtn :disabled="busy || uncertain" @click="loadSources()">{{ t('policies.reload') }}</VBtn>
      <VBtn
        v-if="sources?.nextCursor"
        :disabled="busy || uncertain"
        @click="loadSources(sources.nextCursor)"
        >{{ t('devices.next') }}</VBtn
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
        <VBtn :disabled="busy || uncertain || !chosen" @click="step = 1">{{
          t('software.ux.next')
        }}</VBtn>
      </div>
    </section>
    <form v-if="!result" v-show="step > 0" ref="editor" @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <section v-show="step === 1" data-step="1" class="console-panel">
          <h2>{{ t('software.ux.coordinates') }}</h2>
          <p>{{ source }} / {{ sourceRevision }}</p>
          <VTextField
            v-model="resource"
            :label="t('software.resource')"
            required
            :disabled="busy || uncertain"
          /><VTextField
            v-model="version"
            :label="t('software.version')"
            required
            :disabled="busy || uncertain"
          /><VTextField
            v-model.number="expectedRevision"
            :label="t('policies.revision')"
            type="number"
            min="0"
            required
            :disabled="busy || uncertain"
          /><VTextField
            v-model="packageId"
            :label="t('software.package')"
            required
            :disabled="busy || uncertain"
          /><VTextField
            v-model="packageVersion"
            :label="t('software.packageVersion')"
            required
            :disabled="busy || uncertain"
          /><VSelect
            v-model="platform"
            :label="t('software.platform')"
            :items="[
              { title: 'Windows', value: 'windows' },
              { title: 'macOS', value: 'macos' },
            ]"
            :disabled="busy || uncertain"
          /><VSelect
            v-model="architecture"
            :label="t('software.architecture')"
            :items="['x86_64', 'aarch64']"
            :disabled="busy || uncertain"
          /><VTextField
            v-model="variant"
            :label="t('software.variant')"
            required
            :disabled="busy || uncertain"
          /><VTextField
            v-model.number="length"
            :label="t('software.installerLength')"
            type="number"
            min="1"
            required
            :disabled="busy || uncertain"
          />
          <template v-if="chosen?.source.protocol.kind === 'brew_tap'">
            <VTextField
              v-model="brewPath"
              :label="t('software.ux.brewPath')"
              :disabled="busy || uncertain"
            />
            <VTextField
              v-model="bottleTag"
              :label="t('software.ux.bottleTag')"
              :disabled="busy || uncertain"
            />
            <VTextField
              v-model.number="sourceLength"
              :label="t('software.ux.sourceLength')"
              type="number"
              min="1"
              :disabled="busy || uncertain"
            />
          </template>
          <template v-else>
            <VTextField
              v-model="installerType"
              :label="t('software.ux.installerType')"
              :disabled="busy || uncertain"
            />
            <VSelect
              v-model="installerScope"
              :label="t('software.ux.installerScope')"
              :items="['machine', 'user']"
              :disabled="busy || uncertain"
            />
            <VTextField
              v-model="installerId"
              :label="t('software.ux.installerId')"
              :disabled="busy || uncertain"
            />
            <VTextarea
              v-model="manifestFiles"
              :label="t('software.ux.manifestFiles')"
              auto-grow
              :disabled="busy || uncertain"
            />
          </template>
          <VBtn type="button" :disabled="!chosen" @click="next">{{ t('software.ux.next') }}</VBtn>
        </section>
        <section v-show="step === 2" class="console-panel">
          <h2>{{ t('software.ux.verify') }}</h2>
          <p>{{ t('software.ux.behaviorHint') }}</p>
          <VTextarea
            v-model="behavior"
            :label="t('software.behavior')"
            required
            auto-grow
            :disabled="busy || uncertain"
          /><VTextarea
            v-model="artifacts"
            :label="t('software.artifacts')"
            required
            auto-grow
            :disabled="busy || uncertain"
          /><VTextarea
            v-model="dependencies"
            :label="t('software.dependencies')"
            required
            auto-grow
            :disabled="busy || uncertain"
          /><VTextarea
            v-model="signatures"
            :label="t('software.signatures')"
            required
            auto-grow
            :disabled="busy || uncertain"
          /><VSelect
            v-model="reboot"
            :label="t('software.reboot')"
            :items="[
              { title: t('software.rebootForbid'), value: 'forbid' },
              { title: t('software.rebootReport'), value: 'report' },
            ]"
            :disabled="busy || uncertain"
          /><VCheckbox
            v-model="downgrade"
            :label="t('software.allowDowngrade')"
            :disabled="busy || uncertain"
          /><VCheckbox
            v-model="nativeExport"
            :label="t('software.nativeExport')"
            :disabled="busy || uncertain"
          /><VBtn type="submit" :disabled="step !== 2 || !chosen">{{ t('software.import') }}</VBtn>
        </section>
      </fieldset>
    </form>
    <h2 v-if="result">{{ t('software.ux.imported') }}</h2>
    <p v-if="result">{{ result.resource }} / {{ result.version }} · {{ result.storageRevision }}</p>
    <VBtn v-if="result || uncertain" :disabled="busy || !resource" @click="inspect">{{
      t('policies.verify')
    }}</VBtn>
    <p v-if="observed">{{ observed.id }} · {{ observed.revision }}</p>
    <section v-if="uncertain && pending" class="console-panel" role="status">
      <p>{{ t('software.importUnknownHint') }}</p>
      <p>
        {{ pending.operationId }} · {{ pending.input.resource }} /
        {{ pending.input.resourceVersion }} · {{ pending.input.source.id }} /
        {{ pending.input.source.revision }}
      </p>
      <VCheckbox
        v-model="confirmedReplay"
        :label="t('software.publicationUnknown')"
        :disabled="busy"
      />
      <VBtn :disabled="busy || !confirmedReplay" @click="replay">{{ t('policies.replay') }}</VBtn>
    </section>
    <RouterLink
      v-if="result"
      :to="{
        name: 'software-catalog',
        params: { tenant: runtime.tenant },
        query: { resource: result.resource, version: result.version },
      }"
      >{{ t('software.catalog') }}</RouterLink
    ></MdmPage
  >
</template>
