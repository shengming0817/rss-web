<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import PolicyFieldset from './PolicyFieldset.vue'
import PolicyDialog from '../components/PolicyDialog.vue'
import PolicyTabs from '../components/PolicyTabs.vue'

import { VBtn, VDataTable, VChip, VTextField, VCheckbox, VSelect, VTable } from 'vuetify/components'

import { ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Reference, ScopeRead, ScopeProjection, ScopeChange } from '../clients/scopes'
import { objectKey, type Channel } from '../../devices/clients/objects'
import ObjectLink from '../../devices/components/ObjectLink.vue'

import { deviceBinding } from '../../devices/useDeviceBinding'
import ReferenceEditor from '../components/ReferenceEditor.vue'
const props = defineProps<{ disabled?: boolean }>()

const directoryQuery = useDirectoryQuery(
  ['id', 'revision', 'deleted', 'calculationRevision', 'resolution', 'resolutionRevision'],
  1000,
)

const selected = defineModel<string>({ default: '' })
const scopeOpen = ref(false)
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.scopes,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const editing = ref(false)
const id = ref(''),
  current = ref<ScopeRead>(),
  targets = ref<Reference[]>([]),
  limitations = ref<Reference[]>([]),
  exclusions = ref<Reference[]>([]),
  unlimited = ref(true)
const list = ref<Awaited<ReturnType<typeof runtime.policies.scopes.list>>>()
const compared = ref(false),
  comparison = ref<ScopeRead | null>()
const referenceRoles = ['targets', 'limitations', 'exclusions'] as const
async function compare() {
  const ok = await run(
    () => client.read(id.value),
    (value) => {
      comparison.value = value
      current.value = value
    },
  )
  if (ok) compared.value = true
  else if (uncertain.value && failure.value === 'notFound') {
    comparison.value = null
    compared.value = true
  }
}
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  result = ref<Awaited<ReturnType<typeof client.page>>>(),
  projection = ref<ScopeProjection>('members'),
  channel = ref<Channel>('mdm')
