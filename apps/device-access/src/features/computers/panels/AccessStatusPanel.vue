<script setup lang="ts">
import type { Computer } from '@rss/device-access/model'
import { DeviceAccessSummary } from '@rss/device-access/components'
import { useDa } from '../../../context'
import { useRead } from '../../../services/read'
import ReadState from '../../../ui/ReadState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa()
const { data, busy, error, reload } = useRead(
  (signal) => r.client.bindings(props.device.id, null, signal),
  () => props.device.id,
)
</script>
<template>
  <ReadState :busy="busy" :error="error" @retry="reload" /><DeviceAccessSummary
    v-if="data"
    :computer="device"
    :bindings="data.items"
  />
  <p v-if="data?.nextCursor" class="small muted mt-4">{{ $t('da.m63422cdb5c') }}</p>
  <v-btn variant="outlined" class="mt-5" :loading="busy" @click="reload">{{
    $t('da.macb62c6828')
  }}</v-btn>
</template>
