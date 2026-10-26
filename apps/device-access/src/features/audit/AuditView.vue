<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { utc } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
const r = useDa(),
  route = useRoute(),
  cursor = ref<string | null>(null),
  device = computed(() =>
    typeof route.query['device'] === 'string' ? route.query['device'] : null,
  )
const { data, busy, error, reload } = useRead(
  (signal) => r.client.audit(device.value, cursor.value, signal),
  () => String(device.value) + ':' + (cursor.value ?? ''),
)
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">AUDIT</p>
      <h1>{{ device ? '本机审计活动' : '审计活动' }}</h1>
      <p class="muted">{{ $t('da.mc4086483bc') }}</p>
    </div>
    <v-btn variant="outlined" :loading="busy" @click="reload">{{ $t('da.m7784972fc8') }}</v-btn>
  </div>
  <ReadState :busy="busy" :error="error" @retry="reload" />
  <section v-if="data" class="panel">
    <v-table
      ><thead>
        <tr>
          <th>{{ $t('da.m19106f95d3') }}</th>
          <th>{{ $t('da.m5c41d798e3') }}</th>
          <th>{{ $t('da.md9d9827827') }}</th>
          <th>{{ $t('da.m4ca39faad0') }}</th>
          <th>{{ $t('da.m0a2c91cec6') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in data.items" :key="a.id">
          <td>{{ utc(a.recordedAt) }}</td>
          <td>{{ a.actor }}</td>
          <td>{{ a.action }}</td>
          <td>{{ a.phase }}</td>
          <td>{{ a.outcome }}</td>
        </tr>
      </tbody></v-table
    >
    <p v-if="!data.items.length" class="empty">{{ $t('da.ma7f11979f0') }}</p>
    <v-btn v-if="data.nextCursor" variant="text" @click="cursor = data!.nextCursor">{{
      $t('da.m67a246a344')
    }}</v-btn>
    <p class="panel-footnote">{{ $t('da.m814c67ee1f') }}</p>
  </section>
</template>
