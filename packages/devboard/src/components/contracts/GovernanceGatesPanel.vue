<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { GOVERNANCE_GATES } from '../../data/governanceGates'
import type { GateVerdict } from '../../data/governanceGates'

const { t } = useI18n()

function verdictKey(verdict: GateVerdict): string {
  if (verdict === 'pass') return 'contracts.gates.verdict.pass'
  if (verdict === 'warn') return 'contracts.gates.verdict.warn'
  return 'contracts.gates.verdict.fail'
}
</script>

<template>
  <section class="gates-panel" aria-labelledby="gates-panel-title">
    <div class="gates-panel__head">
      <h2 id="gates-panel-title" class="gates-panel__title">
        {{ t('contracts.gates.title') }}
      </h2>
      <p class="gates-panel__subtitle">{{ t('contracts.gates.subtitle') }}</p>
    </div>

    <ul class="gates-panel__list" role="list">
      <li
        v-for="gate in GOVERNANCE_GATES"
        :key="gate.id"
        class="gates-panel__row"
        data-testid="gate-row"
      >
        <span class="gates-panel__gate-id">{{ gate.id }}</span>

        <span class="gates-panel__desc">{{ t(gate.descKey) }}</span>

        <span class="gates-panel__badge" :class="`gates-panel__badge--${gate.verdict}`">
          <span class="sr-only">{{ t(verdictKey(gate.verdict)) }}</span>
          <span aria-hidden="true">{{ gate.verdict }}</span>
        </span>

        <span class="gates-panel__count">
          {{ t('contracts.gates.countLabel', { passed: gate.passed, total: gate.total }) }}
        </span>

        <span v-if="gate.isNew" class="gates-panel__new">
          {{ t('contracts.gates.new') }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gates-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
}

.gates-panel__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gates-panel__title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.gates-panel__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.gates-panel__list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gates-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--line-soft);
}

.gates-panel__row:last-child {
  border-bottom: none;
}

.gates-panel__gate-id {
  flex: 0 0 52px;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg);
}

.gates-panel__desc {
  flex: 1 1 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.gates-panel__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  white-space: nowrap;
}

.gates-panel__badge--pass {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
  background: color-mix(in srgb, var(--ok) 8%, transparent);
}

.gates-panel__badge--warn {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 30%, transparent);
  background: color-mix(in srgb, var(--warn) 8%, transparent);
}

.gates-panel__badge--fail {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 30%, transparent);
  background: color-mix(in srgb, var(--err) 8%, transparent);
}

.gates-panel__count {
  flex: 0 0 auto;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-faint);
}

.gates-panel__new {
  flex: 0 0 auto;
  display: inline-block;
  padding: 1px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-sans);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-radius: var(--r-sm);
}
</style>
