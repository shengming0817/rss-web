<script setup lang="ts">
import { UiButton, UiDialog, UiTable, UiTabs, UiBadge } from '@rss/core/components'
import { ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { FieldDefinition } from '../clients/assets'
import type { GroupChange, GroupProjection, GroupRead } from '../clients/groups'
import { objectKey } from '../clients/objects'
import ObjectLink from '../components/ObjectLink.vue'
import AssignmentFacts from '../../policies/components/AssignmentFacts.vue'
import PageFrame from '../../../components/PageFrame.vue'
import GroupConditionEditor from '../components/GroupConditionEditor.vue'
import GroupDependencies from '../components/GroupDependencies.vue'
import EndpointPicker from '../components/EndpointPicker.vue'
import { deviceBinding } from '../useDeviceBinding'
import { groupCondition, type GroupCondition } from '../clients/groups'
import { deviceCondition } from '../clients/asset-model'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.groups,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const list = ref<Awaited<ReturnType<typeof runtime.devices.groups.list>>>(),
  fields = ref<FieldDefinition[]>([])
const current = ref<GroupRead>(),
  id = ref(''),
  name = ref(''),
  description = ref(''),
  kind = ref<'static' | 'dynamic'>('static'),
  assetContext = ref<'endpoint' | 'associated_device'>('endpoint'),
  criteria = ref<GroupCondition | null>(null),
  members = ref<string[]>([]),
  remove = ref(false)
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  projection = ref<GroupProjection>('members'),
  result = ref<Awaited<ReturnType<typeof client.page>>>()
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
  void run(
    () => runtime.devices.groups.list({ after: next }),
    (v) => (list.value = v),
  )
}
function open(group = id.value) {
  if (busy.value || uncertain.value) return
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
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = crypto.randomUUID()
  name.value = ''
  description.value = ''
  kind.value = 'static'
  assetContext.value = 'endpoint'
  criteria.value = null
  task.value = undefined
  result.value = undefined
  status.value = undefined
}
function change(input: GroupChange) {
  if (current.value?.group.kind === 'system') return
  compared.value = false
  const group = current.value?.group.id ?? id.value,
    body = operation(input, current.value?.group.revision ?? 0)
  if (busy.value || uncertain.value) return
  pending = async () => {
    const acknowledged = await runWrite(
      async () => client.change(group, body),
      (receipt) => {
        editing.value = false
        deleting.value = false
        task.value = receipt.task ?? undefined
        status.value = undefined
        result.value = undefined
        list.value = undefined
        if (input.action === 'delete') current.value = undefined
        else if (input.action === 'rule' || input.action === 'create') detailTab.value = 'members'
      },
    )
    if (acknowledged && input.action !== 'delete')
      await run(
        () => client.read(group),
        (v) => {
          id.value = v.group.id
          current.value = v
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
  if (!current.value) return
  const group = id.value,
    body = operation({}, current.value.group.revision)
  write(
    () => client.preview(group, body),
    (v) => {
      task.value = v.task
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
async function refresh() {
  if (!task.value) return
  const group = id.value,
    taskId = task.value
  const loaded = await run(
    () => client.status(group, taskId),
    (v) => {
      status.value = v
    },
  )
  if (loaded && status.value?.status === 'completed' && !status.value.failure)
    await run(
      () => client.read(group),
      (v) => {
        current.value = v
      },
    )
}
function page(next?: string) {
  if (task.value)
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
    if (task.value) page()
  }
})
watch(projection, () => {
  result.value = undefined
})
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    current.value = undefined
    list.value = undefined
    result.value = undefined
    fields.value = []
    task.value = undefined
    status.value = undefined
    pending = undefined
    compared.value = false
    editing.value = false
    deleting.value = false
    members.value = []
    create()
    void run(
      async () => ({
        list: await runtime.devices.groups.list(),
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
function openGroup(group: string) {
  open(group)
}
</script>
<template>
  <PageFrame
    :title="t('devices.groups')"
    :description="t('devices.groupDescription')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton :disabled="busy" @click="loadList()">{{ t('devices.reload') }}</UiButton
      ><UiButton :disabled="busy || uncertain" @click="beginCreate">{{
        t('devices.create')
      }}</UiButton></template
    >
    <UiTable
      :label="t('devices.groups')"
      :rows="list?.items ?? []"
      :columns="[
        { key: 'name', label: t('devices.name') },
        { key: 'kind', label: t('devices.kind') },
        { key: 'assetContext', label: t('devices.assetContext') },
        { key: 'memberCount', label: t('devices.memberCount') },
      ]"
      :row-key="(g) => g.id"
      :busy="busy"
      :busy-label="t('devices.loading')"
      :empty-label="t('policies.empty')"
    >
      <template #cell-name="{ row }"
        ><UiButton variant="ghost" :disabled="busy || uncertain" @click="openGroup(row.id)">{{
          row.presentation.name
        }}</UiButton></template
      >
      <template #cell-kind="{ row }"
        ><UiBadge>{{ t(`devices.${row.kind}`) }}</UiBadge></template
      >
      <template #cell-assetContext="{ row }">{{
        t(
          row.assetContext === 'endpoint'
            ? 'devices.objectKind_endpoint'
            : 'devices.associatedDevice',
        )
      }}</template>
    </UiTable>
    <UiButton v-if="list?.nextCursor" :disabled="busy" @click="loadList(list.nextCursor)">{{
      t('devices.next')
    }}</UiButton>
    <section v-if="current" class="group-detail console-panel" data-testid="server-definition">
      <header class="console-page-header">
        <div>
          <h2>{{ current.group.presentation.name }}</h2>
          <p>{{ current.group.presentation.description }}</p>
        </div>
        <UiBadge>{{ t(`devices.${current.group.kind}`) }}</UiBadge>
      </header>
      <div class="console-toolbar">
        <UiButton
          :disabled="busy || uncertain || current.group.kind === 'system'"
          @click="beginEdit('metadata')"
          >{{ t('console.edit') }}</UiButton
        ><RouterLink
          :to="{
            name: 'policy-scopes',
            params: { tenant: runtime.tenant },
            query: { group: current.group.id },
          }"
          >{{ t('policies.scopes') }}</RouterLink
        ><UiButton :disabled="busy || uncertain" @click="preview">{{
          t('devices.previewSaved')
        }}</UiButton
        ><UiButton
          :disabled="busy || uncertain || current.group.kind === 'system'"
          @click="change({ action: 'recompute' })"
          >{{ t('devices.recompute') }}</UiButton
        >
      </div>
      <UiTabs
        v-model="detailTab"
        :label="t('devices.groups')"
        :items="[
          { value: 'overview', label: t('devices.overview') },
          ...(current.group.kind === 'dynamic'
            ? [{ value: 'rule', label: t('devices.rule') }]
            : []),
          { value: 'members', label: t('devices.members') },
          { value: 'changes', label: t('devices.changes') },
          { value: 'decisions', label: t('devices.decisions') },
          { value: 'dependencies', label: t('devices.dependencies') },
        ]"
      >
        <template #overview
          ><dl class="group-summary">
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
          <UiButton :disabled="busy" @click="compare">{{ t('devices.compare') }}</UiButton
          ><UiButton
            :disabled="busy || uncertain || current.group.kind === 'system'"
            @click="
              deletionBlocked = undefined
              deleting = true
            "
            >{{ t('devices.delete') }}</UiButton
          ></template
        >
        <template #dependencies><GroupDependencies :group="current.group.id" /></template>
        <template #rule
          ><fieldset disabled>
            <GroupConditionEditor
              :model-value="current.criteria"
              :fields="fields"
              :asset-context="current.group.assetContext"
              :group="current.group.id"
            />
          </fieldset>
          <UiButton :disabled="busy || uncertain" @click="beginEdit('rule')">{{
            t('console.edit')
          }}</UiButton></template
        >
        <template v-for="tab in ['members', 'changes', 'decisions']" :key="tab" #[tab]>
          <p v-if="!task">{{ t('devices.noGroupResult') }}</p>
          <template v-else
            ><div class="console-toolbar">
              <UiButton :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</UiButton
              ><UiButton :disabled="busy" @click="page()">{{ t('devices.load') }}</UiButton
              ><UiBadge v-if="status">{{ t(`devices.${status.status}`) }}</UiBadge>
            </div>
            <template v-if="result"
              ><p class="ui-help">
                {{ t('devices.currentResult') }}:
                {{ t(`devices.${result.current ? 'yes' : 'no'}`) }}
              </p>
              <UiTable
                v-if="result.page.kind === 'members'"
                :label="t('devices.members')"
                :rows="result.page.items"
                :columns="[{ key: 'object', label: t('policies.device') }]"
                :row-key="objectKey"
                :busy-label="t('devices.loading')"
                :empty-label="t('policies.empty')"
                ><template #cell-object="{ row }"><ObjectLink :object="row" /></template
              ></UiTable>
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
              <UiTable
                v-else
                :label="t('devices.decisions')"
                :rows="result.page.items"
                :columns="[
                  { key: 'object', label: t('policies.device') },
                  { key: 'decision', label: t('devices.decisions') },
                  { key: 'evidence', label: t('devices.evidence') },
                ]"
                :row-key="(d) => objectKey(d.object)"
                :busy-label="t('devices.loading')"
                :empty-label="t('policies.empty')"
              >
                <template #cell-object="{ row }"><ObjectLink :object="row.object" /></template
                ><template #cell-decision="{ row }"
                  ><UiBadge :tone="row.decision === 'unknown' ? 'warning' : 'neutral'">{{
                    t(`devices.${row.decision}`)
                  }}</UiBadge></template
                ><template #cell-evidence="{ row }"
                  ><AssignmentFacts
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
                          ? t(`devices.${e.outcome}`)
                          : t(`devices.state.${e.outcome}`)
                      }}
                    </p>
                    <p v-for="(e, i) in row.provenance" :key="i">
                      {{ e.field }} · {{ e.source }} · {{ e.snapshot_id }} · {{ e.observed_at }}
                    </p>
                  </details></template
                > </UiTable
              ><UiButton
                v-if="result.nextCursor"
                :disabled="busy"
                @click="page(result.nextCursor)"
                >{{ t('devices.next') }}</UiButton
              >
            </template>
            <p v-if="status?.failure" role="alert">
              {{ t('devices.failed') }} ·
              {{
                status.failureDetail ? t(`devices.${status.failureDetail.reason}`) : status.failure
              }}
              <span v-if="status.failureDetail"
                >{{ t('devices.stage') }}: {{ status.failureDetail.stage }} ·
                {{ t('policies.device') }}: {{ status.failureDetail.device }}</span
              >
            </p></template
          >
        </template>
      </UiTabs>
      <form
        v-if="current.group.kind === 'static'"
        class="group-member-editor"
        @submit.prevent="changeMembers"
      >
        <EndpointPicker v-model="members" />
        <label><input v-model="remove" type="checkbox" />{{ t('devices.remove') }}</label
        ><UiButton :disabled="busy || uncertain" type="submit">{{ t('devices.save') }}</UiButton>
      </form>
    </section>
    <UiDialog
      v-model:open="editing"
      placement="right"
      :title="t(current ? 'console.edit' : 'console.create')"
      :close-label="t('console.close')"
    >
      <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
      <form
        class="group-form"
        @submit.prevent="current && editKind === 'rule' ? saveRule($event) : save()"
      >
        <fieldset :disabled="busy || uncertain">
          <label
            >{{ t('devices.name')
            }}<input
              v-model="name"
              data-testid="group-name"
              :readonly="!!current && editKind === 'rule'"
              class="ui-input"
              required
              maxlength="256" /></label
          ><label
            >{{ t('devices.description')
            }}<input
              v-model="description"
              :readonly="!!current && editKind === 'rule'"
              class="ui-input"
              maxlength="4096" /></label
          ><label
            >{{ t('devices.kind')
            }}<select
              v-model="kind"
              data-testid="group-kind"
              class="ui-input"
              :disabled="!!current"
            >
              <option value="static">{{ t('devices.static') }}</option>
              <option value="dynamic">{{ t('devices.dynamic') }}</option>
            </select></label
          ><label
            >{{ t('devices.assetContext')
            }}<select
              v-model="assetContext"
              data-testid="group-context"
              class="ui-input"
              :disabled="!!current || kind === 'static'"
            >
              <option value="endpoint">{{ t('devices.objectKind_endpoint') }}</option>
              <option value="associated_device">{{ t('devices.associatedDevice') }}</option>
            </select></label
          ><GroupConditionEditor
            v-if="kind === 'dynamic' && (!current || editKind === 'rule')"
            v-model="criteria"
            :fields="fields"
            :asset-context="assetContext"
            :group="current?.group.id"
          />
          <div class="console-toolbar">
            <UiButton v-if="current" type="button" @click="compare">{{
              t('devices.compare')
            }}</UiButton
            ><UiButton type="submit">{{
              t(kind === 'dynamic' ? 'devices.saveAndViewMembers' : 'devices.save')
            }}</UiButton
            ><UiButton type="button" @click="cancelEdit">{{ t('console.cancel') }}</UiButton>
          </div>
        </fieldset>
      </form>
      <UiButton v-if="uncertain && pending" :disabled="busy || !compared" @click="pending!()">{{
        t('devices.replay')
      }}</UiButton>
    </UiDialog>
    <details class="console-panel">
      <summary>{{ t('console.advanced') }}</summary>
      <form @submit.prevent="open()">
        <label
          >{{ t('devices.groupId')
          }}<input
            v-model="id"
            class="ui-input"
            required
            :readonly="!!current || busy || uncertain" /></label
        ><UiButton :disabled="busy || uncertain" type="submit">{{ t('devices.open') }}</UiButton>
      </form>
      <p>{{ current?.group.id }} · {{ current?.group.revision }} · {{ task }}</p>
    </details>
    <UiDialog
      :open="deleting"
      :title="t('devices.delete')"
      :close-label="t('console.close')"
      kind="alertdialog"
      :dismissible="!busy && !uncertain"
      @update:open="deleting = $event"
    >
      <p>{{ current?.group.presentation.name }}</p>
      <p>{{ t('devices.memberCount') }}: {{ current?.group.memberCount }}</p>
      <GroupDependencies
        v-if="deleting && current"
        :group="current.group.id"
        @loaded="deletionBlocked = $event"
      />
      <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
      <template #footer>
        <UiButton v-if="uncertain" :disabled="busy" @click="compare">{{
          t('devices.compare')
        }}</UiButton>
        <UiButton
          :disabled="busy || uncertain || deletionBlocked !== false"
          @click="change({ action: 'delete' })"
          >{{ t('devices.delete') }}</UiButton
        ><UiButton v-if="uncertain && pending" :disabled="busy || !compared" @click="pending!()">{{
          t('devices.replay')
        }}</UiButton></template
      >
    </UiDialog>
    <UiButton v-if="uncertain && pending" :disabled="busy" @click="compare">{{
      t('devices.compare')
    }}</UiButton>
    <UiButton
      v-if="uncertain && pending"
      :disabled="busy || !compared"
      type="button"
      @click="pending!()"
    >
      {{ t('devices.replay') }}
    </UiButton>
  </PageFrame>
</template>
