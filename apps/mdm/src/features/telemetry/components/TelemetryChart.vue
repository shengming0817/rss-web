<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { utc, quantity } from '../format'
export interface ChartPoint {
  id: string
  at: number
  end?: number
  value: number | boolean | string | null
  quality: string
  breakBefore: boolean
}
const props = defineProps<{
  points: ChartPoint[]
  start: number
  end: number
  unit: string
  state: boolean
}>()
const { t } = useI18n(),
  index = ref(0)
watch(
  () => props.points,
  () => (index.value = 0),
)
const selected = computed(() => props.points[index.value])
const states = computed(() => [
  ...new Set(props.points.flatMap((p) => (p.value === null ? [] : [String(p.value)]))),
])
const domain = computed(() => {
  const values = props.points.flatMap((p) => (typeof p.value === 'number' ? [p.value] : []))
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values)
  return { min, max: max === min ? min + 1 : max + (max - min) * 0.08 }
})
const x = (at: number) => 60 + ((at - props.start) / Math.max(1, props.end - props.start)) * 700
function y(value: number | boolean | string) {
  return props.state
    ? 35 +
        (Math.max(0, states.value.indexOf(String(value))) * 145) /
          Math.max(1, states.value.length - 1)
    : 205 - ((Number(value) - domain.value.min) / (domain.value.max - domain.value.min)) * 175
}
const paths = computed(() => {
  const paths: string[] = []
  let current = ''
  for (const p of props.points) {
    if (p.value === null || p.breakBefore) {
      if (current) paths.push(current)
      current = ''
    }
    if (typeof p.value === 'number' && !props.state)
      current += `${current ? ' L' : 'M'}${x(p.at)},${y(p.value)}`
  }
  if (current) paths.push(current)
  return paths
})
</script>
<template>
  <figure class="telemetry-chart">
    <svg
      viewBox="0 0 800 250"
      role="img"
      :aria-label="t(state ? 'telemetry.stateChart' : 'telemetry.numericChart')"
    >
      <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction">
        <line
          x1="60"
          x2="760"
          :y1="205 - fraction * 175"
          :y2="205 - fraction * 175"
          class="telemetry-grid"
        />
        <text v-if="!state" x="50" :y="209 - fraction * 175" text-anchor="end">
          {{ quantity(domain.min + fraction * (domain.max - domain.min)) }}
        </text>
      </g>
      <g v-if="state">
        <text v-for="value in states" :key="value" x="50" :y="y(value) + 4" text-anchor="end">
          {{ value }}
        </text>
        <circle
          v-for="point in points.filter((p) => p.value !== null)"
          :key="point.id"
          :cx="x(point.at)"
          :cy="y(point.value!)"
          r="4"
          class="telemetry-dot"
        >
          <title>{{ utc(point.at) }} · {{ String(point.value) }}</title>
        </circle>
      </g>
      <g v-if="!state">
        <circle
          v-for="point in points.filter((p) => typeof p.value === 'number')"
          :key="point.id"
          :cx="x(point.at)"
          :cy="y(point.value!)"
          r="2"
          class="telemetry-dot"
        >
          <title>{{ utc(point.at) }} · {{ String(point.value) }}</title>
        </circle>
      </g>
      <path v-for="(path, i) in paths" :key="i" :d="path" class="telemetry-line" />
      <g v-for="fraction in [0, 0.5, 1]" :key="fraction">
        <text
          :x="60 + fraction * 700"
          y="237"
          :text-anchor="fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'"
        >
          {{ utc(start + fraction * (end - start)).slice(11, 19) }} UTC
        </text>
      </g>
      <line
        v-if="selected"
        :x1="x(selected.at)"
        :x2="x(selected.at)"
        y1="20"
        y2="205"
        class="telemetry-cursor"
      />
    </svg>
    <label v-if="points.length" class="telemetry-scrubber"
      >{{ t('telemetry.inspectPoint')
      }}<input
        v-model.number="index"
        type="range"
        min="0"
        :max="points.length - 1"
        step="1"
        :aria-valuetext="
          selected
            ? utc(selected.at) + ' / ' + String(selected.value ?? t('telemetry.noValue'))
            : undefined
        "
    /></label>
    <figcaption v-if="selected" class="telemetry-readout">
      <time>{{ utc(selected.at) }}</time
      ><strong>{{ selected.value === null ? '—' : quantity(selected.value) }} {{ unit }}</strong
      ><span>{{ selected.quality }}</span>
    </figcaption>
    <p class="telemetry-caption">{{ t(state ? 'telemetry.stateHint' : 'telemetry.gapHint') }}</p>
  </figure>
</template>
