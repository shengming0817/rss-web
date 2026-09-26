<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Criteria, FieldDefinition } from '../clients/assets'
import type { GroupChange, GroupProjection, GroupRead } from '../clients/groups'
import DeviceFrame from '../components/DeviceFrame.vue'
import CriteriaEditor from '../components/CriteriaEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.groups,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof runtime.devices.directory.groups>>>(),
  fields = ref<FieldDefinition[]>([])
const current = ref<GroupRead>(),
  id = ref(''),
  name = ref(''),
  description = ref(''),
  kind = ref<'static' | 'dynamic'>('static'),
  criteria = ref<Criteria | null>(null),
  members = ref(''),
  remove = ref(false)
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  projection = ref<GroupProjection>('members'),
  result = ref<Awaited<ReturnType<typeof client.page>>>()
let pending: (() => Promise<boolean>) | undefined
function write<T>(request: () => Promise<T>, apply: (value: T) => void) {
  if (busy.value || uncertain.value) return
  pending = () => runWrite(request, apply)
  void pending()
}
function loadList(next?: string) {
  void run(
    () => runtime.devices.directory.groups(next),
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
      name.value = v.group.name
      description.value = v.group.description
      kind.value = v.group.kind
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
  change({ action: 'members', add: remove.value ? [] : ids, remove: remove.value ? ids : [] })
}
onMounted(() => {
  create()
  void run(
    async () => ({
      list: await runtime.devices.directory.groups(),
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
  <DeviceFrame :title="t('devices.groups')" :busy="busy" :failure="failure">
    <button :disabled="busy" @click="loadList()">{{ t('devices.reload') }}</button>
    <ul>
      <li v-for="group in list?.items" :key="group.id">
        <button :disabled="busy || uncertain" @click="openGroup(group.id)">
          {{ group.name }} · {{ t(`devices.${group.kind}`) }} · {{ group.memberCount }}
        </button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="loadList(list.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form @submit.prevent="open()">
      <label
        >{{ t('devices.groupId')
        }}<input v-model="id" required :readonly="!!current || busy || uncertain" /></label
      ><button :disabled="busy || uncertain">{{ t('devices.open') }}</button>
    </form>
    <button :disabled="busy || uncertain" @click="create">{{ t('devices.create') }}</button>
    <p v-if="current">
      {{ t('devices.revision') }} {{ current.group.revision }} · {{ t('devices.memberVersion') }}
      {{ current.group.memberVersion }} · {{ t('devices.memberCount') }}
      {{ current.group.memberCount }}
    </p>
    <section v-if="current" class="identity-card" data-testid="server-definition">
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
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <label>{{ t('devices.name') }}<input v-model="name" required maxlength="256" /></label
        ><label
          >{{ t('devices.description') }}<input v-model="description" maxlength="4096" /></label
        ><label
          >{{ t('devices.kind')
          }}<select v-model="kind" :disabled="!!current">
            <option value="static">{{ t('devices.static') }}</option>
            <option value="dynamic">{{ t('devices.dynamic') }}</option>
          </select></label
        ><CriteriaEditor v-if="kind === 'dynamic'" v-model="criteria" :fields="fields" /><button>
          {{ t('devices.save') }}</button
        ><button v-if="current && kind === 'dynamic'" type="button" @click="saveRule">
          {{ t('devices.rule') }}
        </button>
      </fieldset>
    </form>
    <section v-if="current">
      <button
        :disabled="busy"
        @click="
          run(
            () => client.read(id),
            (v) => (current = v),
          )
        "
      >
        {{ t('devices.compare') }}</button
      ><button :disabled="busy || uncertain" @click="change({ action: 'delete' })">
        {{ t('devices.delete') }}
      </button>
      <form v-if="current.group.kind === 'static'" @submit.prevent="changeMembers">
        <label>{{ t('devices.memberIds') }}<textarea v-model="members" required /></label
        ><label><input v-model="remove" type="checkbox" />{{ t('devices.remove') }}</label
        ><button :disabled="busy || uncertain">{{ t('devices.save') }}</button>
      </form>
      <p>{{ t('devices.previewNote') }}</p>
      <button :disabled="busy || uncertain" @click="preview">{{ t('devices.previewSaved') }}</button
      ><button :disabled="busy || uncertain" @click="change({ action: 'recompute' })">
        {{ t('devices.recompute') }}
      </button>
    </section>
    <section v-if="task">
      <h2>{{ t('devices.task') }} {{ task }}</h2>
      <button :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</button>
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
        ><select v-model="projection" :aria-label="t('devices.kind')" @change="result = undefined">
          <option v-for="key in ['members', 'changes', 'decisions']" :key="key" :value="key">
            {{ t(`devices.${key}`) }}
          </option></select
        ><button :disabled="busy" @click="page()">{{ t('devices.load') }}</button></template
      >
      <template v-if="result"
        ><p>
          {{ t('devices.currentResult') }}: {{ t(`devices.${result.current ? 'yes' : 'no'}`) }}
        </p>
        <ul v-if="result.page.kind === 'members'">
          <li v-for="device in result.page.items" :key="device">
            <RouterLink
              :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device } }"
              >{{ device }}</RouterLink
            >
          </li>
        </ul>
        <div v-else-if="result.page.kind === 'changes'">
          <p>{{ t('devices.add') }}: {{ result.page.added.join(', ') || '—' }}</p>
          <p>{{ t('devices.remove') }}: {{ result.page.removed.join(', ') || '—' }}</p>
        </div>
        <ul v-else>
          <li v-for="decision in result.page.items" :key="decision.device">
            <RouterLink
              :to="{
                name: 'device-detail',
                params: { tenant: runtime.tenant, device: decision.device },
              }"
              >{{ decision.device }}</RouterLink
            >
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
        <button v-if="result.nextCursor" :disabled="busy" @click="page(result.nextCursor)">
          {{ t('devices.next') }}
        </button>
      </template>
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending!()">
      {{ t('devices.replay') }}
    </button>
  </DeviceFrame>
</template>
