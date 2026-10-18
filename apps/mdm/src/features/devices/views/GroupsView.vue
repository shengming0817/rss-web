<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Criteria, FieldDefinition } from '../clients/assets'
import type { GroupChange, GroupProjection, GroupRead } from '../clients/groups'
import { objectKey } from '../clients/objects'
import ObjectLink from '../components/ObjectLink.vue'
import PageFrame from '../../../components/PageFrame.vue'
import CriteriaEditor from '../components/CriteriaEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.groups,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof runtime.devices.groups.list>>>(),
  fields = ref<FieldDefinition[]>([])
const current = ref<GroupRead>(),
  id = ref(''),
  name = ref(''),
  description = ref(''),
  kind = ref<'static' | 'dynamic'>('static'),
  assetContext = ref<'endpoint' | 'associated_device'>('endpoint'),
  criteria = ref<Criteria | null>(null),
  members = ref(''),
  remove = ref(false)
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  projection = ref<GroupProjection>('members'),
  result = ref<Awaited<ReturnType<typeof client.page>>>()
const editing = ref(false),
  deleting = ref(false)
function cancelEdit() {
  if (busy.value || uncertain.value) return
  if (current.value) {
    name.value = current.value.group.name
    description.value = current.value.group.description
    kind.value = current.value.group.kind
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
  pending = () => runWrite(request, apply)
  void pending()
}
function loadList(next?: string) {
  void run(
    () => runtime.devices.groups.list(next),
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
      name.value = v.group.name
      description.value = v.group.description
      kind.value = v.group.kind
      assetContext.value = v.group.assetContext
      criteria.value = v.criteria
      task.value = undefined
      result.value = undefined
      status.value = undefined
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
  change(
    current.value
      ? { action: 'edit', name: name.value, description: description.value }
      : {
          action: 'create',
          assetContext: assetContext.value,
          name: name.value,
          description: description.value,
          criteria:
            kind.value === 'static'
              ? null
              : (structuredClone(toRaw(criteria.value)) ?? { kind: 'and', children: [] }),
        },
  )
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
  if (!(event.currentTarget as HTMLButtonElement).closest('form')?.reportValidity()) return
  change({
    action: 'rule',
    criteria: structuredClone(toRaw(criteria.value)) ?? { kind: 'and', children: [] },
  })
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
  const ids = members.value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((id) => ({ kind: 'endpoint' as const, id }))
  change({ action: 'members', add: remove.value ? [] : ids, remove: remove.value ? ids : [] })
}
watch(kind, (value) => {
  if (!current.value && value === 'static') assetContext.value = 'endpoint'
})
watch(projection, () => {
  result.value = undefined
})
onMounted(() => {
  create()
  void run(
    async () => ({
      list: await runtime.devices.groups.list(),
      fields: (await runtime.devices.assets.catalog()).fields,
    }),
    (v) => {
      list.value = v.list
      fields.value = v.fields
    },
  )
})
function openGroup(group: string) {
  open(group)
}
</script>
<template>
  <PageFrame :title="t('devices.groups')" :busy="busy" :failure="failure">
    <UiButton :disabled="!!busy" type="submit" @click="loadList()">{{
      t('devices.reload')
    }}</UiButton>
    <div class="console-toolbar">
      <UiButton type="button" :disabled="busy || uncertain" @click="beginCreate">{{
        t('devices.create')
      }}</UiButton>
    </div>
    <ul class="console-object-list">
      <li v-for="group in list?.items" :key="group.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="openGroup(group.id)">
          {{ group.name }} · {{ t(`devices.${group.kind}`) }} · {{ group.memberCount }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="list?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="loadList(list.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
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
        ><UiButton :disabled="!!(busy || uncertain)" type="submit">{{
          t('devices.open')
        }}</UiButton>
      </form>
    </details>
    <p v-if="current">
      {{ t('devices.revision') }} {{ current.group.revision }} · {{ t('devices.memberVersion') }}
      {{ current.group.memberVersion }} · {{ t('devices.memberCount') }}
      {{ current.group.memberCount }}
    </p>
    <section v-if="current" class="console-panel" data-testid="server-definition">
      <h2>{{ t('devices.current') }}</h2>
      <RouterLink
        :to="{
          name: 'policy-scopes',
          params: { tenant: runtime.tenant },
          query: { group: current.group.id },
        }"
        >{{ t('policies.scopes') }}</RouterLink
      >
      <p>{{ current.group.name }} · {{ current.group.description }}</p>
      <fieldset disabled>
        <CriteriaEditor :model-value="current.criteria" :fields="fields" />
      </fieldset>
    </section>
    <div v-if="current && !editing" class="console-toolbar">
      <UiButton type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</UiButton>
    </div>
    <form v-show="editing" class="console-panel" @submit.prevent="save">
      <div class="console-page-header">
        <h2>{{ t(current ? 'console.edit' : 'console.create') }}</h2>
        <UiButton type="button" :disabled="busy || uncertain" @click="cancelEdit">{{
          t('console.cancel')
        }}</UiButton>
      </div>
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('devices.name')
          }}<input v-model="name" class="ui-input" required maxlength="256" /></label
        ><label
          >{{ t('devices.description')
          }}<input v-model="description" class="ui-input" maxlength="4096" /></label
        ><label
          >{{ t('devices.kind')
          }}<select v-model="kind" class="ui-input" :disabled="!!current">
            <option value="static">{{ t('devices.static') }}</option>
            <option value="dynamic">{{ t('devices.dynamic') }}</option>
          </select></label
        ><label
          >{{ t('devices.assetContext')
          }}<select
            v-model="assetContext"
            class="ui-input"
            :disabled="!!current || kind === 'static'"
          >
            <option value="endpoint">{{ t('devices.objectKind_endpoint') }}</option>
            <option value="associated_device">{{ t('devices.associatedDevice') }}</option>
          </select></label
        ><CriteriaEditor v-if="kind === 'dynamic'" v-model="criteria" :fields="fields" /><UiButton
          type="submit"
        >
          {{ t('devices.save') }}</UiButton
        ><UiButton v-if="current && kind === 'dynamic'" type="button" @click="saveRule">
          {{ t('devices.rule') }}
        </UiButton>
      </fieldset>
    </form>
    <section v-if="current" class="console-panel">
      <UiButton
        :disabled="!!busy"
        type="submit"
        @click="
          run(
            () => client.read(id),
            (v) => (current = v),
          )
        "
      >
        {{ t('devices.compare') }}</UiButton
      ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="deleting = true">
        {{ t('devices.delete') }}
      </UiButton>
      <form v-if="current.group.kind === 'static'" @submit.prevent="changeMembers">
        <label
          >{{ t('devices.memberIds')
          }}<textarea v-model="members" class="ui-input" required /></label
        ><label><input v-model="remove" type="checkbox" />{{ t('devices.remove') }}</label
        ><UiButton :disabled="!!(busy || uncertain)" type="submit">{{
          t('devices.save')
        }}</UiButton>
      </form>
      <p>{{ t('devices.previewNote') }}</p>
      <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="preview">{{
        t('devices.previewSaved')
      }}</UiButton
      ><UiButton
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change({ action: 'recompute' })"
      >
        {{ t('devices.recompute') }}
      </UiButton>
    </section>
    <section v-if="task">
      <h2>{{ t('devices.task') }} {{ task }}</h2>
      <UiButton :disabled="!!busy" type="submit" @click="refresh">{{
        t('devices.refreshTask')
      }}</UiButton>
      <p v-if="status">
        {{ t(`devices.${status.status}`) }} · {{ t('devices.memberCount') }} {{ status.members }}
      </p>
      <p v-if="status?.failure" role="alert">{{ t('devices.failed') }}</p>
      <dl v-if="status?.failureDetail">
        <dt>{{ t('devices.blocked') }}</dt>
        <dd>{{ t(`devices.${status.failureDetail.reason}`) }}</dd>
        <dt>{{ t('devices.stage') }}</dt>
        <dd>{{ t(`devices.${status.failureDetail.stage}`) }}</dd>
        <dt>{{ t('devices.deviceId') }}</dt>
        <dd>{{ status.failureDetail.device ?? '—' }}</dd>
      </dl>
      <template v-if="status?.status === 'completed' && !status.failure"
        ><select
          v-model="projection"
          class="ui-input"
          :aria-label="t('devices.kind')"
          @change="result = undefined"
        >
          <option v-for="key in ['members', 'changes', 'decisions']" :key="key" :value="key">
            {{ t(`devices.${key}`) }}
          </option></select
        ><UiButton :disabled="!!busy" type="submit" @click="page()">{{
          t('devices.load')
        }}</UiButton></template
      >
      <template v-if="result"
        ><p>
          {{ t('devices.currentResult') }}: {{ t(`devices.${result.current ? 'yes' : 'no'}`) }}
        </p>
        <ul v-if="result.page.kind === 'members'">
          <li v-for="object in result.page.items" :key="objectKey(object)">
            <ObjectLink :object="object" />
          </li>
        </ul>
        <div v-else-if="result.page.kind === 'changes'">
          <p>{{ t('devices.add') }}: {{ result.page.added.map(objectKey).join(', ') || '—' }}</p>
          <p>
            {{ t('devices.remove') }}: {{ result.page.removed.map(objectKey).join(', ') || '—' }}
          </p>
        </div>
        <ul v-else>
          <li v-for="decision in result.page.items" :key="objectKey(decision.object)">
            <ObjectLink :object="decision.object" />
            <ul>
              <li v-for="source in decision.sourceObjects" :key="objectKey(source.object)">
                <ObjectLink :object="source.object" />
                <ul>
                  <li v-for="member in source.members" :key="member.registrationId">
                    {{ member.device }} / {{ member.channel }} / {{ member.registrationId }} /
                    {{ member.generation }}
                  </li>
                </ul>
              </li>
            </ul>
            · {{ t(`devices.${decision.decision}`) }} · {{ t(`devices.${decision.origin}Origin`) }}
            <ul>
              <li v-for="(explanation, index) in decision.explanations" :key="index">
                {{ explanation.path.join('.') }}:
                {{
                  ['match', 'no_match'].includes(explanation.outcome)
                    ? t(`devices.${explanation.outcome}`)
                    : t(`devices.state.${explanation.outcome}`)
                }}
              </li>
            </ul>
            <details>
              <summary>{{ t('devices.evidence') }}</summary>
              <ul>
                <li v-for="(evidence, index) in decision.provenance" :key="index">
                  {{ evidence.field }} · {{ evidence.source }} · {{ evidence.snapshot_id }} ·
                  {{ evidence.observed_at }}
                </li>
              </ul>
            </details>
          </li>
        </ul>
        <UiButton
          v-if="result.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="page(result.nextCursor)"
        >
          {{ t('devices.next') }}
        </UiButton>
      </template>
    </section>
    <UiDialog
      :open="deleting"
      :title="t('devices.delete')"
      :close-label="t('console.close')"
      kind="alertdialog"
      :dismissible="!busy && !uncertain"
      @update:open="deleting = $event"
    >
      <p>{{ current?.group.name }} · {{ current?.group.id }}</p>
      <p>{{ t('devices.memberCount') }}: {{ current?.group.memberCount }}</p>
      <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
      <template #footer
        ><UiButton :disabled="busy || uncertain" @click="change({ action: 'delete' })">{{
          t('devices.delete')
        }}</UiButton
        ><UiButton v-if="uncertain && pending" :disabled="busy" @click="pending!()">{{
          t('devices.replay')
        }}</UiButton></template
      >
    </UiDialog>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending!()">
      {{ t('devices.replay') }}
    </UiButton>
  </PageFrame>
</template>
