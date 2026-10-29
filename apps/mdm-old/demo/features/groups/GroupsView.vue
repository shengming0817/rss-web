<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VChip,
  VDialog,
  VSelect,
  VTab,
  VTable,
  VTabs,
  VTextField,
} from 'vuetify/components'
import MdmPage from '../../../src/ui/MdmPage.vue'
import DeviceGroupsPanel from '../../../src/features/devices/components/DeviceGroupsPanel.vue'
import UserGroupsPanel from '../../../src/features/devices/components/UserGroupsPanel.vue'
import { useOperation } from '../../../src/services/useOperation'
import { formatFilter } from '@rss/api/mdm-filter'
import { useDemo } from '../../context'
import { createDemoGroupsClient } from './client'
import { categories, fresh, draft as decodeDraft, type Category, type Group } from './model'
import GroupRuleEditor from './GroupRuleEditor.vue'
import { messages } from './messages'
const runtime = useDemo(),
  route = useRoute(),
  router = useRouter(),
  { t } = useI18n({ useScope: 'local', messages })
const binding = () => {
  const s = runtime.session.state.value
  return [runtime.tenant, s.status, s.tenant ?? undefined, s.identity?.principalId, s.session?.id]
}
const client = createDemoGroupsClient(runtime.transport, runtime.tenant)
const { run, runWrite, busy, failure, uncertain } = useOperation([], binding)
const formal = ref(false),
  formalLocked = ref(false)
const blocked = computed(() => busy.value || uncertain.value || formalLocked.value)
onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath || !blocked.value)
onBeforeRouteLeave(() => !blocked.value)
const category = computed<Category>({
  get: () => categories.find((v) => route.query['category'] === v) ?? 'device-dynamic',
  set: (value) => {
    if (!blocked.value) void router.push({ query: { category: value } })
  },
})
const nameFilter = ref(''),
  appliedName = ref(''),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  catalog = ref<Awaited<ReturnType<typeof client.catalog>>>()
const selected = ref<Group>(),
  editorOpen = ref(false),
  editingId = ref(''),
  editingRevision = ref(0),
  draft = ref(fresh(category.value)),
  remote = ref<Group>(),
  conflict = ref(false),
  compared = ref(false)
const taskId = ref<string>(),
  task = ref<Awaited<ReturnType<typeof client.task>>>(),
  resultId = ref<string>(),
  result = ref<Awaited<ReturnType<typeof client.results>>>(),
  projection = ref<'members' | 'changes' | 'decisions'>('members')
const generateOpen = ref(false),
  generatedName = ref(''),
  relation = ref<'registration_user' | 'current_user'>('registration_user'),
  deleting = ref(false)
