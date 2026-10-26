<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import MdmPage from '../../../ui/MdmPage.vue'
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <MdmPage :title="t('policies.scripts')">
    <p>{{ t('policies.scriptAssignment') }}</p>
    <ol class="console-journey">
      <li
        v-for="(step, index) in [
          { route: 'policy-resources', key: 'resources' },
          { route: 'policy-policies', key: 'policies' },
        ]"
        :key="step.route"
        class="console-panel"
      >
        <span class="console-step-number">{{ index + 1 }}</span>
        <h2>{{ t(`policies.${step.key}`) }}</h2>
        <RouterLink :to="{ name: step.route, params: { tenant: runtime.tenant } }"
          >{{ t('console.openSource') }} →</RouterLink
        >
      </li>
    </ol>
  </MdmPage>
</template>
