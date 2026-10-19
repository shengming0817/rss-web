<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{
  revision: number
  desiredRevision?: number | null
  versions: readonly {
    revision: number
    state?: string
    operationId?: string
    selected?: boolean
    revoked?: boolean
    expiresAt?: number | null
    failureReason?: string | null
    qualifiedAt?: number | null
    acceptedAt?: number | null
  }[]
}>()
const { t, te } = useI18n()
function status(value: string) {
  return te('settings.status.' + value) ? t('settings.status.' + value) : value
}
function time(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : new Date(value * 1000).toISOString()
}
</script>
<template>
  <div class="settings-version-summary">
    <span
      >{{ t('settings.savedVersion') }} <strong>{{ revision }}</strong></span
    ><span
      >{{ t('settings.requestedVersion') }} <strong>{{ desiredRevision ?? '—' }}</strong></span
    ><span>{{ t('settings.runtimeVersion') }} {{ t('settings.notObserved') }}</span>
  </div>
  <div class="settings-table-wrap">
    <table class="ui-table">
      <thead>
        <tr>
          <th>{{ t('settings.revision') }}</th>
          <th>{{ t('settings.state') }}</th>
          <th>{{ t('settings.operationId') }}</th>
          <th>{{ t('settings.observedAt') }}</th>
          <th>{{ t('settings.expiresAt') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="version in versions" :key="version.revision">
          <td>{{ version.revision }}</td>
          <td>
            {{
              version.revoked
                ? t('settings.revoke')
                : version.state
                  ? status(version.state)
                  : version.selected
                    ? t('settings.status.configured')
                    : t('settings.status.pending')
            }}
            <p v-if="version.failureReason">{{ version.failureReason }}</p>
          </td>
          <td>
            <code>{{ version.operationId ?? '—' }}</code>
          </td>
          <td>{{ time(version.qualifiedAt ?? version.acceptedAt) }}</td>
          <td>{{ time(version.expiresAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
