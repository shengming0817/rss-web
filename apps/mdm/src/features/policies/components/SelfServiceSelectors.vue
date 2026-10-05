<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import TenantUserSelect from '../../devices/components/TenantUserSelect.vue'
import {
  selectorKinds,
  selfServiceSelector,
  type SelfServiceSelector,
} from '../clients/self-service-access'
const model = defineModel<SelfServiceSelector[]>({ required: true })
const { t } = useI18n(),
  id = useId(),
  runtime = useMdm(),
  client = runtime.operations.authorization
const { run, busy, failure } = useOperation()
const kind = ref<SelfServiceSelector['kind']>('user'),
  principal = ref(''),
  selectedId = ref(''),
  provider = ref(''),
  issuer = ref(''),
  configurationVersion = ref(1),
  matching = ref<'exact' | 'subtree'>('exact')
const instance = ref(''),
  groups = ref<Awaited<ReturnType<typeof client.groups>>['items']>([]),
  cursor = ref<string | null>(null),
  departments = ref<Awaited<ReturnType<typeof client.departments>>>()
function load(more = false) {
  const selected = kind.value
  void run(
    async () => {
      if (selected === 'user') return { kind: selected, value: await client.effective() }
      if (selected === 'user_group')
        return {
          kind: selected,
          value: await client.groups(more ? (cursor.value ?? undefined) : undefined),
        }
      if (selected === 'department') return { kind: selected, value: await client.departments() }
      return { kind: 'idp_group' as const, value: undefined }
    },
    (result) => {
      if (selected !== kind.value) return
      if (result.kind === 'user') instance.value = result.value.instanceId
      else if (result.kind === 'user_group') {
        groups.value = more ? [...groups.value, ...result.value.items] : result.value.items
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
function add() {
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
      if (!groups.value.some((g) => g.id === selectedId.value && g.value?.enabled))
        throw new Error('Unavailable group')
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
    model.value = [...model.value, selector]
    failure.value = null
  } catch {
    failure.value = 'invalidRequest'
  }
}
function label(s: SelfServiceSelector) {
  const coordinate = s.kind === 'user' ? `${s.principalId} (${s.instanceId}/${s.tenantId})` : s.id
  const origin =
    'source' in s
      ? ` · ${s.source.providerId} · ${s.source.issuer} · v${s.source.configurationVersion}`
      : ''
  return `${t(`policies.selfService.selector_${s.kind}`)}: ${coordinate}${origin}${s.kind === 'department' ? ` (${t(`policies.selfService.${s.matching}`)})` : ''}`
}
</script>
<template>
  <fieldset>
    <legend>{{ t('policies.selfService.users') }}</legend>
    <p>{{ t('policies.selfService.anySelector') }}</p>
    <ul>
      <li v-for="(s, index) in model" :key="JSON.stringify(s)">
        {{ label(s) }}
        <button
          type="button"
          :aria-label="`${t('policies.remove')} ${label(s)}`"
          @click="model = model.filter((_, i) => i !== index)"
        >
          {{ t('policies.remove') }}
        </button>
      </li>
    </ul>
    <p v-if="!model.length" role="alert">{{ t('policies.selfService.emptyUsers') }}</p>
    <label :for="`${id}-kind`">{{ t('policies.selfService.selectorKind') }}</label
    ><select :id="`${id}-kind`" v-model="kind" :disabled="busy">
      <option v-for="k in selectorKinds" :key="k" :value="k">
        {{ t(`policies.selfService.selector_${k}`) }}
      </option>
    </select>
    <TenantUserSelect v-if="kind === 'user'" v-model="principal" :disabled="busy" />
    <template v-else-if="kind === 'user_group'">
      <label :for="`${id}-group`">{{ t('policies.selfService.selector_user_group') }}</label
      ><select :id="`${id}-group`" v-model="selectedId" :disabled="busy">
        <option value="">{{ t('policies.selfService.choose') }}</option>
        <option v-for="g in groups" :key="g.id" :value="g.id" :disabled="!g.value?.enabled">
          {{ g.value?.name ?? g.id }}
        </option>
      </select>
      <button v-if="cursor" type="button" :disabled="busy" @click="load(true)">
        {{ t('policies.next') }}
      </button>
    </template>
    <template v-else-if="kind === 'department'">
      <p v-if="departments?.status !== 'available'" role="status">
        {{ t('policies.selfService.departmentUnavailable') }}
      </p>
      <template v-else>
        <label :for="`${id}-department`">{{ t('policies.selfService.selector_department') }}</label
        ><select :id="`${id}-department`" v-model="selectedId" :disabled="busy">
          <option value="">{{ t('policies.selfService.choose') }}</option>
          <option v-for="d in departments.snapshot.nodes" :key="d.id" :value="d.id">
            {{ d.displayName }}
          </option>
        </select>
        <label :for="`${id}-matching`">{{ t('policies.selfService.matching') }}</label
        ><select :id="`${id}-matching`" v-model="matching">
          <option value="exact">{{ t('policies.selfService.exact') }}</option>
          <option value="subtree">{{ t('policies.selfService.subtree') }}</option>
        </select>
      </template>
    </template>
    <template v-else>
      <label :for="`${id}-group-id`">{{ t('policies.selfService.groupId') }}</label
      ><input :id="`${id}-group-id`" v-model="selectedId" />
      <label :for="`${id}-provider`">{{ t('policies.selfService.provider') }}</label
      ><input :id="`${id}-provider`" v-model="provider" />
      <label :for="`${id}-issuer`">{{ t('policies.selfService.issuer') }}</label
      ><input :id="`${id}-issuer`" v-model="issuer" />
      <label :for="`${id}-configuration-version`">{{
        t('policies.selfService.sourceRevision')
      }}</label
      ><input
        :id="`${id}-configuration-version`"
        v-model.number="configurationVersion"
        type="number"
        min="1"
        step="1"
      />
    </template>
    <button type="button" :disabled="busy || model.length >= 256" @click="add">
      {{ t('policies.add') }}
    </button>
    <button v-if="kind !== 'idp_group'" type="button" :disabled="busy" @click="load()">
      {{ t('policies.reload') }}
    </button>
    <p v-if="failure" role="alert">{{ t(`policies.${failure}`) }}</p>
  </fieldset>
</template>
