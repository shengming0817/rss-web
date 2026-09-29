<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  updateDefinition,
  type UpdateChange,
  type UpdateDefinition,
  type UpdateRing,
} from '../clients/updates'
import SoftwareFrame from '../components/SoftwareFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.updates,
  route = useRoute()
const { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  releases = ref<Awaited<ReturnType<typeof client.releases>>>([]),
  selected = ref<UpdateRing>()
function fresh(): UpdateDefinition {
  return {
    title: '',
    scope: '',
    platform: 'windows',
    enabled: true,
    target: { kind: 'os', release: '' },
    deferDays: 0,
    deadline: Math.floor(Date.now() / 1000) + 7 * 86400,
    notifyMinutes: 15,
    reboot: 'user',
    window: null,
  }
}
const draft = ref(fresh()),
  invalid = ref(false)
const deadline = computed({
  get: () => new Date(draft.value.deadline * 1000).toISOString().slice(0, 16),
  set: (v) => {
    const n = Date.parse(`${v}Z`)
    if (Number.isFinite(n)) draft.value.deadline = n / 1000
  },
})
let pending: { id: string; body: Operation<UpdateChange> } | undefined
function accept(value: UpdateRing) {
  selected.value = value
  draft.value = structuredClone(value.definition)
  if (pending?.id === value.id && pending.body.operationId === value.operation)
    uncertain.value = false
}
function read(id = uncertain.value ? pending?.id : selected.value?.id) {
  if (!id || (uncertain.value && pending?.id !== id)) return
  void run(() => client.read(id), accept)
}
function list(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => {
      page.value = v
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  selected.value = undefined
  pending = undefined
  draft.value = fresh()
}
async function replay() {
  if (pending) await runWrite(() => client.change(pending!.id, pending!.body), accept)
}
function change(input: UpdateChange) {
  if (busy.value || uncertain.value) return
  invalid.value = false
  try {
    if (input.action === 'put')
      input = {
        action: 'put',
        definition: updateDefinition(structuredClone(toRaw(input.definition))),
      }
  } catch {
    invalid.value = true
    return
  }
  pending = {
    id: selected.value?.id ?? crypto.randomUUID(),
    body: operation(input, selected.value?.revision ?? 0),
  }
  void replay()
}
function kind(event: Event) {
  draft.value.target =
    (event.target as HTMLSelectElement).value === 'os'
      ? { kind: 'os', release: '' }
      : {
          kind: 'third_party',
          resource: { kind: 'software', id: '', version: '1', variants: {} },
          admissionOperation: '',
        }
  if (draft.value.target.kind === 'third_party') {
    draft.value.notifyMinutes = 0
    draft.value.reboot = 'user'
  }
}
function resetBinding() {
  if (draft.value.target.kind === 'third_party') {
    draft.value.target.admissionOperation = ''
    draft.value.target.resource.variants = {}
  }
}
function bind() {
  const target = draft.value.target
  if (target.kind !== 'third_party') return
  const { id, version } = target.resource
  void run(
    async () => {
      const [resource, approval] = await Promise.all([
        runtime.policies.resources.read(id),
        runtime.software.admission.version(id, version),
      ])
      const v = resource.versions.find((v) => v.id === version)
      if (
        resource.kind !== 'software' ||
        v?.state !== 'active' ||
        approval.admission?.state !== 'approved'
      )
        throw new Error('Unapproved patch')
      const variants: Record<string, string> = {}
      for (const variant of v.variants) {
        const key = `${variant.platform}_${variant.architecture}`
        if (variants[key]) throw new Error('Ambiguous patch variant')
        variants[key] = variant.key
      }
      return {
        kind: 'third_party' as const,
        resource: { kind: 'software' as const, id, version, variants },
        admissionOperation: approval.admission.operation,
      }
    },
    (v) => {
      draft.value.target = v
    },
  )
}
function windowEnabled(event: Event) {
  draft.value.window = (event.target as HTMLInputElement).checked
    ? { zone: 'UTC', weekdays: [1, 2, 3, 4, 5, 6, 7], startMinute: 60, endMinute: 300 }
    : null
  if (!draft.value.window) draft.value.reboot = 'user'
}
watch(
  () => route.fullPath,
  () => {
    selected.value = undefined
    pending = undefined
    draft.value = fresh()
    invalid.value = false
    page.value = undefined
    releases.value = []
    const id = route.query['id']
    void run(
      () =>
        Promise.all([
          client.list(),
          client.releases(),
          typeof id === 'string' ? client.read(id) : undefined,
        ]),
      ([items, available, value]) => {
        page.value = items
        releases.value = available
        if (value) accept(value)
      },
    )
  },
  { immediate: true },
)
</script>
<template>
  <SoftwareFrame :title="t('software.updates')" :busy="busy" :failure="failure">
    <p>{{ t('software.updatesHint') }}</p>
    <button :disabled="busy" @click="list()">{{ t('policies.reload') }}</button>
    <button :disabled="busy || uncertain" @click="create">{{ t('software.newRing') }}</button>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button data-action="open-ring" :disabled="busy || uncertain" @click="read(item.id)">
          {{ item.definition.title }} · {{ item.id }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="change({ action: 'put', definition: draft })">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.ringDefinition') }}</legend>
        <label for="update-title">{{ t('software.displayTitle') }}</label
        ><input id="update-title" v-model="draft.title" required />
        <label for="update-scope">{{ t('software.updateScope') }}</label
        ><input id="update-scope" v-model="draft.scope" required />
        <label for="update-platform">{{ t('policies.platform') }}</label
        ><select id="update-platform" v-model="draft.platform">
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
        </select>
        <label for="update-kind">{{ t('policies.kind') }}</label
        ><select id="update-kind" :value="draft.target.kind" @change="kind">
          <option value="os">{{ t('software.osUpdate') }}</option>
          <option value="third_party">{{ t('software.thirdPartyPatch') }}</option>
        </select>
        <template v-if="draft.target.kind === 'os'">
          <label for="update-release">{{ t('software.updateRelease') }}</label
          ><select id="update-release" v-model="draft.target.release" required>
            <option value="" disabled>—</option>
            <option
              v-for="release in releases.filter((r) => r.platform === draft.platform)"
              :key="release.id"
              :value="release.id"
            >
              {{ release.title }} / {{ release.version }} · {{ release.source }} ·
              {{ new Date(release.releasedAt * 1000).toISOString() }}
            </option>
          </select>
        </template>
        <template v-else>
          <label for="patch-resource">{{ t('software.patchResource') }}</label
          ><input
            id="patch-resource"
            v-model="draft.target.resource.id"
            required
            @input="resetBinding"
          />
          <label for="patch-version">{{ t('software.resourceVersion') }}</label
          ><input
            id="patch-version"
            v-model="draft.target.resource.version"
            required
            @input="resetBinding"
          />
          <button type="button" @click="bind">{{ t('software.bindPatch') }}</button>
          <p>{{ draft.target.admissionOperation || t('software.notAdmitted') }}</p>
          <p>{{ t('software.patchHint') }}</p>
        </template>
        <label for="update-deferral">{{ t('software.deferDays') }}</label
        ><input
          id="update-deferral"
          v-model.number="draft.deferDays"
          type="number"
          min="0"
          max="365"
          required
        />
        <label for="update-deadline">{{ t('software.updateDeadline') }} (UTC)</label
        ><input id="update-deadline" v-model="deadline" type="datetime-local" required />
        <template v-if="draft.target.kind === 'os'">
          <label for="update-notification">{{ t('software.notifyMinutes') }}</label
          ><input
            id="update-notification"
            v-model.number="draft.notifyMinutes"
            type="number"
            min="0"
            max="10080"
            required
          />
          <label for="update-reboot">{{ t('software.reboot') }}</label
          ><select id="update-reboot" v-model="draft.reboot">
            <option value="user">{{ t('software.rebootUser') }}</option>
            <option v-if="draft.window" value="maintenance">
              {{ t('software.rebootWindow') }}
            </option>
          </select>
        </template>
        <label
          ><input type="checkbox" :checked="!!draft.window" @change="windowEnabled" />{{
            t('software.maintenance')
          }}</label
        >
        <template v-if="draft.window">
          <label for="update-zone">{{ t('software.windowZone') }}</label
          ><input id="update-zone" v-model="draft.window.zone" required />
          <label for="update-start">{{ t('software.windowStart') }}</label
          ><input
            id="update-start"
            v-model.number="draft.window.startMinute"
            type="number"
            min="0"
            max="1439"
            required
          />
          <label for="update-end">{{ t('software.windowEnd') }}</label
          ><input
            id="update-end"
            v-model.number="draft.window.endMinute"
            type="number"
            min="0"
            max="1440"
            required
          />
          <label v-for="day in [1, 2, 3, 4, 5, 6, 7]" :key="day"
            ><input v-model="draft.window.weekdays" type="checkbox" :value="day" />{{
              t(`software.weekday${day}`)
            }}</label
          >
        </template>
        <label><input v-model="draft.enabled" type="checkbox" />{{ t('policies.enabled') }}</label>
        <button type="submit">{{ t('policies.save') }}</button>
      </fieldset>
    </form>
    <p v-if="invalid" role="alert">{{ t('software.invalidUpdate') }}</p>
    <p v-if="uncertain" role="alert">{{ t('software.updateUnknown') }}</p>
    <button v-if="uncertain && pending" :disabled="busy" @click="replay">
      {{ t('policies.replay') }}
    </button>
    <button v-if="pending || selected" data-action="read-ring" :disabled="busy" @click="read()">
      {{ t('policies.verify') }}
    </button>
    <section v-if="selected">
      <h2>{{ selected.definition.title }} · {{ selected.id }}</h2>
      <p>
        {{ t('policies.revision') }} {{ selected.revision }} · {{ t('policies.scopes') }}
        {{ selected.scopeRevision ?? '—' }} ·
        {{ selected.definition.enabled ? t('policies.enabled') : t('software.update_paused') }}
      </p>
      <div class="device-actions">
        <button
          v-for="action in ['scan', 'install', 'pause', 'resume'] as const"
          :key="action"
          :data-action="`update-${action}`"
          :disabled="busy || uncertain"
          @click="change({ action })"
        >
          {{ t(`software.updateAction_${action}`) }}
        </button>
      </div>
      <RouterLink
        v-if="selected.policy"
        :to="{
          name: 'software-deployments',
          params: { tenant: runtime.tenant },
          query: { id: selected.policy.id },
        }"
        >{{ t('software.patchRuns') }}</RouterLink
      >
      <p>{{ t('software.gapHint') }}</p>
      <table>
        <thead>
          <tr>
            <th>{{ t('policies.device') }}</th>
            <th>{{ t('software.updateGap') }}</th>
            <th>{{ t('software.observation') }}</th>
            <th>{{ t('software.updatePhase') }}</th>
            <th>{{ t('policies.effect') }}</th>
            <th>{{ t('policies.detail') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in selected.devices" :key="row.device">
            <td>
              <RouterLink
                :to="{
                  name: 'device-detail',
                  params: { tenant: runtime.tenant, device: row.device },
                }"
                >{{ row.device }}</RouterLink
              >
              <p>
                {{ row.registration?.source ?? '—' }} / {{ row.registration?.id ?? '—' }} /
                {{ row.registration?.generation ?? '—' }}
              </p>
            </td>
            <td>{{ t(`software.gap_${row.gap}`) }}</td>
            <td>
              {{ row.observedAt === null ? '—' : new Date(row.observedAt * 1000).toISOString() }} ·
              {{ t(`software.updateSource_${row.source}`) }}
            </td>
            <td>
              {{ t(`software.update_${row.phase}`) }}
              <p v-if="row.waiting">{{ t(`software.updateWait_${row.waiting}`) }}</p>
              <p v-if="row.rebootRequestedAt !== null">
                {{ t('software.rebootRequestedAt') }}
                {{ new Date(row.rebootRequestedAt * 1000).toISOString() }}
              </p>
              <p v-if="row.notifiedAt !== null">
                {{ t('software.notifiedAt') }} {{ new Date(row.notifiedAt * 1000).toISOString() }}
              </p>
            </td>
            <td>{{ t(`software.updateEffect_${row.effect}`) }}</td>
            <td>
              <p v-if="row.code">{{ row.code }}</p>
              <RouterLink
                v-if="row.execution"
                :to="{
                  name: 'policy-execution',
                  params: { tenant: runtime.tenant, execution: row.execution },
                }"
                >{{ t('policies.detail') }}</RouterLink
              >
              <p>{{ row.attempt ?? '—' }}</p>
              <button
                v-if="row.phase === 'failed' && !selected.policy"
                :disabled="busy || uncertain"
                @click="change({ action: 'retry', device: row.device })"
              >
                {{ t('software.updateAction_retry') }}
              </button>
              <button
                v-if="row.phase === 'unknown' && !selected.policy"
                :disabled="busy || uncertain"
                @click="change({ action: 'reconcile', device: row.device })"
              >
                {{ t('software.updateAction_reconcile') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </SoftwareFrame>
</template>
