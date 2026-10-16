<script setup lang="ts">
import { UiButton, UiUtcDateTimeInput } from '@rss/core/components'
import { ref, toRaw, watch } from 'vue'
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
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import CatalogLocator from '../../policies/components/CatalogLocator.vue'
import PageFrame from '../../../components/PageFrame.vue'
const editing = ref(false)
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

let pending: { id: string; body: Operation<UpdateChange> } | undefined
function accept(value: UpdateRing) {
  editing.value = false
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
  editing.value = true
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
  <PageFrame :title="t('software.updates')" :busy="busy" :failure="failure">
    <p>{{ t('software.updatesHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="list()">{{ t('policies.reload') }}</UiButton>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('software.newRing')
    }}</UiButton>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul class="console-object-list">
      <li v-for="item in page?.items" :key="item.id">
        <UiButton
          data-action="open-ring"
          :disabled="!!(busy || uncertain)"
          type="submit"
          @click="read(item.id)"
        >
          {{ item.definition.title }} · {{ item.id }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="list(page.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <div v-if="selected && !editing" class="console-toolbar">
      <UiButton type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</UiButton>
    </div>
    <form
      v-show="editing"
      class="console-panel"
      @submit.prevent="change({ action: 'put', definition: draft })"
    >
      <div class="console-page-header">
        <h2>{{ t(selected ? 'console.edit' : 'console.create') }}</h2>
        <UiButton type="button" :disabled="busy || uncertain" @click="editing = false">{{
          t('console.close')
        }}</UiButton>
      </div>
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.ringDefinition') }}</legend>
        <label for="update-title">{{ t('software.displayTitle') }}</label
        ><input id="update-title" v-model="draft.title" class="ui-input" required />
        <label for="update-scope">{{ t('software.updateScope') }}</label
        ><input id="update-scope" v-model="draft.scope" class="ui-input" required /><CatalogLocator
          v-model="draft.scope"
          collection="scopes"
          :disabled="busy || uncertain"
        />
        <label for="update-platform">{{ t('policies.platform') }}</label
        ><select id="update-platform" v-model="draft.platform" class="ui-input">
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
        </select>
        <label for="update-kind">{{ t('policies.kind') }}</label
        ><select id="update-kind" class="ui-input" :value="draft.target.kind" @change="kind">
          <option value="os">{{ t('software.osUpdate') }}</option>
          <option value="third_party">{{ t('software.thirdPartyPatch') }}</option>
        </select>
        <template v-if="draft.target.kind === 'os'">
          <label for="update-release">{{ t('software.updateRelease') }}</label
          ><select id="update-release" v-model="draft.target.release" class="ui-input" required>
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
          <SoftwareResourceSelect
            v-model:resource="draft.target.resource.id"
            v-model:version="draft.target.resource.version"
            :disabled="busy || uncertain"
            @change="resetBinding"
          /><label for="patch-resource">{{ t('software.patchResource') }}</label
          ><input
            id="patch-resource"
            v-model="draft.target.resource.id"
            class="ui-input"
            required
            @input="resetBinding"
          />
          <label for="patch-version">{{ t('software.resourceVersion') }}</label
          ><input
            id="patch-version"
            v-model="draft.target.resource.version"
            class="ui-input"
            required
            @input="resetBinding"
          />
          <UiButton type="button" @click="bind">{{ t('software.bindPatch') }}</UiButton>
          <p>{{ draft.target.admissionOperation || t('software.notAdmitted') }}</p>
          <p>{{ t('software.patchHint') }}</p>
        </template>
        <label for="update-deferral">{{ t('software.deferDays') }}</label
        ><input
          id="update-deferral"
          v-model.number="draft.deferDays"
          class="ui-input"
          type="number"
          min="0"
          max="365"
          required
        />
        <label for="update-deadline">{{ t('software.updateDeadline') }} (UTC)</label
        ><UiUtcDateTimeInput
          id="update-deadline"
          :model-value="draft.deadline"
          :invalid-label="t('policies.invalidDate')"
          required
          @update:model-value="draft.deadline = $event ?? Number.NaN"
        />
        <template v-if="draft.target.kind === 'os'">
          <label for="update-notification">{{ t('software.notifyMinutes') }}</label
          ><input
            id="update-notification"
            v-model.number="draft.notifyMinutes"
            class="ui-input"
            type="number"
            min="0"
            max="10080"
            required
          />
          <label for="update-reboot">{{ t('software.reboot') }}</label
          ><select id="update-reboot" v-model="draft.reboot" class="ui-input">
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
          ><input id="update-zone" v-model="draft.window.zone" class="ui-input" required />
          <label for="update-start">{{ t('software.windowStart') }}</label
          ><input
            id="update-start"
            v-model.number="draft.window.startMinute"
            class="ui-input"
            type="number"
            min="0"
            max="1439"
            required
          />
          <label for="update-end">{{ t('software.windowEnd') }}</label
          ><input
            id="update-end"
            v-model.number="draft.window.endMinute"
            class="ui-input"
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
        <UiButton type="submit">{{ t('policies.save') }}</UiButton>
      </fieldset>
    </form>
    <p v-if="invalid" role="alert">{{ t('software.invalidUpdate') }}</p>
    <p v-if="uncertain" role="alert">{{ t('software.updateUnknown') }}</p>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="replay">
      {{ t('policies.replay') }}
    </UiButton>
    <UiButton
      v-if="pending || selected"
      data-action="read-ring"
      :disabled="!!busy"
      type="submit"
      @click="read()"
    >
      {{ t('policies.verify') }}
    </UiButton>
    <section v-if="selected" class="console-panel">
      <h2>{{ selected.definition.title }} · {{ selected.id }}</h2>
      <p>
        {{ t('policies.revision') }} {{ selected.revision }} · {{ t('policies.scopes') }}
        {{ selected.scopeRevision ?? '—' }} ·
        {{ selected.definition.enabled ? t('policies.enabled') : t('software.update_paused') }}
      </p>
      <div class="console-inline-actions">
        <UiButton
          v-for="action in ['scan', 'install', 'pause', 'resume'] as const"
          :key="action"
          :data-action="`update-${action}`"
          :disabled="!!(busy || uncertain)"
          type="submit"
          @click="change({ action })"
        >
          {{ t(`software.updateAction_${action}`) }}
        </UiButton>
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
      <div class="ui-table-scroll">
        <table class="ui-table">
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
                {{ row.observedAt === null ? '—' : new Date(row.observedAt * 1000).toISOString() }}
                ·
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
                <UiButton
                  v-if="row.phase === 'failed' && !selected.policy"
                  :disabled="!!(busy || uncertain)"
                  type="submit"
                  @click="change({ action: 'retry', device: row.device })"
                >
                  {{ t('software.updateAction_retry') }}
                </UiButton>
                <UiButton
                  v-if="row.phase === 'unknown' && !selected.policy"
                  :disabled="!!(busy || uncertain)"
                  type="submit"
                  @click="change({ action: 'reconcile', device: row.device })"
                >
                  {{ t('software.updateAction_reconcile') }}
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </PageFrame>
</template>
