<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiMessage, UiSpinner } from '@rss/core/components'
import { useMdm } from '../context'
defineProps<{ title: string; description?: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n(),
  runtime = useMdm()
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
    <UiMessage v-if="runtime.demo" tone="info" :title="t('mdm.mock')" class="console-demo-note">{{
      t('devices.noEffect')
    }}</UiMessage>
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
