<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AuditEntry } from '@rss/audit'
import AuditSensitiveField from './AuditSensitiveField.vue'

defineProps<{ readonly rows: readonly AuditEntry[] }>()
const { locale, t } = useI18n()

function recordedAt(seconds: number): { readonly datetime?: string; readonly text: string } {
  const date = new Date(seconds * 1_000)
  if (Number.isNaN(date.getTime())) return { text: `${seconds} UTC` }
  return {
    datetime: date.toISOString(),
    text: new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
    }).format(date),
  }
}
</script>

<template>
  <ol class="audit-table">
    <li v-for="entry in rows" :key="entry.seq" class="audit-row">
      <h3>#{{ entry.seq }} · {{ entry.action }}</h3>
      <dl class="audit-facts">
        <div>
          <dt>{{ t('auditPage.fields.outcome') }}</dt>
          <dd>{{ entry.outcome }}</dd>
        </div>
        <div>
          <dt>{{ t('auditPage.fields.actorKind') }}</dt>
          <dd>{{ entry.actorKind }}</dd>
        </div>
        <div>
          <dt>{{ t('auditPage.fields.resourceKind') }}</dt>
          <dd>{{ entry.resourceKind }}</dd>
        </div>
        <div>
          <dt>{{ t('auditPage.fields.recordedAt') }}</dt>
          <dd>
            <time :datetime="recordedAt(entry.recordedAt).datetime">
              {{ recordedAt(entry.recordedAt).text }} UTC
            </time>
          </dd>
        </div>
        <div>
          <dt>{{ t('auditPage.fields.fingerprint') }}</dt>
          <dd>
            <code>{{ entry.entryHash }}</code> — {{ t('auditPage.notVerified') }}
          </dd>
        </div>
      </dl>
      <div class="audit-sensitive">
        <AuditSensitiveField :label="t('auditPage.fields.tenant')" :value="entry.tenantId" />
        <AuditSensitiveField :label="t('auditPage.fields.actor')" :value="entry.actor" />
        <AuditSensitiveField :label="t('auditPage.fields.resource')" :value="entry.resourceId" />
      </div>
    </li>
  </ol>
</template>

<style scoped>
.audit-table {
  display: grid;
  gap: 16px;
  padding: 0;
  list-style: none;
}

.audit-row {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.audit-facts > div {
  display: grid;
  gap: 4px;
  margin: 8px 0;
}

.audit-sensitive {
  display: grid;
  gap: 8px;
}

code {
  overflow-wrap: anywhere;
}
</style>
