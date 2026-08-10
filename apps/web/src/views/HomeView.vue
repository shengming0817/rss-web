<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VerifiedProfilePanel from '../features/identity/VerifiedProfilePanel.vue'
import { useIdentitySession } from '../features/identity/session-context'
import HomeRuntimeSummary from '../features/runtime/HomeRuntimeSummary.vue'
import HomeAuditEntries from '../features/audit/HomeAuditEntries.vue'

const { t } = useI18n()
const { state } = useIdentitySession()
const profile = computed(() =>
  state.value.status === 'authenticated' || state.value.status === 'refreshing'
    ? state.value.profile
    : undefined,
)
</script>

<template>
  <section class="home" aria-labelledby="home-title">
    <h1 id="home-title" class="v1-h1">{{ t('home.title') }}</h1>
    <p class="v1-sub">{{ t('home.subtitle') }}</p>
    <VerifiedProfilePanel v-if="profile" :profile="profile" />
    <div class="home-grid">
      <HomeRuntimeSummary />
      <HomeAuditEntries />
    </div>
  </section>
</template>

<style scoped>
.home {
  max-width: 1100px;
  padding: 32px;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin-top: 24px;
}

:deep(.home-panel) {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

:deep(.home-panel__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

:deep(code) {
  overflow-wrap: anywhere;
}

:deep(.facts > div),
:deep(.audit-list li) {
  display: grid;
  gap: 4px;
  margin: 12px 0;
}
</style>
