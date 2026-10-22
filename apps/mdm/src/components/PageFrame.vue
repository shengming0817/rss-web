<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiMessage, UiSpinner } from '@rss/core/components'
defineProps<{ title: string; description?: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n()
</script>
<template>
  <section class="console-page" :aria-busy="busy || undefined">
    <header class="console-page-header">
      <div>
        <h1>{{ title }}</h1>
        <p v-if="description" class="console-page-description">{{ description }}</p>
      </div>
      <div class="console-page-actions">
        <UiSpinner v-if="busy" :label="t('devices.loading')" /><slot name="actions" />
      </div>
    </header>
    <UiMessage
      v-if="failure"
      tone="danger"
      :title="
        t(
          failure === 'removeBeforeSwitch'
            ? 'policies.selfService.removeBeforeSwitch'
            : `devices.${failure}`,
        )
      "
      class="console-page-error"
    ></UiMessage>
    <div class="console-page-body"><slot /></div>
  </section>
</template>
