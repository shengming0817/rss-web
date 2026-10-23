<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
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
import PageFrame from '../../../components/PageFrame.vue'
const runtime = useMdm(),
  client = runtime.policies.policies,
  { t } = useI18n()
const id = ref(crypto.randomUUID() as string),
  current = ref<PolicyRead>(),
  scope = ref(''),
  kind = ref<'unmanage_device' | 'credential'>('unmanage_device'),
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
    scope: scope.value,
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
    () => client.list(cursor, kind.value, undefined, { state: state.value || undefined }),
    (v) => {
      rows.value = v
    },
  )
}
async function read(policy = (pending.value?.input as { id: string } | undefined)?.id ?? id.value) {
  current.value = undefined
  await run(() => client.read(policy), apply)
}
function fresh() {
  if (locked.value) return
  current.value = undefined
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
  if (!current.value) return
  await run(
    () =>
      client.assignments(
        current.value!.id,
        after,
        current.value!.definition.action.kind === 'unmanage_device',
      ),
    (v) => {
      assignments.value = v
    },
  )
}
async function check(after?: string, scopeResult?: string) {
  try {
    const d = definition()
    await run(
      () => client.preview(d, after, scopeResult),
      (v) => {
        preview.value = v
      },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
watch(
  [kind, state],
  () => {
    rows.value = undefined
    void load()
  },
  { immediate: true },
)
</script>
<template>
  <PageFrame :title="t('gap.lifecycle')" :busy="busy" :failure="failure">
    <p>{{ t('gap.retirementHint') }}</p>
    <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
      t('policies.policies')
    }}</RouterLink>
    <label
      >{{ t('gap.action')
      }}<select v-model="kind" :disabled="locked || !!current">
        <option value="unmanage_device">{{ t('gap.retire') }}</option>
        <option value="credential">{{ t('gap.credential') }}</option>
      </select></label
    >
    <label
      >{{ t('gap.state')
      }}<select v-model="state">
        <option value="">{{ t('gap.allStates') }}</option>
        <option v-for="s in ['enabled', 'disabled', 'archived']" :key="s">{{ s }}</option>
      </select></label
    >
    <UiButton :disabled="locked" @click="fresh">{{ t('gap.newDraft') }}</UiButton
    ><UiButton :disabled="busy" @click="load()">{{ t('gap.load') }}</UiButton>
    <ul>
      <li v-for="p in rows?.items" :key="p.id">
        <UiButton :disabled="locked" @click="read(p.id)">{{ p.id }} · {{ p.state }}</UiButton>
      </li>
    </ul>
    <UiButton v-if="rows?.nextCursor" @click="load(rows.nextCursor)">{{ t('gap.next') }}</UiButton>
    <form @submit.prevent="save">
      <fieldset :disabled="locked || current?.state === 'archived'">
        <label>{{ t('gap.policy') }}<input v-model="id" :readonly="!!current" required /></label
        ><UiButton type="button" @click="read()">{{ t('gap.load') }}</UiButton>
        <label>{{ t('gap.scope') }}<input v-model="scope" required /></label
        ><CatalogLocator v-model="scope" collection="scopes" :disabled="locked" />
        <template v-if="kind === 'credential'"
          ><label
            >{{ t('gap.action')
            }}<select v-model="credential">
              <option v-if="credential.endsWith('rss_login')" :value="credential" disabled>
                {{ credential }}
              </option>
              <option v-for="op in choices" :key="op" :value="op">{{ t('gap.' + op) }}</option>
            </select></label
          >
          <label
            >{{ t('gap.architecture')
            }}<select v-model="architecture">
              <option>x86_64</option>
              <option>aarch64</option>
            </select></label
          >
          <label
            >{{ t('policies.frequency')
            }}<select v-model="frequency">
              <option
                v-for="f in ['once_per_version', 'once_per_entry', 'every_trigger'] as const"
                :key="f"
                :value="f"
              >
                {{ f }}
              </option>
            </select></label
          ><label>{{ t('gap.volume') }}<input v-model="volume" /></label
          ><label>{{ t('gap.protector') }}<input v-model="protector" /></label
          ><label>{{ t('gap.sid') }}<input v-model="sid" /></label> </template
        ><NativeScheduleEditor v-model="schedule" :disabled="locked" />
        <label
          >{{ t('software.taskLifetime')
          }}<input v-model.number="duration" type="number" min="60" max="604800" required
        /></label>
        <label><input v-model="enabled" type="checkbox" />{{ t('gap.enabled') }}</label>
        <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label>
        <UiButton type="submit" :disabled="!confirmation">{{ t('gap.save') }}</UiButton
        ><UiButton type="button" @click="check()">{{ t('policies.preview') }}</UiButton>
        <template v-if="current"
          ><UiButton
            type="button"
            :disabled="!confirmation"
            @click="change({ action: current.enabled ? 'disable' : 'enable' })"
            >{{
              t(current.enabled ? 'policies.selfService.disable' : 'policies.selfService.enable')
            }}</UiButton
          ><UiButton
            type="button"
            :disabled="!confirmation || current.state !== 'disabled'"
            @click="change({ action: 'archive' })"
            >{{ t('gap.archived') }}</UiButton
          >
          <label>{{ t('gap.deadline') }}<input v-model.number="deadline" type="number" /></label
          ><UiButton
            type="button"
            :disabled="!confirmation || !current.enabled"
            @click="trigger()"
            >{{ t('gap.trigger') }}</UiButton
          ></template
        >
      </fieldset>
    </form>
    <template v-if="pending"
      ><p role="alert">
        {{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }} {{ pending.id }}
      </p>
      <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
      ><UiButton
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="restore"
        >{{ t('gap.replayOriginal') }}</UiButton
      ><UiButton
        v-if="pending.state === 'conflict'"
        @click="
          async () => {
            await read()
            if (!failure) resolvedConflict()
          }
        "
        >{{ t('gap.compare') }}</UiButton
      ></template
    >
    <ul v-if="preview">
      <li v-for="(row, index) in preview.items" :key="index"><AssignmentFacts :item="row" /></li>
    </ul>
    <UiButton v-if="preview?.nextCursor" @click="check(preview.nextCursor, preview.scopeResult)">{{
      t('gap.next')
    }}</UiButton>
    <UiButton v-if="current" :disabled="busy" @click="progress()">{{
      t('policies.refreshProgress')
    }}</UiButton>
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
      <UiButton
        v-for="op in kind === 'unmanage_device' ? row.operationIds : []"
        :key="op"
        @click="retirementId = op"
        >{{ op }}</UiButton
      >
    </article>
    <UiButton v-if="assignments?.nextCursor" @click="progress(assignments.nextCursor)">{{
      t('gap.next')
    }}</UiButton>
    <RetirementDetails v-if="retirementId && kind === 'unmanage_device'" :id="retirementId" />
  </PageFrame>
</template>