let pending: (() => Promise<boolean>) | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false
const canWrite = computed(() => catalog.value?.writable === true)
const assignmentOptions = computed(() =>
  draft.value.groupType.startsWith('user')
    ? (catalog.value?.people ?? [])
    : (catalog.value?.devices ?? []),
)
function filter() {
  const kind = {
    kind: 'compare' as const,
    field: 'groupType',
    operator: '==' as const,
    values: [category.value],
  }
  return formatFilter(
    appliedName.value
      ? {
          kind: 'and',
          children: [
            kind,
            {
              kind: 'compare',
              field: 'name',
              operator: '=icontains=',
              values: [appliedName.value],
            },
          ],
        }
      : kind,
  )
}
async function load(cursor?: string) {
  page.value = undefined
  return run(
    async () => ({
      catalog: catalog.value ?? (await client.catalog()),
      page: await client.list({ filter: filter(), sort: ['name'], cursor }),
    }),
    (v) => {
      catalog.value = v.catalog
      page.value = v.page
    },
  )
}
async function applyFilter() {
  appliedName.value = nameFilter.value
  await load()
}
async function open(id: string) {
  if (blocked.value) return
  selected.value = undefined
  result.value = undefined
  resultId.value = undefined
  taskId.value = undefined
  task.value = undefined
  remote.value = undefined
  await run(
    () => client.read(id),
    (v) => (selected.value = v),
  )
  const loaded = selected.value as Group | undefined
  if (loaded?.resultId) {
    resultId.value = loaded.resultId
    await loadResult()
  }
}
function create() {
  if (blocked.value) return
  editingId.value = crypto.randomUUID()
  editingRevision.value = 0
  draft.value = fresh(category.value)
  editorOpen.value = true
  conflict.value = false
  remote.value = undefined
  pending = undefined
}
function edit() {
  if (!selected.value || blocked.value) return
  editingId.value = selected.value.id
  editingRevision.value = selected.value.revision
  draft.value = structuredClone(toRaw(selected.value))
  editorOpen.value = true
  conflict.value = false
  remote.value = undefined
  pending = undefined
}
function definition() {
  return {
    name: draft.value.name,
    description: draft.value.description,
    groupType: draft.value.groupType,
    enabled: draft.value.enabled,
    assignments: [...draft.value.assignments],
    rule: draft.value.rule ? structuredClone(toRaw(draft.value.rule)) : null,
  }
}
async function accepted(receipt: Awaited<ReturnType<typeof client.save>>, remove = false) {
  taskId.value = receipt.taskId ?? undefined
  task.value = undefined
  result.value = undefined
  resultId.value = undefined
  editorOpen.value = false
  deleting.value = false
  generateOpen.value = false
  if (remove) selected.value = undefined
  else if (
    !(await run(
      () => client.read(receipt.groupId),
      (v) => (selected.value = v),
    ))
  )
    return
  await load()
}
function save(remove = false) {
  if (blocked.value || conflict.value || !canWrite.value) return
  if (!remove) {
    try {
      decodeDraft(definition())
    } catch {
      failure.value = 'invalidRequest'
      return
    }
  }
  const id = remove ? selected.value!.id : editingId.value,
    body = {
      operationId: crypto.randomUUID(),
      expectedRevision: remove ? selected.value!.revision : editingRevision.value,
      input: remove ? null : definition(),
    }
  compared.value = false
  pending = async () => {
    let receipt: Awaited<ReturnType<typeof client.save>> | undefined
    const ok = await runWrite(
      () => client.save(id, body),
      (v) => (receipt = v),
    )
    if (ok && receipt) await accepted(receipt, remove)
    else if (failure.value === 'conflict') conflict.value = true
    return ok
  }
  void pending()
}
function calculate(preview: boolean) {
  if (!selected.value || blocked.value || !canWrite.value) return
  const id = selected.value.id,
    body = {
      operationId: crypto.randomUUID(),
      expectedRevision: selected.value.revision,
      input: {},
    }
  compared.value = false
  pending = async () => {
    const ok = await runWrite(
      () => client.calculate(id, preview, body),
      (v) => {
        taskId.value = v.taskId ?? undefined
        task.value = undefined
        result.value = undefined
      },
    )
    return ok
  }
  void pending()
}
async function compare() {
  const id = editorOpen.value ? editingId.value : selected.value?.id
  if (!id) return
  const ok = await run(
    () => client.read(id),
    (v) => (remote.value = v),
  )
  compared.value = ok || failure.value === 'notFound'
}
function adopt() {
  if (!remote.value || uncertain.value) return
  editingRevision.value = remote.value.revision
  conflict.value = false
  remote.value = undefined
  pending = undefined
  failure.value = null
}
async function observeTask() {
  if (!taskId.value || busy.value || uncertain.value || disposed) return
  if (
    !(await run(
      () => client.task(taskId.value!),
      (v) => (task.value = v),
    ))
  )
    return
  if (task.value?.status === 'completed' && task.value.resultId) {
    resultId.value = task.value.resultId
    if (
      selected.value &&
      !(await run(
        () => client.read(selected.value!.id),
        (v) => (selected.value = v),
      ))
    )
      return
    if (!(await loadResult())) return
    await load()
  }
}
function schedule() {
  clearTimeout(timer)
  if (
    !disposed &&
    taskId.value &&
    !busy.value &&
    !uncertain.value &&
    !failure.value &&
    (!task.value || task.value.status === 'running')
  )
    timer = setTimeout(() => void observeTask(), 350)
}
watch([taskId, task, busy, uncertain, failure], schedule)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
})
async function loadResult(cursor?: string) {
  if (!selected.value || !resultId.value) return
  result.value = undefined
  return run(
    () => client.results(selected.value!.id, resultId.value!, projection.value, cursor),
    (v) => (result.value = v),
  )
}
watch(projection, () => {
  if (!busy.value && !uncertain.value) void loadResult()
})
function showCurrent() {
  resultId.value = selected.value?.resultId ?? undefined
  void loadResult()
}
function beginDelete() {
  deleting.value = true
  pending = undefined
  compared.value = false
  conflict.value = false
}
function beginGenerate() {
  generatedName.value = selected.value?.name ? `${selected.value.name} · Mock devices` : ''
  relation.value = 'registration_user'
  generateOpen.value = true
  pending = undefined
  compared.value = false
}
function generate() {
  if (!selected.value || blocked.value || !canWrite.value) return
  const id = selected.value.id,
    body = {
      operationId: crypto.randomUUID(),
      expectedRevision: selected.value.revision,
      input: {
        id: crypto.randomUUID(),
        name: generatedName.value,
        description: '',
        relation: relation.value,
      },
    }
  pending = async () => {
    let receipt: Awaited<ReturnType<typeof client.generate>> | undefined
    const ok = await runWrite(
      () => client.generate(id, body),
      (v) => (receipt = v),
    )
    if (ok && receipt) {
      generateOpen.value = false
      await router.push({
        query: { category: 'device-dynamic', id: receipt.groupId, task: receipt.taskId },
      })
    }
    return ok
  }
  void pending()
}
watch(
  () => JSON.stringify([route.fullPath, binding()]),
  async () => {
    clearTimeout(timer)
    page.value = undefined
    selected.value = undefined
    result.value = undefined
    resultId.value = undefined
    taskId.value = undefined
    task.value = undefined
    editorOpen.value = false
    generateOpen.value = false
    deleting.value = false
    pending = undefined
    conflict.value = false
    compared.value = false
    remote.value = undefined
    formal.value = false
    formalLocked.value = false
    appliedName.value = ''
    nameFilter.value = ''
    catalog.value = undefined
    if (!(await load())) return
    if (typeof route.query['id'] === 'string') await open(route.query['id'])
    if (typeof route.query['task'] === 'string') taskId.value = route.query['task']
  },
  { immediate: true, flush: 'post' },
)
</script>
<template>
  <MdmPage
    :title="t('demoGroups.title')"
    :description="t('demoGroups.boundary')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-chip color="warning">Mock</v-chip
      ><v-btn v-if="category !== 'user-dynamic'" :disabled="blocked" @click="formal = !formal">{{
        t(formal ? 'demoGroups.backMock' : 'demoGroups.formal')
      }}</v-btn></template
    >
    <v-tabs v-model="category" :aria-label="t('demoGroups.title')"
      ><v-tab
        v-for="value in categories"
        :key="value"
        :value="value"
        :disabled="blocked && category !== value"
        >{{ t('demoGroups.' + value) }}</v-tab
      ></v-tabs
    >
    <template v-if="formal">
      <v-alert type="info" variant="tonal">{{ t('demoGroups.formalHint') }}</v-alert>
      <UserGroupsPanel v-if="category === 'user-static'" @locked="formalLocked = $event" />
      <DeviceGroupsPanel
        v-else
        :key="category"
        :group-kind="category === 'device-static' ? 'static' : 'dynamic'"
        @locked="formalLocked = $event"
      />
    </template>
    <template v-else>
      <v-alert type="info" variant="tonal">{{ t('demoGroups.userBoundary') }}</v-alert>
      <v-alert v-if="catalog && !canWrite" type="info">{{ t('demoGroups.readOnly') }}</v-alert>
      <v-alert v-if="uncertain" type="warning" variant="tonal">{{
        t('demoGroups.unknownWrite')
      }}</v-alert>
      <form class="console-toolbar" @submit.prevent="applyFilter">
        <v-text-field
          v-model="nameFilter"
          :label="t('demoGroups.filter')"
          :disabled="blocked"
          hide-details
        /><v-btn type="submit" :disabled="blocked">{{ t('demoGroups.apply') }}</v-btn
        ><v-btn :disabled="blocked" @click="load()">{{ t('demoGroups.reload') }}</v-btn
        ><v-btn color="primary" :disabled="blocked || !canWrite" @click="create">{{
          t('demoGroups.create')
        }}</v-btn>
      </form>
      <v-table :aria-label="t('demoGroups.' + category)"
        ><thead>
          <tr>
            <th>{{ t('demoGroups.name') }}</th>
            <th>{{ t('demoGroups.members') }}</th>
            <th>{{ t('demoGroups.unknown') }}</th>
            <th>{{ t('demoGroups.revision') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in page?.items" :key="row.id">
            <td>
              <v-btn variant="text" :disabled="blocked" @click="open(row.id)">{{ row.name }}</v-btn
              ><v-chip v-if="!row.enabled">{{ t('demoGroups.reasons.disabled') }}</v-chip>
            </td>
            <td>{{ row.memberCount ?? t('demoGroups.pending') }}</td>
            <td>{{ row.unknownCount ?? '—' }}</td>
            <td>{{ row.revision }}</td>
          </tr>
          <tr v-if="page && !page.items.length">
            <td colspan="4">{{ t('demoGroups.empty') }}</td>
          </tr>
        </tbody></v-table
      >
      <v-btn v-if="page?.nextCursor" :disabled="blocked" @click="load(page.nextCursor)">{{
        t('demoGroups.next')
      }}</v-btn>
      <section v-if="selected" class="console-panel" data-testid="mock-group-detail">
        <h2>{{ selected.name }} · {{ t('demoGroups.detail') }}</h2>
        <p>
          {{ selected.id }} · {{ t('demoGroups.revision') }} {{ selected.revision }} ·
          {{ t('demoGroups.' + selected.freshness) }}
        </p>
        <p>{{ selected.description }}</p>
        <div class="console-toolbar">
          <v-btn :disabled="blocked || !canWrite" @click="edit">{{ t('demoGroups.edit') }}</v-btn
          ><v-btn :disabled="blocked || !canWrite" @click="calculate(true)">{{
            t('demoGroups.preview')
          }}</v-btn
          ><v-btn :disabled="blocked || !canWrite" @click="calculate(false)">{{
            t('demoGroups.recompute')
          }}</v-btn
          ><v-btn
            v-if="selected.groupType.startsWith('user')"
            :disabled="blocked || !canWrite"
            @click="beginGenerate"
            >{{ t('demoGroups.generate') }}</v-btn
          ><v-btn :disabled="blocked || !canWrite" color="error" @click="beginDelete">{{
            t('demoGroups.remove')
          }}</v-btn>
        </div>
        <GroupRuleEditor
          v-if="selected.rule"
          :model-value="selected.rule"
          :domain="selected.groupType.startsWith('user') ? 'user' : 'device'"
          disabled
        />
        <p v-else>
          {{ t('demoGroups.assignments') }}:
          {{
            selected.assignments
              .map(
                (id) =>
                  (selected!.groupType.startsWith('user')
                    ? catalog?.people
                    : catalog?.devices
                  )?.find((p) => p.id === id)?.label ?? id,
              )
              .join(', ') || '—'
          }}
        </p>
        <v-alert v-if="task" type="info" variant="tonal"
          >{{ t('demoGroups.' + task.status) }} · {{ task.id }}</v-alert
        >
        <v-btn
          v-if="taskId && task?.status !== 'superseded'"
          :disabled="blocked"
          @click="observeTask"
          >{{ t('demoGroups.refreshTask') }}</v-btn
        >
        <div class="console-toolbar">
          <v-select
            v-model="projection"
            :disabled="blocked"
            :label="t('demoGroups.outcome')"
            :items="
              ['members', 'changes', 'decisions'].map((v) => ({
                value: v,
                title: t('demoGroups.' + v),
              }))
            "
          /><v-btn :disabled="blocked || !selected.resultId" @click="showCurrent">{{
            t('demoGroups.published')
          }}</v-btn>
        </div>
        <v-alert type="info" variant="tonal">{{ t('demoGroups.unknownHint') }}</v-alert>
        <template v-if="result"
          ><h3>{{ t(result.preview ? 'demoGroups.previewLabel' : 'demoGroups.published') }}</h3>
          <p>{{ result.resultId }} · {{ new Date(result.evaluatedAt * 1000).toISOString() }}</p>
          <v-table :aria-label="t('demoGroups.' + projection)"
            ><thead>
              <tr>
                <th>{{ t('demoGroups.name') }}</th>
                <th>{{ t('demoGroups.outcome') }}</th>
                <th>{{ t('demoGroups.before') }}</th>
                <th>{{ t('demoGroups.reason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in result.items" :key="row.id">
                <td>{{ row.label }}</td>
                <td>{{ t('demoGroups.' + row.outcome) }}</td>
                <td>{{ row.before ? t('demoGroups.' + row.before) : '—' }}</td>
                <td>{{ t('demoGroups.reasons.' + row.reason) }}</td>
              </tr>
              <tr v-if="!result.items.length">
                <td colspan="4">{{ t('demoGroups.empty') }}</td>
              </tr>
            </tbody></v-table
          ><v-btn
            v-if="result.nextCursor"
            :disabled="blocked"
            @click="loadResult(result.nextCursor)"
            >{{ t('demoGroups.next') }}</v-btn
          ></template
        >
      </section>
    </template>
    <v-dialog v-model="editorOpen" max-width="850" scrollable :persistent="blocked"
      ><v-card :title="t('demoGroups.definition')"
        ><v-card-text
          ><v-alert v-if="uncertain" type="warning">{{ t('demoGroups.unknownWrite') }}</v-alert
          ><v-alert v-if="conflict" type="warning">{{ t('demoGroups.conflict') }}</v-alert
          ><v-alert v-if="failure" type="error">{{ t('devices.' + failure) }}</v-alert>
          <form @submit.prevent="save()">
            <fieldset :disabled="blocked || !canWrite">
              <v-text-field
                v-model="draft.name"
                :label="t('demoGroups.name')"
                maxlength="256"
                required
                data-testid="mock-group-name"
              /><v-text-field
                v-model="draft.description"
                :label="t('demoGroups.description')"
              /><v-checkbox
                v-model="draft.enabled"
                :label="t('demoGroups.enabled')"
              /><GroupRuleEditor
                v-if="draft.rule"
                v-model="draft.rule"
                :domain="draft.groupType.startsWith('user') ? 'user' : 'device'"
                :disabled="blocked"
              /><template v-else
                ><p>{{ t('demoGroups.staticHint') }}</p>
                <v-select
                  v-model="draft.assignments"
                  :items="assignmentOptions"
                  item-title="label"
                  item-value="id"
                  multiple
                  chips
                  :label="t('demoGroups.assignments')" /></template
              ><v-btn
                type="submit"
                color="primary"
                :disabled="conflict"
                data-testid="mock-group-save"
                >{{ t('demoGroups.save') }}</v-btn
              >
            </fieldset>
          </form>
          <v-btn v-if="editingRevision > 0 || uncertain" :disabled="busy" @click="compare">{{
            t('demoGroups.compare')
          }}</v-btn
          ><v-alert v-if="remote" type="info"
            >{{ t('demoGroups.remote') }} {{ remote.revision }} · {{ remote.name
            }}<v-btn :disabled="blocked" @click="adopt">{{ t('demoGroups.adopt') }}</v-btn></v-alert
          ><v-btn v-if="uncertain && pending" :disabled="busy || !compared" @click="pending()">{{
            t('demoGroups.replay')
          }}</v-btn></v-card-text
        ><v-card-actions
          ><v-btn :disabled="blocked" @click="editorOpen = false">{{
            t('demoGroups.close')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="generateOpen" max-width="650" :persistent="blocked"
      ><v-card :title="t('demoGroups.generate')"
        ><v-card-text
          ><v-alert type="info">{{ t('demoGroups.generateHint') }}</v-alert
          ><v-alert v-if="failure" type="error">{{ t('devices.' + failure) }}</v-alert>
          <form @submit.prevent="generate">
            <v-text-field
              v-model="generatedName"
              :label="t('demoGroups.generatedName')"
              :disabled="blocked"
              required
            /><v-select
              v-model="relation"
              :label="t('demoGroups.relation')"
              :disabled="blocked"
              :items="
                ['registration_user', 'current_user'].map((v) => ({
                  value: v,
                  title: t('demoGroups.' + v),
                }))
              "
            /><v-btn type="submit" :disabled="blocked || !generatedName" color="primary">{{
              t('demoGroups.generateSubmit')
            }}</v-btn>
          </form>
          <template v-if="uncertain"
            ><v-alert type="warning">{{ t('demoGroups.unknownWrite') }}</v-alert
            ><v-btn :disabled="busy" @click="compare">{{ t('demoGroups.compare') }}</v-btn
            ><v-btn v-if="pending" :disabled="busy || !compared" @click="pending()">{{
              t('demoGroups.replay')
            }}</v-btn></template
          ></v-card-text
        ><v-card-actions
          ><v-btn :disabled="blocked" @click="generateOpen = false">{{
            t('demoGroups.cancel')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="deleting" max-width="600" :persistent="blocked"
      ><v-card :title="t('demoGroups.remove')"
        ><v-card-text
          ><p>{{ selected?.name }}</p>
          <p>{{ t('demoGroups.confirmDelete') }}</p>
          <v-alert v-if="failure" type="error">{{ t('devices.' + failure) }}</v-alert
          ><template v-if="uncertain"
            ><p>{{ t('demoGroups.unknownWrite') }}</p>
            <v-btn :disabled="busy" @click="compare">{{ t('demoGroups.compare') }}</v-btn
            ><v-btn v-if="pending" :disabled="busy || !compared" @click="pending()">{{
              t('demoGroups.replay')
            }}</v-btn></template
          ></v-card-text
        ><v-card-actions
          ><v-btn :disabled="blocked" @click="deleting = false">{{ t('demoGroups.cancel') }}</v-btn
          ><v-btn :disabled="blocked || conflict" color="error" @click="save(true)">{{
            t('demoGroups.confirm')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <template v-if="uncertain && !editorOpen && !generateOpen && !deleting"
      ><v-btn :disabled="busy" @click="compare">{{ t('demoGroups.compare') }}</v-btn
      ><v-btn v-if="pending" :disabled="busy || !compared" @click="pending()">{{
        t('demoGroups.replay')
      }}</v-btn></template
    >
  </MdmPage>
</template>
