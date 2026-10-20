<script setup lang="ts">
import { UiButton, UiDialog, UiTable, UiBadge } from '@rss/core/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Reference, ScopeRead, ScopeProjection, ScopeChange } from '../clients/scopes'
import { objectKey, type Channel } from '../../devices/clients/objects'
import ObjectLink from '../../devices/components/ObjectLink.vue'
import PageFrame from '../../../components/PageFrame.vue'
import ReferenceEditor from '../components/ReferenceEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.scopes,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const editing = ref(false)
const id = ref(''),
  current = ref<ScopeRead>(),
  targets = ref<Reference[]>([]),
  limitations = ref<Reference[]>([]),
  exclusions = ref<Reference[]>([]),
  unlimited = ref(true)
const list = ref<Awaited<ReturnType<typeof runtime.policies.scopes.list>>>(),
  devices = ref<{ id: string; name: string }[]>([]),
  groups = ref<{ id: string; name: string }[]>([])
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  result = ref<Awaited<ReturnType<typeof client.page>>>(),
  projection = ref<ScopeProjection>('members'),
  channel = ref<Channel>('mdm')
let pending: (() => Promise<void>) | undefined
function load(cursor?: string) {
  void run(
    () => runtime.policies.scopes.list(cursor),
    (v) => (list.value = v),
  )
}
function apply(value: ScopeRead) {
  editing.value = false
  current.value = value
  id.value = value.id
  targets.value = value.definition.targets
  limitations.value = value.definition.limitations ?? []
  unlimited.value = value.definition.limitations === null
  exclusions.value = value.definition.exclusions
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
function refresh() {
  if (task.value)
    void run(
      () => client.status(id.value, task.value!),
      (v) => (status.value = v),
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
onMounted(async () => {
  await run(
    async () =>
      Promise.all([
        runtime.policies.scopes.list(),
        runtime.devices.directory.list(),
        runtime.devices.groups.list(),
      ]),
    ([l, d, g]) => {
      list.value = l
      devices.value = d.items.map((d) => ({ id: d.id, name: d.id }))
      groups.value = g.items
    },
  )
  const device = route.query['device'],
    group = route.query['group']
  if (typeof device === 'string' || typeof group === 'string') {
    create()
    targets.value =
      typeof device === 'string'
        ? [{ kind: 'device', id: device }]
        : [{ kind: 'group', id: group as string }]
  }
})
</script>
<template>
  <PageFrame :title="t('policies.scopes')" :busy="busy" :failure="failure">
    <p>{{ t('policies.scopeHint') }}</p>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('policies.create')
    }}</UiButton
    ><UiButton :disabled="!!busy" type="submit" @click="load()">{{
      t('policies.reload')
    }}</UiButton>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <UiTable
      :label="t('policies.scopes')"
      :rows="list?.items ?? []"
      :columns="[
        { key: 'scope', label: t('policies.scopes') },
        { key: 'revision', label: t('policies.revision') },
        { key: 'resolution', label: t('console.result') },
      ]"
      :row-key="(s) => s.id"
      :busy-label="t('devices.loading')"
      :empty-label="t('policies.empty')"
      ><template #cell-scope="{ row }"
        ><UiButton variant="ghost" :disabled="busy || uncertain" @click="open(row.id)"
          >{{ t('policies.scopes') }} · {{ row.id.slice(0, 8) }}</UiButton
        ></template
      ><template #cell-resolution="{ row }"
        ><UiBadge>{{
          t(row.resolution ? 'devices.completed' : 'devices.pending')
        }}</UiBadge></template
      ></UiTable
    >
    <UiButton
      v-if="list?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(list.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <section v-if="current && !editing" class="console-panel">
      <h2>{{ t('console.summary') }}</h2>
      <p>{{ current.id }} · {{ t('policies.revision') }} {{ current.revision }}</p>
      <fieldset disabled>
        <ReferenceEditor
          :model-value="current.definition.targets"
          :label="t('policies.targets')"
          :devices="devices"
          :groups="groups"
        />
        <p v-if="current.definition.limitations === null">{{ t('policies.unlimited') }}</p>
        <ReferenceEditor
          v-else
          :model-value="current.definition.limitations"
          :label="t('policies.limitations')"
          :devices="devices"
          :groups="groups"
        /><ReferenceEditor
          :model-value="current.definition.exclusions"
          :label="t('policies.exclusions')"
          :devices="devices"
          :groups="groups"
        />
      </fieldset>
    </section>
    <div v-if="current && !editing" class="console-toolbar">
      <UiButton type="button" :disabled="busy || uncertain" @click="editing = true">{{
        t('console.edit')
      }}</UiButton>
    </div>
    <UiDialog
      v-model:open="editing"
      placement="right"
      :title="t(current ? 'console.edit' : 'console.create')"
      :close-label="t('console.close')"
      ><form class="scope-form" @submit.prevent="save">
        <div class="console-page-header">
          <h2>{{ t(current ? 'console.edit' : 'console.create') }}</h2>
          <UiButton
            type="button"
            variant="ghost"
            :disabled="busy || uncertain"
            @click="editing = false"
            >{{ t('console.close') }}</UiButton
          >
        </div>
        <fieldset :disabled="busy || uncertain">
          <label for="scope-id">{{ t('policies.id') }}</label
          ><input
            id="scope-id"
            v-model="id"
            class="ui-input"
            required
            :readonly="!!current"
          /><UiButton type="button" @click="open()">
            {{ t('policies.open') }}
          </UiButton>
          <ReferenceEditor
            v-model="targets"
            :label="t('policies.targets')"
            :devices="devices"
            :groups="groups"
          />
          <label><input v-model="unlimited" type="checkbox" />{{ t('policies.unlimited') }}</label>
          <p>{{ t('policies.emptyLimit') }}</p>
          <ReferenceEditor
            v-if="!unlimited"
            v-model="limitations"
            :label="t('policies.limitations')"
            :devices="devices"
            :groups="groups"
          />
          <ReferenceEditor
            v-model="exclusions"
            :label="t('policies.exclusions')"
            :devices="devices"
            :groups="groups"
          /><UiButton type="submit">{{ t('policies.save') }}</UiButton
          ><UiButton v-if="current" type="button" @click="change({ action: 'delete' })">
            {{ t('policies.remove') }}
          </UiButton>
        </fieldset>
      </form>
    </UiDialog>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending()">
      {{ t('policies.replay') }}
    </UiButton>
    <section v-if="task" class="console-panel scope-results">
      <h2>{{ t('console.result') }}</h2>
      <p>{{ task }} · {{ status ? t(`policies.state.${status.status}`) : '—' }}</p>
      <UiButton :disabled="!!busy" type="submit" @click="refresh">{{
        t('policies.refresh')
      }}</UiButton
      ><template v-if="status?.status === 'completed'"
        ><p>{{ t('policies.frozen') }}</p>
        <label
          >{{ t('policies.channel')
          }}<select v-model="channel" class="ui-input">
            <option value="mdm">MDM</option>
            <option value="agent">Agent</option>
          </select></label
        ><label for="scope-projection">{{ t('policies.detail') }}</label
        ><select id="scope-projection" v-model="projection" class="ui-input">
          <option value="members">{{ t('policies.members') }}</option>
          <option value="decisions">{{ t('policies.decisions') }}</option></select
        ><UiButton :disabled="!!busy" type="submit" @click="page()">{{
          t('policies.open')
        }}</UiButton>
        <template v-if="result"
          ><p>{{ result.channel }}</p>
          <ul v-if="result.page.kind === 'members'">
            <li v-for="object in result.page.items" :key="objectKey(object)">
              <ObjectLink :object="object" />
            </li>
          </ul>
          <div v-else class="ui-table-scroll">
            <table class="ui-table">
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
            </table>
          </div>
        </template>
        <UiButton
          v-if="result?.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="page(result.nextCursor)"
        >
          {{ t('policies.next') }}
        </UiButton></template
      >
    </section>
  </PageFrame>
</template>
