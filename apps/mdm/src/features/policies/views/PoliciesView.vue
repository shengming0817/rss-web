<script setup lang="ts">
import PolicyFieldset from '../components/PolicyFieldset.vue'
import { VBtn, VSelect, VTextField, VDataTable, VChip, VCheckbox } from 'vuetify/components'
import { controlEvent } from '../control-event'

import type { PreviewInput } from '../clients/policies'

import { jsonObject } from '../../../services/json'
import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import type { Json } from '../../../services/json'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  defaultSchedule,
  defaultCollectionSchedule,
  policyDefinition,
  type PolicyRead,
  type ExecutionDefinition,
  type ConfigurationDefinition,
  type PolicyDefinition,
  type PolicyChange,
} from '../clients/model'
import type { ResourceRead, ScriptSpec } from '../clients/resources'
import CollectionPeriod from '../components/CollectionPeriod.vue'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import SelfServiceEditor from '../components/SelfServiceEditor.vue'
import ResourceIdentity from '../components/ResourceIdentity.vue'
import CatalogLocator from '../components/CatalogLocator.vue'
import AssignmentFacts from '../components/AssignmentFacts.vue'
import { objectKey } from '../../devices/clients/objects'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import PolicyIdentityEditor from '../components/PolicyIdentityEditor.vue'
import PolicyEntry from '../components/PolicyEntry.vue'
import PolicyDelete from '../components/PolicyDelete.vue'
import { policyDestination } from '../policy-destination'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.policies,
  route = useRoute(),
  router = useRouter()
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<PolicyRead>(),
  resource = ref<ResourceRead>()
const queryState = ref<'' | 'enabled' | 'disabled' | 'archived'>(''),
  queryCategory = ref(''),
  queryScope = ref('')
const editing = ref(false)
const creationKind = ref('execution')
const id = ref(typeof route.query['id'] === 'string' ? route.query['id'] : '')
function fresh(
  kind: 'execution' | 'configuration' | 'native_collection' | 'agent_collection' = 'execution',
):
  | ExecutionDefinition
  | ConfigurationDefinition
  | (PolicyDefinition & {
      action: Extract<
        PolicyDefinition['action'],
        { kind: 'native_collection' | 'agent_collection' }
      >
    }) {
  if (kind === 'configuration')
    return {
      customEvent: null,
      alias: null,
      scope: '',
      action: {
        kind,
        resource: {
          id: '',
          version: '1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: '',
        },
        exit: 'retain',
      },
    }
  if (kind === 'native_collection' || kind === 'agent_collection')
    return {
      customEvent: null,
      alias: null,
      scope: '',
      action: {
        kind,
        resource: {
          id: '',
          version: '1',
          platform: 'windows',
          architecture: 'x86_64',
          variant: '',
        },
        schedule: defaultCollectionSchedule(),
        frequency: 'every_trigger',
        runLifetimeSeconds: 3600,
      },
    }
  return {
    customEvent: null,
    alias: null,
    scope: '',
    action: {
      kind: 'execution',
      resource: { id: '', version: '1', platform: 'windows', architecture: 'x86_64', variant: '' },
      parameters: {},
      schedule: defaultSchedule(),
      frequency: 'once_per_version',
      runLifetimeSeconds: 3600,
    },
  }
}
const definition = ref(fresh()),
  ready = ref(false),
  enabled = ref(false),
  pending = ref<{ id: string; requester: string; body: Operation<PolicyChange> }>()
