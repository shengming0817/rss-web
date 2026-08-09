<script setup lang="ts">
/**
 * RolloutSlider — rollout percentage control (0–100).
 *
 * Uses a native <input type="range"> for built-in keyboard support (← → Home End).
 * Emits `update:modelValue` with clamped integer (0–100).
 *
 * a11y: accessible name comes from the parent's <label for="inputId"> association.
 * The slider value is carried by aria-valuenow/valuemin/valuemax.
 * The parent must render a <label :for="inputId"> — do NOT add aria-label on the input
 * when a visible label is already associated (double accessible name).
 *
 * inputId: caller-supplied unique id (required to bind <label for> + <output for>).
 * In Vue 3.5+ the parent can use useId() to generate a stable unique value.
 *
 * prefers-reduced-motion: transition disabled when reduced motion is preferred.
 */
import { useId } from 'vue'

const props = defineProps<{
  modelValue: number
  /** Stable unique HTML id for the range input. Used to bind <label for> and <output for>. */
  inputId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

/** Fallback to useId() when caller does not supply an id. */
const resolvedId = props.inputId ?? useId()

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function onChange(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', clamp(raw))
}
</script>

<template>
  <div class="rollout-slider">
    <div class="rollout-slider__track">
      <input
        :id="resolvedId"
        type="range"
        class="rollout-slider__input"
        :value="modelValue"
        min="0"
        max="100"
        step="1"
        :aria-valuenow="modelValue"
        aria-valuemin="0"
        aria-valuemax="100"
        @input="onChange"
      />
    </div>
    <output class="rollout-slider__value" :for="resolvedId"> {{ modelValue }}% </output>
  </div>
</template>

<style scoped>
.rollout-slider {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rollout-slider__track {
  flex: 1;
}

.rollout-slider__input {
  width: 100%;
  height: 4px;
  accent-color: var(--accent);
  cursor: pointer;
}

.rollout-slider__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--r-sm);
}

.rollout-slider__value {
  min-width: 38px;
  font-size: 12.5px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .rollout-slider__input {
    transition: none;
  }
}
</style>
