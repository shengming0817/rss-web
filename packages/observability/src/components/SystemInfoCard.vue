<script setup lang="ts">
/**
 * SystemInfoCard — displays runtime system info for the current assembly.
 *
 * Degrades to UnavailablePanel when status='unavailable' or system=null.
 * a11y: section is labelled by its h2 heading via aria-labelledby.
 */
import { useI18n } from 'vue-i18n'
import type { SystemInfoResponse } from '../api/system'
import type { LoadStatus } from '../lib/loadStatus'
import { formatUptime } from '../lib/formatUptime'
import { formatMib } from '../lib/formatBytes'
import { UnavailablePanel } from '@gocell/core'

defineProps<{
  system: SystemInfoResponse | null
  status: LoadStatus
}>()
const { t } = useI18n()

const HEADING_ID = 'system-info-heading'
</script>

<template>
  <UnavailablePanel
    v-if="status === 'unavailable' || system === null"
    :title="t('landing.system.title')"
    :message="t('landing.system.unavailable')"
  />
  <section v-else :aria-labelledby="HEADING_ID" class="card">
    <h2 :id="HEADING_ID" class="card__heading">{{ t('landing.system.title') }}</h2>

    <!-- Build info -->
    <h3 class="card__subheading">{{ t('landing.system.build') }}</h3>
    <dl class="kv">
      <div class="kv__row">
        <dt>{{ t('landing.system.version') }}</dt>
        <dd>{{ system.build.version }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.commit') }}</dt>
        <dd class="mono">{{ system.build.commit }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.goVersion') }}</dt>
        <dd class="mono">{{ system.build.goVersion }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.dirty') }}</dt>
        <dd>
          {{ system.build.dirty ? t('landing.system.dirtyYes') : t('landing.system.dirtyClean') }}
        </dd>
      </div>
    </dl>

    <!-- Runtime info -->
    <h3 class="card__subheading">{{ t('landing.system.runtime') }}</h3>
    <dl class="kv">
      <div class="kv__row">
        <dt>{{ t('landing.system.uptime') }}</dt>
        <dd>{{ formatUptime(system.runtime.uptimeSeconds) }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.goroutines') }}</dt>
        <dd class="mono">{{ system.runtime.goroutines }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.memory') }}</dt>
        <dd class="mono">{{ formatMib(system.runtime.memoryMB) }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.pid') }}</dt>
        <dd class="mono">{{ system.runtime.pid }}</dd>
      </div>
    </dl>

    <!-- Assembly info -->
    <h3 class="card__subheading">{{ t('landing.system.assembly') }}</h3>
    <dl class="kv">
      <div class="kv__row">
        <dt>{{ t('landing.system.assembly') }}</dt>
        <dd>{{ system.assembly.name }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.cells') }}</dt>
        <dd>{{ system.assembly.cells.join(', ') }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.primaryAddr') }}</dt>
        <dd class="mono">{{ system.assembly.primaryAddr }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.internalAddr') }}</dt>
        <dd class="mono">{{ system.assembly.internalAddr }}</dd>
      </div>
    </dl>

    <!-- Environment info -->
    <h3 class="card__subheading">{{ t('landing.system.environment') }}</h3>
    <dl class="kv">
      <div class="kv__row">
        <dt>{{ t('landing.system.environment') }}</dt>
        <dd>{{ system.environment.env }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.system.hostname') }}</dt>
        <dd class="mono">{{ system.environment.hostname }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-raised);
}

.card__heading {
  margin: 0 0 12px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.card__subheading {
  margin: 12px 0 4px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.card__subheading:first-of-type {
  margin-top: 0;
}

.kv {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 0;
  margin: 0 0 4px;
}

.kv__row {
  display: contents;
}

.kv__row dt,
.kv__row dd {
  padding: 5px 0;
  font-size: var(--text-base);
  border-bottom: 1px solid var(--line-soft);
  margin: 0;
}

.kv__row:last-child dt,
.kv__row:last-child dd {
  border-bottom: none;
}

.kv__row dt {
  color: var(--fg-muted);
  padding-right: 12px;
}

.kv__row dd {
  color: var(--fg);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
</style>
