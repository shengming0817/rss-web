<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { jsonValue } from '../clients/resources'
import type { PolicyRead, PolicyDefinition, PolicyChange } from '../clients/policies'
import PolicyFrame from '../components/PolicyFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.policies,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  current = ref<PolicyRead>(),
  id = ref(typeof route.query['id'] === 'string' ? route.query['id'] : '')
const definition = ref<PolicyDefinition>({
    source: 'resource',
    parameters: {},
    resource: '',
    resourceVersion: '1',
    scope: '',
    enabled: true,
    exitBehavior: 'cancel',
    trigger: { kind: 'on_change' },
    validity: null,
  }),
  previewRows = ref<PolicyRead['members']>()
const parameters = ref('{}')
function validateParameters(event: Event) {
  const input = event.target as HTMLTextAreaElement
  try {
    jsonValue(JSON.parse(input.value), 65536)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
let pending: (() => Promise<void>) | undefined
function apply(value: PolicyRead) {
  current.value = value
  id.value = value.id
  definition.value = structuredClone(value.definition)
  parameters.value = JSON.stringify(value.definition.parameters)
  previewRows.value = undefined
}
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('policies', cursor),
    (v) => (list.value = v),
  )
}
function open(target = id.value) {
  if (uncertain.value) return
  void run(() => client.read(target), apply)
}
function progress() {
  if (current.value) {
    const target = current.value.id
    void run(
      () => client.read(target),
      (v) => {
        if (current.value?.id === v.id)
          current.value = { ...current.value, computation: v.computation, members: v.members }
      },
    )
  }
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = `policy-${crypto.randomUUID()}`
  current.value = undefined
  previewRows.value = undefined
}
function change(input: PolicyChange) {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  pending = async () => {
    await runWrite(
      () => client.change(target, body),
      (v) => {
        apply(v)
        list.value = undefined
      },
    )
  }
  void pending()
}
function draft() {
  return {
    ...structuredClone(toRaw(definition.value)),
    parameters: jsonValue(JSON.parse(parameters.value), 65536),
  }
}
function save() {
  change({ action: 'put', definition: draft() })
}
function preview() {
  if (busy.value || uncertain.value) return
  const value = draft()
  void run(
    () => client.preview(id.value, value),
    (v) => (previewRows.value = v),
  )
}
onMounted(async () => {
  await run(
    () => runtime.policies.catalog.list('policies'),
    (v) => (list.value = v),
  )
  if (id.value) open()
})
</script>
<template>
  <PolicyFrame :title="t('policies.policies')" :busy="busy" :failure="failure">
    <p>{{ t('policies.policyHint') }}</p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button>
    <button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ item.label }} · {{ t(`policies.state.${item.status}`) }}
        </button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain || current?.archived">
        <label for="policy-id">{{ t('policies.id') }}</label
        ><input id="policy-id" v-model="id" :readonly="!!current" required />
        <label for="policy-source">{{ t('policies.source') }}</label
        ><select id="policy-source" v-model="definition.source">
          <option value="resource">{{ t('policies.resources') }}</option>
          <option value="configuration">{{ t('policies.configurations') }}</option>
        </select>
        <label for="policy-parameters">{{ t('policies.parameters') }}</label
        ><textarea
          id="policy-parameters"
          v-model="parameters"
          required
          @input="validateParameters"
        />
        <label for="policy-resource">{{ t('policies.resources') }}</label
        ><input id="policy-resource" v-model="definition.resource" required />
        <label for="policy-version">{{ t('policies.version') }}</label
        ><input id="policy-version" v-model="definition.resourceVersion" required />
        <label for="policy-scope">{{ t('policies.scopes') }}</label
        ><input id="policy-scope" v-model="definition.scope" required />
        <label
          ><input v-model="definition.enabled" type="checkbox" />{{ t('policies.active') }}</label
        >
        <label for="policy-exit">{{ t('policies.exitBehavior') }}</label
        ><select id="policy-exit" v-model="definition.exitBehavior">
          <option value="cancel">{{ t('policies.cancelOutstanding') }}</option>
          <option value="retain">{{ t('policies.retainEffects') }}</option>
        </select>
        <label for="policy-trigger">{{ t('policies.trigger') }}</label
        ><select
          id="policy-trigger"
          :value="definition.trigger.kind"
          @change="
            definition.trigger =
              ($event.target as HTMLSelectElement).value === 'interval'
                ? { kind: 'interval', seconds: 3600 }
                : { kind: ($event.target as HTMLSelectElement).value as 'on_change' | 'check_in' }
          "
        >
          <option value="on_change">{{ t('policies.onChange') }}</option>
          <option value="interval">{{ t('policies.interval') }}</option>
          <option value="check_in">{{ t('policies.checkIn') }}</option>
        </select>
        <template v-if="definition.trigger.kind === 'interval'"
          ><label for="policy-seconds">{{ t('policies.seconds') }}</label
          ><input
            id="policy-seconds"
            v-model.number="definition.trigger.seconds"
            type="number"
            min="60"
            max="31536000"
            required
        /></template>
        <label
          ><input
            type="checkbox"
            :checked="definition.validity !== null"
            @change="
              definition.validity = ($event.target as HTMLInputElement).checked
                ? {
                    start: Math.floor(Date.now() / 1000),
                    end: Math.floor(Date.now() / 1000) + 86400,
                  }
                : null
            "
          />{{ t('policies.optionalWindow') }}</label
        >
        <template v-if="definition.validity"
          ><label for="policy-start">{{ t('policies.notBefore') }}</label
          ><input
            id="policy-start"
            v-model.number="definition.validity.start"
            type="number"
            min="0"
            required /><label for="policy-end">{{ t('policies.until') }}</label
          ><input
            id="policy-end"
            v-model.number="definition.validity.end"
            type="number"
            :min="definition.validity.start + 1"
            required
        /></template>
        <button type="submit" :disabled="!id">{{ t('policies.save') }}</button
        ><button type="button" :disabled="!id" @click="preview">{{ t('policies.preview') }}</button>
      </fieldset>
    </form>
    <template v-if="current"
      ><p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('policies.computation') }}
        {{ current.computation.sequence }} · {{ t(`policies.state.${current.computation.status}`) }}
      </p>
      <button :disabled="busy" @click="progress">{{ t('policies.refreshProgress') }}</button
      ><button :disabled="busy || uncertain" @click="open()">
        {{ t('policies.reloadDefinition') }}</button
      ><button
        :disabled="busy || uncertain || current.archived"
        @click="change({ action: 'archive' })"
      >
        {{ t('policies.archive') }}
      </button>
      <p v-if="!current.members.length">{{ t('policies.waitingMembers') }}</p></template
    >
    <section v-if="previewRows">
      <h2>{{ t('policies.preview') }}</h2>
      <ul>
        <li v-for="row in previewRows" :key="row.device">
          {{ row.device }} · {{ t(`policies.assignment.${row.reason}`) }}
        </li>
      </ul>
    </section>
    <table v-if="current?.members.length">
      <thead>
        <tr>
          <th>{{ t('policies.targets') }}</th>
          <th>{{ t('policies.reason') }}</th>
          <th>{{ t('policies.executions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in current.members" :key="row.device">
          <td>{{ row.device }}</td>
          <td>{{ t(`policies.assignment.${row.reason}`) }}</td>
          <td>
            <RouterLink
              v-if="row.execution"
              :to="{
                name: 'policy-execution',
                params: { tenant: runtime.tenant, execution: row.execution },
              }"
              >{{ row.execution }}</RouterLink
            ><button
              v-if="row.execution"
              :disabled="busy || uncertain"
              @click="change({ action: 'cancel_run', execution: row.execution })"
            >
              {{ t('policies.cancel') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
  </PolicyFrame>
</template>
