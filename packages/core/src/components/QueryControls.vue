<script setup lang="ts">
import { ref, useId } from 'vue'
/** Display only. Domains own query meaning, accepted snapshots and request execution. */
const props = defineProps<{
  filter: string
  sort: string
  fields: readonly string[]
  columns: readonly string[]
  limit: number
  maximum: number
  previous?: boolean | undefined
  next?: boolean | undefined
  disabled?: boolean | undefined
  labels: Record<
    'filter' | 'sort' | 'fields' | 'limit' | 'apply' | 'first' | 'previous' | 'next',
    string
  >
  hint?: string | undefined
}>()
const emit = defineEmits<{
  'update:filter': [value: string]
  'update:sort': [value: string]
  'update:fields': [value: string[]]
  'update:limit': [value: number]
  apply: []
  first: []
  previous: []
  next: []
}>()
const id = useId()
const controls = ref<HTMLElement>()
function apply() {
  if (props.disabled) return
  const inputs = controls.value?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    'input, select',
  )
  if (inputs && [...inputs].some((input) => !input.reportValidity())) return
  emit('apply')
}
</script>
<template>
  <div class="directory-query">
    <details>
      <summary>
        {{ labels.filter }} / {{ labels.sort }} / {{ labels.fields }} / {{ labels.limit }}
      </summary>
      <fieldset ref="controls" :disabled="disabled">
        <label :for="id + '-filter'">{{ labels.filter }}</label>
        <input
          :id="id + '-filter'"
          :value="filter"
          maxlength="8192"
          :aria-describedby="id + '-hint'"
          @keydown.enter.prevent="apply"
          @input="emit('update:filter', ($event.target as HTMLInputElement).value)"
        />
        <label :for="id + '-sort'">{{ labels.sort }}</label>
        <input
          :id="id + '-sort'"
          :value="sort"
          maxlength="2048"
          :aria-describedby="id + '-hint'"
          @keydown.enter.prevent="apply"
          @input="emit('update:sort', ($event.target as HTMLInputElement).value)"
        />
        <label :for="id + '-fields'">{{ labels.fields }}</label>
        <select
          :id="id + '-fields'"
          multiple
          required
          :value="fields"
          @change="
            emit(
              'update:fields',
              [...($event.target as HTMLSelectElement).selectedOptions].map(
                (option) => option.value,
              ),
            )
          "
        >
          <option v-for="column in columns" :key="column" :value="column">{{ column }}</option>
        </select>
        <label :for="id + '-limit'">{{ labels.limit }}</label>
        <input
          :id="id + '-limit'"
          type="number"
          min="1"
          :max="maximum"
          :value="limit"
          required
          @keydown.enter.prevent="apply"
          @input="emit('update:limit', Number(($event.target as HTMLInputElement).value))"
        />
        <p :id="id + '-hint'">{{ hint }}</p>
        <button type="button" @click="apply">{{ labels.apply }}</button>
      </fieldset>
    </details>
    <nav :aria-label="labels.first">
      <button type="button" :disabled="disabled" @click="emit('first')">{{ labels.first }}</button>
      <button type="button" :disabled="disabled || !previous" @click="emit('previous')">
        {{ labels.previous }}
      </button>
      <button type="button" :disabled="disabled || !next" @click="emit('next')">
        {{ labels.next }}
      </button>
    </nav>
  </div>
</template>
<style scoped>
.directory-query fieldset {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  margin-block: 1rem;
  border: 1px solid currentColor;
  border-radius: 0.5rem;
}
.directory-query input,
.directory-query select,
.directory-query button {
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  padding: 0.4rem;
  color: inherit;
  background: transparent;
}
.directory-query input {
  max-width: 24rem;
}
.directory-query input[type='number'] {
  width: 6rem;
}
.directory-query p {
  flex-basis: 100%;
}
.directory-query nav {
  display: flex;
  gap: 0.5rem;
}
.directory-query :disabled {
  opacity: 0.55;
}
</style>
