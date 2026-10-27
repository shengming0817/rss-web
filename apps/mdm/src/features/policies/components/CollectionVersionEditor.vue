<script setup lang="ts">
import PolicyFieldset from './PolicyFieldset.vue'
import { VSelect, VTextField, VBtn } from 'vuetify/components'
import { controlEvent } from '../control-event'

import { computed, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { ResourceRead, ResourceChange, Variant, UploadTarget } from '../clients/resources'
import type {
  ValueMapping,
  Declaration,
} from '../../../contracts/collection/generated/ResourceWrite'
import { wireValue } from '../../../contracts/collection/check'
import { agentBytes, nativeBytes } from '../../../contracts/collection/canonical'
import CollectionMappings from './CollectionMappings.vue'
const props = defineProps<{ resource: ResourceRead; locked: boolean }>()
const emit = defineEmits<{
  prepare: [input: ResourceChange, files: { file: File; target: UploadTarget }[]]
}>()
const runtime = useMdm(),
  { t } = useI18n()
const version = ref(''),
  base = ref(''),
  index = ref(0),
  variants = ref<Variant[]>([]),
  preparing = ref(false),
  failure = ref(false)
const choices = ref<Record<string, string>>({})
const nativeGroups = ref<number[]>([])
const selected = computed(() => variants.value[index.value])
const declaration = computed(() => selected.value?.declaration)
const native = (v: Declaration) => v.kind === 'native_collection' || v.kind === 'agent_collection'
const sourceQueries = computed(() => {
  const source = props.resource.versions.find((v) => v.id === base.value)?.variants[index.value]
    ?.declaration
  if (source?.kind === 'agent_collection')
    return Object.keys(source.definition.plan.queries).map((key) => ({ key, label: key }))
  if (source?.kind === 'native_collection')
    return [
      ...new Map(
        Object.values(source.definition.mappings).map((m) => {
          const key = JSON.stringify(m.query),
            label =
              typeof m.query === 'string'
                ? m.query || source.definition.adapter
                : m.query.kind === 'scalar'
                  ? m.query.uri
                  : m.query.kind === 'inventory'
                    ? m.query.inventory
                    : m.query.kind
          return [key, { key, label }] as const
        }),
      ).values(),
    ]
  return []
})
function bindingKey(key: string, variantIndex = index.value) {
  return `${nativeGroups.value[variantIndex] ?? variantIndex}/${key}`
}
const mappings = computed<Record<string, ValueMapping>>({
  get: () => {
    const d = declaration.value
    return d && native(d) && 'definition' in d
      ? Object.fromEntries(
          Object.entries(d.definition.mappings).map(([key, b]) => [key, b.mapping]),
        )
      : {}
  },
  set(value) {
    for (const key of Object.keys(choices.value))
      if (
        key.startsWith((nativeGroups.value[index.value] ?? index.value) + '/') &&
        !Object.hasOwn(value, key.slice(key.indexOf('/') + 1))
      )
        delete choices.value[key]
    const d = declaration.value
    if (d?.kind === 'agent_collection')
      d.definition.mappings = Object.fromEntries(
        Object.entries(value).map(([key, mapping]) => [
          key,
          {
            ...(d.definition.mappings[key] ?? { query: '', missing: 'missing' as const }),
            mapping,
          },
        ]),
      )
    if (d?.kind === 'native_collection') {
      const source = sourceQueries.value[0]
      if (!source) return
      const fallback = JSON.parse(source.key)
      d.definition.mappings = Object.fromEntries(
        Object.entries(value).map(([key, mapping]) => [
          key,
          { query: d.definition.mappings[key]?.query ?? fallback, mapping },
        ]),
      )
    }
  },
})
function chooseQuery(key: string, event: Event) {
  const choice = (event.target as HTMLSelectElement).value,
    d = declaration.value
  if (!sourceQueries.value.some((q) => q.key === choice)) return
  choices.value[bindingKey(key)] = choice
  if (d?.kind === 'agent_collection' && d.definition.mappings[key])
    d.definition.mappings[key]!.query = choice
  if (d?.kind === 'native_collection' && d.definition.mappings[key])
    d.definition.mappings[key]!.query = JSON.parse(choice)
}
function copy() {
  const source = props.resource.versions.find((v) => v.id === base.value)
  variants.value = structuredClone(toRaw(source?.variants ?? []))
  choices.value = {}
  nativeGroups.value = []
  const groups = new Map<string, number>()
  variants.value.forEach((variant, i) => {
    const d = variant.declaration
    if (d.kind !== 'native_collection') return
    const identity = JSON.stringify([
      variant.platform,
      d.artifact.reference,
      d.artifact.length,
      d.artifact.sha256,
    ])
    const leader = groups.get(identity)
    nativeGroups.value[i] = leader ?? i
    if (leader === undefined) groups.set(identity, i)
    else {
      const paired = variants.value[leader]!.declaration
      if (paired.kind === 'native_collection') d.definition = paired.definition
    }
  })
  variants.value.forEach((variant, i) => {
    const d = variant.declaration
    if (d.kind === 'native_collection' || d.kind === 'agent_collection')
      for (const [key, binding] of Object.entries(d.definition.mappings))
        choices.value[bindingKey(key, i)] =
          typeof binding.query === 'string'
            ? d.kind === 'native_collection'
              ? JSON.stringify(binding.query)
              : binding.query
            : JSON.stringify(binding.query)
  })
  index.value = 0
  failure.value = false
}
let generation = 0
watch(
  () => JSON.stringify([props.resource.id, props.resource.revision, ...deviceBinding(runtime)]),
  () => {
    generation++
    preparing.value = false
    variants.value = []
    base.value = ''
    version.value = ''
    choices.value = {}
    nativeGroups.value = []
  },
  { flush: 'sync' },
)
async function prepare(event: Event) {
  if (props.locked || preparing.value) return
  const form = event.target as HTMLFormElement
  if (!form.reportValidity()) return
  const current = generation
  preparing.value = true
  failure.value = false
  try {
    if (
      !version.value ||
      props.resource.versions.some((v) => v.id === version.value) ||
      !variants.value.length
    )
      throw new Error('Choose a new version')
    // Nested mapping edits may contain Vue proxies; freeze the actual, precision-checked wire value.
    const frozen = wireValue(variants.value) as Variant[],
      files: { file: File; target: UploadTarget }[] = []
    for (const [i, variant] of frozen.entries()) {
      const d = variant.declaration
      if (d.kind !== 'native_collection' && d.kind !== 'agent_collection')
        throw new Error('Wrong collection')
      if (
        !Object.keys(d.definition.mappings).length ||
        Object.keys(d.definition.mappings).some((key) => !choices.value[bindingKey(key, i)])
      )
        throw new Error('Choose a physical read for each field')
      const bytes =
        d.kind === 'native_collection' ? nativeBytes(d.definition) : agentBytes(d.definition)
      const sha256 = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)),
      ]
      d.artifact = { ...d.artifact, length: bytes.byteLength, sha256 }
      files.push({
        file: new File([bytes.buffer as ArrayBuffer], 'collection.json', {
          type: 'application/json',
        }),
        target: {
          version: version.value,
          platform: variant.platform,
          architecture: variant.architecture,
          variant: variant.key,
          artifact: d.artifact.reference,
        },
      })
    }
    if (current === generation)
      emit(
        'prepare',
        { action: 'version', version: version.value, kind: props.resource.kind, variants: frozen },
        files,
      )
  } catch {
    if (current === generation) failure.value = true
  } finally {
    if (current === generation) preparing.value = false
  }
}
</script>
<template>
  <form class="console-panel" data-testid="collection-version" @submit.prevent="prepare">
    <h3>{{ t('policies.collectionEditor.title') }}</h3>
    <p>{{ t('policies.collectionEditor.hint') }}</p>
    <PolicyFieldset :disabled="locked || preparing">
      <label
        >{{ t('policies.collectionEditor.base')
        }}<VSelect
          v-model="base"
          required
          :items="[
            { title: String(t('devices.select')), value: '' },
            ...resource.versions
              .filter((v) => v.state !== 'archived')
              .map((v) => ({ title: String(v.id) + '·' + String(v.state), value: v.id })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @update:model-value="copy()"
      /></label>
      <label
        >{{ t('policies.collectionEditor.version')
        }}<VTextField
          v-model="version"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <label v-if="variants.length"
        >{{ t('policies.variant')
        }}<VSelect
          v-model.number="index"
          :items="[
            ...variants.map((v, i) => ({
              title: String(v.platform) + '/' + String(v.architecture) + '/' + String(v.key),
              value: i,
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <p v-if="declaration?.kind === 'native_collection'">
        {{ t('policies.collectionEditor.nativePair') }}
      </p>
      <template
        v-if="declaration?.kind === 'native_collection' || declaration?.kind === 'agent_collection'"
      >
        <p>
          {{ t('policies.collectionEditor.scope') }}:
          {{
            declaration.kind === 'native_collection'
              ? declaration.definition.scope.kind
              : declaration.definition.plan.scope.kind
          }}
        </p>
        <CollectionMappings
          v-model="mappings"
          :platform="selected?.platform"
          :source="
            declaration.kind === 'agent_collection'
              ? 'agent.native'
              : selected?.platform === 'windows'
                ? 'mdm.windows'
                : 'mdm.apple'
          "
        />
        <label v-for="key in Object.keys(mappings)" :key="key"
          >{{ key }} · {{ t('policies.collectionEditor.query')
          }}<VSelect
            required
            :model-value="choices[bindingKey(key)] ?? ''"
            :items="[
              { title: String(t('devices.select')), value: '' },
              ...sourceQueries.map((q) => ({ title: String(q.label), value: q.key })),
            ]"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            @update:model-value="chooseQuery(key, controlEvent($event))"
        /></label>
      </template>
      <p v-if="failure" role="alert">{{ t('policies.collectionEditor.invalid') }}</p>
      <VBtn type="submit" :disabled="!base || !version">{{
        t('policies.collectionEditor.prepare')
      }}</VBtn>
    </PolicyFieldset>
  </form>
</template>
