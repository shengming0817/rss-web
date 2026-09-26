<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../useOperation'
import DeviceFrame from '../components/DeviceFrame.vue'
import BatchPanel from '../components/BatchPanel.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation()
const page = ref<Awaited<ReturnType<typeof runtime.devices.directory.list>>>(),
  selected = ref<string[]>([])
function load(next?: string) {
  selected.value = []
  void run(
    () => runtime.devices.directory.list(next),
    (v) => (page.value = v),
  )
}
onMounted(() => load())
</script>
<template>
  <DeviceFrame :title="t('devices.directory')" :busy="busy" :failure="failure">
    <button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button>
    <div v-if="page" class="mdm-grid">
      <article
        v-for="key in ['total', 'pending', 'windows', 'macos', 'withInventory'] as const"
        :key="key"
        class="identity-card"
      >
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ page.statistics[key] }}</strong>
      </article>
    </div>
    <table v-if="page?.items.length">
      <thead>
        <tr>
          <th>{{ t('devices.select') }}</th>
          <th>{{ t('devices.name') }}</th>
          <th>{{ t('devices.platform') }}</th>
          <th>{{ t('devices.status') }}</th>
          <th>{{ t('devices.channels') }}</th>
          <th>{{ t('devices.owner') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="device in page.items" :key="device.id">
          <td>
            <input
              v-model="selected"
              type="checkbox"
              :value="device.id"
              :aria-label="`${t('devices.select')} ${device.name}`"
            />
          </td>
          <td>
            <RouterLink
              :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: device.id } }"
              >{{ device.name }}</RouterLink
            >
          </td>
          <td>{{ t(`devices.${device.platform}`) }}</td>
          <td>{{ t(`devices.${device.status}`) }}</td>
          <td>{{ device.channels.join(' + ') || '—' }}</td>
          <td>{{ device.owner ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="page">{{ t('devices.empty') }}</p>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <BatchPanel :devices="selected" />
  </DeviceFrame>
</template>
