<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  defaultSchedule,
  policyDefinition,
  type PolicyRead,
  type ExecutionDefinition,
  type ConfigurationDefinition,
  type PolicyChange,
} from '../clients/model'
import type { ResourceRead, ScriptSpec, Json } from '../clients/resources'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import SelfServiceEditor from '../components/SelfServiceEditor.vue'
import PolicyFrame from '../components/PolicyFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.policies,
  route = useRoute(),
  router = useRouter()
const { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<PolicyRead>(),
  resource = ref<ResourceRead>()
const id = ref(typeof route.query['id'] === 'string' ? route.query['id'] : '')
function fresh(
  kind: 'execution' | 'configuration' = 'execution',
): ExecutionDefinition | ConfigurationDefinition {
  if (kind === 'configuration')
    return {
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
  return {
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
    resource.value = undefined
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
            (definition.value.action.kind === 'execution' ? 'script' : 'configuration'),
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
  if (current.value || (kind !== 'execution' && kind !== 'configuration')) return
  definition.value = { ...fresh(kind), scope: definition.value.scope }
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
}
const preview = ref<Awaited<ReturnType<typeof client.preview>>>(),
  progress = ref<Awaited<ReturnType<typeof client.devices>>>()
function check(after?: string, scopeResult?: string) {
  if (!ready.value || busy.value || uncertain.value) return
  try {
    const d = policyDefinition(structuredClone(toRaw(definition.value)))
    void run(
      () => client.preview(d, after, scopeResult),
      (v) => {
        preview.value = v
      },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
function loadProgress(after?: string) {
  const p = current.value
  if (p)
    void run(
      () => client.devices(p.id, after),
      (v) => {
        progress.value = v
      },
    )
}
const fields = computed(() =>
  Object.entries(spec.value?.parameters['properties'] ?? {}).map(([name, value]) => {
    const schema = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
  if (p.definition.action.kind !== 'execution' && p.definition.action.kind !== 'configuration')
    throw new Error('Wrong policy action')
  ready.value = true
  current.value = p
  id.value = p.id
  enabled.value = p.enabled
  if (p.definition.action.kind === 'execution')
    definition.value = structuredClone({ ...p.definition, action: p.definition.action })
  else definition.value = structuredClone({ ...p.definition, action: p.definition.action })
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
}
function load(after?: string) {
  return run(
    () => client.list(after),
    (v) => {
      list.value = {
        ...v,
        items: v.items.filter((p) =>
          ['execution', 'configuration'].includes(p.definition.action.kind),
        ),
      }
    },
  )
}
function open(target = pending.value?.id ?? id.value) {
  if (!target || busy.value) return
  ready.value = false
  current.value = undefined
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
  definition.value = fresh()
  enabled.value = false
  id.value = target
  return run(
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
}
function resetDraft() {
  ready.value = true
  current.value = undefined
  resource.value = undefined
  preview.value = undefined
  progress.value = undefined
  id.value = crypto.randomUUID()
  definition.value = fresh()
  enabled.value = false
  pending.value = undefined
}
function select(target: string) {
  void router.push({ query: { ...route.query, id: target } })
}
function create() {
  if (busy.value || uncertain.value) return
  if (route.query['id']) void router.push({ query: { ...route.query, id: undefined } })
  else resetDraft()
}
watch(
  () => route.query['id'],
  (target) => {
    pending.value = undefined
    if (typeof target === 'string') void open(target)
    else resetDraft()
  },
  { flush: 'sync' },
)
function bind() {
  const target = definition.value.action.resource.id
  void run(
    () => runtime.policies.resources.read(target),
    (r) => {
      if (r.kind !== (definition.value.action.kind === 'execution' ? 'script' : 'configuration'))
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
      list.value = undefined
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
    () => {
      if (requester() !== original.requester) throw new Error('Policy requester changed')
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
  else if (!id.value) resetDraft()
})
</script>
<template>
  <PolicyFrame :title="t('policies.policies')" :busy="busy" :failure="failure">
    <p>{{ t('policies.policyHint') }}</p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="select(item.id)">
          {{ item.definition.selfService?.displayName ?? item.id }} ·
          {{ t(item.enabled ? 'policies.state.active' : 'policies.state.paused') }}
        </button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain || !ready">
        <label for="policy-action">{{ t('policies.actionKind') }}</label
        ><select
          id="policy-action"
          :value="definition.action.kind"
          :disabled="!!current"
          @change="actionKind"
        >
          <option value="execution">{{ t('policies.scripts') }}</option>
          <option value="configuration">{{ t('policies.configurations') }}</option>
        </select>
        <label for="policy-id">{{ t('policies.id') }}</label
        ><input id="policy-id" v-model="id" :readonly="!!current" required />
        <label for="policy-resource">{{ t('policies.resources') }}</label
        ><input id="policy-resource" v-model="definition.action.resource.id" required />
        <label for="policy-version">{{ t('policies.version') }}</label
        ><input id="policy-version" v-model="definition.action.resource.version" required />
        <button type="button" @click="bind">{{ t('policies.selfService.loadResource') }}</button>
        <label for="policy-variant">{{ t('policies.variant') }}</label
        ><select
          id="policy-variant"
          :value="
            variants.findIndex(
              (v) =>
                v.key === definition.action.resource.variant &&
                v.platform === definition.action.resource.platform &&
                v.architecture === definition.action.resource.architecture,
            )
          "
          required
          @change="selectVariant"
        >
          <option :value="-1" disabled>{{ t('policies.selfService.chooseVariant') }}</option>
          <option v-for="(v, index) in variants" :key="index" :value="index">
            {{ v.platform }} / {{ v.architecture }} / {{ v.key }}
          </option>
        </select>
        <label for="policy-scope">{{ t('policies.scopes') }}</label
        ><input id="policy-scope" v-model="definition.scope" required />
        <template v-if="definition.action.kind === 'execution'">
          <p>{{ t('policies.selfService.parameterHint') }}</p>
          <fieldset v-for="f in fields" :key="f.name">
            <legend>{{ f.name }}</legend>
            <label :for="`source-${f.name}`">{{ t('policies.source') }}</label
            ><select
              :id="`source-${f.name}`"
              :value="definition.action.parameters[f.name]?.kind"
              @change="source(f.name, $event)"
            >
              <option value="fixed">{{ t('policies.selfService.fixed') }}</option>
              <option value="input">{{ t('policies.selfService.input') }}</option>
            </select>
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
              <select
                v-if="f.choices"
                :id="`value-${f.name}`"
                :value="f.choices.findIndex((v) => v === fixedValue(f.name))"
                required
                @change="choice(f.name, $event)"
              >
                <option :value="-1" disabled>{{ t('policies.selfService.requiredValue') }}</option>
                <option v-for="(value, index) in f.choices" :key="index" :value="index">
                  {{ String(value) }}
                </option>
              </select>
              <input
                v-else
                :id="`value-${f.name}`"
                :type="f.type === 'boolean' ? 'checkbox' : f.type === 'integer' ? 'number' : 'text'"
                :checked="fixedValue(f.name) === true"
                :value="fixedValue(f.name)"
                :min="numeric(f.schema, 'minimum')"
                :max="numeric(f.schema, 'maximum')"
                :minlength="numeric(f.schema, 'minLength')"
                :maxlength="numeric(f.schema, 'maxLength')"
                :required="
                  f.type === 'integer' ||
                  (f.type === 'string' && (numeric(f.schema, 'minLength') ?? 0) > 0)
                "
                :placeholder="t('policies.selfService.requiredValue')"
                @input="parameter(f.name, $event)"
              />
            </template>
          </fieldset>
          <NativeScheduleEditor v-model="definition.action.schedule" />
          <label for="policy-frequency">{{ t('policies.selfService.frequency') }}</label
          ><select id="policy-frequency" v-model="definition.action.frequency">
            <option
              v-for="value in ['once_per_version', 'once_per_entry', 'every_trigger']"
              :key="value"
              :value="value"
            >
              {{ t(`policies.selfService.${value}`) }}
            </option>
          </select>
          <label for="policy-lifetime">{{ t('policies.selfService.lifetime') }}</label
          ><input
            id="policy-lifetime"
            v-model.number="definition.action.runLifetimeSeconds"
            type="number"
            min="60"
            max="604800"
            required
          />
          <label><input v-model="enabled" type="checkbox" />{{ t('policies.active') }}</label>
          <SelfServiceEditor v-model="definition.selfService" />
        </template>
        <template v-else
          ><label for="policy-exit">{{ t('policies.exitBehavior') }}</label
          ><select id="policy-exit" v-model="definition.action.exit">
            <option value="retain">{{ t('policies.configurationRetain') }}</option>
            <option value="remove">{{ t('policies.configurationRemove') }}</option>
          </select></template
        >
        <label v-if="definition.action.kind === 'configuration'"
          ><input v-model="enabled" type="checkbox" />{{ t('policies.active') }}</label
        >
        <button type="submit" :disabled="!id || !selectedVariant">{{ t('policies.save') }}</button>
      </fieldset>
    </form>
    <button v-if="!current && route.query['id']" :disabled="busy" @click="open()">
      {{ t('policies.reloadDefinition') }}
    </button>
    <template v-if="current"
      ><p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('policies.version') }}
        {{ current.version }}
      </p>
      <button :disabled="busy" @click="open()">{{ t('policies.reloadDefinition') }}</button
      ><button
        :disabled="busy || uncertain"
        @click="change({ action: current.enabled ? 'disable' : 'enable' })"
      >
        {{ t(current.enabled ? 'policies.selfService.disable' : 'policies.selfService.enable') }}
      </button></template
    >
    <button
      v-if="definition.action.kind === 'configuration'"
      :disabled="busy || uncertain || !ready || !selectedVariant"
      @click="check()"
    >
      {{ t('policies.preview') }}
    </button>
    <ul v-if="preview">
      <li v-for="d in preview.items" :key="d.device">
        {{ d.device }} · {{ t(`policies.preview_${d.eligibility.state}`) }}
      </li>
    </ul>
    <button
      v-if="preview?.nextCursor"
      :disabled="busy"
      @click="check(preview.nextCursor, preview.scopeResult)"
    >
      {{ t('policies.next') }}
    </button>
    <button
      v-if="current && definition.action.kind === 'configuration'"
      :disabled="busy"
      @click="loadProgress()"
    >
      {{ t('policies.refreshProgress') }}
    </button>
    <ul v-if="progress">
      <li v-for="d in progress.items" :key="d.device">
        {{ d.device }} · {{ t(`policies.preview_${d.assignment}`) }}
        <ul>
          <li v-for="op in d.operationIds" :key="op">{{ t('policies.operation') }} · {{ op }}</li>
          <li v-for="diagnosis in d.diagnoses" :key="diagnosis">{{ diagnosis }}</li>
        </ul>
      </li>
    </ul>
    <button v-if="progress?.nextCursor" :disabled="busy" @click="loadProgress(progress.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <p v-if="definition.action.kind === 'execution'">
      {{ t('policies.selfService.executionHint') }}
    </p>
    <p v-else>{{ t('policies.configurationHint') }}</p>
    <p v-if="uncertain && pending" role="alert">
      {{ t('policies.selfService.unknown', { id: pending.body.operationId }) }}
    </p>
    <template v-if="uncertain && pending">
      <p>{{ t('policies.selfService.recoverHint') }}</p>
      <button :disabled="busy || requester() !== pending.requester" @click="recover">
        {{ t('policies.selfService.recover') }}
      </button>
    </template>
  </PolicyFrame>
</template>
