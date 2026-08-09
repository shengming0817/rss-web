<script setup lang="ts">
/**
 * FlagFormModal — create or edit a feature flag.
 *
 * Mode derived from the `flag` prop:
 *   - null/undefined → create: key field editable
 *   - present → edit: key field readonly, shows type (read-only)
 *
 * Variant config: flag `type` is read-only display only.
 * Variant configuration UI is not available (BR-007 pending: flag variant schema).
 * The UI shows a "variant config coming soon" placeholder in both create and edit.
 *
 * CAS conflict: the parent supplies errorKey (from store re-throw) which is shown
 * in role="alert" inside the modal.
 *
 * Submit payload:
 *   - create mode: { key, description, enabled, rolloutPercentage }
 *   - edit mode: { key, enabled, rolloutPercentage, description, expectedVersion }
 */
import { computed, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ModalShell } from '@gocell/core/components'
import type { FeatureFlag } from '../api/flags'
import RolloutSlider from './RolloutSlider.vue'

export interface CreateFlagPayload {
  key: string
  description: string
  enabled: boolean
  rolloutPercentage: number
}

export interface UpdateFlagPayload {
  key: string
  enabled: boolean
  rolloutPercentage: number
  description: string
  expectedVersion: number
}

const props = withDefaults(
  defineProps<{
    open: boolean
    flag?: FeatureFlag | null
    errorKey?: string | null
    busy?: boolean
  }>(),
  { flag: null, errorKey: null, busy: false },
)

const emit = defineEmits<{
  submit: [payload: CreateFlagPayload | UpdateFlagPayload]
  cancel: []
}>()

const { t } = useI18n()

const isEdit = computed(() => props.flag !== null)

const form = reactive({
  key: '',
  description: '',
  enabled: false,
  rolloutPercentage: 0,
})
const submitted = ref(false)
const keyError = ref<string | null>(null)

/** Reset form whenever the modal (re)opens. */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    submitted.value = false
    keyError.value = null
    form.key = props.flag?.key ?? ''
    form.description = props.flag?.description ?? ''
    form.enabled = props.flag?.enabled ?? false
    form.rolloutPercentage = props.flag?.rolloutPercentage ?? 0
  },
  { immediate: true },
)

const titleKey = computed(() => (isEdit.value ? 'flags.form.editTitle' : 'flags.form.createTitle'))

/** Unique id for the rollout slider input — binds <label for> to <input id>. */
const rolloutSliderId = useId()

function validateKey(k: string): string | null {
  if (!k.trim()) return 'flags.form.key.required'
  return null
}

function onSubmit(): void {
  submitted.value = true
  if (!isEdit.value) {
    keyError.value = validateKey(form.key)
    if (keyError.value) return
  }

  if (isEdit.value && props.flag) {
    const payload: UpdateFlagPayload = {
      key: props.flag.key,
      enabled: form.enabled,
      rolloutPercentage: Math.min(100, Math.max(0, form.rolloutPercentage)),
      description: form.description,
      expectedVersion: props.flag.version,
    }
    emit('submit', payload)
  } else {
    const payload: CreateFlagPayload = {
      key: form.key.trim(),
      description: form.description,
      enabled: form.enabled,
      rolloutPercentage: Math.min(100, Math.max(0, form.rolloutPercentage)),
    }
    emit('submit', payload)
  }
}
</script>

