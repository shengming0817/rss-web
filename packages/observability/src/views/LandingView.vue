<script setup lang="ts">
/**
 * LandingView — `/` health dashboard (Batch 7 / BR-001/002).
 *
 * Renders the system health overview: cell-health grid, system info, and
 * placeholder cards for deploys and KPIs (no backend yet, intentional).
 *
 * Polling: useHealthPoll fires refresh() immediately and every 30s;
 * the manual refresh button lets the user trigger a fetch on demand.
 *
 * Design DNA: single --accent, tokens.css variables only, no inline colour,
 * no magic numbers, no emoji, no gradient.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHealthStore } from '../stores/useHealthStore'
import { useHealthPoll } from '../composables/useHealthPoll'
import { UnavailablePanel } from '@gocell/core'
import CellHealthCard from '../components/CellHealthCard.vue'
import SystemInfoCard from '../components/SystemInfoCard.vue'

const { t } = useI18n()
const health = useHealthStore()

// Start polling: fires refresh() immediately + every 30s; cleans up on scope dispose.
// Do NOT call health.refresh() here again — useHealthPoll already fires it once.
useHealthPoll()

// ─── derived ─────────────────────────────────────────────────────────────────

// idle is treated the same as loading: both mean "no data yet, show spinner".
const isLoading = computed(
  () => health.healthStatus === 'loading' || health.healthStatus === 'idle',
)

const isUnavailable = computed(() => health.healthStatus === 'unavailable')

const isLoaded = computed(() => health.healthStatus === 'loaded')

// ─── single a11y live-region text ────────────────────────────────────────────
// Exactly one polite live region must exist at any time; we drive its text via
// a computed so screen readers announce meaningful transitions.
const liveRegionText = computed<string>(() => {
  if (health.healthStatus === 'loading' || health.healthStatus === 'idle') {
    return t('landing.loading')
  }
  if (health.healthStatus === 'unavailable') {
    return t('landing.unavailable.title')
  }
  if (health.lastCheckAt) {
    return t('landing.liveRegion', { time: health.lastCheckAt })
  }
  return ''
})

const summaryHeadingId = 'landing-summary-heading'
const deploysHeadingId = 'landing-deploys-heading'
const kpiHeadingId = 'landing-kpi-heading'

// ─── timestamp formatter ──────────────────────────────────────────────────────
const dtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function formatTs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dtFormat.format(d)
}
</script>

<template>
  <div class="landing">
    <!-- ─── page header ──────────────────────────────────────────────────── -->
    <header class="landing__header">
      <div>
        <h1 class="v1-h1">{{ t('landing.title') }}</h1>
        <p class="v1-sub">{{ t('landing.subtitle') }}</p>
      </div>
      <div class="landing__head-actions">
        <button type="button" class="landing__btn" @click="health.refresh()">
          {{ t('landing.refresh') }}
        </button>
        <span v-if="health.lastCheckAt" class="landing__last-check">
          {{ t('landing.lastCheck', { time: formatTs(health.lastCheckAt) }) }}
        </span>
      </div>
    </header>

    <!-- ─── a11y live region (single, always present) ──────────────────── -->
    <!-- Only one polite live region; text is driven by liveRegionText computed. -->
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveRegionText }}</p>

    <!-- ─── health section ───────────────────────────────────────────────── -->
    <!-- No role="status" on the visible loading <p> — live region above handles announcements. -->
    <p v-if="isLoading" class="landing__loading">
      {{ t('landing.loading') }}
    </p>

    <div v-else-if="isUnavailable" class="landing__degraded" data-testid="health-degraded">
      <UnavailablePanel
        :title="t('landing.unavailable.title')"
        :message="t('landing.unavailable.message')"
      />
      <button type="button" class="landing__btn" @click="health.refresh()">
        {{ t('landing.unavailable.retry') }}
      </button>
    </div>

    <template v-else-if="isLoaded">
      <!-- summary strip -->
      <section class="landing__summary" :aria-labelledby="summaryHeadingId">
        <h2 :id="summaryHeadingId" class="landing__section-h">
          {{ t('landing.summary.label') }}
        </h2>
        <div class="landing__rollup">
          <div class="landing__rollup-item">
            <span class="landing__rollup-count" aria-hidden="true">{{ health.rollup.total }}</span>
            <span class="landing__rollup-label">
              {{ t('landing.summary.total', { n: health.rollup.total }) }}
            </span>
          </div>
          <div class="landing__rollup-item">
            <span class="landing__rollup-count landing__rollup-count--ok" aria-hidden="true">
              {{ health.rollup.healthy }}
            </span>
            <span class="landing__rollup-label">
              {{ t('landing.summary.healthy', { n: health.rollup.healthy }) }}
            </span>
          </div>
          <div class="landing__rollup-item">
            <span class="landing__rollup-count landing__rollup-count--warn" aria-hidden="true">
              {{ health.rollup.degraded }}
            </span>
            <span class="landing__rollup-label">
              {{ t('landing.summary.degraded', { n: health.rollup.degraded }) }}
            </span>
          </div>
          <div class="landing__rollup-item">
            <span class="landing__rollup-count landing__rollup-count--err" aria-hidden="true">
              {{ health.rollup.down }}
            </span>
            <span class="landing__rollup-label">
              {{ t('landing.summary.down', { n: health.rollup.down }) }}
            </span>
          </div>
        </div>
      </section>

      <!-- cell cards grid -->
      <div class="landing__cells">
        <CellHealthCard v-for="c in health.cells" :key="c.name" :cell="c" />
      </div>
    </template>

    <!-- ─── system info ──────────────────────────────────────────────────── -->
    <SystemInfoCard :system="health.system" :status="health.systemStatus" />

    <!-- ─── placeholder cards row ───────────────────────────────────────── -->
    <div class="landing__placeholders">
      <!-- recent deploys (intentional — no backend endpoint yet) -->
      <section class="landing__placeholder-card" :aria-labelledby="deploysHeadingId">
        <h2 :id="deploysHeadingId" class="landing__section-h">
          {{ t('landing.deploys.title') }}
        </h2>
        <UnavailablePanel :message="t('landing.deploys.unavailable')" />
      </section>

      <!-- KPI card (intentional — no backend endpoint yet) -->
      <section class="landing__placeholder-card" :aria-labelledby="kpiHeadingId">
        <h2 :id="kpiHeadingId" class="landing__section-h">{{ t('landing.kpi.title') }}</h2>
        <UnavailablePanel :message="t('landing.kpi.unavailable')" />
        <RouterLink to="/observe" class="landing__observe-link">
          {{ t('landing.kpi.openObserve') }}
        </RouterLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ─── screen reader only (standard clip pattern) ─────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ─── page shell ─────────────────────────────────────────────────────────── */
