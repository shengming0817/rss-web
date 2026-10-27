<script setup lang="ts">
import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import {
  VBtn,
  VDialog,
  VCard,
  VCardTitle,
  VCardText,
  VCardActions,
  VTable,
  VTabs,
  VTab,
  VChip,
  VTextField,
  VTextarea,
  VSelect,
  VCheckbox,
  VAlert,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { FieldDefinition } from '../clients/assets'
import {
  type GroupChange,
  type GroupProjection,
  type GroupRead,
  type GroupTaskKind,
  groupCondition,
  type GroupCondition,
} from '../clients/groups'
import { objectKey } from '../clients/objects'
import ObjectLink from '../components/ObjectLink.vue'
import AssignmentFacts from '../../policies/components/AssignmentFacts.vue'
import MdmPage from '../../../ui/MdmPage.vue'
import GroupConditionEditor from '../components/GroupConditionEditor.vue'
import GroupDependencies from '../components/GroupDependencies.vue'
import EndpointPicker from '../components/EndpointPicker.vue'
import { deviceBinding } from '../useDeviceBinding'
import { deviceCondition } from '../clients/asset-model'
const props = defineProps<{ groupKind?: 'static' | 'dynamic' }>()
const emit = defineEmits<{ locked: [value: boolean] }>()
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.groups,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const list = ref<Awaited<ReturnType<typeof runtime.devices.groups.list>>>(),
  fields = ref<FieldDefinition[]>([])
const query = ref(''),
  filter = ref<'' | 'static' | 'dynamic' | 'system'>('')
let applied: { name?: string | undefined; kind?: 'static' | 'dynamic' | 'system' | undefined } = {}
function closeDetail() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  definitionTask.value = undefined
  definitionStatus.value = undefined
  task.value = undefined
  status.value = undefined
  result.value = undefined
  loadList()
}
const current = ref<GroupRead>(),
  id = ref(''),
  name = ref(''),
  description = ref(''),
  kind = ref<'static' | 'dynamic'>('static'),
  assetContext = ref<'endpoint' | 'associated_device'>('endpoint'),
  criteria = ref<GroupCondition | null>(null),
  members = ref<string[]>([]),
  remove = ref(false)
const definitionTask = ref<string>(),
  definitionStatus = ref<Awaited<ReturnType<typeof client.status>>>(),
  taskKind = ref<GroupTaskKind>('group')
const definitionPending = computed(
  () =>
    !!definitionTask.value &&
    (!definitionStatus.value || ['pending', 'running'].includes(definitionStatus.value.status)),
)
watch(
  () => busy.value || uncertain.value || definitionPending.value,
  (value) => emit('locked', value),
  { immediate: true },
)
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  projection = ref<GroupProjection>('members'),
  result = ref<Awaited<ReturnType<typeof client.page>>>()
const membersEditing = ref(false)
const deletionBlocked = ref<boolean>(),
  compared = ref(false)
const detailTab = ref('overview'),
  editKind = ref<'metadata' | 'rule'>('metadata')
async function compare() {
  const ok = await run(
    () => client.read(id.value),
    (v) => {
      current.value = v
      compared.value = true
    },
  )
  if (!ok && uncertain.value && failure.value === 'notFound') compared.value = true
}
function beginEdit(mode: 'metadata' | 'rule') {
  if (mode === 'rule' && current.value?.group.kind !== 'dynamic') return
  if (current.value) {
    name.value = current.value.group.presentation.name
    description.value = current.value.group.presentation.description
    criteria.value = structuredClone(toRaw(current.value.criteria))
  }
  editKind.value = mode
  editing.value = true
}
const editing = ref(false),
  deleting = ref(false)