<template>
  <ModalShell :open="open" title-id="flag-form-modal-title" @close="emit('cancel')">
    <h2 id="flag-form-modal-title" class="flag-modal__title">{{ t(titleKey) }}</h2>

    <form class="flag-modal__form" novalidate @submit.prevent="onSubmit">
      <!-- Key field -->
      <div class="flag-modal__field">
        <label class="flag-modal__label" for="flag-form-key">
          {{ t('flags.form.key.label') }}
        </label>
        <input
          id="flag-form-key"
          v-model="form.key"
          data-field="key"
          class="flag-modal__input"
          type="text"
          autocomplete="off"
          :readonly="isEdit || undefined"
          :placeholder="t('flags.form.key.placeholder')"
          :aria-invalid="!!keyError || undefined"
          :aria-describedby="keyError ? 'flag-form-key-error' : undefined"
        />
        <p
          v-if="keyError && submitted"
          id="flag-form-key-error"
          class="flag-modal__error"
          role="alert"
        >
          {{ t(keyError) }}
        </p>
      </div>

      <!-- Description field -->
      <div class="flag-modal__field">
        <label class="flag-modal__label" for="flag-form-description">
          {{ t('flags.form.description.label') }}
        </label>
        <input
          id="flag-form-description"
          v-model="form.description"
          data-field="description"
          class="flag-modal__input"
          type="text"
          autocomplete="off"
          :placeholder="t('flags.form.description.placeholder')"
        />
      </div>

      <!-- Enabled toggle -->
      <div class="flag-modal__field">
        <label class="flag-modal__checkbox" for="flag-form-enabled">
          <input
            id="flag-form-enabled"
            v-model="form.enabled"
            data-field="enabled"
            type="checkbox"
          />
          <span>{{ t('flags.form.enabled.label') }}</span>
        </label>
      </div>

      <!-- Rollout percentage -->
      <div class="flag-modal__field">
        <label class="flag-modal__label" :for="rolloutSliderId">
          {{ t('flags.form.rollout.label') }}
        </label>
        <RolloutSlider v-model="form.rolloutPercentage" :input-id="rolloutSliderId" />
      </div>

      <!-- Type display (read-only) — shown in edit mode only -->
      <div v-if="isEdit && flag" class="flag-modal__field">
        <span class="flag-modal__label">{{ t('flags.form.type.label') }}</span>
        <span data-testid="flag-type-display" class="flag-modal__type-display">
          {{ flag.type }}
        </span>
      </div>

      <!-- Variant coming-soon placeholder (BR-007 pending: flag variant schema) -->
      <div
        class="flag-modal__field flag-modal__variant-placeholder"
        data-testid="variant-placeholder"
      >
        <p class="flag-modal__variant-soon">
          {{ t('flags.form.variantComingSoon') }}
        </p>
      </div>

      <!-- Server/CAS error -->
      <p v-if="errorKey" data-testid="server-error" class="flag-modal__error" role="alert">
        {{ t(errorKey) }}
      </p>

      <div class="flag-modal__actions">
        <button type="button" data-action="cancel" class="flag-modal__btn" @click="emit('cancel')">
          {{ t('flags.form.cancel') }}
        </button>
        <button
          type="submit"
          data-action="submit"
          class="flag-modal__btn flag-modal__btn--primary"
          :disabled="busy || undefined"
          :aria-busy="busy"
        >
          {{ busy ? t('flags.form.submitting') : t('flags.form.submit') }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.flag-modal__title {
  margin: 0 0 16px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--fg);
}

.flag-modal__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.flag-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flag-modal__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.flag-modal__input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  transition: border-color 0.15s;
}

.flag-modal__input:read-only {
  color: var(--fg-muted);
  background: var(--bg-sunken);
}

.flag-modal__input::placeholder {
  color: var(--fg-faint);
}

.flag-modal__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.flag-modal__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-muted);
}

.flag-modal__type-display {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
  padding: 4px 8px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  align-self: flex-start;
}

.flag-modal__variant-placeholder {
  padding: 10px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.flag-modal__variant-soon {
  margin: 0;
  font-size: 12px;
  color: var(--fg-faint);
}

.flag-modal__error {
  margin: 0;
  font-size: 12.5px;
  color: var(--err);
}

.flag-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.flag-modal__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.flag-modal__btn:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.flag-modal__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.flag-modal__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

.flag-modal__btn--primary:hover:not(:disabled) {
  background: var(--fg-hover);
}

.flag-modal__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .flag-modal__input {
    transition: none;
  }
}
</style>
