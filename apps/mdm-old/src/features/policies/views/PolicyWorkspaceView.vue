<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VBtn } from 'vuetify/components'
import { useMdm } from '../../../context'
import PoliciesView from './PoliciesView.vue'
import SoftwarePoliciesView from './SoftwarePoliciesView.vue'
import OnboardingPoliciesView from './OnboardingPoliciesView.vue'
import LifecyclePoliciesView from './LifecyclePoliciesView.vue'
const route = useRoute(),
  runtime = useMdm(),
  { t } = useI18n()
const editor = computed(() =>
  route.query['action'] === 'software'
    ? SoftwarePoliciesView
    : ['ensure_agent_installed', 'request_mdm_enrollment'].includes(String(route.query['action']))
      ? OnboardingPoliciesView
      : ['unmanage_device', 'credential'].includes(String(route.query['action']))
        ? LifecyclePoliciesView
        : PoliciesView,
)
</script>
<template>
  <nav class="d-flex flex-wrap ga-2 mb-4" :aria-label="t('policies.policies')">
    <VBtn variant="text" :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
      t('policies.policies')
    }}</VBtn>
    <VBtn
      v-for="item in [
        { name: 'policy-resources', label: 'policies.resources' },
        { name: 'security-rules', label: 'security.rules' },
        { name: 'policy-metrics', label: 'telemetry.metricsSettings' },
        { name: 'policy-tools', label: 'policies.entry.title' },
        { name: 'policy-executions', label: 'policies.executions' },
      ]"
      :key="item.name"
      variant="tonal"
      :to="{ name: item.name, params: { tenant: runtime.tenant } }"
      >{{ t(item.label) }}</VBtn
    >
  </nav>
  <component :is="editor" :key="String(route.query['action'] ?? '')" />
</template>
