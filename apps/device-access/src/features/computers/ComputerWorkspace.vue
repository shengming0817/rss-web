<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { utc, label } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
import Icon from '../../ui/Icon.vue'
import AccessStatusPanel from './panels/AccessStatusPanel.vue'
import AssetAssignmentPanel from './panels/AssetAssignmentPanel.vue'
import AccountBindingsPanel from './panels/AccountBindingsPanel.vue'
import PasskeyRecordsPanel from './panels/PasskeyRecordsPanel.vue'
import RecoveryPanel from './panels/RecoveryPanel.vue'
import DiagnosticsPanel from './panels/DiagnosticsPanel.vue'
const props = defineProps<{ deviceId: string; compact?: boolean }>()
defineEmits<{ expand: [string] }>()
const r = useDa(),
  route = useRoute(),
  router = useRouter(),
  previewTab = ref('status')
const tabs = [
  { value: 'status', label: '访问状态' },
  { value: 'assets', label: '资产归属' },
  { value: 'accounts', label: '账号与绑定' },
  { value: 'passkeys', label: 'Passkey' },
  { value: 'recovery', label: '恢复与轮换' },
  { value: 'diagnostics', label: '诊断与修复' },
]
const active = computed({
  get: () =>
    props.compact
      ? previewTab.value
      : tabs.some((t) => t.value === route.params['tab'])
        ? String(route.params['tab'])
        : 'status',
  set: (tab: string) => {
    if (props.compact) previewTab.value = tab
    else
      void router.replace({
        name: 'computer',
        params: { deviceId: props.deviceId, tab },
        query: route.query,
      })
  },
})
watch(
  () => props.deviceId,
  () => {
    previewTab.value = 'status'
  },
)
const {
  data: computer,
  busy,
  error,
  reload,
} = useRead(
  (signal) => r.client.computer(props.deviceId, signal),
  () => props.deviceId,
)
</script>
<template>
  <section :class="['computer-workspace', { compact }]">
    <ReadState :busy="busy" :error="error" @retry="reload" /><template v-if="computer"
      ><div v-if="!compact" class="computer-page-header">
        <v-btn
          variant="text"
          size="small"
          @click="router.push({ name: 'computers', query: route.query })"
          ><Icon name="back" />{{ $t('da.mef1528cf2c') }}</v-btn
        >
        <div class="computer-identity">
          <span class="computer-glyph"><Icon name="devices" /></span>
          <div>
            <p class="eyebrow">COMPUTER / {{ label(computer.platform) }}</p>
            <h1>{{ computer.name }}</h1>
            <p class="muted">最近设备观察：{{ utc(computer.lastObservedAt) }}</p>
          </div>
          <v-chip>{{ label(computer.status) }}</v-chip>
        </div>
      </div>
      <div v-else class="drawer-header">
        <h2>{{ computer.name }}</h2>
        <v-btn variant="outlined" size="small" @click="$emit('expand', active)">{{
          $t('da.mbd0f5f4859')
        }}</v-btn>
      </div>
      <section class="panel">
        <v-tabs v-model="active" color="primary"
          ><v-tab v-for="t in tabs" :key="t.value" :value="t.value">{{ t.label }}</v-tab></v-tabs
        >
        <div class="computer-content">
          <AccessStatusPanel v-if="active === 'status'" :device="computer" /><AssetAssignmentPanel
            v-else-if="active === 'assets'"
            :device="computer"
          /><AccountBindingsPanel
            v-else-if="active === 'accounts'"
            :device="computer"
          /><PasskeyRecordsPanel
            v-else-if="active === 'passkeys'"
            :device="computer"
          /><RecoveryPanel v-else-if="active === 'recovery'" :device="computer" /><DiagnosticsPanel
            v-else
            :device="computer"
          />
        </div></section
    ></template>
  </section>
</template>
