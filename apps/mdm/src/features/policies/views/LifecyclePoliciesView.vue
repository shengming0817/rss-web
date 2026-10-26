<script setup lang="ts">
import { VSelect, VBtn, VTextField, VCheckbox } from 'vuetify/components'

import type { PreviewInput } from '../clients/policies'

import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import { ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import PolicyIdentityEditor from '../components/PolicyIdentityEditor.vue'
import PolicyEntry from '../components/PolicyEntry.vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import {
  policyDefinition,
  defaultSchedule,
  type PolicyRead,
  type PolicyDefinition,
  type PolicyChange,
} from '../clients/model'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import AssignmentFacts from '../components/AssignmentFacts.vue'
import CatalogLocator from '../components/CatalogLocator.vue'
import RetirementDetails from '../../devices/components/RetirementDetails.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const route = useRoute(),
  runtime = useMdm(),
  client = runtime.policies.policies,
  { t } = useI18n()
const alias = ref<string | null>(null),
  customEvent = ref<string | null>(null)
const id = ref(crypto.randomUUID() as string),
  current = ref<PolicyRead>(),
  scope = ref(''),
  kind = ref<'unmanage_device' | 'credential'>(
    route.query['action'] === 'credential' ? 'credential' : 'unmanage_device',
  ),
  enabled = ref(false),
  schedule = ref(defaultSchedule()),
  credential = ref('collect_bitlocker'),
  architecture = ref<'x86_64' | 'aarch64'>('x86_64'),
  frequency = ref<'once_per_version' | 'once_per_entry' | 'every_trigger'>('once_per_version'),
  volume = ref(''),
  protector = ref(''),
  sid = ref(''),
  confirmation = ref(false),
  retirementId = ref(''),
  deadline = ref(Math.floor(Date.now() / 1000) + 3600),
  duration = ref(3600)
const choices = [
  'collect_bitlocker',
  'verify_bitlocker',
  'rotate_bitlocker',
  'rotate_local_administrator',
  'verify_local_administrator',
]
const { run, submit, pending, locked, busy, failure, resolvedConflict } = useOriginalOperation(
  () => 'lifecycle-policy',
)
const rows = ref<Awaited<ReturnType<typeof client.list>>>(),
  assignments = ref<Awaited<ReturnType<typeof client.assignments>>>(),
  preview = ref<Awaited<ReturnType<typeof client.preview>>>(),
  state = ref<'' | 'enabled' | 'disabled' | 'archived'>('')