function requester() {
  const state = runtime.session.state.value
  return state.status === 'authenticated' &&
    state.tenant === runtime.tenant &&
    state.identity &&
    state.session
    ? [state.tenant, state.identity.principalId, state.session.id].join('/')
    : null
}
watch(
  requester,
  () => {
    pending.value = undefined
    ready.value = false
    current.value = undefined
    list.value = undefined
    resource.value = undefined
    progress.value = undefined
    preview.value = undefined
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  pending.value = undefined
})
const variants = computed(() =>
  resource.value?.id === definition.value.action.resource.id
    ? (resource.value.versions
        .find((v) => v.id === definition.value.action.resource.version && v.state === 'active')
        ?.variants.filter(
          (v) =>
            v.declaration.kind ===
            (definition.value.action.kind === 'execution'
              ? 'script'
              : definition.value.action.kind),
        ) ?? [])
    : [],
)
const spec = computed<ScriptSpec | undefined>(() => {
  const b = definition.value.action.resource,
    v = variants.value.find(
      (v) => v.key === b.variant && v.platform === b.platform && v.architecture === b.architecture,
    )
  return v?.declaration.kind === 'script' ? v.declaration.definition : undefined
})
const selectedVariant = computed(() => {
  const b = definition.value.action.resource
  return variants.value.find(
    (v) => v.key === b.variant && v.platform === b.platform && v.architecture === b.architecture,
  )
})
function actionKind(event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  if (
    current.value ||
    (kind !== 'execution' &&
      kind !== 'configuration' &&
      kind !== 'native_collection' &&
      kind !== 'agent_collection')
  )
    return
  if (definition.value.selfService) {
    failure.value = 'removeBeforeSwitch'
    return
  }
  definition.value = { ...fresh(kind), scope: definition.value.scope }
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
}
const preview = ref<Awaited<ReturnType<typeof client.preview>>>(),
  progress = ref<Awaited<ReturnType<typeof client.assignments>>>()
