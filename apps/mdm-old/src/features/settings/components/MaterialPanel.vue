<script setup lang="ts">
import { VAlert, VBtn } from 'vuetify/components'
import ChannelPanel from './ChannelPanel.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import ApplePanel from './ApplePanel.vue'
import ProviderPanel from './ProviderPanel.vue'
import TaskTrustPanel from './TaskTrustPanel.vue'
import WebhookPanel from './WebhookPanel.vue'
import PackagesPanel from './PackagesPanel.vue'

const props = defineProps<{ material: string }>()
const runtime = useMdm(),
  { t } = useI18n()
const apple = computed(() =>
  props.material === 'apns' || props.material === 'profile' || props.material === 'managed_account'
    ? props.material
    : null,
)
const provider = computed(() =>
  props.material === 'storage' || props.material === 'smtp' || props.material === 'wns'
    ? props.material
    : null,
)
</script>
<template>
  <template v-if="runtime.realm === 'tenant'"
    ><ApplePanel v-if="apple" :purpose="apple" /><ProviderPanel
      v-else-if="provider"
      :kind="provider" /><TaskTrustPanel v-else-if="material === 'task'" /><WebhookPanel
      v-else-if="material === 'webhook'" /><VBtn
      v-else-if="material === 'pki'"
      :to="{ name: 'security-device-trust', params: { tenant: runtime.tenant } }"
      variant="text"
      >{{ t('security.pki.title') }}</VBtn
    ><PackagesPanel v-else-if="material === 'packages'" /><VAlert
      v-else
      type="warning"
      :title="t('settings.notSupported')"
      variant="tonal" /></template
  ><VAlert v-else type="warning" :title="t('settings.scopeHint')" variant="tonal" /><ChannelPanel
    v-if="runtime.realm === 'tenant'"
  />
</template>