function definition(): PolicyDefinition {
  const previous = current.value?.definition.action
  const operation =
    credential.value.endsWith('rss_login') && previous?.kind === 'credential'
      ? previous.operation
      : credential.value === 'collect_bitlocker'
        ? { kind: credential.value }
        : credential.value.endsWith('bitlocker')
          ? { kind: credential.value, volume: volume.value, protector: protector.value }
          : { kind: credential.value, sid: sid.value }
  return policyDefinition({
    ...current.value?.definition,
    customEvent: customEvent.value,
    scope: scope.value,
    alias: alias.value,
    action:
      kind.value === 'unmanage_device'
        ? { kind: kind.value, schedule: toRaw(schedule.value), runLifetimeSeconds: duration.value }
        : {
            kind: kind.value,
            operation,
            architecture: architecture.value,
            frequency: frequency.value,
            schedule: toRaw(schedule.value),
            runLifetimeSeconds: duration.value,
          },
  })
}
function apply(p: PolicyRead) {
  if (p.definition.action.kind !== 'unmanage_device' && p.definition.action.kind !== 'credential')
    throw new Error('Wrong policy action')
  current.value = p
  alias.value = p.definition.alias
  customEvent.value = p.definition.customEvent
  id.value = p.id
  scope.value = p.definition.scope
  kind.value = p.definition.action.kind
  enabled.value = p.enabled
  schedule.value = structuredClone(p.definition.action.schedule)
  duration.value = p.definition.action.runLifetimeSeconds
  if (p.definition.action.kind === 'credential') {
    const a = p.definition.action
    credential.value = a.operation.kind
    architecture.value = a.architecture
    frequency.value = a.frequency
    volume.value = 'volume' in a.operation ? a.operation.volume! : ''
    protector.value = 'protector' in a.operation ? a.operation.protector! : ''
    sid.value = 'sid' in a.operation ? a.operation.sid! : ''
  }
}
async function load(cursor?: string) {
  rows.value = undefined
  await run(
    () =>
      client.list({
        cursor,
        filter: allOf(
          queryComparison('action', '==', kind.value),
          state.value ? queryComparison('state', '==', state.value) : undefined,
        ),
      }),
    (v) => {
      rows.value = v
    },
  )
}
async function read(policy = (pending.value?.input as { id: string } | undefined)?.id ?? id.value) {
  current.value = undefined
  return run(() => client.read(policy), apply)
}
function fresh() {
  if (locked.value) return
  current.value = undefined
  alias.value = null
  customEvent.value = null
  id.value = crypto.randomUUID()
  scope.value = ''
  enabled.value = false
  schedule.value = defaultSchedule()
  assignments.value = undefined
  preview.value = undefined
  retirementId.value = ''
}
function change(input: PolicyChange, replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  void submit(
    {
      type: 'change' as const,
      id: id.value,
      expectedRevision: current.value?.revision ?? 0,
      input,
    },
    (operationId, original) =>
      client.change(original.id, {
        operationId,
        expectedRevision: original.expectedRevision,
        input: original.input,
      }),
    apply,
    replay,
  )
}
function save() {
  try {
    change({ action: 'put', definition: definition(), enabled: enabled.value })
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function trigger(replay = false) {
  if ((!current.value && !replay) || !confirmation.value) return
  confirmation.value = false
  const input = replay
    ? (pending.value!.input as { type: 'trigger'; id: string; revision: number; deadline: number })
    : {
        type: 'trigger' as const,
        id: current.value!.id,
        revision: current.value!.revision,
        deadline: deadline.value,
      }
  const ok = await submit(
    input,
    (operation, original) =>
      client.rerun(original.id, operation, original.revision, original.deadline),
    () => {},
    replay,
  )
  if (ok) {
    await read(input.id)
    await progress()
  }
}
function restore() {
  const original = pending.value?.input as { type: string; input?: PolicyChange } | undefined
  if (original?.type === 'trigger') trigger(true)
  else if (original?.input) change(original.input, true)
}
async function progress(after?: string) {
  assignments.value = undefined
  if (!current.value) return
  const target = current.value.id
  await run(
    () => client.assignments(target, { cursor: after }),
    (v) => {
      if (current.value?.id === target) assignments.value = v
    },
  )
}
let previewInput: PreviewInput | undefined
watch(
  () =>
    JSON.stringify([
      runtime.session.state.value,
      current.value?.definition,
      id.value,
      scope.value,
      kind.value,
      schedule.value,
      duration.value,
      credential.value,
      architecture.value,
      frequency.value,
      volume.value,
      protector.value,
      sid.value,
    ]),
  () => {
    previewInput = undefined
    preview.value = undefined
  },
  { flush: 'sync' },
)
async function check(cursor?: string) {
  if (busy.value || locked.value) return
  const previous = cursor ? preview.value : undefined
  preview.value = undefined
  try {
    const d = definition()
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

watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    alias.value = null
    customEvent.value = null
    current.value = undefined
    rows.value = undefined
    assignments.value = undefined
    preview.value = undefined
    previewInput = undefined
    id.value = crypto.randomUUID()
    scope.value = ''
    confirmation.value = false
  },
  { flush: 'sync' },
)
watch(
  () => current.value?.id,
  () => {
    assignments.value = undefined
  },
  { flush: 'sync' },
)
watch(
  [kind, state],
  () => {
    rows.value = undefined
    if (typeof route.query['id'] === 'string' && !current.value) void read(route.query['id'])
    else void load()
  },
  { immediate: true },
)
watch(
  () => route.query['id'],
  (value) => {
    if (typeof value === 'string') void read(value)
  },
)
</script>
<template>
  <MdmPage :title="t('gap.lifecycle')" :busy="busy" :failure="failure">
    <p>{{ t('gap.retirementHint') }}</p>
    <PolicyEntry v-if="current" :policy="current" />
    <fieldset :disabled="locked || current?.state === 'archived'">
      <PolicyIdentityEditor v-model:alias="alias" v-model:event="customEvent" />
    </fieldset>
    <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
      t('policies.policies')
    }}</RouterLink>
    <label
      >{{ t('gap.action')
      }}<VSelect
        v-model="kind"
        :disabled="locked || !!current"
        :items="[
          { title: String(t('gap.retire')), value: 'unmanage_device' },
          { title: String(t('gap.credential')), value: 'credential' },
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <label
      >{{ t('gap.state')
      }}<VSelect
        v-model="state"
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
    /></label>
    <VBtn :disabled="locked" @click="fresh">{{ t('gap.newDraft') }}</VBtn
    ><VBtn :disabled="busy" @click="load()">{{ t('gap.load') }}</VBtn>
    <ul>
      <li v-for="p in rows?.items" :key="p.id">
        <VBtn :disabled="locked" @click="read(p.id)">{{ p.id }} · {{ p.state }}</VBtn>
      </li>
    </ul>
    <VBtn v-if="rows?.nextCursor" @click="load(rows.nextCursor)">{{ t('gap.next') }}</VBtn>
    <form @submit.prevent="save">
      <fieldset :disabled="locked || current?.state === 'archived'">
        <label
          >{{ t('gap.policy')
          }}<VTextField
            v-model="id"
            :readonly="!!current"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><VBtn type="button" @click="read()">{{ t('gap.load') }}</VBtn>
        <label
          >{{ t('gap.scope')
          }}<VTextField
            v-model="scope"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><CatalogLocator v-model="scope" collection="scopes" :disabled="locked" />
        <template v-if="kind === 'credential'"
          ><label
            >{{ t('gap.action')
            }}<VSelect
              v-model="credential"
              :items="[
                ...(credential.endsWith('rss_login')
                  ? [{ title: String(credential), value: credential, props: { disabled: true } }]
                  : []),
                ...choices.map((op) => ({ title: String(t('gap.' + op)), value: op })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label>
          <label
            >{{ t('gap.architecture')
            }}<VSelect
              v-model="architecture"
              :items="[
                { title: 'x86_64', value: 'x86_64' },
                { title: 'aarch64', value: 'aarch64' },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label>
          <label
            >{{ t('policies.frequency')
            }}<VSelect
              v-model="frequency"
              :items="[
                ...(['once_per_version', 'once_per_entry', 'every_trigger'] as const).map((f) => ({
                  title: String(f),
                  value: f,
                })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><label
            >{{ t('gap.volume')
            }}<VTextField
              v-model="volume"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><label
            >{{ t('gap.protector')
            }}<VTextField
              v-model="protector"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><label
            >{{ t('gap.sid')
            }}<VTextField
              v-model="sid"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label> </template
        ><NativeScheduleEditor v-model="schedule" :disabled="locked" />
        <label
          >{{ t('software.taskLifetime')
          }}<VTextField
            v-model.number="duration"
            type="number"
            min="60"
            max="604800"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto"
        /></label>
        <label><VCheckbox v-model="enabled" hide-details="auto" />{{ t('gap.enabled') }}</label>
        <label
          ><VCheckbox v-model="confirmation" hide-details="auto" />{{
            t('gap.confirmation')
          }}</label
        >
        <VBtn type="submit" :disabled="!confirmation">{{ t('gap.save') }}</VBtn
        ><VBtn type="button" @click="check()">{{ t('policies.preview') }}</VBtn>
        <template v-if="current"
          ><VBtn
            type="button"
            :disabled="!confirmation"
            @click="change({ action: current.enabled ? 'disable' : 'enable' })"
            >{{
              t(current.enabled ? 'policies.selfService.disable' : 'policies.selfService.enable')
            }}</VBtn
          ><VBtn
            type="button"
            :disabled="!confirmation || current.state !== 'disabled'"
            @click="change({ action: 'archive' })"
            >{{ t('gap.archived') }}</VBtn
          >
          <label
            >{{ t('gap.deadline')
            }}<VTextField
              v-model.number="deadline"
              type="number"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><VBtn type="button" :disabled="!confirmation || !current.enabled" @click="trigger()">{{
            t('gap.trigger')
          }}</VBtn></template
        >
      </fieldset>
    </form>
    <template v-if="pending"
      ><p role="alert">
        {{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }} {{ pending.id }}
      </p>
      <label
        ><VCheckbox v-model="confirmation" hide-details="auto" />{{ t('gap.confirmation') }}</label
      ><VBtn
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="restore"
        >{{ t('gap.replayOriginal') }}</VBtn
      ><VBtn
        v-if="pending.state === 'conflict'"
        :disabled="busy"
        @click="
          async () => {
            const ok = await read()
            if (ok) resolvedConflict()
          }
        "
        >{{ t('gap.compare') }}</VBtn
      ></template
    >
    <ul v-if="preview">
      <li v-for="(row, index) in preview.items" :key="index"><AssignmentFacts :item="row" /></li>
    </ul>
    <VBtn v-if="preview?.nextCursor" @click="check(preview.nextCursor)">{{ t('gap.next') }}</VBtn>
    <VBtn v-if="current" :disabled="busy" @click="progress()">{{
      t('policies.refreshProgress')
    }}</VBtn>
    <article v-for="(row, index) in assignments?.items" :key="index">
      <AssignmentFacts :item="row" /><RouterLink
        v-for="op in kind === 'credential' ? row.operationIds : []"
        :key="op"
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: op },
          query: { policy: current?.id },
        }"
        >{{ op }}</RouterLink
      >
      <p>{{ row.qualification.state }}</p>
      <VBtn
        v-for="op in kind === 'unmanage_device' ? row.operationIds : []"
        :key="op"
        @click="retirementId = op"
        >{{ op }}</VBtn
      >
    </article>
    <VBtn v-if="assignments?.nextCursor" @click="progress(assignments.nextCursor)">{{
      t('gap.next')
    }}</VBtn>
    <RetirementDetails v-if="retirementId && kind === 'unmanage_device'" :id="retirementId" />
  </MdmPage>
</template>