function cancelEdit() {
  if (busy.value || uncertain.value) return
  if (current.value) {
    name.value = current.value.group.presentation.name
    description.value = current.value.group.presentation.description
    kind.value = current.value.group.kind === 'system' ? 'static' : current.value.group.kind
    assetContext.value = current.value.group.assetContext
    criteria.value = structuredClone(toRaw(current.value.criteria))
  } else {
    name.value = ''
    description.value = ''
    criteria.value = null
    kind.value = 'static'
  }
  editing.value = false
}
function beginCreate() {
  create()
  editing.value = true
}
let pending: (() => Promise<boolean>) | undefined
function write<T>(request: () => Promise<T>, apply: (value: T) => void) {
  if (busy.value || uncertain.value) return
  compared.value = false
  pending = () => runWrite(request, apply)
  void pending()
}
function loadList(next?: string) {
  list.value = undefined
  if (busy.value) return
  const selection = next
    ? applied
    : { name: query.value || undefined, kind: props.groupKind ?? (filter.value || undefined) }
  void run(
    () =>
      runtime.devices.groups.list({
        cursor: next,
        filter: allOf(
          selection.name ? queryComparison('name', '=icontains=', selection.name) : undefined,
          selection.kind ? queryComparison('kind', '==', selection.kind) : undefined,
        ),
      }),
    (v) => {
      list.value = v
      applied = selection
    },
  )
}
function open(group = id.value) {
  if (busy.value || uncertain.value || definitionPending.value) return
  definitionTask.value = undefined
  definitionStatus.value = undefined
  taskKind.value = 'group'
  void run(
    () => client.read(group),
    (v) => {
      id.value = v.group.id
      current.value = v
      editing.value = false
      name.value = v.group.presentation.name
      description.value = v.group.presentation.description
      kind.value = v.group.kind === 'system' ? 'static' : v.group.kind
      assetContext.value = v.group.assetContext
      criteria.value = structuredClone(v.criteria)
      task.value = v.memberSet ?? undefined
      result.value = undefined
      status.value = undefined
      detailTab.value = 'overview'
    },
  )
}
function create() {
  if (busy.value || uncertain.value || definitionPending.value) return
  definitionTask.value = undefined
  definitionStatus.value = undefined
  taskKind.value = 'group'
  current.value = undefined
  id.value = crypto.randomUUID()
  name.value = ''
  description.value = ''
  kind.value = props.groupKind ?? 'static'
  assetContext.value = 'endpoint'
  criteria.value = kind.value === 'dynamic' ? deviceCondition() : null
  task.value = undefined
  result.value = undefined
  status.value = undefined
}
function change(input: GroupChange) {
  if (current.value?.group.kind === 'system' || definitionPending.value) return
  compared.value = false
  const group = current.value?.group.id ?? id.value,
    body = operation(input, current.value?.group.revision ?? 0)
  if (busy.value || uncertain.value) return
  pending = async () => {
    const acknowledged = await runWrite(
      async () => client.change(group, body),
      (receipt) => {
        if ('kind' in receipt && receipt.kind === 'group_definition') {
          definitionTask.value = receipt.task
          definitionStatus.value = undefined
          taskKind.value = 'group'
          task.value = current.value?.memberSet ?? undefined
        } else {
          definitionTask.value = undefined
          definitionStatus.value = undefined
          task.value = receipt.task ?? undefined
          taskKind.value = 'group'
          editing.value = false
        }
        membersEditing.value = false
        deleting.value = false
        status.value = undefined
        result.value = undefined
        list.value = undefined
        if (input.action === 'delete') current.value = undefined
      },
    )
    if (acknowledged && input.action !== 'delete' && !definitionTask.value)
      await run(
        () => client.read(group),
        (v) => {
          id.value = v.group.id
          current.value = v
          if (!task.value) task.value = v.memberSet ?? undefined
          if (input.action === 'rule' || (input.action === 'create' && input.criteria))
            detailTab.value = 'members'
        },
      )
    return acknowledged
  }
  void pending()
}
function save() {
  try {
    change(
      current.value
        ? {
            action: 'edit',
            presentation: {
              ...current.value.group.presentation,
              name: name.value,
              description: description.value,
            },
          }
        : {
            action: 'create',
            assetContext: assetContext.value,
            presentation: { name: name.value, description: description.value },
            criteria:
              kind.value === 'static'
                ? null
                : criteria.value
                  ? groupCondition(criteria.value)
                  : deviceCondition(),
          },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
function preview() {
  if (!current.value || definitionPending.value) return
  const group = id.value,
    body = operation({}, current.value.group.revision)
  write(
    () => client.preview(group, body),
    (v) => {
      definitionTask.value = undefined
      definitionStatus.value = undefined
      task.value = v.task
      taskKind.value = 'group_preview'
      status.value = undefined
      result.value = undefined
    },
  )
}
function saveRule(event: Event) {
  if (current.value?.group.kind !== 'dynamic') return
  const form =
    event.currentTarget instanceof HTMLFormElement
      ? event.currentTarget
      : (event.currentTarget as HTMLElement).closest('form')
  if (!form?.reportValidity()) return
  try {
    change({
      action: 'rule',
      criteria: criteria.value ? groupCondition(criteria.value) : deviceCondition(),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
function completed(value: Awaited<ReturnType<typeof client.status>> | undefined) {
  return value?.status === 'completed' && !value.failure
}
async function refresh() {
  if (busy.value || uncertain.value) return
  const group = id.value
  if (definitionTask.value && !completed(definitionStatus.value)) {
    const loaded = await run(
      () => client.status(group, definitionTask.value!, 'group_definition'),
      (v) => {
        definitionStatus.value = v
      },
    )
    if (!loaded || !completed(definitionStatus.value)) return
    editing.value = false
    detailTab.value = 'members'
  }
  if (definitionStatus.value && definitionStatus.value.status !== 'completed') return
  if (task.value && !definitionTask.value && !completed(status.value)) {
    const loaded = await run(
      () => client.status(group, task.value!, taskKind.value),
      (v) => {
        status.value = v
      },
    )
    if (!loaded || !completed(status.value)) return
    if (taskKind.value === 'group_preview') return
  }
  await run(
    () => client.read(group),
    (v) => {
      current.value = v
      if (taskKind.value !== 'group_preview' && task.value !== (v.memberSet ?? undefined)) {
        task.value = v.memberSet ?? undefined
        status.value = undefined
        result.value = undefined
      }
    },
  )
}
const observing = computed(
  () =>
    definitionPending.value ||
    (!!task.value && !status.value && !definitionTask.value) ||
    (!!status.value && ['pending', 'running'].includes(status.value.status)) ||
    (current.value?.freshness === 'pending' &&
      (!status.value || ['pending', 'running', 'completed'].includes(status.value.status)) &&
      (!definitionStatus.value || definitionStatus.value.status === 'completed') &&
      taskKind.value !== 'group_preview'),
)
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
function scheduleObservation() {
  clearTimeout(timer)
  if (
    disposed ||
    !observing.value ||
    failure.value ||
    uncertain.value ||
    document.visibilityState === 'hidden'
  )
    return
  timer = setTimeout(async () => {
    await refresh()
    scheduleObservation()
  }, 2000)
}
watch([observing, busy, failure, uncertain, id], scheduleObservation)
document.addEventListener('visibilitychange', scheduleObservation)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', scheduleObservation)
})
function page(next?: string) {
  if (
    task.value &&
    (current.value?.memberSet === task.value ||
      (status.value?.status === 'completed' && !status.value.failure))
  )
    void run(
      () => client.page(id.value, task.value!, projection.value, next),
      (v) => (result.value = v),
    )
}
function changeMembers() {
  const ids = members.value.map((id) => ({ kind: 'endpoint' as const, id }))
  change({ action: 'members', add: remove.value ? [] : ids, remove: remove.value ? ids : [] })
}
watch(kind, (value) => {
  if (!current.value && value === 'static') assetContext.value = 'endpoint'
  if (value === 'dynamic' && !criteria.value) criteria.value = deviceCondition()
})
watch(detailTab, (value) => {
  if (['members', 'changes', 'decisions'].includes(value)) {
    projection.value = value as GroupProjection
    result.value = undefined
    if (
      task.value &&
      (status.value?.status === 'completed' || current.value?.memberSet === task.value)
    )
      page()
  }
})
watch(projection, () => {
  result.value = undefined
})
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    definitionTask.value = undefined
    definitionStatus.value = undefined
    taskKind.value = 'group'
    current.value = undefined
    list.value = undefined
    query.value = ''
    filter.value = ''
    applied = { kind: props.groupKind }
    result.value = undefined
    fields.value = []
    task.value = undefined
    status.value = undefined
    pending = undefined
    compared.value = false
    editing.value = false
    membersEditing.value = false
    deleting.value = false
    members.value = []
    create()
    void run(
      async () => ({
        list: await runtime.devices.groups.list({
          filter: allOf(
            props.groupKind ? queryComparison('kind', '==', props.groupKind) : undefined,
          ),
        }),
        fields: (await runtime.devices.assets.catalog()).fields,
      }),
      (value) => {
        list.value = value.list
        fields.value = value.fields
      },
    )
  },
  { immediate: true, flush: 'sync' },
)
function beginDelete() {
  deletionBlocked.value = undefined
  deleting.value = true
}
function openGroup(group: string) {
  open(group)
}
</script>
<template>
  <MdmPage
    :title="t('devices.groups')"
    :description="t('policies.ux.groupsHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn :disabled="busy" variant="outlined" @click="loadList()">{{
        t('devices.reload')
      }}</v-btn
      ><v-btn
        color="primary"
        :disabled="busy || uncertain || definitionPending"
        @click="beginCreate"
        >{{ t('devices.create') }}</v-btn
      ></template
    >
    <v-alert
      v-if="definitionTask"
      type="info"
      variant="tonal"
      data-testid="group-definition-task"
      role="status"
      >{{ t('devices.definitionTask') }} · {{ definitionTask }} ·
      {{ t(`devices.${definitionStatus?.status ?? 'pending'}`) }}
      <p v-if="definitionStatus?.failure">{{ definitionStatus.failure }}</p>
      <v-btn :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</v-btn></v-alert
    >
    <v-alert v-if="current?.freshness === 'pending'" type="info" variant="tonal">{{
      t('devices.membersPending')
    }}</v-alert>
    <template v-if="!current">
      <p>
        {{ t('policies.ux.loaded', { count: list?.items.length ?? 0 }) }} ·
        {{ t('policies.ux.memberBoundary') }}
      </p>
      <form class="console-toolbar task-filterbar" @submit.prevent="loadList()">
        <v-text-field
          v-model="query"
          type="search"
          :label="t('policies.ux.searchGroups')"
          :disabled="busy"
          clearable
          @click:clear="query = ''"
        /><v-select
          v-if="!groupKind"
          v-model="filter"
          :label="t('devices.kind')"
          :items="[
            { value: '', title: t('policies.ux.allTypes') },
            ...['static', 'dynamic', 'system'].map((value) => ({
              value,
              title: t('devices.' + value),
            })),
          ]"
        /><v-btn type="submit" :disabled="busy">{{ t('devices.searchGroups') }}</v-btn>
      </form>
      <v-table :aria-label="t('devices.groups')"
        ><thead>
          <tr>
            <th>{{ t('devices.name') }}</th>
            <th>{{ t('devices.kind') }}</th>
            <th>{{ t('devices.assetContext') }}</th>
            <th>{{ t('devices.memberCount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in list?.items" :key="row.id">
            <td>
              <v-btn variant="text" :disabled="busy || uncertain" @click="openGroup(row.id)">{{
                row.presentation.name
              }}</v-btn>
              <p>{{ row.presentation.description }}</p>
            </td>
            <td>
              <v-chip>{{ t('devices.' + row.kind) }}</v-chip>
            </td>
            <td>
              {{
                t(
                  row.assetContext === 'endpoint'
                    ? 'devices.objectKind_endpoint'
                    : 'devices.associatedDevice',
                )
              }}
            </td>
            <td>{{ row.memberCount }}</td>
          </tr>
          <tr v-if="list && !list.items.length">
            <td colspan="4">{{ t('policies.empty') }}</td>
          </tr>
        </tbody></v-table
      >
      <v-btn v-if="list?.nextCursor" :disabled="busy" @click="loadList(list.nextCursor)">{{
        t('devices.next')
      }}</v-btn>
    </template>
    <template v-if="current">
      <v-btn variant="text" :disabled="busy || uncertain" @click="closeDetail"
        >← {{ t('policies.ux.backGroups') }}</v-btn
      >
      <v-card data-testid="server-definition"
        ><v-card-title
          >{{ current.group.presentation.name }}
          <v-chip>{{ t('devices.' + current.group.kind) }}</v-chip></v-card-title
        ><v-card-text>
          <p>{{ current.group.presentation.description }}</p>
          <div class="console-toolbar">
            <v-btn
              :disabled="busy || uncertain || current.group.kind === 'system'"
              @click="beginEdit('metadata')"
              >{{ t('console.edit') }}</v-btn
            ><v-btn :disabled="busy || uncertain || definitionPending" @click="preview">{{
              t('devices.previewSaved')
            }}</v-btn
            ><v-btn
              :disabled="busy || uncertain || current.group.kind === 'system'"
              @click="change({ action: 'recompute' })"
              >{{ t('devices.recompute') }}</v-btn
            >
          </div>
          <v-tabs v-model="detailTab" :aria-label="t('devices.groups')"
            ><v-tab value="overview">{{ t('devices.overview') }}</v-tab
            ><v-tab v-if="current.group.kind === 'dynamic'" value="rule">{{
              t('devices.rule')
            }}</v-tab
            ><v-tab
              v-for="tab in ['members', 'changes', 'decisions', 'dependencies']"
              :key="tab"
              :value="tab"
              >{{ t('devices.' + tab) }}</v-tab
            ></v-tabs
          >
          <section v-if="detailTab === 'overview'">
            <dl class="group-summary">
              <div>
                <dt>{{ t('devices.assetContext') }}</dt>
                <dd>
                  {{
                    t(
                      current.group.assetContext === 'endpoint'
                        ? 'devices.objectKind_endpoint'
                        : 'devices.associatedDevice',
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>{{ t('devices.memberCount') }}</dt>
                <dd>{{ current.group.memberCount }}</dd>
              </div>
              <div>
                <dt>{{ t('devices.memberVersion') }}</dt>
                <dd>{{ current.group.memberVersion }}</dd>
              </div>
            </dl>
            <v-btn :disabled="busy" @click="compare">{{ t('devices.compare') }}</v-btn
            ><v-btn
              :disabled="busy || uncertain || current.group.kind === 'system'"
              @click="beginDelete"
              >{{ t('devices.delete') }}</v-btn
            >
          </section>
          <GroupDependencies v-if="detailTab === 'dependencies'" :group="current.group.id" />
          <section v-if="detailTab === 'rule'">
            <fieldset disabled>
              <GroupConditionEditor
                :model-value="current.criteria"
                :fields="fields"
                :asset-context="current.group.assetContext"
                :group="current.group.id"
              />
            </fieldset>
            <v-btn :disabled="busy || uncertain" @click="beginEdit('rule')">{{
              t('console.edit')
            }}</v-btn>
          </section>
          <section v-if="['members', 'changes', 'decisions'].includes(detailTab)">
            <p v-if="!task">{{ t('devices.noGroupResult') }}</p>
            <template v-else
              ><div class="console-toolbar">
                <v-btn :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</v-btn
                ><v-btn :disabled="busy" @click="page()">{{ t('devices.load') }}</v-btn
                ><v-chip v-if="status">{{ t('devices.' + status.status) }}</v-chip>
              </div>
              <template v-if="result"
                ><p>
                  {{ t('devices.currentResult') }}:
                  {{ t('devices.' + (result.current ? 'yes' : 'no')) }}
                </p>
                <v-table v-if="result.page.kind === 'members'" :aria-label="t('devices.members')"
                  ><thead>
                    <tr>
                      <th>{{ t('policies.device') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in result.page.items" :key="objectKey(row)">
                      <td><ObjectLink :object="row" /></td>
                    </tr>
                    <tr v-if="!result.page.items.length">
                      <td>{{ t('policies.empty') }}</td>
                    </tr>
                  </tbody></v-table
                >
                <div v-else-if="result.page.kind === 'changes'" class="group-summary">
                  <section>
                    <h3>{{ t('devices.add') }}</h3>
                    <p v-for="object in result.page.added" :key="objectKey(object)">
                      <ObjectLink :object="object" />
                    </p>
                  </section>
                  <section>
                    <h3>{{ t('devices.remove') }}</h3>
                    <p v-for="object in result.page.removed" :key="objectKey(object)">
                      <ObjectLink :object="object" />
                    </p>
                  </section>
                </div>
                <v-table v-else :aria-label="t('devices.decisions')"
                  ><thead>
                    <tr>
                      <th>{{ t('policies.device') }}</th>
                      <th>{{ t('devices.decisions') }}</th>
                      <th>{{ t('devices.evidence') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in result.page.items" :key="objectKey(row.object)">
                      <td><ObjectLink :object="row.object" /></td>
                      <td>
                        <v-chip :color="row.decision === 'unknown' ? 'warning' : undefined">{{
                          t('devices.' + row.decision)
                        }}</v-chip>
                      </td>
                      <td>
                        <AssignmentFacts
                          :item="{
                            object: row.object,
                            channel: null,
                            availability: '',
                            reason: null,
                            target: null,
                            sources: row.sourceObjects,
                          }"
                        />
                        <details>
                          <summary>{{ t('devices.explanations') }}</summary>
                          <p v-for="(e, i) in row.explanations" :key="i">
                            {{ e.path.join('.') }} ·
                            {{
                              ['match', 'no_match'].includes(e.outcome)
                                ? t('devices.' + e.outcome)
                                : t('devices.state.' + e.outcome)
                            }}
                          </p>
                          <p v-for="(e, i) in row.provenance" :key="i">
                            {{ e.field }} · {{ e.source }} · {{ e.snapshot_id }} ·
                            {{ e.observed_at }}
                          </p>
                        </details>
                      </td>
                    </tr>
                  </tbody></v-table
                >
                <v-btn v-if="result.nextCursor" :disabled="busy" @click="page(result.nextCursor)">{{
                  t('devices.next')
                }}</v-btn> </template
              ><v-alert v-if="status?.failure" type="error" variant="tonal"
                >{{ t('devices.failed') }} ·
                {{
                  status.failureDetail
                    ? t('devices.' + status.failureDetail.reason)
                    : status.failure
                }}
                <p v-if="status.failureDetail">
                  {{ t('devices.stage') }}: {{ status.failureDetail.stage }} ·
                  {{ t('policies.device') }}: {{ status.failureDetail.device }}
                </p></v-alert
              >
            </template>
          </section>
          <v-btn
            v-if="current.group.kind === 'static'"
            :disabled="busy || uncertain"
            @click="membersEditing = true"
            >{{ t('devices.manageMembers') }}</v-btn
          >
        </v-card-text></v-card
      >
    </template>
    <v-dialog
      v-model="membersEditing"
      :data-state="membersEditing ? 'open' : 'closed'"
      max-width="800"
      :persistent="busy || uncertain"
      ><v-card :title="t('devices.manageMembers')"
        ><v-card-text
          ><form class="group-member-editor" @submit.prevent="changeMembers">
            <EndpointPicker v-model="members" /><v-checkbox
              v-model="remove"
              :label="t('devices.remove')"
            /><v-btn :disabled="busy || uncertain" type="submit">{{ t('devices.save') }}</v-btn>
          </form>
          <template v-if="uncertain && pending"
            ><v-btn :disabled="busy" @click="compare">{{ t('devices.compare') }}</v-btn
            ><v-btn :disabled="busy || !compared" @click="pending!()">{{
              t('devices.replay')
            }}</v-btn></template
          ></v-card-text
        ><v-card-actions
          ><v-btn :disabled="busy || uncertain" @click="membersEditing = false">{{
            t('console.close')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog
      v-model="editing"
      :data-state="editing ? 'open' : 'closed'"
      max-width="960"
      scrollable
      :persistent="busy || uncertain || definitionPending"
      ><v-card :title="t(current ? 'console.edit' : 'console.create')"
        ><v-card-text>
          <v-alert v-if="failure" type="error" variant="tonal">{{
            t('devices.' + failure)
          }}</v-alert>
          <div v-if="definitionTask" role="status">
            <p>
              {{ t('devices.definitionTask') }} ·
              {{ t('devices.' + (definitionStatus?.status ?? 'pending')) }}
            </p>
            <p v-if="definitionStatus?.failure">{{ definitionStatus.failure }}</p>
            <v-btn :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</v-btn>
          </div>
          <form
            class="group-form"
            @submit.prevent="current && editKind === 'rule' ? saveRule($event) : save()"
          >
            <fieldset :disabled="busy || uncertain || definitionPending">
              <v-text-field
                v-model="name"
                data-testid="group-name"
                :label="t('devices.name')"
                :readonly="!!current && editKind === 'rule'"
                required
                maxlength="256"
              />
              <div class="group-choice-row">
                <v-select
                  v-model="kind"
                  data-testid="group-kind"
                  :label="t('devices.kind')"
                  :disabled="!!current || !!groupKind"
                  :items="
                    ['static', 'dynamic'].map((value) => ({ value, title: t('devices.' + value) }))
                  "
                /><v-select
                  v-model="assetContext"
                  data-testid="group-context"
                  :label="t('devices.assetContext')"
                  :disabled="!!current || kind === 'static'"
                  :items="[
                    { value: 'endpoint', title: t('devices.objectKind_endpoint') },
                    { value: 'associated_device', title: t('devices.associatedDevice') },
                  ]"
                />
              </div>
              <v-textarea
                v-model="description"
                :label="t('devices.description')"
                :readonly="!!current && editKind === 'rule'"
                maxlength="4096"
              />
              <GroupConditionEditor
                v-if="kind === 'dynamic' && (!current || editKind === 'rule')"
                v-model="criteria"
                :fields="fields"
                :asset-context="assetContext"
                :group="current?.group.id"
              />
              <div class="console-toolbar">
                <v-btn v-if="current" type="button" @click="compare">{{
                  t('devices.compare')
                }}</v-btn
                ><v-btn color="primary" type="submit">{{
                  t(kind === 'dynamic' ? 'devices.saveAndViewMembers' : 'devices.save')
                }}</v-btn
                ><v-btn type="button" @click="cancelEdit">{{ t('console.cancel') }}</v-btn>
              </div>
            </fieldset>
          </form>
          <template v-if="uncertain && pending"
            ><v-btn :disabled="busy" @click="compare">{{ t('devices.compare') }}</v-btn
            ><v-btn :disabled="busy || !compared" @click="pending!()">{{
              t('devices.replay')
            }}</v-btn></template
          > </v-card-text
        ><v-card-actions
          ><v-btn
            :aria-label="t('console.close')"
            :disabled="busy || uncertain"
            @click="editing = false"
            >{{ t('console.close') }}</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <details>
      <summary>{{ t('console.advanced') }}</summary>
      <form @submit.prevent="open()">
        <v-text-field
          v-model="id"
          :label="t('devices.groupId')"
          required
          :readonly="!!current || busy || uncertain || definitionPending"
        /><v-btn :disabled="busy || uncertain" type="submit">{{ t('devices.open') }}</v-btn>
      </form>
      <p>{{ current?.group.id }} · {{ current?.group.revision }} · {{ task }}</p>
    </details>
    <v-dialog
      v-model="deleting"
      :data-state="deleting ? 'open' : 'closed'"
      max-width="800"
      role="alertdialog"
      :persistent="busy || uncertain"
      ><v-card :title="t('devices.delete')"
        ><v-card-text
          ><p>{{ current?.group.presentation.name }}</p>
          <p>{{ t('devices.memberCount') }}: {{ current?.group.memberCount }}</p>
          <GroupDependencies
            v-if="deleting && current"
            :group="current.group.id"
            @loaded="deletionBlocked = $event"
          /><v-alert v-if="failure" type="error" variant="tonal">{{
            t('devices.' + failure)
          }}</v-alert></v-card-text
        ><v-card-actions
          ><v-btn v-if="uncertain" :disabled="busy" @click="compare">{{
            t('devices.compare')
          }}</v-btn
          ><v-btn
            :disabled="busy || uncertain || deletionBlocked !== false"
            color="error"
            @click="change({ action: 'delete' })"
            >{{ t('devices.delete') }}</v-btn
          ><v-btn v-if="uncertain && pending" :disabled="busy || !compared" @click="pending!()">{{
            t('devices.replay')
          }}</v-btn
          ><v-btn :disabled="busy || uncertain" @click="deleting = false">{{
            t('console.close')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <template v-if="uncertain && pending"
      ><v-btn :disabled="busy" @click="compare">{{ t('devices.compare') }}</v-btn
      ><v-btn :disabled="busy || !compared" @click="pending!()">{{
        t('devices.replay')
      }}</v-btn></template
    >
  </MdmPage>
</template>
