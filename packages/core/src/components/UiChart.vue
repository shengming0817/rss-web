<script setup lang="ts">
import { computed } from 'vue'
import type { UiChartPoint } from './types'
const props = defineProps<{
  label: string
  kind: 'line' | 'bar' | 'donut'
  points: readonly UiChartPoint[]
  unit?: string
  emptyLabel: string
  dataLabel: string
}>()
const valid = computed(
  () =>
    props.points.length > 0 &&
    props.points.every((point) => Number.isFinite(point.value) && point.value >= 0),
)
const max = computed(() => Math.max(1, ...props.points.map((point) => point.value)))
const total = computed(() => props.points.reduce((sum, point) => sum + point.value, 0))
const line = computed(() =>
  props.points
    .map(
      (point, index) =>
        `${(index * 280) / Math.max(1, props.points.length - 1) + 10},${90 - (point.value / max.value) * 75}`,
    )
    .join(' '),
)
const segments = computed(() => {
  let offset = 0
  return props.points.map((point) => {
    const size = total.value ? (point.value / total.value) * 100 : 0
    const segment = { size, offset }
    offset += size
    return segment
  })
})
function color(index: number) {
  return ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--fg-muted)'][index % 4]
}
</script>
<template>
  <figure class="ui-chart" :aria-label="label">
    <figcaption class="ui-label">{{ label }}</figcaption>
    <p v-if="!valid || (kind === 'donut' && total === 0)" role="status" class="ui-help">
      {{ emptyLabel }}
    </p>
    <template v-else
      ><svg v-if="kind === 'line'" viewBox="0 0 300 100" aria-hidden="true">
        <polyline :points="line" fill="none" stroke="var(--accent)" stroke-width="2" /></svg
      ><svg v-else-if="kind === 'bar'" viewBox="0 0 300 100" aria-hidden="true">
        <rect
          v-for="(point, index) in points"
          :key="index"
          :x="(index * 300) / points.length + 3"
          :y="95 - (point.value / max) * 85"
          :width="Math.max(1, 300 / points.length - 6)"
          :height="(point.value / max) * 85"
          :fill="color(index)"
          rx="2"
        /></svg
      ><svg v-else class="ui-donut" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          v-for="(segment, index) in segments"
          :key="index"
          cx="60"
          cy="60"
          r="44"
          fill="none"
          :stroke="color(index)"
          stroke-width="12"
          pathLength="100"
          :stroke-dasharray="`${segment.size} ${100 - segment.size}`"
          :stroke-dashoffset="-segment.offset"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <ul class="ui-legend">
        <li v-for="(point, index) in points" :key="index">
          <span class="ui-legend-mark" :style="{ background: color(index) }" aria-hidden="true" />{{
            point.label
          }}
          <strong>{{ point.value }}{{ unit }}</strong>
        </li>
      </ul>
      <details>
        <summary class="ui-help">{{ dataLabel }}</summary>
        <table class="ui-table">
          <caption class="ui-sr-only">
            {{
              label
            }}
          </caption>
          <tbody>
            <tr v-for="(point, index) in points" :key="index">
              <th scope="row">{{ point.label }}</th>
              <td>{{ point.value }}{{ unit }}</td>
            </tr>
          </tbody>
        </table>
      </details></template
    >
  </figure>
</template>
