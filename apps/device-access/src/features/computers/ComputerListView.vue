<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { useDirectory } from '../../services/directory'
import { computerColumns } from '@rss/device-access/client'
import { QueryRows } from '@rss/core'
import DirectoryControls from '../../ui/DirectoryControls.vue'
import { readListLocation, listLocation } from './list-location'
import { utc, label } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
import Icon from '../../ui/Icon.vue'
import ComputerWorkspace from './ComputerWorkspace.vue'
const r = useDa(),
  router = useRouter(),
  route = useRoute(),
  initial = readListLocation(route.query),
  quick = ref<string | null>(null)
const directory = useDirectory(
  computerColumns,
  100,
  (query, signal) => r.client.computers(query, signal),
  () => route.path,
  initial,
)
const { data, busy, error, reload } = directory
const rows = computed(() => data.value?.summaries ?? [])
const selectedReference = ref<{ kind: 'endpoint' | 'association'; id: string }>()
const view = useRead(
  (signal) => r.client.viewComputers(selectedReference.value!, signal),
  () => JSON.stringify(selectedReference.value),
  { enabled: () => !!selectedReference.value },
)
function inspect(row: Record<string, unknown>) {
  const reference = row.reference as { kind: 'endpoint' | 'association'; id: string }
  if (JSON.stringify(selectedReference.value) === JSON.stringify(reference)) void view.reload()
  else selectedReference.value = reference
}
let persisted = route.fullPath,
  persisting = false
watch(directory.data, (page) => {
  if (page && directory.applied.value) {
    persisting = true
    void router
      .replace({ query: listQuery() })
      .then(() => {
        persisted = route.fullPath
      })
      .finally(() => {
        persisting = false
      })
  }
})
watch(
  () => route.fullPath,
  () => {
    const location = listQuery()
    if (
      !persisting &&
      route.fullPath !== persisted &&
      JSON.stringify(route.query) !== JSON.stringify(location)
    )
      void directory.restore(readListLocation(route.query))
  },
)

function open(id: string, tab = 'status') {
  void router.push({
    name: 'computer',
    params: { deviceId: id, tab },
    query: listQuery(),
  })
}
function listQuery() {
  return listLocation(
    { ...directory.applied.value, cursor: directory.cursor.value },
    directory.trail.value,
  )
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">COMPUTERS</p>
      <h1>{{ $t('da.m2273cdb3af') }}</h1>
      <p class="muted">{{ $t('da.md6c7a253ab') }}</p>
    </div>
    <v-btn variant="outlined" :loading="busy" @click="reload">{{ $t('da.m7784972fc8') }}</v-btn>
  </div>
  <ReadState :busy="busy" :error="error" @retry="reload" />
  <section class="panel">
    <DirectoryControls
      :query="directory"
      :busy="busy"
      hint="筛选 key、status、assetState、channel、source、platform、search；按 key 排序。"
    />
    <QueryRows
      v-if="data && !data.summaries"
      :items="data.items"
      :fields="directory.applied.value?.fields ?? computerColumns"
      :required="['reference']"
      @open="inspect"
    />
    <ReadState :busy="view.busy.value" :error="view.error.value" @retry="view.reload" />
    <v-btn v-for="c in view.data.value ?? []" :key="c.id" @click="open(c.id)">{{ c.name }}</v-btn>
    <v-table
      ><thead>
        <tr>
          <th>{{ $t('da.m2273cdb3af') }}</th>
          <th>{{ $t('da.me4b9d69486') }}</th>
          <th>{{ $t('da.m9d56f448e2') }}</th>
          <th>{{ $t('da.m4867434416') }}</th>
          <th>{{ $t('da.mf3ea6d345e') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in rows" :key="c.id">
          <td>
            <button class="name-button" @click="open(c.id)">
              <span class="device-icon"><Icon name="devices" /></span><strong>{{ c.name }}</strong>
            </button>
          </td>
          <td>{{ label(c.platform) }}</td>
          <td>
            <v-chip>{{ label(c.status) }}</v-chip>
          </td>
          <td>{{ utc(c.lastObservedAt) }}</td>
          <td>
            <v-btn variant="text" size="small" @click="open(c.id)">{{ $t('da.m1a8a2d9e4c') }}</v-btn
            ><v-btn variant="text" size="small" @click="quick = c.id">{{
              $t('da.m9e61629d23')
            }}</v-btn>
          </td>
        </tr>
      </tbody></v-table
    >
    <div v-if="!busy && !error && !rows.length" class="empty">
      <h3>{{ $t('da.mce4f267739') }}</h3>
      <p>{{ $t('da.m13d5ec0dbb') }}</p>
    </div>
    <div class="table-footer">
      <span>当前页 {{ rows.length }} 条，不代表组织总量</span>
    </div>
  </section>
  <v-navigation-drawer
    :model-value="!!quick"
    temporary
    location="right"
    width="720"
    @update:model-value="
      (v) => {
        if (!v) quick = null
      }
    "
    ><ComputerWorkspace
      v-if="quick"
      :device-id="quick"
      compact
      @expand="(tab) => open(quick!, tab)"
    /><v-btn block variant="text" @click="quick = null">{{
      $t('da.mc1fe6f7cae')
    }}</v-btn></v-navigation-drawer
  >
</template>
