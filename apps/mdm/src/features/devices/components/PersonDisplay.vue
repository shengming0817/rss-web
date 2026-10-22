<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { sourceKey } from '../../settings/clients/profiles'
import type { PersonDisplay } from '../clients/endpoint-model'
defineProps<{ display: PersonDisplay | null }>()
const { t } = useI18n()
</script>
<template>
  <span class="person-display">
    <span v-if="display?.login">{{ t('devices.personLogin') }}: {{ display.login }}</span>
    <span v-for="profile in display?.profiles ?? []" :key="sourceKey(profile.source)">
      {{
        profile.source.kind === 'identity_local'
          ? t('devices.personLocal')
          : t('devices.personIdp') + ' ' + profile.source.provider
      }}:
      <template v-if="profile.status === 'available'">
        {{ profile.displayName ?? t('devices.personNameMissing') }}
        <span v-if="profile.username">
          · {{ t('devices.personUsername') }}: {{ profile.username }}</span
        >
      </template>
      <template v-else>{{ t('devices.personStatus.' + profile.status) }}</template>
    </span>
    <span v-if="!display || (!display.login && !display.profiles.length)">{{
      t('devices.personNotProvided')
    }}</span>
  </span>
</template>
<style scoped>
.person-display {
  display: inline-flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow-wrap: anywhere;
}
</style>