.landing {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1280px;
  padding: 28px 32px;
}

/* ─── header ──────────────────────────────────────────────────────────────── */
.landing__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.landing__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.landing__btn {
  height: 30px;
  padding: 0 12px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.landing__btn:hover {
  background: var(--bg-sunken);
}

.landing__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.landing__last-check {
  font-size: var(--text-sm);
  color: var(--fg-faint);
  font-family: var(--font-mono);
}

/* ─── loading / degraded states ──────────────────────────────────────────── */
.landing__loading {
  margin: 0;
  padding: 40px 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
  text-align: center;
}

.landing__degraded {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── section headings ───────────────────────────────────────────────────── */
.landing__section-h {
  margin: 0 0 10px;
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
}

/* ─── summary strip ──────────────────────────────────────────────────────── */
.landing__summary {
  padding: 0;
}

.landing__rollup {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.landing__rollup-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.landing__rollup-count {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 500;
  line-height: 1;
  color: var(--fg);
}

.landing__rollup-count--ok {
  color: var(--ok);
}

.landing__rollup-count--warn {
  color: var(--warn);
}

.landing__rollup-count--err {
  color: var(--err);
}

.landing__rollup-label {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* ─── cell cards grid ────────────────────────────────────────────────────── */
.landing__cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* ─── section wrapper ────────────────────────────────────────────────────── */
.landing__section {
  display: flex;
  flex-direction: column;
}

/* ─── placeholder cards row ──────────────────────────────────────────────── */
.landing__placeholders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.landing__placeholder-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

/* ─── observe link ───────────────────────────────────────────────────────── */
.landing__observe-link {
  align-self: flex-start;
  margin-top: 10px;
  font-size: var(--text-base);
  color: var(--accent);
  text-decoration: none;
}

.landing__observe-link:hover {
  text-decoration: underline;
}

.landing__observe-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
</style>
