<script setup lang="ts">
import ChannelPanel from './ChannelPanel.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import ApplePanel from './ApplePanel.vue'
import ProviderPanel from './ProviderPanel.vue'
import TaskTrustPanel from './TaskTrustPanel.vue'
import WebhookPanel from './WebhookPanel.vue'
import PackagesPanel from './PackagesPanel.vue'
import PkiPanel from './PkiPanel.vue'

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
      v-else-if="material === 'webhook'" /><PkiPanel v-else-if="material === 'pki'" /><PackagesPanel
      v-else-if="material === 'packages'" /><UiMessage
      v-else
      tone="warning"
      :title="t('settings.notSupported')" /></template
  ><UiMessage v-else tone="warning" :title="t('settings.scopeHint')" />
  <ChannelPanel v-if="runtime.realm === 'tenant'" />
</template>
