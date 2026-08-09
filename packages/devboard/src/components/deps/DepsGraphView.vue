<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'
import type { DependencyEdge } from '../../composables/useDepsGraph'

const props = defineProps<{
  cells: readonly CellEntry[]
  edges: readonly DependencyEdge[]
  selectedCellId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()

// SVG layout constants — use CSS tokens via inline style where possible,
// but these are pure geometric values (no token equiv).
const SVG_W = 600
const SVG_H = 400
const CX = SVG_W / 2
const CY = SVG_H / 2
const RADIUS = 140
const NODE_W = 110
const NODE_H = 36
const ARROW_ID = 'deps-graph-arrow'

interface NodeLayout {
  id: string
  x: number
  y: number
}

const nodeLayouts = computed<readonly NodeLayout[]>(() => {
  const n = props.cells.length
  if (n === 0) return []
  return props.cells.map((cell, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return {
      id: cell.id,
      x: CX + RADIUS * Math.cos(angle),
      y: CY + RADIUS * Math.sin(angle),
    }
  })
})

const posMap = computed<ReadonlyMap<string, NodeLayout>>(() => {
  return new Map(nodeLayouts.value.map((n) => [n.id, n]))
})

// Compute edge path endpoints accounting for node rectangle so arrows
// touch the border, not the center.
interface EdgePath {
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

function clampToRect(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  hw: number,
  hh: number,
): { x: number; y: number } {
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return { x: sx, y: sy }
  const ux = dx / dist
  const uy = dy / dist
  // clamp to rectangle border of target
  const tScaleX = hw / Math.abs(ux || 1e-9)
  const tScaleY = hh / Math.abs(uy || 1e-9)
  const tScale = Math.min(tScaleX, tScaleY)
  return {
    x: tx - ux * tScale,
    y: ty - uy * tScale,
  }
}

const edgePaths = computed<readonly EdgePath[]>(() => {
  const hw = NODE_W / 2
  const hh = NODE_H / 2
  return props.edges.flatMap((e) => {
    const src = posMap.value.get(e.from)
    const tgt = posMap.value.get(e.to)
    if (!src || !tgt) return []
    const end = clampToRect(src.x, src.y, tgt.x, tgt.y, hw, hh)
    const start = clampToRect(tgt.x, tgt.y, src.x, src.y, hw, hh)
    return [{ from: e.from, to: e.to, x1: start.x, y1: start.y, x2: end.x, y2: end.y }]
  })
})
</script>

<template>
  <div class="deps-graph">
    <svg
      v-if="cells.length > 0"
      :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
      class="deps-graph__svg"
      role="img"
      :aria-label="t('deps.graph.label')"
    >
      <title>{{ t('deps.graph.label') }}</title>

      <defs>
        <marker
          :id="ARROW_ID"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line)" aria-hidden="true" />
        </marker>
      </defs>

      <!-- Edges -->
      <line
        v-for="ep in edgePaths"
        :key="`${ep.from}-${ep.to}`"
        :x1="ep.x1"
        :y1="ep.y1"
        :x2="ep.x2"
        :y2="ep.y2"
        stroke="var(--line)"
        stroke-width="1"
        :marker-end="`url(#${ARROW_ID})`"
        aria-hidden="true"
      />

      <!-- Nodes -->
      <g
        v-for="node in nodeLayouts"
        :key="node.id"
        :transform="`translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`"
        tabindex="0"
        role="button"
        :aria-label="node.id"
        :aria-pressed="selectedCellId === node.id ? 'true' : 'false'"
        class="deps-graph__node"
        :class="{ 'deps-graph__node--selected': selectedCellId === node.id }"
        @click="emit('select', node.id)"
        @keydown.enter.space.prevent="emit('select', node.id)"
      >
        <!-- rx="4" = the --r-sm radius token. SVG presentation attributes can't
             reference CSS vars, so the numeric literal is the token's only carrier here. -->
        <rect
          :width="NODE_W"
          :height="NODE_H"
          rx="4"
          fill="var(--bg-raised)"
          :stroke="selectedCellId === node.id ? 'var(--accent)' : 'var(--line)'"
          stroke-width="1"
        />
        <text
          :x="NODE_W / 2"
          :y="NODE_H / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="var(--fg)"
          font-family="var(--font-mono)"
          class="deps-graph__label"
        >
          {{ node.id }}
        </text>
      </g>
    </svg>

    <p v-else class="deps-graph__empty">
      {{ t('deps.graph.empty') }}
    </p>
  </div>
</template>

<style scoped>
.deps-graph {
  width: 100%;
}

.deps-graph__svg {
  width: 100%;
  height: auto;
  display: block;
}

.deps-graph__node {
  cursor: pointer;
  outline: none;
}

.deps-graph__node:focus-visible rect {
  stroke: var(--accent);
  stroke-width: 2;
}

.deps-graph__label {
  font-size: var(--text-xs);
}

.deps-graph__empty {
  color: var(--fg-faint);
  font-size: var(--text-sm);
  text-align: center;
  padding: 40px 0;
}

@media (prefers-reduced-motion: reduce) {
  .deps-graph__node {
    transition: none;
  }
}
</style>
