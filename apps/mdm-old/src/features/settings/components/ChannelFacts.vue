<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { VAlert, VChip, VTable } from 'vuetify/components'
import type { runtimeSnapshot } from '../clients/runtime'
defineProps<{ channels: ReturnType<typeof runtimeSnapshot>['channels'] }>()
const { t } = useI18n()
</script>
<template>
  <section class="console-panel" data-testid="channel-facts">
    <h2>{{ t('operations.diagnosticUi.channels') }}</h2>
    <p>{{ t('operations.diagnosticUi.channelHint') }}</p>
    <VAlert v-if="!channels.length" type="info" variant="tonal">{{
      t('operations.diagnosticUi.notObserved')
    }}</VAlert>
    <article v-for="channel in channels" :key="channel.name" class="console-panel">
      <h3>{{ t(`operations.diagnosticUi.channelName.${channel.name}`) }}</h3>
      <VTable density="compact"
        ><tbody>
          <tr>
            <th scope="row">{{ t('settings.state') }}</th>
            <td>
              <VChip>{{ t(`operations.diagnosticUi.state.${channel.state}`) }}</VChip>
            </td>
          </tr>
          <tr>
            <th scope="row">{{ t('operations.diagnosticUi.mounted') }}</th>
            <td>{{ t(channel.mounted ? 'devices.yes' : 'devices.no') }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t('operations.diagnosticUi.loaded') }}</th>
            <td>
              <span v-for="(revision, key) in channel.loadedMaterials" :key="key"
                >{{ key }} · {{ revision }}
              </span>
              <span v-if="!Object.keys(channel.loadedMaterials).length">{{
                t('operations.diagnosticUi.notObserved')
              }}</span>
            </td>
          </tr>
        </tbody></VTable
      >
      <ul v-if="channel.reasons.length">
        <li v-for="reason in channel.reasons" :key="reason">
          {{ t(`operations.diagnosticUi.reason.${reason}`) }}
        </li>
      </ul>
    </article>
  </section>
</template>
