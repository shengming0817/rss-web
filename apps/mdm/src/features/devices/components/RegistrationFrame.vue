<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
defineProps<{ title: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <section class="device-console" :aria-busy="busy">
    <h1>{{ title }}</h1>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <slot />
  </section>
</template>
