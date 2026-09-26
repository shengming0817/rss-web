<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
defineProps<{ title: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n(),
  runtime = useMdm()
const links = [
  ['devices', 'directory'],
  ['device-search', 'search'],
  ['device-groups', 'groups'],
  ['device-enroll', 'enroll'],
] as const
</script>
<template>
  <section :aria-busy="busy" class="device-console">
    <nav :aria-label="t('devices.navigation')" class="device-actions">
      <RouterLink
        v-for="[name, label] in links"
        :key="name"
        :to="{ name, params: { tenant: runtime.tenant } }"
        >{{ t(`devices.${label}`) }}</RouterLink
      >
    </nav>
    <h1>{{ title }}</h1>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }} · {{ t('devices.noEffect') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <slot />
  </section>
</template>
