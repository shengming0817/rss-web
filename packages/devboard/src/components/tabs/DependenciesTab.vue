<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

const hasCrossCell = computed(
  () => props.cell.dependsOnCells.length > 0 || props.cell.requiredByCells.length > 0,
)
</script>

<template>
  <div class="deps">
    <div class="deps__header">
      <h2 class="deps__title">{{ t('cells.dependencies.title') }}</h2>
      <p class="deps__hint">{{ t('cells.dependencies.hint') }}</p>
    </div>

    <!-- Depends on -->
    <section class="card" aria-labelledby="deps-on-h">
      <h3 id="deps-on-h" class="card__heading">{{ t('cells.dependencies.dependsOn') }}</h3>
      <p v-if="props.cell.dependsOnCells.length === 0" class="muted">
        {{ !hasCrossCell ? t('cells.dependencies.none') : '—' }}
      </p>
      <ul v-else class="cell-list" role="list">
        <li v-for="id in props.cell.dependsOnCells" :key="id" class="cell-list__item">
          <RouterLink :to="`/cells/${id}`" class="cell-link mono">{{ id }}</RouterLink>
        </li>
      </ul>
    </section>

    <!-- Required by -->
    <section class="card" aria-labelledby="deps-by-h">
      <h3 id="deps-by-h" class="card__heading">{{ t('cells.dependencies.requiredBy') }}</h3>
      <p v-if="props.cell.requiredByCells.length === 0" class="muted">—</p>
      <ul v-else class="cell-list" role="list">
        <li v-for="id in props.cell.requiredByCells" :key="id" class="cell-list__item">
          <RouterLink :to="`/cells/${id}`" class="cell-link mono">{{ id }}</RouterLink>
        </li>
      </ul>
    </section>

    <!-- Infra section -->
    <section class="card" aria-labelledby="deps-infra-h">
      <h3 id="deps-infra-h" class="card__heading">{{ t('cells.dependencies.infra') }}</h3>
      <p v-if="props.cell.requires.length === 0" class="muted">—</p>
      <ul v-else class="infra-list" role="list">
        <li v-for="dep in props.cell.requires" :key="dep" class="infra-list__item mono">
          {{ dep }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.deps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.deps__title {
  margin: 0 0 4px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.deps__hint {
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

.muted {
  font-size: var(--text-base);
  color: var(--fg-muted);
  margin: 0;
}

.cell-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-list__item {
  padding: 3px 0;
}

.cell-link {
  color: var(--accent);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}

.cell-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.infra-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.infra-list__item {
  display: inline-block;
  padding: 3px 8px;
  font-size: var(--text-sm);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  color: var(--fg-muted);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
</style>
