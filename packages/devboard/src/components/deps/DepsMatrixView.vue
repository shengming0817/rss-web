<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'

defineProps<{
  cells: readonly CellEntry[]
  dependsOn: (from: string, to: string) => boolean
}>()

const { t } = useI18n()
</script>

<template>
  <div class="deps-matrix">
    <table class="deps-matrix__table">
      <caption class="deps-matrix__caption">
        {{
          t('deps.matrix.caption')
        }}
      </caption>
      <thead>
        <tr>
          <!-- top-left empty corner — no scope, not a header -->
          <td class="deps-matrix__corner" aria-hidden="true"></td>
          <th
            v-for="col in cells"
            :key="col.id"
            scope="col"
            class="deps-matrix__th deps-matrix__th--col"
          >
            <span class="deps-matrix__mono">{{ col.id }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in cells" :key="row.id" class="deps-matrix__row">
          <th scope="row" class="deps-matrix__th deps-matrix__th--row">
            <span class="deps-matrix__mono">{{ row.id }}</span>
          </th>
          <td
            v-for="col in cells"
            :key="col.id"
            class="deps-matrix__cell"
            :class="{
              'deps-matrix__cell--depends': row.id !== col.id && dependsOn(row.id, col.id),
              'deps-matrix__cell--self': row.id === col.id,
            }"
          >
            <template v-if="row.id === col.id">
              <span class="sr-only">{{ t('deps.matrix.self') }}</span>
              <span aria-hidden="true" class="deps-matrix__dot deps-matrix__dot--self">·</span>
            </template>
            <template v-else-if="dependsOn(row.id, col.id)">
              <span aria-hidden="true" class="deps-matrix__dot deps-matrix__dot--yes">●</span>
              <span class="sr-only">{{ t('deps.matrix.depends') }}</span>
            </template>
            <template v-else>
              <span aria-hidden="true" class="deps-matrix__dot deps-matrix__dot--no">·</span>
              <span class="sr-only">{{ t('deps.matrix.independent') }}</span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.deps-matrix {
  overflow-x: auto;
}

.deps-matrix__table {
  border-collapse: collapse;
  font-size: var(--text-base);
}

.deps-matrix__caption {
  caption-side: top;
  text-align: left;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  font-weight: 500;
  padding: 0 0 8px;
}

.deps-matrix__corner {
  /* empty */
}

.deps-matrix__th {
  padding: 6px 10px;
  font-weight: 500;
  color: var(--fg-muted);
  font-size: var(--text-sm);
  white-space: nowrap;
}

.deps-matrix__th--col {
  border-bottom: 1px solid var(--line);
  text-align: center;
}

.deps-matrix__th--row {
  border-right: 1px solid var(--line);
  text-align: right;
}

.deps-matrix__row {
  border-bottom: 1px solid var(--line-soft);
}

.deps-matrix__row:last-child {
  border-bottom: none;
}

.deps-matrix__cell {
  padding: 6px 10px;
  text-align: center;
  min-width: 48px;
}

.deps-matrix__cell--depends {
  background: var(--accent-soft);
}

.deps-matrix__cell--self {
  background: var(--bg-sunken);
}

.deps-matrix__dot {
  font-size: var(--text-lg);
  line-height: 1;
}

.deps-matrix__dot--yes {
  color: var(--accent);
}

.deps-matrix__dot--no,
.deps-matrix__dot--self {
  color: var(--fg-faint);
}

.deps-matrix__mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
