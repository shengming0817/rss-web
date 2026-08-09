<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { UnavailablePanel } from '@gocell/core'
import { useObserveStore } from '../stores/useObserveStore'

const { t } = useI18n()
const store = useObserveStore()

onMounted(() => {
  void store.loadOverview()
})

const headingId = 'observe-overview-heading'

const qpsValue = computed<string>(() => {
  const v = store.kpis.qps?.points.at(-1)?.v
  return v != null ? v.toFixed(1) : '—'
})

const p95Value = computed<string>(() => {
  const v = store.kpis.p95?.points.at(-1)?.v
  return v != null ? Math.round(v * 1000).toString() : '—'
})

const errorRateValue = computed<string>(() => {
  const v = store.kpis.errorRate?.points.at(-1)?.v
  return v != null ? (v * 100).toFixed(2) + '%' : '—'
})

const sloBurnValue = computed<string>(() => {
  const v = store.kpis.sloBurn?.points.at(-1)?.v
  return v != null ? v.toFixed(2) : '—'
})

const allKpisNull = computed<boolean>(() => {
  const kpis = store.kpis
  return kpis.qps == null && kpis.p95 == null && kpis.errorRate == null && kpis.sloBurn == null
})
</script>

<template>
  <section class="overview" :aria-labelledby="headingId">
    <h2 :id="headingId" class="overview__heading">{{ t('observe.overview.regionLabel') }}</h2>

    <p
      v-if="store.overviewStatus === 'idle' || store.overviewStatus === 'loading'"
      class="overview__status"
      role="status"
    >
      {{ t('observe.overview.loading') }}
    </p>

    <template v-else-if="store.overviewStatus === 'unavailable'">
      <UnavailablePanel
        :title="t('observe.unavailable.title')"
        :message="t('observe.unavailable.message')"
      />
      <button type="button" class="overview__retry" @click="store.loadOverview()">
        {{ t('observe.unavailable.retry') }}
      </button>
    </template>

    <template v-else>
      <p v-if="allKpisNull" class="overview__status" role="status">
        {{ t('observe.overview.empty') }}
      </p>

      <div v-else class="overview__tiles">
        <div class="overview__tile">
          <span class="overview__tile-label">{{ t('observe.overview.qps') }}</span>
          <span class="overview__tile-value">{{ qpsValue }}</span>
        </div>
        <div class="overview__tile">
          <span class="overview__tile-label">{{ t('observe.overview.p95') }}</span>
          <span class="overview__tile-value">{{ p95Value }}</span>
        </div>
        <div class="overview__tile">
          <span class="overview__tile-label">{{ t('observe.overview.errorRate') }}</span>
          <span class="overview__tile-value">{{ errorRateValue }}</span>
        </div>
        <div class="overview__tile">
          <span class="overview__tile-label">{{ t('observe.overview.sloBurn') }}</span>
          <span class="overview__tile-value">{{ sloBurnValue }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.overview {
  padding: 16px;
}

.overview__heading {
  margin: 0 0 16px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.overview__status {
  padding: 24px 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
  text-align: center;
}

.overview__retry {
  margin-top: 12px;
  height: 30px;
  padding: 0 14px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.overview__retry:hover {
  background: var(--bg-sunken);
}

.overview__retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.overview__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.overview__tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.overview__tile-label {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.overview__tile-value {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  color: var(--fg);
}
</style>
