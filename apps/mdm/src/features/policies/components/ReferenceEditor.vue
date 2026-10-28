<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import PolicyFieldset from './PolicyFieldset.vue'
import { VSelect, VBtn, VTextField } from 'vuetify/components'

import { ref, useId, watch } from 'vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useI18n } from 'vue-i18n'
import type { Reference } from '../clients/scopes'
defineProps<{
  label: string
  disabled?: boolean
}>()
const deviceQuery = useDirectoryQuery(
  ['id', 'status', 'primaryMdmRegistration', 'channels', 'enrollments', 'inventoryAvailable'],
  1000,
)

const groupQuery = useDirectoryQuery(
  [
    'id',
    'kind',
    'systemSelector',
    'assetContext',
    'calculationRevision',
    'presentation',
    'revision',
    'memberVersion',
    'memberCount',
    'ruleVersion',
    'deleted',
  ],
  1000,
)

const model = defineModel<Reference[]>({ required: true })
const { t } = useI18n(),
  prefix = useId(),
  kind = ref<'device' | 'group'>('device'),
  id = ref('')
const runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), kind.value])
const page = ref<{ items: { id: string; name: string }[]; nextCursor: string | null }>()
const groupRows = ref<object[]>([]),
  deviceRows = ref<object[]>([])
async function chooseGroup(value: string) {
  await run(
    () => runtime.devices.groups.read(value),
    (row) => {
      id.value = row.group.id
    },
  )
}
async function chooseDevice(value: string) {
  await run(
    () => runtime.devices.directory.detail(value),
    (row) => {
      id.value = row.id
    },
  )
}
function load(after?: string) {
  void run(
    async () => {
      if (kind.value === 'group') {
        const result = await groupQuery.read(after, (query) => runtime.devices.groups.list(query))
        return {
          ...result,
          raw: result.items,
          collection: 'group' as const,
          items: result.items
            .filter((g) => 'id' in g)
            .map((g) => ({
              id: g.id,
              name: `${g.presentation?.name ?? g.id} · ${t('policies.revision')} ${g.revision}`,
            })),
        }
      }
      const result = await deviceQuery.read(after, (query) => runtime.devices.directory.list(query))
      return {
        ...result,
        raw: result.items,
        collection: 'device' as const,
        items: result.items.filter((row) => 'id' in row).map((d) => ({ id: d.id, name: d.id })),
      }
    },
    (value) => {
      page.value = value
      if (value.collection === 'group') groupRows.value = value.raw
      else deviceRows.value = value.raw
    },
  )
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), kind.value]),
  () => {
    page.value = undefined
    id.value = ''
  },
  { flush: 'sync' },
)
function add() {
  if (id.value && !model.value.some((v) => v.kind === kind.value && v.id === id.value))
    model.value = [...model.value, { kind: kind.value, id: id.value }]
}
groupQuery.onClear(() => {
  page.value = undefined
  groupRows.value = []
})
deviceQuery.onClear(() => {
  page.value = undefined
  deviceRows.value = []
})
groupQuery.bind(kind)
deviceQuery.bind(kind)
</script>
<template>
  <DirectoryControls
    v-if="kind === 'device'"
    :query="deviceQuery"
    :busy="busy"
    hint="id / status / channel / source；sort: id / status"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    v-if="kind === 'device' && !deviceQuery.complete.value"
    :items="deviceRows"
    @open="
      (row) => {
        chooseDevice(String(row.id))
      }
    "
  />

  <DirectoryControls
    v-if="kind === 'group'"
    :query="groupQuery"
    :busy="busy"
    hint="id / revision / kind / assetContext / deleted / name / memberCount / calculationRevision / memberVersion"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    v-if="kind === 'group' && !groupQuery.complete.value"
    :items="groupRows"
    @open="
      (row) => {
        chooseGroup(String(row.id))
      }
    "
  />

  <PolicyFieldset :disabled="!!disabled">
    <legend>{{ label }}</legend>
    <label :for="`${prefix}-kind`">{{ t('policies.source') }}</label
    ><VSelect
      :id="`${prefix}-kind`"
      v-model="kind"
      :items="[
        { title: String(t('policies.device')), value: 'device' },
        { title: String(t('policies.group')), value: 'group' },
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    />
    <VBtn type="button" :disabled="busy" @click="load()">{{ t('console.chooseLoaded') }}</VBtn>
    <template v-if="page">
      <label :for="`${prefix}-choice`">{{ t('devices.select') }}</label>
      <VSelect
        :id="`${prefix}-choice`"
        v-model="id"
        :disabled="busy"
        :items="[
          { title: String(t('devices.select')), value: '' },
          ...(id && !page.items.some((item) => item.id === id)
            ? [{ title: String(id), value: id }]
            : []),
          ...page.items.map((item) => ({ title: String(item.name), value: item.id })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
    </template>
    <MdmDisclosure class="task-technical">
      <template #title>{{ t('policies.ux.technical') }}</template>
      <label :for="`${prefix}-id`">{{ t('policies.id') }}</label
      ><VTextField
        :id="`${prefix}-id`"
        v-model="id"
        maxlength="256"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
    </MdmDisclosure>
    <VBtn type="button" :disabled="!id || busy" @click="add">{{ t('policies.add') }}</VBtn>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>

    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <ul class="task-reference-list">
      <li v-for="(item, index) in model" :key="`${item.kind}:${item.id}`">
        <span>{{ page?.items.find((choice) => choice.id === item.id)?.name ?? item.id }}</span
        ><small>{{ t(`policies.${item.kind}`) }}</small>
        <VBtn type="button" @click="model = model.filter((_, i) => i !== index)">
          {{ t('policies.remove') }}
        </VBtn>
      </li>
    </ul>
  </PolicyFieldset>
</template>