let pending: (() => Promise<void>) | undefined
function chooseScope() {
  if (!current.value || busy.value || uncertain.value) return
  selected.value = current.value.id
  scopeOpen.value = false
}
function closeScope() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  task.value = undefined
  status.value = undefined
  result.value = undefined
  load()
}
function load(cursor?: string) {
  void run(
    () => directoryQuery.read(cursor, (query) => runtime.policies.scopes.list(query), {}),
    (v) => (list.value = v),
  )
}
function apply(value: ScopeRead) {
  editing.value = false
  current.value = value
  id.value = value.id
  targets.value = structuredClone(value.definition.targets)
  limitations.value = structuredClone(value.definition.limitations ?? [])
  unlimited.value = value.definition.limitations === null
  exclusions.value = structuredClone(value.definition.exclusions)
}
function open(value = id.value) {
  if (!busy.value && !uncertain.value)
    void run(
      () => client.read(value),
      (v) => {
        apply(v)
        task.value = v.resolution ?? undefined
        status.value = undefined
        result.value = undefined
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
  editing.value = true
  current.value = undefined
  id.value = crypto.randomUUID()
  targets.value = []
  limitations.value = []
  exclusions.value = []
  unlimited.value = true
  task.value = undefined
  status.value = undefined
  result.value = undefined
}
function change(input: ScopeChange) {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  compared.value = false
  pending = async () => {
    const acknowledged = await runWrite(
      () => client.change(target, body),
      (v) => {
        task.value = v.task ?? undefined
        status.value = undefined
        result.value = undefined
        list.value = undefined
        if (input.action === 'delete') current.value = undefined
      },
    )
    if (acknowledged && input.action !== 'delete') await run(() => client.read(target), apply)
  }
  void pending()
}
function save() {
  change({
    action: 'put',
    definition: {
      targets: structuredClone(toRaw(targets.value)),
      limitations: unlimited.value ? null : structuredClone(toRaw(limitations.value)),
      exclusions: structuredClone(toRaw(exclusions.value)),
    },
  })
}
async function refresh() {
  const target = id.value,
    pendingTask = task.value
  if (!pendingTask) return
  result.value = undefined
  let completed = false
  const ok = await run(
    () => client.status(target, pendingTask),
    (value) => {
      status.value = value
      completed = value.status === 'completed'
    },
  )
  if (ok && completed && id.value === target)
    await run(
      () => client.read(target),
      (value) => {
        if (id.value === target) apply(value)
      },
    )
}
function page(cursor?: string) {
  if (task.value)
    void run(
      () => client.page(id.value, task.value!, projection.value, channel.value, cursor),
      (v) => (result.value = v),
    )
}
watch([projection, channel], () => {
  result.value = undefined
})
watch(
  () => JSON.stringify([scopeOpen.value, ...deviceBinding(runtime)]),
  async () => {
    if (!scopeOpen.value) return
    editing.value = false
    current.value = undefined
    list.value = undefined
    id.value = ''
    targets.value = []
    limitations.value = []
    exclusions.value = []
    task.value = undefined
    status.value = undefined
    result.value = undefined
    pending = undefined
    compared.value = false
    comparison.value = undefined
    if (
      !(await run(
        () => client.list(),
        (value) => {
          list.value = value
        },
      ))
    )
      return
    const device = route.query['device'],
      group = route.query['group']
    if (typeof device === 'string' || typeof group === 'string') {
      create()
      targets.value =
        typeof device === 'string'
          ? [{ kind: 'device', id: device }]
          : [{ kind: 'group', id: group as string }]
    }
  },
  { immediate: true, flush: 'sync' },
)
if (route.query['device'] || route.query['group']) scopeOpen.value = true
directoryQuery.onClear(() => {
  list.value = undefined
})
</script>
<template>
  <DirectoryControls
    :query="directoryQuery"
    :busy="busy"
    hint="id / revision / deleted / calculationRevision / resolutionRevision；ready 可筛选。"
    @load="load"
  />
  <DirectoryResults
    v-if="!directoryQuery.complete.value"
    :disabled="busy || uncertain"
    :items="list?.items ?? []"
    @open="
      (row) => {
        open(String(row.id))
      }
    "
  />

  <VBtn type="button" variant="tonal" :disabled="props.disabled" @click="scopeOpen = true">{{
    t('policies.scopeEditor.manage')
  }}</VBtn>
  <PolicyDialog
    v-model:open="scopeOpen"
    :title="t('policies.scopeEditor.manage')"
    :close-label="t('console.close')"
    :dismissible="!busy && !uncertain"
  >
    <p>{{ t('policies.scopeEditor.contract') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <div class="d-flex ga-2 mb-4">
      <VBtn :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
        t('policies.create')
      }}</VBtn
      ><VBtn :disabled="!!busy" type="submit" @click="load()">{{ t('policies.reload') }}</VBtn>
    </div>
    <template v-if="!current">
      <div class="task-directory-summary">
        <strong>{{ t('policies.ux.loaded', { count: list?.items.length ?? 0 }) }}</strong
        ><span>{{ t('policies.ux.memberBoundary') }}</span>
      </div>
      <VDataTable
        v-if="directoryQuery.complete.value"
        :aria-label="t('policies.scopes')"
        :items-per-page="-1"
        hide-default-footer
        :items="list?.items ?? []"
        :headers="
          [
            { key: 'scope', label: t('policies.scopes') },
            { key: 'revision', label: t('policies.revision') },
            { key: 'resolution', label: t('console.result') },
          ].map((column) => ({ key: column.key, title: column.label, sortable: false }))
        "
        item-value="id"
        :loading-text="t('devices.loading')"
        :no-data-text="t('policies.empty')"
        ><template #[`item.scope`]="{ item: row }"
          ><VBtn variant="text" :disabled="busy || uncertain" @click="open(row.id)"
            >{{ t('policies.scopes') }} · {{ row.id.slice(0, 8) }}</VBtn
          ></template
        ><template #[`item.resolution`]="{ item: row }"
          ><VChip>{{
            t(row.resolution ? 'policies.savedResult' : 'policies.awaitingResult')
          }}</VChip></template
        ></VDataTable
      >
    </template>
    <VBtn v-if="current" variant="text" :disabled="busy || uncertain" @click="closeScope"
      >← {{ t('policies.ux.backScopes') }}</VBtn
    >
    <VBtn
      v-if="current && !editing"
      type="button"
      color="primary"
      :disabled="
        busy || uncertain || current.resolutionRevision !== current.revision || !current.resolution
      "
      @click="chooseScope"
      >{{ t('policies.scopeEditor.use') }}</VBtn
    >
    <section v-if="current && !editing" class="console-panel task-scope-definition">
      <h2>{{ t('policies.ux.scopeSaved') }}</h2>
      <p>{{ current.id }} · {{ t('policies.revision') }} {{ current.revision }}</p>
      <div class="task-scope-roles">
        <section v-for="role in referenceRoles" :key="role" class="task-scope-role">
          <h3>{{ t(`policies.${role}`) }}</h3>
          <p>{{ t(`policies.ux.scope${role[0]!.toUpperCase() + role.slice(1)}`) }}</p>
          <p v-if="current.definition[role] === null">{{ t('policies.unlimited') }}</p>
          <ul v-else-if="current.definition[role]?.length" class="task-reference-list">
            <li
              v-for="reference in current.definition[role]"
              :key="`${reference.kind}/${reference.id}`"
            >
              <VChip>{{ t(`policies.${reference.kind}`) }}</VChip
              ><span class="coordinate">{{ reference.id }}</span>
            </li>
          </ul>
          <p v-else>{{ t('policies.empty') }}</p>
        </section>
      </div>
    </section>
    <div v-if="current && !editing" class="console-toolbar">
      <VBtn type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</VBtn>
    </div>
    <PolicyDialog
      v-model:open="editing"
      placement="right"
      :title="t(current ? 'console.edit' : 'console.create')"
      :close-label="t('console.close')"
      ><p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
      <form class="scope-form" @submit.prevent="save">
        <PolicyFieldset :disabled="busy || uncertain">
          <MdmDisclosure class="task-technical">
            <template #title>{{ t('policies.ux.technical') }}</template>
            <label for="scope-id">{{ t('policies.id') }}</label
            ><VTextField
              id="scope-id"
              v-model="id"
              required
              :readonly="!!current"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            /><VBtn type="button" @click="open()">
              {{ t('policies.open') }}
            </VBtn>
          </MdmDisclosure>
          <section class="task-scope-role">
            <h3>{{ t('policies.targets') }}</h3>
            <p>{{ t('policies.ux.scopeTargets') }}</p>
            <ReferenceEditor v-model="targets" :label="t('policies.targets')" />
          </section>
          <section class="task-scope-role">
            <h3>{{ t('policies.limitations') }}</h3>
            <p>{{ t('policies.ux.scopeLimitations') }}</p>
            <label
              ><VCheckbox v-model="unlimited" hide-details="auto" />{{
                t('policies.unlimited')
              }}</label
            >
            <p>{{ t('policies.emptyLimit') }}</p>
            <ReferenceEditor
              v-if="!unlimited"
              v-model="limitations"
              :label="t('policies.limitations')"
            />
          </section>
          <section class="task-scope-role">
            <h3>{{ t('policies.exclusions') }}</h3>
            <p>{{ t('policies.ux.scopeExclusions') }}</p>
            <ReferenceEditor v-model="exclusions" :label="t('policies.exclusions')" />
          </section>
          <VBtn type="submit">{{ t('policies.save') }}</VBtn
          ><VBtn v-if="current" type="button" @click="change({ action: 'delete' })">
            {{ t('policies.remove') }}
          </VBtn>
        </PolicyFieldset>
      </form>
      <section v-if="compared" data-testid="scope-comparison" class="console-panel">
        <h3>{{ t('devices.compare') }}</h3>
        <dl v-if="comparison">
          <dt>{{ t('policies.revision') }}</dt>
          <dd>{{ comparison.revision }}</dd>
          <template v-for="role in referenceRoles" :key="role">
            <dt>{{ t(`policies.${role}`) }}</dt>
            <dd>
              {{
                comparison.definition[role] === null
                  ? t('policies.unlimited')
                  : comparison.definition[role]!.map(
                      (r) => `${t(`policies.${r.kind}`)}: ${r.id}`,
                    ).join(', ') || '—'
              }}
            </dd>
          </template>
        </dl>
        <p v-else>{{ t('devices.notFound') }}</p>
      </section>
      <VBtn v-if="uncertain || failure === 'conflict'" :disabled="busy" @click="compare">{{
        t('devices.compare')
      }}</VBtn>
      <VBtn v-if="uncertain && pending" :disabled="busy || !compared" @click="pending()">{{
        t('policies.replay')
      }}</VBtn>
    </PolicyDialog>
    <VBtn v-if="uncertain || failure === 'conflict'" :disabled="busy" @click="compare">{{
      t('devices.compare')
    }}</VBtn>
    <VBtn
      v-if="uncertain && pending"
      :disabled="busy || !compared"
      type="button"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </VBtn>
    <section v-if="task" class="console-panel scope-results">
      <h2>{{ t('console.result') }}</h2>
      <p>{{ task }} · {{ status ? t(`policies.state.${status.status}`) : '—' }}</p>
      <VBtn :disabled="!!busy" type="submit" @click="refresh">{{ t('policies.refresh') }}</VBtn
      ><template v-if="status?.status === 'completed'"
        ><p>{{ t('policies.frozen') }}</p>
        <label
          >{{ t('policies.channel')
          }}<VSelect
            v-model="channel"
            :items="[
              { title: 'MDM', value: 'mdm' },
              { title: 'Agent', value: 'agent' },
            ]"
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><PolicyTabs
          v-model="projection"
          :label="t('policies.detail')"
          :items="[
            { value: 'members', label: t('policies.members') },
            { value: 'decisions', label: t('policies.decisions') },
          ]"
        /><VBtn :disabled="!!busy" type="submit" @click="page()">{{ t('policies.open') }}</VBtn>
        <template v-if="result"
          ><p>
            {{ result.channel }} ·
            {{ t(result.current ? 'policies.savedResult' : 'policies.historicalResult') }}
          </p>
          <ul v-if="result.page.kind === 'members'">
            <li v-for="object in result.page.items" :key="objectKey(object)">
              <ObjectLink :object="object" />
            </li>
          </ul>
          <div v-else class="device-table-scroll">
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>{{ t('policies.device') }}</th>
                  <th>{{ t('policies.identity') }}</th>
                  <th>{{ t('policies.reason') }}</th>
                  <th>{{ t('policies.source') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in result.page.items" :key="objectKey(item.object)">
                  <td><ObjectLink :object="item.object" /></td>
                  <td>{{ t(`policies.preview_${item.qualification.state}`) }}</td>
                  <td>
                    {{ item.reasons.map((reason) => t(`policies.state.${reason}`)).join(', ') }}
                  </td>
                  <td>
                    {{
                      [
                        ...(item.targets ?? []),
                        ...(item.limitations ?? []),
                        ...(item.exclusions ?? []),
                      ]
                        .map(
                          (source) =>
                            `${source.reference.kind}:${source.reference.id} / ${source.version}`,
                        )
                        .join(', ')
                    }}
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </template>
        <VBtn
          v-if="result?.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="page(result.nextCursor)"
        >
          {{ t('policies.next') }}
        </VBtn></template
      >
    </section>
  </PolicyDialog>
</template>
