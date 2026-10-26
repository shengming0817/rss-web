<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { readListLocation, listLocation } from './list-location'
import { utc, label } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
import Icon from '../../ui/Icon.vue'
import ComputerWorkspace from './ComputerWorkspace.vue'
const r = useDa(),
  router = useRouter(),
  route = useRoute(),
  initial = readListLocation(route.query),
  cursor = ref<string | null>(initial.cursor),
  search = ref(initial.search),
  platform = ref(initial.platform),
  quick = ref<string | null>(null)
const { data, busy, error, reload } = useRead(
  (signal) => r.client.computers(cursor.value, signal),
  () => cursor.value,
)
const rows = computed(
  () =>
    data.value?.items.filter(
      (c) =>
        (platform.value === 'all' || c.platform === platform.value) &&
        c.name.toLowerCase().includes(search.value.toLowerCase()),
    ) ?? [],
)
watch([cursor, platform], persist)
function open(id: string, tab = 'status') {
  void router.push({
    name: 'computer',
    params: { deviceId: id, tab },
    query: listQuery(),
  })
}
function listQuery() {
  return listLocation(search.value, platform.value, cursor.value)
}
function persist() {
  void router.replace({ query: listQuery() })
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
    <div class="filters">
      <v-text-field
        v-model="search"
        :label="$t('da.m558cf8be1a')"
        @update:model-value="persist"
      /><v-select
        v-model="platform"
        :items="[
          { title: '全部平台', value: 'all' },
          { title: 'Windows', value: 'windows' },
          { title: 'macOS', value: 'macos' },
        ]"
        :label="$t('da.m21d108bac0')"
      />
    </div>
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
      <div>
        <v-btn v-if="cursor" variant="text" size="small" @click="cursor = null">{{
          $t('da.m851d093dde')
        }}</v-btn
        ><v-btn
          v-if="data?.nextCursor"
          variant="text"
          size="small"
          @click="cursor = data!.nextCursor"
          >{{ $t('da.m67a246a344') }}</v-btn
        >
      </div>
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
