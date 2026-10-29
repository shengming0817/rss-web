<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import PolicyFieldset from './PolicyFieldset.vue'
import { VBtn, VSelect, VTextField } from 'vuetify/components'

import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useOperation } from '../../../services/useOperation'
import TenantUserSelect from '../../devices/components/TenantUserSelect.vue'
import {
  selectorKinds,
  selfServiceSelector,
  type SelfServiceSelector,
} from '../clients/self-service-access'
const groupQuery = useDirectoryQuery(
  ['id', 'revision', 'deleted', 'name', 'enabled', 'memberCount', 'value'],
  1000,
)

const model = defineModel<SelfServiceSelector[]>({ required: true })
const { t } = useI18n(),
  id = useId(),
  runtime = useMdm(),
  client = runtime.operations.authorization
const kind = ref<SelfServiceSelector['kind']>('user'),
  principal = ref(''),
  selectedId = ref(''),
  provider = ref(''),
  issuer = ref(''),
  configurationVersion = ref(1),
  matching = ref<'exact' | 'subtree'>('exact')
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), kind.value])
const instance = ref(''),
  groups = ref<Awaited<ReturnType<typeof client.groups>>['items']>([]),
  cursor = ref<string | null>(null),
  departments = ref<Awaited<ReturnType<typeof client.departments>>>()
