<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { runtimeSnapshot } from '../clients/runtime'
defineProps<{ channels: ReturnType<typeof runtimeSnapshot>['channels'] }>()
const { t } = useI18n()
</script>
<template>
  <section class="console-panel" data-testid="channel-facts">
    <h2>{{ t('operations.diagnosticUi.channels') }}</h2>
    <p>{{ t('operations.diagnosticUi.channelHint') }}</p>
    <p v-if="!channels.length">{{ t('operations.diagnosticUi.notObserved') }}</p>
    <article v-for="channel in channels" :key="channel.name" class="console-panel">
      <h3>{{ t(`operations.diagnosticUi.channelName.${channel.name}`) }}</h3>
      <dl class="settings-facts">
        <dt>{{ t('settings.state') }}</dt>
        <dd>{{ t(`operations.diagnosticUi.state.${channel.state}`) }}</dd>
        <dt>{{ t('operations.diagnosticUi.mounted') }}</dt>
        <dd>{{ t(channel.mounted ? 'devices.yes' : 'devices.no') }}</dd>
        <dt>{{ t('operations.diagnosticUi.loaded') }}</dt>
        <dd>
          <span v-for="(revision, key) in channel.loadedMaterials" :key="key"
            >{{ key }} · {{ revision }}
          </span>
          <span v-if="!Object.keys(channel.loadedMaterials).length">{{
            t('operations.diagnosticUi.notObserved')
          }}</span>
        </dd>
      </dl>
      <ul v-if="channel.reasons.length">
        <li v-for="reason in channel.reasons" :key="reason">
          {{ t(`operations.diagnosticUi.reason.${reason}`) }}
        </li>
      </ul>
    </article>
  </section>
</template>
