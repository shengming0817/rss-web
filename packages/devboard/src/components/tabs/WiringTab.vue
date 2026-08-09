<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

const hasAnyDeps = computed(
  () => props.cell.requires.length > 0 || props.cell.l0Dependencies.length > 0,
)
</script>

<template>
  <div class="wiring">
    <div class="wiring__header">
      <h2 class="wiring__title">{{ t('cells.wiring.title') }}</h2>
      <p class="wiring__hint">{{ t('cells.wiring.hint') }}</p>
    </div>

    <p v-if="!hasAnyDeps" class="muted">{{ t('cells.wiring.none') }}</p>

    <template v-else>
      <!-- Infra deps -->
      <section class="card" aria-labelledby="wiring-requires-h">
        <h3 id="wiring-requires-h" class="card__heading">{{ t('cells.wiring.requires') }}</h3>
        <ul v-if="props.cell.requires.length > 0" class="dep-list" role="list">
          <li v-for="dep in props.cell.requires" :key="dep" class="dep-list__item mono">
            {{ dep }}
          </li>
        </ul>
        <p v-else class="muted">—</p>
      </section>

      <!-- L0 deps -->
      <section class="card" aria-labelledby="wiring-l0-h">
        <h3 id="wiring-l0-h" class="card__heading">{{ t('cells.wiring.l0deps') }}</h3>
        <ul v-if="props.cell.l0Dependencies.length > 0" class="dep-list" role="list">
          <li v-for="dep in props.cell.l0Dependencies" :key="dep" class="dep-list__item mono">
            {{ dep }}
          </li>
        </ul>
        <p v-else class="muted">—</p>
      </section>

      <!-- Inline SVG diagram: infra → cell flow -->
      <section class="card wiring-diagram" aria-labelledby="wiring-diagram-h">
        <h3 id="wiring-diagram-h" class="card__heading">{{ t('cells.wiring.infraToCell') }}</h3>
        <div class="diagram">
          <!-- Infra boxes on the left -->
          <div class="diagram__col" :aria-label="t('cells.wiring.requires')">
            <div
              v-for="dep in props.cell.requires"
              :key="dep"
              class="diagram__box diagram__box--infra"
            >
              <span class="mono">{{ dep }}</span>
            </div>
            <div v-if="props.cell.requires.length === 0" class="diagram__box diagram__box--infra">
              <span class="muted mono">—</span>
            </div>
          </div>

          <!-- Arrow -->
          <div class="diagram__arrow" aria-hidden="true">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            >
              <path d="M4 20 H 32 M 24 13 L 32 20 L 24 27" />
            </svg>
          </div>

          <!-- Cell box on the right -->
          <div class="diagram__col">
            <div class="diagram__box diagram__box--cell">
              <span class="mono">{{ props.cell.id }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.wiring {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.wiring__title {
  margin: 0 0 4px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.wiring__hint {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.card {
  padding: 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-raised);
}

.card__heading {
  margin: 0 0 10px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.dep-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dep-list__item {
  padding: 4px 8px;
  font-size: var(--text-sm);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  color: var(--fg);
  display: inline-block;
  width: fit-content;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.muted {
  font-size: var(--text-base);
  color: var(--fg-muted);
  margin: 0;
}

.wiring-diagram .card__heading {
  margin-bottom: 14px;
}

.diagram {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diagram__col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagram__arrow {
  color: var(--fg-muted);
  display: flex;
  align-items: center;
}

.diagram__box {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-soft);
}

.diagram__box--infra {
  background: var(--bg-sunken);
  color: var(--fg-muted);
}

.diagram__box--cell {
  background: var(--bg-raised);
  border-color: var(--accent);
  color: var(--fg);
}
</style>
