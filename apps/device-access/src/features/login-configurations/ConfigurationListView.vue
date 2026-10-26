<script setup lang="ts">
import { ref } from 'vue'
import type { Configuration } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { label } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
import ConfigurationEditor from './ConfigurationEditor.vue'
const r = useDa(),
  cursor = ref<string | null>(null),
  editing = ref<Configuration | null>(null),
  open = ref(false)
const { data, busy, error, reload } = useRead(
  (signal) => r.client.configurations(cursor.value, signal),
  () => cursor.value,
)
function edit(value: Configuration | null) {
  editing.value = value
  open.value = true
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">LOGIN CONFIGURATION</p>
      <h1>{{ $t('da.mbb8954cdf2') }}</h1>
      <p class="muted">{{ $t('da.mce90a32897') }}</p>
    </div>
    <v-btn
      color="primary"
      :disabled="!r.client.capabilities.configuration.available"
      @click="edit(null)"
      >{{ $t('da.mae2987c647') }}</v-btn
    >
  </div>
  <ReadState :busy="busy" :error="error" @retry="reload" />
  <section v-if="data" class="panel">
    <v-table
      ><thead>
        <tr>
          <th>{{ $t('da.md7d7ce790b') }}</th>
          <th>{{ $t('da.me4b9d69486') }}</th>
          <th>{{ $t('da.m3fbc354a7e') }}</th>
          <th>{{ $t('da.m62e951a692') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in data.items" :key="c.id">
          <td>{{ c.name }}</td>
          <td>{{ label(c.platform) }}</td>
          <td>{{ c.scope.label }}</td>
          <td>{{ label(c.state) }}</td>
          <td>
            <v-btn variant="text" size="small" @click="edit(c)">{{ $t('da.mfa96692279') }}</v-btn>
          </td>
        </tr>
      </tbody></v-table
    >
    <p v-if="!data.items.length" class="empty">{{ $t('da.mcf5eeaeb69') }}</p>
    <v-btn v-if="data.nextCursor" variant="text" @click="cursor = data!.nextCursor">{{
      $t('da.m67a246a344')
    }}</v-btn>
  </section>
  <section class="panel explanatory mt-6">
    <h2>{{ $t('da.m5cd9d453a6') }}</h2>
    <p>{{ $t('da.m2387a4321b') }}</p>
    <p>{{ $t('da.m1f98a61dd4') }}</p>
  </section>
  <ConfigurationEditor v-if="open" :existing="editing" @close="open = false" @saved="reload" />
</template>