let previewInput: PreviewInput | undefined
watch(
  () => JSON.stringify([requester(), definition.value]),
  () => {
    previewInput = undefined
    preview.value = undefined
  },
  { flush: 'sync' },
)
async function check(cursor?: string) {
  if (!ready.value || busy.value || uncertain.value) return
  const previous = cursor ? preview.value : undefined
  preview.value = undefined
  try {
    const d = policyDefinition(structuredClone(toRaw(definition.value)))
    if (
      cursor &&
      (!previous || !previewInput || JSON.stringify(d) !== JSON.stringify(previewInput.definition))
    ) {
      previewInput = undefined
      return
    }
    const input = cursor ? previewInput! : { definition: d }
    previewInput = input
    await run(
      async () => {
        const page = await client.preview(input, { cursor })
        if (previous && previous.scopeResult !== page.scopeResult)
          throw new Error('Wrong preview scope result')
        return page
      },
      (v) => {
        if (previewInput !== input) return
        preview.value = v
      },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}

function loadProgress(after?: string) {
  progress.value = undefined
  const p = current.value
  if (p)
    void run(
      () => client.assignments(p.id, { cursor: after }),
      (v) => {
        if (current.value?.id === p.id) progress.value = v
      },
    )
}
const fields = computed(() =>
  Object.entries(
    (spec.value
      ? (jsonObject(spec.value.parameters, 16384)['properties'] as Record<string, Json>)
      : {}) ?? {},
  ).map(([name, value]) => {
    const schema: Record<string, Json> =
      value && typeof value === 'object' && !Array.isArray(value) ? jsonObject(value, 16384) : {}
    const choices =
      'const' in schema
        ? [schema['const']]
        : Array.isArray(schema['enum'])
          ? schema['enum']
          : undefined
    return { name, schema, type: schema['type'], choices }
  }),
)
function defaultValue(schema: Record<string, Json>): string | boolean | number {
  const first =
    'const' in schema
      ? schema['const']
      : Array.isArray(schema['enum'])
        ? schema['enum'][0]
        : undefined
  if (
    typeof first === 'string' ||
    typeof first === 'boolean' ||
    (typeof first === 'number' && Number.isSafeInteger(first))
  )
    return first
  if (schema['type'] === 'boolean') return false
  if (schema['type'] === 'integer')
    return Math.max(
      typeof schema['minimum'] === 'number' ? Math.ceil(schema['minimum']) : -Infinity,
      Math.min(0, typeof schema['maximum'] === 'number' ? Math.floor(schema['maximum']) : Infinity),
    )
  return ''
}
function numeric(schema: Record<string, Json>, name: string) {
  return typeof schema[name] === 'number' ? schema[name] : undefined
}
function apply(p: PolicyRead) {
  if (p.definition.action.kind === 'device_access') {
    editing.value = false
    failure.value = 'unsupported'
    return
  }
  if (
    !['execution', 'configuration', 'native_collection', 'agent_collection'].includes(
      p.definition.action.kind,
    )
  ) {
    const destination = policyDestination(p, runtime.tenant)
    if (destination) void router.replace(destination)
    return
  }
  if (p.definition.action.kind === 'telemetry_profile') {
    void router.push({
      name: 'policy-telemetry',
      params: { tenant: runtime.tenant },
      query: { resource: p.definition.action.resource.id, policy: p.id },
    })
    return
  }
  editing.value = false
  if (
    p.definition.action.kind !== 'execution' &&
    p.definition.action.kind !== 'configuration' &&
    p.definition.action.kind !== 'native_collection' &&
    p.definition.action.kind !== 'agent_collection'
  )
    throw new Error('Wrong policy action')
  ready.value = p.state !== 'archived'
  current.value = p
  id.value = p.id
  enabled.value = p.enabled
  if (p.definition.action.kind === 'execution')
    definition.value = structuredClone({ ...p.definition, action: p.definition.action })
  else if (p.definition.action.kind === 'configuration')
    definition.value = structuredClone({ ...p.definition, action: p.definition.action })
  else
    definition.value = structuredClone({
      ...p.definition,
      action: p.definition.action,
    }) as ReturnType<typeof fresh>
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
}
function load(after?: string) {
  list.value = undefined
  return run(
    () =>
      client.list({
        cursor: after,
        filter: allOf(
          queryState.value ? queryComparison('state', '==', queryState.value) : undefined,
          queryCategory.value ? queryComparison('category', '==', queryCategory.value) : undefined,
          queryScope.value ? queryComparison('scope', '==', queryScope.value) : undefined,
        ),
      }),
    (v) => {
      list.value = {
        ...v,
        items: v.items,
      }
    },
  )
}
async function open(target = pending.value?.id ?? id.value) {
  if (!target || busy.value) return
  ready.value = false
  current.value = undefined
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
  definition.value = fresh()
  enabled.value = false
  id.value = target
  const loaded = await run(
    () => client.read(target),
    (p) => {
      if (
        p.id !== target ||
        (typeof route.query['id'] === 'string' && route.query['id'] !== target)
      )
        throw new Error('Wrong Policy locator')
      apply(p)
    },
  )
  if (loaded && current.value) await bind()
  return loaded
}
function resetDraft() {
  ready.value = true
  current.value = undefined
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
  id.value = crypto.randomUUID()
  definition.value = fresh(creationKind.value as Parameters<typeof fresh>[0])
  enabled.value = false
  pending.value = undefined
}
function select(target: string) {
  const policy = list.value?.items.find((item) => item.id === target)
  const destination = policy && policyDestination(policy, runtime.tenant)
  void router.push(destination ?? { query: { ...route.query, id: target } })
}
async function create() {
  if (busy.value || uncertain.value) return
  if (
    [
      'software',
      'ensure_agent_installed',
      'request_mdm_enrollment',
      'unmanage_device',
      'credential',
      'telemetry_profile',
    ].includes(creationKind.value)
  ) {
    if (creationKind.value === 'telemetry_profile') {
      void router.push({ name: 'policy-telemetry', params: { tenant: runtime.tenant } })
    } else
      void router.push({
        name: 'policy-policies',
        params: { tenant: runtime.tenant },
        query: { action: creationKind.value, create: '1' },
      })
    return
  }
  editing.value = false
  if (route.query['id']) await router.push({ query: { ...route.query, id: undefined } })
  await nextTick()
  if (route.query['id']) return
  resetDraft()
  editing.value = true
}
watch(
  () => route.query['id'],
  (target) => {
    pending.value = undefined
    if (typeof target === 'string') void open(target)
    else resetDraft()
  },
  { flush: 'post' },
)
function bind() {
  const target = definition.value.action.resource.id
  return run(
    () => runtime.policies.resources.read(target),
    (r) => {
      if (
        r.kind !==
        (definition.value.action.kind === 'execution' ? 'script' : definition.value.action.kind)
      )
        throw new Error('Wrong resource kind')
      resource.value = r
    },
  )
}
function selectVariant(event: Event) {
  const v = variants.value[Number((event.target as HTMLSelectElement).value)]
  if (!v) return
  definition.value.action.resource = {
    ...definition.value.action.resource,
    variant: v.key,
    platform: v.platform,
    architecture: v.architecture,
  }
  if (definition.value.action.kind === 'execution')
    definition.value.action.parameters = Object.fromEntries(
      fields.value.map((f) => [f.name, { kind: 'fixed' as const, value: defaultValue(f.schema) }]),
    )
}
function source(name: string, event: Event) {
  if (definition.value.action.kind !== 'execution') return
  const input = (event.target as HTMLSelectElement).value === 'input'
  if (input) {
    definition.value.action.parameters[name] = { kind: 'input' }
    definition.value.action.schedule.trigger = { kind: 'manual' }
  } else
    definition.value.action.parameters[name] = {
      kind: 'fixed',
      value: defaultValue(fields.value.find((f) => f.name === name)!.schema),
    }
}
function choice(name: string, event: Event) {
  if (definition.value.action.kind !== 'execution') return
  const value = fields.value.find((f) => f.name === name)?.choices?.[
    Number((event.target as HTMLSelectElement).value)
  ]
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    definition.value.action.parameters[name] = { kind: 'fixed', value }
}
function fixedValue(name: string) {
  if (definition.value.action.kind !== 'execution') return ''
  const value = definition.value.action.parameters[name]
  return value?.kind === 'fixed' ? value.value : ''
}
function parameter(name: string, event: Event) {
  if (definition.value.action.kind !== 'execution') return
  const input = event.target as HTMLInputElement,
    type = fields.value.find((f) => f.name === name)?.type
  definition.value.action.parameters[name] = {
    kind: 'fixed',
    value:
      type === 'boolean' ? input.checked : type === 'integer' ? Number(input.value) : input.value,
  }
}
function change(input: PolicyChange) {
  if (
    busy.value ||
    uncertain.value ||
    !ready.value ||
    current.value?.state === 'archived' ||
    (input.action === 'archive' && current.value?.state !== 'disabled') ||
    (typeof route.query['id'] === 'string' && current.value?.id !== route.query['id'])
  )
    return
  const actor = requester()
  if (!actor) return
  const body = operation(structuredClone(input), current.value?.revision ?? 0),
    target = current.value?.id ?? id.value
  pending.value = { id: target, requester: actor, body }
  void runWrite(
    () => client.change(target, body),
    (p) => {
      if (requester() !== actor) throw new Error('Policy requester changed')
      apply(p)
      pending.value = undefined
      if (p.state === 'archived' && list.value)
        list.value.items = list.value.items.filter((item) => item.id !== p.id)
      else list.value = undefined
      if (route.query['id'] !== p.id) void router.replace({ query: { ...route.query, id: p.id } })
    },
  )
}
async function recover() {
  const original = pending.value
  if (
    !original ||
    busy.value ||
    !uncertain.value ||
    original.requester !== requester() ||
    (typeof route.query['id'] === 'string' && route.query['id'] !== original.id)
  )
    return
  ready.value = false
  const confirmed = await runWrite(
    () => client.change(original.id, structuredClone(toRaw(original.body))),
    (p) => {
      if (requester() !== original.requester) throw new Error('Policy requester changed')
      if (p.state === 'archived' && list.value)
        list.value.items = list.value.items.filter((item) => item.id !== p.id)
      pending.value = undefined
    },
  )
  if (confirmed && requester() === original.requester) {
    if (route.query['id'] !== original.id)
      await router.replace({ query: { ...route.query, id: original.id } })
    else await open(original.id)
  }
}
function save(event: Event) {
  if (!(event.target as HTMLFormElement).reportValidity()) return
  try {
    const d = policyDefinition(structuredClone(toRaw(definition.value))),
      action = d.action
    if (
      !selectedVariant.value ||
      (action.kind === 'execution' &&
        (!spec.value ||
          fields.value.some((f) => !(f.name in action.parameters)) ||
          Object.keys(action.parameters).length !== fields.value.length))
    )
      throw new Error('Load exact resource first')
    change({ action: 'put', enabled: enabled.value, definition: d })
  } catch {
    failure.value = 'invalidRequest'
  }
}
onMounted(async () => {
  await load()
  if (id.value && !current.value) await open()
  else if (!id.value) {
    resetDraft()
    if (typeof route.query['device'] === 'string' || typeof route.query['group'] === 'string')
      editing.value = true
    const kind = route.query['kind']
    if (
      ['execution', 'native_collection', 'agent_collection', 'configuration'].includes(
        String(kind),
      ) &&
      typeof route.query['resource'] === 'string' &&
      typeof route.query['version'] === 'string'
    ) {
      definition.value = fresh(kind as Parameters<typeof fresh>[0])
      definition.value.action.resource.id = route.query['resource']
      definition.value.action.resource.version = route.query['version']
      editing.value = true
      await bind()
      const variant = variants.value[0]
      if (variant)
        definition.value.action.resource = {
          ...definition.value.action.resource,
          platform: variant.platform,
          architecture: variant.architecture,
          variant: variant.key,
        }
      if (variant && definition.value.action.kind === 'execution')
        definition.value.action.parameters = Object.fromEntries(
          fields.value.map((field) => [
            field.name,
            { kind: 'fixed' as const, value: defaultValue(field.schema) },
          ]),
        )
    }
  }
})
</script>
<template>
  <MdmPage :title="t('policies.policies')" :busy="busy" :failure="failure">
    <p>{{ t('policies.policyHint') }}</p>
    <RouterLink :to="{ name: 'policy-tools', params: { tenant: runtime.tenant } }">{{
      t('policies.entry.title')
    }}</RouterLink>
    <RouterLink :to="{ name: 'policy-lifecycle', params: { tenant: runtime.tenant } }">{{
      t('gap.lifecycle')
    }}</RouterLink>
    <VSelect
      v-model="creationKind"
      :label="t('policies.actionKind')"
      :items="[
        { title: t('policies.scripts'), value: 'execution' },
        { title: t('policies.configurations'), value: 'configuration' },
        { title: t('policies.nativeCollection'), value: 'native_collection' },
        { title: t('policies.agentCollection'), value: 'agent_collection' },
        { title: t('policies.software'), value: 'software' },
        { title: t('software.installAgent'), value: 'ensure_agent_installed' },
        { title: t('software.requestMdm'), value: 'request_mdm_enrollment' },
        { title: t('gap.lifecycle'), value: 'unmanage_device' },
        { title: t('policies.credentialAction'), value: 'credential' },
        { title: t('telemetry.profiles'), value: 'telemetry_profile' },
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      :disabled="busy || uncertain"
    />
    <VBtn :disabled="!!(busy || uncertain)" type="button" @click="create">{{
      t('policies.create')
    }}</VBtn
    ><VBtn :disabled="!!busy" type="submit" @click="load()">{{ t('policies.reload') }}</VBtn>
    <div class="console-toolbar">
      <label
        >{{ t('gap.state')
        }}<VSelect
          v-model="queryState"
          :items="[
            { title: String(t('gap.allStates')), value: '' },
            ...['enabled', 'disabled', 'archived'].map((s) => ({
              title: String(s),
              value: String(s),
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @update:model-value="list = undefined" /></label
      ><label
        >{{ t('gap.category')
        }}<VTextField
          v-model="queryCategory"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @input="list = undefined" /></label
      ><label
        >{{ t('gap.queryScope')
        }}<VTextField
          v-model="queryScope"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @input="list = undefined" /></label
      ><VBtn
        type="button"
        :disabled="busy"
        @click="
          () => {
            list = undefined
            load()
          }
        "
        >{{ t('gap.load') }}</VBtn
      >
    </div>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <VDataTable
      :aria-label="t('policies.policies')"
      :items-per-page="-1"
      hide-default-footer
      :items="list?.items ?? []"
      :headers="
        [
          { key: 'policy', label: t('policies.policies') },
          { key: 'state', label: t('console.summary') },
          { key: 'action', label: t('policies.source') },
        ].map((column) => ({ key: column.key, title: column.label, sortable: false }))
      "
      item-value="id"
      :loading-text="t('devices.loading')"
      :no-data-text="t('policies.empty')"
      ><template #[`item.policy`]="{ item: row }"
        ><VBtn variant="text" :disabled="busy || uncertain" @click="select(row.id)">{{
          row.definition.selfService?.presentation.displayName ??
          `${t('policies.policies')} · ${row.id.slice(0, 8)}`
        }}</VBtn></template
      ><template #[`item.state`]="{ item: row }"
        ><VChip>{{
          t(
            row.state === 'archived'
              ? 'policies.state.archived'
              : row.state === 'enabled'
                ? 'policies.state.active'
                : 'policies.state.paused',
          )
        }}</VChip></template
      ><template #[`item.action`]="{ item: row }">{{
        row.definition.action.kind
      }}</template></VDataTable
    >
    <VBtn v-if="list?.nextCursor" :disabled="!!busy" type="submit" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </VBtn>
    <p v-if="current?.state === 'archived'" role="status">{{ t('policies.archivedHint') }}</p>
    <div v-if="current && current.state !== 'archived' && !editing" class="console-toolbar">
      <VBtn type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</VBtn>
    </div>
    <PolicyEntry v-if="current" :policy="current" />
    <form
      v-show="editing || !!current"
      class="console-panel"
      data-form="policy"
      @submit.prevent="save"
    >
      <div class="console-page-header">
        <h2>{{ t(current ? 'console.edit' : 'console.create') }}</h2>
        <VBtn type="button" variant="text" :disabled="busy || uncertain" @click="editing = false">{{
          t('console.close')
        }}</VBtn>
      </div>
      <PolicyFieldset :disabled="busy || uncertain || !ready || !editing">
        <PolicyIdentityEditor
          v-model:alias="definition.alias"
          v-model:event="definition.customEvent"
          :fixed-parameters="
            definition.action.kind !== 'execution' ||
            !Object.values(definition.action.parameters).some((p) => p.kind === 'input')
          "
        />
        <label for="policy-action">{{ t('policies.actionKind') }}</label
        ><VSelect
          id="policy-action"
          :disabled="!!current"
          :model-value="definition.action.kind"
          :items="[
            { title: String(t('policies.scripts')), value: 'execution' },
            { title: String(t('policies.configurations')), value: 'configuration' },
            { title: String(t('policies.nativeCollection')), value: 'native_collection' },
            { title: String(t('policies.agentCollection')), value: 'agent_collection' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @update:model-value="actionKind(controlEvent($event))"
        />
        <label for="policy-id">{{ t('policies.id') }}</label
        ><VTextField
          id="policy-id"
          v-model="id"
          :readonly="!!current"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
        <label for="policy-resource">{{ t('policies.resources') }}</label
        ><VTextField
          id="policy-resource"
          v-model="definition.action.resource.id"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
        <label for="policy-version">{{ t('policies.version') }}</label
        ><VTextField
          id="policy-version"
          v-model="definition.action.resource.version"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        />
        <VBtn type="button" @click="bind">{{ t('policies.selfService.loadResource') }}</VBtn>
        <label for="policy-variant">{{ t('policies.variant') }}</label
        ><VSelect
          id="policy-variant"
          required
          :model-value="
            variants.findIndex(
              (v) =>
                v.key === definition.action.resource.variant &&
                v.platform === definition.action.resource.platform &&
                v.architecture === definition.action.resource.architecture,
            )
          "
          :items="[
            {
              title: String(t('policies.selfService.chooseVariant')),
              value: -1,
              props: { disabled: true },
            },
            ...variants.map((v, index) => ({
              title: String(v.platform) + '/' + String(v.architecture) + '/' + String(v.key),
              value: index,
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @update:model-value="selectVariant(controlEvent($event))"
        />
        <label for="policy-scope">{{ t('policies.selfService.deviceScope') }}</label
        ><VTextField
          id="policy-scope"
          v-model="definition.scope"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        /><CatalogLocator
          v-model="definition.scope"
          collection="scopes"
          :disabled="busy || uncertain"
        />
        <template v-if="definition.action.kind === 'execution'">
          <ResourceIdentity :binding="definition.action.resource" />
          <p>{{ t('policies.selfService.parameterHint') }}</p>
          <PolicyFieldset v-for="f in fields" :key="f.name">
            <legend>{{ f.name }}</legend>
            <label :for="`source-${f.name}`">{{ t('policies.source') }}</label
            ><VSelect
              :id="`source-${f.name}`"
              :model-value="definition.action.parameters[f.name]?.kind"
              :items="[
                { title: String(t('policies.selfService.fixed')), value: 'fixed' },
                { title: String(t('policies.selfService.input')), value: 'input' },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="source(f.name, controlEvent($event))"
            />
            <p v-if="typeof f.schema['description'] === 'string'">{{ f.schema['description'] }}</p>
            <p
              v-for="bound in ['minimum', 'maximum', 'minLength', 'maxLength']"
              v-show="numeric(f.schema, bound) !== undefined"
              :key="bound"
            >
              {{ t(`policies.selfService.${bound}`, { value: numeric(f.schema, bound) }) }}
            </p>
            <template v-if="definition.action.parameters[f.name]?.kind === 'fixed'">
              <label :for="`value-${f.name}`">{{ t('policies.parameters') }}</label>
              <VSelect
                v-if="f.choices"
                :id="`value-${f.name}`"
                required
                :model-value="f.choices.findIndex((v) => v === fixedValue(f.name))"
                :items="[
                  {
                    title: String(t('policies.selfService.requiredValue')),
                    value: -1,
                    props: { disabled: true },
                  },
                  ...f.choices.map((value, index) => ({
                    title: String(String(value)),
                    value: index,
                  })),
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                @update:model-value="choice(f.name, controlEvent($event))"
              />
              <VCheckbox
                v-else-if="f.type === 'boolean'"
                :id="`value-${f.name}`"
                :model-value="fixedValue(f.name) === true"
                hide-details="auto"
                @update:model-value="parameter(f.name, controlEvent($event))"
              />
              <VTextField
                v-else
                :id="`value-${f.name}`"
                :type="f.type === 'boolean' ? 'checkbox' : f.type === 'integer' ? 'number' : 'text'"
                :min="numeric(f.schema, 'minimum')"
                :max="numeric(f.schema, 'maximum')"
                :minlength="numeric(f.schema, 'minLength')"
                :maxlength="numeric(f.schema, 'maxLength')"
                :required="
                  f.type === 'integer' ||
                  (f.type === 'string' && (numeric(f.schema, 'minLength') ?? 0) > 0)
                "
                :placeholder="t('policies.selfService.requiredValue')"
                :model-value="fixedValue(f.name)"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                @input="parameter(f.name, $event)"
              />
            </template>
          </PolicyFieldset>
          <NativeScheduleEditor v-model="definition.action.schedule" />
          <label for="policy-frequency">{{ t('policies.selfService.frequency') }}</label
          ><VSelect
            id="policy-frequency"
            v-model="definition.action.frequency"
            :items="[
              ...['once_per_version', 'once_per_entry', 'every_trigger'].map((value) => ({
                title: String(t(`policies.selfService.${value}`)),
                value: value,
              })),
            ]"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
          />
          <label for="policy-lifetime">{{ t('policies.selfService.lifetime') }}</label
          ><VTextField
            id="policy-lifetime"
            v-model.number="definition.action.runLifetimeSeconds"
            type="number"
            min="60"
            max="604800"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto"
          />
          <label
            ><VCheckbox v-model="enabled" hide-details="auto" />{{ t('policies.active') }}</label
          >
          <SelfServiceEditor v-model="definition.selfService" />
          <VBtn
            v-if="definition.selfService"
            type="button"
            data-action="remove-self-service"
            @click="delete definition.selfService"
          >
            {{ t('policies.selfService.removeConfiguration') }}
          </VBtn>
        </template>
        <template v-else-if="definition.action.kind === 'configuration'"
          ><label for="policy-exit">{{ t('policies.exitBehavior') }}</label
          ><VSelect
            id="policy-exit"
            v-model="definition.action.exit"
            :items="[
              { title: String(t('policies.configurationRetain')), value: 'retain' },
              { title: String(t('policies.configurationRemove')), value: 'remove' },
            ]"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
        /></template>
        <template
          v-if="
            definition.action.kind === 'native_collection' ||
            definition.action.kind === 'agent_collection'
          "
          ><CollectionPeriod v-model="definition.action.schedule" :disabled="busy || uncertain" />
        </template>
        <label v-if="definition.action.kind !== 'execution'"
          ><VCheckbox v-model="enabled" hide-details="auto" />{{ t('policies.active') }}</label
        >
        <VBtn v-if="editing" type="submit" :disabled="!!(!id || !selectedVariant)">{{
          t('policies.save')
        }}</VBtn>
      </PolicyFieldset>
    </form>
    <VBtn v-if="!current && route.query['id']" :disabled="!!busy" type="submit" @click="open()">
      {{ t('policies.reloadDefinition') }}
    </VBtn>
    <template v-if="current"
      ><p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('policies.version') }}
        {{ current.version }} ·
        {{
          t(
            current.state === 'archived'
              ? 'policies.state.archived'
              : current.enabled
                ? 'policies.state.active'
                : 'policies.state.paused',
          )
        }}
      </p>
      <VBtn :disabled="!!busy" type="submit" @click="open()">{{
        t('policies.reloadDefinition')
      }}</VBtn
      ><VBtn
        v-if="current.state !== 'archived'"
        :disabled="!!(busy || uncertain || !ready)"
        type="submit"
        @click="change({ action: current.enabled ? 'disable' : 'enable' })"
      >
        {{ t(current.enabled ? 'policies.selfService.disable' : 'policies.selfService.enable') }}
      </VBtn>
      <PolicyDelete
        :policy="current"
        :disabled="busy || uncertain || !ready"
        @confirm="change({ action: 'archive' })"
      />
    </template>
    <VBtn
      v-if="definition.action.kind === 'configuration'"
      :disabled="!!(busy || uncertain || !ready || !selectedVariant)"
      type="submit"
      @click="check()"
    >
      {{ t('policies.preview') }}
    </VBtn>
    <ul v-if="preview">
      <li v-for="d in preview.items" :key="objectKey(d.object)">
        <AssignmentFacts :item="d" /> {{ t(`policies.preview_${d.eligibility.state}`) }}
      </li>
    </ul>
    <VBtn
      v-if="preview?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="check(preview.nextCursor)"
    >
      {{ t('policies.next') }}
    </VBtn>
    <VBtn v-if="current" :disabled="!!busy" type="submit" @click="loadProgress()">
      {{ t('policies.refreshProgress') }}
    </VBtn>
    <VDataTable
      v-if="progress"
      :aria-label="t('policies.refreshProgress')"
      :items-per-page="-1"
      hide-default-footer
      :items="progress.items"
      :headers="
        [
          { key: 'object', label: t('policies.device') },
          { key: 'qualification', label: t('policies.identity') },
          { key: 'operations', label: t('policies.operation') },
        ].map((column) => ({ key: column.key, title: column.label, sortable: false }))
      "
      item-value="id"
      :loading-text="t('devices.loading')"
      :no-data-text="t('policies.empty')"
      ><template #[`item.object`]="{ item: row }"><AssignmentFacts :item="row" /></template
      ><template #[`item.qualification`]="{ item: row }">{{
        t(`policies.preview_${row.qualification.state}`)
      }}</template
      ><template #[`item.operations`]="{ item: row }"
        ><details v-if="row.operationIds.length">
          <summary>{{ row.operationIds.length }} {{ t('policies.operation') }}</summary>
          <p v-for="op in row.operationIds" :key="op" class="coordinate">{{ op }}</p>
        </details>
        <span v-else>—</span></template
      ></VDataTable
    >
    <VBtn
      v-if="progress?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="loadProgress(progress.nextCursor)"
    >
      {{ t('policies.next') }}
    </VBtn>
    <p v-if="definition.action.kind === 'execution'">
      {{ t('policies.selfService.executionHint') }}
    </p>
    <p v-else>{{ t('policies.configurationHint') }}</p>
    <p v-if="uncertain && pending" role="alert">
      {{ t('policies.selfService.unknown', { id: pending.body.operationId }) }}
    </p>
    <template v-if="uncertain && pending">
      <p>{{ t('policies.selfService.recoverHint') }}</p>
      <VBtn
        :disabled="!!(busy || requester() !== pending.requester)"
        type="submit"
        @click="recover"
      >
        {{ t('policies.selfService.recover') }}
      </VBtn>
    </template>
  </MdmPage>
</template>
