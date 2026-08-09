<script setup lang="ts">
/**
 * AccessComingSoonView — generic placeholder for Wave-2+ access features.
 *
 * Props:
 *   titleKey — i18n key used as the page heading (passed by the router via
 *              static props: { titleKey: 'nav.decisions' }).
 *
 * Tokens-only styles; matches the title style used in IdentitiesView/PoliciesView.
 */
import { useI18n } from 'vue-i18n'

defineProps<{
  titleKey: string
}>()

const { t } = useI18n()
</script>

<template>
  <section class="coming-soon">
    <h1 class="coming-soon__title">{{ t(titleKey) }}</h1>
    <span class="coming-soon__badge" role="note">{{ t('access.comingSoon.badge') }}</span>
    <p class="coming-soon__body">{{ t('access.comingSoon.body') }}</p>
  </section>
</template>

<style scoped>
.coming-soon {
  max-width: 1080px;
  padding: 28px 32px;
}

.coming-soon__title {
  margin: 0 0 12px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.coming-soon__badge {
  display: inline-block;
  margin-bottom: 16px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.coming-soon__body {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}
</style>
