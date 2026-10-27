<script setup lang="ts">
import { VAlert, VBtn, VCard, VCardText, VSelect, VTextField } from 'vuetify/components'
import { comparison as queryComparison } from '../../../services/directory-query'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { ResourceRead } from '../../policies/clients/resources'
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ change: [] }>()
const resource = defineModel<string>('resource', { required: true }),
  version = defineModel<string>('version', { required: true }),
  { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), resource.value])
const page = ref<Awaited<ReturnType<typeof runtime.policies.resources.list>>>(),
  selected = ref<ResourceRead>()
function load(after?: string) {
  void run(
    () =>
      runtime.policies.resources.list({
        filter: queryComparison('kind', '==', 'software'),
        cursor: after,
      }),
    (v) => {
      page.value = v
    },
  )
}
function open() {
  selected.value = undefined
  void run(
    () => runtime.policies.resources.read(resource.value),
    (v) => {
      if (v.kind !== 'software') throw new Error('Wrong resource')
      selected.value = v
    },
  )
}
async function choose() {
  version.value = ''
  selected.value = undefined
  emit('change')
  await nextTick()
  open()
}
watch(
  () => deviceBinding(runtime),
  () => {
    page.value = undefined
    selected.value = undefined
  },
  { flush: 'sync' },
)
watch(
  resource,
  () => {
    selected.value = undefined
  },
  { flush: 'sync' },
)
</script>
<template>
  <VCard class="my-3" variant="outlined"
    ><VCardText>
      <VTextField
        v-model="resource"
        :label="t('software.resource')"
        :disabled="props.disabled || busy"
        @change="choose"
      />
      <div class="d-flex flex-wrap ga-2 mb-3">
        <VBtn :disabled="props.disabled || busy || !resource" @click="open">{{
          t('policies.open')
        }}</VBtn>
        <VBtn :disabled="props.disabled || busy" @click="load()">{{ t('software.catalog') }}</VBtn>
      </div>
      <template v-if="page">
        <p class="mb-3">{{ t('console.pageNotTotal') }}</p>
        <VSelect
          v-model="resource"
          :label="t('software.catalog')"
          :items="
            page.items.map((item) => ({
              title: `${typeof item.presentation['name'] === 'string' ? item.presentation['name'] : item.id} · ${item.activeVersion ?? '—'}`,
              value: item.id,
            }))
          "
          :disabled="props.disabled || busy"
          @update:model-value="choose"
        />
        <VBtn
          v-if="page.nextCursor"
          :disabled="props.disabled || busy"
          @click="load(page.nextCursor)"
          >{{ t('devices.next') }}</VBtn
        >
      </template>
      <VSelect
        v-if="selected"
        v-model="version"
        :label="t('software.version')"
        :items="
          selected.versions.map((item) => ({
            title: `${item.id} · ${t(`policies.state.${item.state}`)}`,
            value: item.id,
          }))
        "
        :disabled="props.disabled || busy"
        @update:model-value="emit('change')"
      />
      <VAlert v-if="failure" type="error" class="my-3">{{ t(`devices.${failure}`) }}</VAlert>
      <p>{{ t('console.selectionNotAdmission') }}</p>
    </VCardText></VCard
  >
</template>