function load(after?: string) {
  const selected = kind.value
  void run(
    async () => {
      if (selected === 'user') return { kind: selected, value: await client.effective() }
      if (selected === 'user_group')
        return {
          kind: selected,
          value: await groupQuery.read(after, (query) => client.groups(query)),
        }
      if (selected === 'department') return { kind: selected, value: await client.departments() }
      return { kind: 'idp_group' as const, value: undefined }
    },
    (result) => {
      if (selected !== kind.value) return
      if (result.kind === 'user') instance.value = result.value.instanceId
      else if (result.kind === 'user_group') {
        projectedGroups.value = result.value.items
        groups.value = groupQuery.complete.value ? result.value.items : []
        cursor.value = result.value.nextCursor
      } else if (result.kind === 'department') departments.value = result.value
    },
  )
}
watch(
  kind,
  () => {
    selectedId.value = ''
    departments.value = undefined
    groups.value = []
    cursor.value = null
    load()
  },
  { immediate: true },
)
const projectedGroups = ref<object[]>([])
async function add() {
  let availableGroup = false
  if (kind.value === 'user_group') {
    const ok = await run(
      () => client.group(selectedId.value),
      (group) => {
        availableGroup = group.value?.enabled === true
      },
    )
    if (!ok || !availableGroup) {
      failure.value = 'invalidRequest'
      return
    }
  }
  try {
    let value: unknown
    if (kind.value === 'user')
      value = {
        kind: 'user',
        instanceId: instance.value,
        tenantId: runtime.tenant,
        principalId: principal.value,
      }
    else if (kind.value === 'user_group') {
      if (!availableGroup) throw new Error('Unavailable group')
      value = { kind: 'user_group', id: selectedId.value }
    } else if (kind.value === 'department') {
      const d = departments.value
      if (d?.status !== 'available' || !d.snapshot.nodes.some((n) => n.id === selectedId.value))
        throw new Error('Unavailable department')
      value = {
        kind: 'department',
        id: selectedId.value,
        source: d.source,
        matching: matching.value,
      }
    } else
      value = {
        kind: 'idp_group',
        id: selectedId.value,
        source: {
          providerId: provider.value,
          issuer: issuer.value,
          configurationVersion: configurationVersion.value,
        },
      }
    const selector = selfServiceSelector(value)
    if (
      model.value.length >= 256 ||
      model.value.some((s) => JSON.stringify(s) === JSON.stringify(selector))
    )
      throw new Error('Invalid selection')
    model.value = [...model.value, selector].map(selfServiceSelector)
    failure.value = null
  } catch {
    failure.value = 'invalidRequest'
  }
}
function remove(index: number) {
  model.value = model.value.filter((_, i) => i !== index).map(selfServiceSelector)
}
function label(s: SelfServiceSelector) {
  const coordinate = s.kind === 'user' ? `${s.principalId} (${s.instanceId}/${s.tenantId})` : s.id
  const origin =
    'source' in s
      ? ` · ${s.source.providerId} · ${s.source.issuer} · v${s.source.configurationVersion}`
      : ''
  return `${t(`policies.selfService.selector_${s.kind}`)}: ${coordinate}${origin}${s.kind === 'department' ? ` (${t(`policies.selfService.${s.matching}`)})` : ''}`
}
groupQuery.onClear(() => {
  groups.value = []
  projectedGroups.value = []
})
groupQuery.bind(kind)
</script>
<template>
  <DirectoryControls
    v-if="kind === 'user_group'"
    :query="groupQuery"
    :busy="busy"
    hint="id / revision / deleted / name / enabled / memberCount"
    @load="load"
  />
  <DirectoryResults
    v-if="kind === 'user_group' && !groupQuery.complete.value"
    :disabled="busy"
    :items="projectedGroups"
    @open="
      (row) => {
        selectedId = String(row.id)
      }
    "
  />

  <PolicyFieldset>
    <legend>{{ t('policies.selfService.users') }}</legend>
    <p>{{ t('policies.selfService.anySelector') }}</p>
    <ul>
      <li v-for="(s, index) in model" :key="JSON.stringify(s)">
        {{ label(s) }}
        <VBtn
          type="button"
          :aria-label="`${t('policies.remove')} ${label(s)}`"
          @click="remove(index)"
        >
          {{ t('policies.remove') }}
        </VBtn>
      </li>
    </ul>
    <p v-if="!model.length" role="alert">{{ t('policies.selfService.emptyUsers') }}</p>
    <label :for="`${id}-kind`">{{ t('policies.selfService.selectorKind') }}</label
    ><VSelect
      :id="`${id}-kind`"
      v-model="kind"
      :disabled="busy"
      :items="[
        ...selectorKinds.map((k) => ({
          title: String(t(`policies.selfService.selector_${k}`)),
          value: k,
        })),
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    />
    <TenantUserSelect v-if="kind === 'user'" v-model="principal" :disabled="busy" />
    <template v-else-if="kind === 'user_group'">
      <label :for="`${id}-group`">{{ t('policies.selfService.selector_user_group') }}</label
      ><VSelect
        :id="`${id}-group`"
        v-model="selectedId"
        :disabled="busy"
        :items="[
          { title: String(t('policies.selfService.choose')), value: '' },
          ...groups.map((g) => ({
            title: String(g.value?.name ?? g.id),
            value: g.id,
            props: { disabled: !g.value?.enabled },
          })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <VBtn v-if="cursor" type="button" :disabled="!!busy" @click="load(cursor ?? undefined)">
        {{ t('policies.next') }}
      </VBtn>
    </template>
    <template v-else-if="kind === 'department'">
      <p v-if="departments?.status !== 'available'" role="status">
        {{ t('policies.selfService.departmentUnavailable') }}
      </p>
      <template v-else>
        <label :for="`${id}-department`">{{ t('policies.selfService.selector_department') }}</label
        ><VSelect
          :id="`${id}-department`"
          v-model="selectedId"
          :disabled="busy"
          :items="[
            { title: String(t('policies.selfService.choose')), value: '' },
            ...departments.snapshot.nodes.map((d) => ({
              title: String(d.displayName),
              value: d.id,
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
        <label :for="`${id}-matching`">{{ t('policies.selfService.matching') }}</label
        ><VSelect
          :id="`${id}-matching`"
          v-model="matching"
          :items="[
            { title: String(t('policies.selfService.exact')), value: 'exact' },
            { title: String(t('policies.selfService.subtree')), value: 'subtree' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
      </template>
    </template>
    <template v-else>
      <label :for="`${id}-group-id`">{{ t('policies.selfService.groupId') }}</label
      ><VTextField
        :id="`${id}-group-id`"
        v-model="selectedId"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-provider`">{{ t('policies.selfService.provider') }}</label
      ><VTextField
        :id="`${id}-provider`"
        v-model="provider"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-issuer`">{{ t('policies.selfService.issuer') }}</label
      ><VTextField
        :id="`${id}-issuer`"
        v-model="issuer"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
      <label :for="`${id}-configuration-version`">{{
        t('policies.selfService.sourceRevision')
      }}</label
      ><VTextField
        :id="`${id}-configuration-version`"
        v-model.number="configurationVersion"
        type="number"
        min="1"
        step="1"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
    </template>
    <VBtn type="button" :disabled="!!(busy || model.length >= 256)" @click="add">
      {{ t('policies.add') }}
    </VBtn>
    <VBtn v-if="kind !== 'idp_group'" type="button" :disabled="!!busy" @click="load()">
      {{ t('policies.reload') }}
    </VBtn>
    <p v-if="failure" role="alert">{{ t(`policies.${failure}`) }}</p>
  </PolicyFieldset>
</template>
