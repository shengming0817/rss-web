<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Computer, PasskeyRecord } from '@rss/device-access/model'
import { EnterprisePasskeySummary } from '@rss/device-access/components'
import { useDa } from '../../../context'
import { useRead } from '../../../services/read'
import { utc, label } from '../../../services/status'
import ReadState from '../../../ui/ReadState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa(),
  cursor = ref<string | null>(null),
  search = ref(''),
  selected = ref<PasskeyRecord | null>(null)
const { data, busy, error, reload } = useRead(
  (signal) => r.client.passkeys(props.device.id, cursor.value, signal),
  () => props.device.id + ':' + (cursor.value ?? ''),
)
watch(
  () => props.device.id,
  () => {
    cursor.value = null
    search.value = ''
    selected.value = null
  },
  { flush: 'sync' },
)
watch(
  data,
  () => {
    selected.value = null
  },
  { flush: 'sync' },
)
const rows = computed(
  () =>
    data.value?.items.filter((p) =>
      `${p.rp} ${p.account} ${p.label}`.toLowerCase().includes(search.value.toLowerCase()),
    ) ?? [],
)
</script>
<template>
  <div class="asset-editor-heading">
    <h2>{{ $t('da.mdbc2253cb4') }}</h2>
    <v-chip v-if="r.client.capabilities.passkeys.source === 'demo'">{{
      $t('da.me5949176c3')
    }}</v-chip>
  </div>
  <p class="small muted mb-5">{{ device.name }} · 每条凭据一条记录，展示其在本机的状态。</p>
  <ReadState :busy="busy" :error="error" @retry="reload" /><template v-if="data"
    ><v-text-field
      v-model="search"
      :label="$t('da.m4feba57833')"
      class="mb-5"
    /><EnterprisePasskeySummary
      :device-id="device.id"
      :records="rows"
      @detail="selected = $event"
    />
    <p v-if="!rows.length" class="empty">{{ $t('da.m94a5054b9a') }}</p>
    <div class="table-footer">
      <span>本页 {{ rows.length }} 条</span
      ><v-btn
        v-if="data.nextCursor"
        variant="text"
        size="small"
        @click="cursor = data!.nextCursor"
        >{{ $t('da.m67a246a344') }}</v-btn
      >
    </div></template
  >
  <p class="small muted mt-5">{{ $t('da.m9866c344ef') }}</p>
  <v-dialog
    :model-value="!!selected"
    max-width="620"
    @update:model-value="
      (v) => {
        if (!v) selected = null
      }
    "
    ><v-card v-if="selected"
      ><v-card-title>{{ selected.label }}</v-card-title
      ><v-card-text
        ><dl class="detail-list">
          <div>
            <dt>{{ $t('da.m2273cdb3af') }}</dt>
            <dd>{{ device.name }}</dd>
          </div>
          <div>
            <dt>{{ $t('da.m98ee760e5f') }}</dt>
            <dd>{{ selected.rp }} / {{ selected.account }}</dd>
          </div>
          <div>
            <dt>{{ $t('da.m68fd81ffa4') }}</dt>
            <dd>{{ selected.id }}</dd>
          </div>
          <div>
            <dt>{{ $t('da.m0d09a4e1dc') }}</dt>
            <dd>{{ label(selected.state) }}</dd>
          </div>
          <div>
            <dt>{{ $t('da.mfff38cb687') }}</dt>
            <dd>{{ utc(selected.lastObservedAt) }}</dd>
          </div>
        </dl></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="selected = null">{{
          $t('da.m6c14bd7f6f')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
