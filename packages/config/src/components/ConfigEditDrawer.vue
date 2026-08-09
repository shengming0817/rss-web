<script setup lang="ts">
/**
 * ConfigEditDrawer — create or edit a config entry.
 *
 * Mode derived from the `entry` prop:
 *   - null/undefined → create: key field editable, sensitive toggle shown
 *   - present → edit: key field readonly, sensitive toggle hidden
 *
 * Stage semantics: write/update = stage the edit (backend stores it, bumps version).
 * Publish is a separate action on the list page. UI clarifies with the stage warning strip.
 *
 * Sensitive write guard: when editing a sensitive entry, value input is left empty
 * with a hint prompting the user to enter a new value. The redacted placeholder
 * "******" is never submitted — validation guards before emit.
 *
 * CAS conflict: the parent supplies errorKey (from store re-throw) which is shown
 * in role="alert" inside the drawer.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HttpConfigWriteV1Request, HttpConfigUpdateV1Request } from '@gocell/contracts'
import { ModalShell } from '@gocell/core/components'
import type { ConfigEntry } from '../api/config'
import { validateConfigKey, validateConfigValue } from '../lib/configValidation'

export type CreatePayload = HttpConfigWriteV1Request
export interface UpdatePayload {
  key: string
  body: HttpConfigUpdateV1Request
}

const props = withDefaults(
  defineProps<{
    open: boolean
    /** Present when editing an existing entry; null/undefined = create mode. */
    entry?: ConfigEntry | null
    /** CAS/server error i18n key from the parent; shown inline (role=alert). */
    errorKey?: string | null
    busy?: boolean
  }>(),
  { entry: null, errorKey: null, busy: false },
)

const emit = defineEmits<{
  /** Emitted on submit: create payload when entry is null, update payload when entry is set. */
  submit: [payload: CreatePayload | UpdatePayload]
  cancel: []
}>()

const { t } = useI18n()

const isEdit = computed(() => props.entry !== null)

const form = reactive({
  key: '',
  value: '',
  sensitive: false,
})
const submitted = ref(false)

const keyError = computed(() =>
  submitted.value && !isEdit.value ? validateConfigKey(form.key) : null,
)
const valueError = computed(() => (submitted.value ? validateConfigValue(form.value) : null))

const isSensitiveEdit = computed(() => isEdit.value && (props.entry?.sensitive ?? false))

const titleKey = computed(() =>
  isEdit.value ? 'config.entries.drawer.editTitle' : 'config.entries.drawer.createTitle',
)

/** Reset form whenever the drawer (re)opens. */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    submitted.value = false
    form.key = props.entry?.key ?? ''
    // Sensitive edit: leave value blank, user must re-enter
    form.value = isSensitiveEdit.value ? '' : (props.entry?.value ?? '')
    form.sensitive = props.entry?.sensitive ?? false
  },
  { immediate: true },
)

function onSubmit(): void {
  submitted.value = true
  if (keyError.value || valueError.value) return

  if (isEdit.value && props.entry) {
    const payload: UpdatePayload = {
      key: props.entry.key,
      body: {
        value: form.value,
        expectedVersion: props.entry.version,
      },
    }
    emit('submit', payload)
  } else {
    const payload: CreatePayload = {
      key: form.key,
      value: form.value,
      ...(form.sensitive ? { sensitive: true as const } : {}),
    }
    emit('submit', payload)
  }
}
</script>

<template>
  <ModalShell :open="open" title-id="config-edit-drawer-title" @close="emit('cancel')">
    <h2 id="config-edit-drawer-title" class="drawer__title">{{ t(titleKey) }}</h2>

    <!-- Stage warning strip -->
    <p class="drawer__stage-hint" role="note">{{ t('config.entries.drawer.stageHint') }}</p>

    <form class="drawer__form" novalidate @submit.prevent="onSubmit">
      <!-- Key field -->
      <div class="drawer__field">
        <label class="drawer__label" for="config-edit-key">
          {{ t('config.entries.drawer.key.label') }}
        </label>
        <input
          id="config-edit-key"
          v-model="form.key"
          class="drawer__input"
          type="text"
          autocomplete="off"
          :readonly="isEdit"
          :placeholder="t('config.entries.drawer.key.placeholder')"
          :aria-invalid="!!keyError || undefined"
          :aria-describedby="keyError ? 'config-edit-key-error' : undefined"
        />
        <p v-if="keyError" id="config-edit-key-error" class="drawer__error" role="alert">
          {{ t(keyError) }}
        </p>
      </div>

      <!-- Value field -->
      <div class="drawer__field">
        <label class="drawer__label" for="config-edit-value">
          {{ t('config.entries.drawer.value.label') }}
          <span v-if="isSensitiveEdit" class="drawer__sensitive-badge">
            {{ t('config.entries.drawer.value.sensitiveLabel') }}
          </span>
        </label>
        <input
          id="config-edit-value"
          v-model="form.value"
          class="drawer__input"
          type="text"
          autocomplete="off"
          :placeholder="
            isSensitiveEdit
              ? t('config.entries.drawer.value.sensitivePlaceholder')
              : t('config.entries.drawer.value.placeholder')
          "
          :aria-invalid="!!valueError || undefined"
          :aria-describedby="valueError ? 'config-edit-value-error' : undefined"
        />
        <p v-if="valueError" id="config-edit-value-error" class="drawer__error" role="alert">
          {{ t(valueError) }}
        </p>
        <p v-if="isSensitiveEdit" class="drawer__hint">
          {{ t('config.entries.drawer.value.sensitiveHint') }}
        </p>
      </div>

      <!-- Sensitive toggle: only in create mode -->
      <label v-if="!isEdit" class="drawer__checkbox" for="config-edit-sensitive">
        <input id="config-edit-sensitive" v-model="form.sensitive" type="checkbox" />
        <span>{{ t('config.entries.drawer.sensitive.label') }}</span>
      </label>

      <!-- Server/CAS error -->
      <p v-if="errorKey" class="drawer__error" role="alert">{{ t(errorKey) }}</p>

      <div class="drawer__actions">
        <button type="button" class="drawer__btn" @click="emit('cancel')">
          {{ t('config.entries.drawer.cancel') }}
        </button>
        <button
          type="submit"
          class="drawer__btn drawer__btn--primary"
          :disabled="busy"
          :aria-busy="busy"
        >
          {{ busy ? t('config.entries.drawer.submitting') : t('config.entries.drawer.submit') }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.drawer__title {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--fg);
}

.drawer__stage-hint {
  margin: 0 0 16px;
  padding: 8px 12px;
  font-size: 12.5px;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-left: 3px solid var(--warn);
  border-radius: var(--r-sm);
}

.drawer__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.drawer__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.drawer__sensitive-badge {
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.drawer__input {
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

.drawer__input:read-only {
  color: var(--fg-muted);
  background: var(--bg-sunken);
}

.drawer__input::placeholder {
  color: var(--fg-faint);
}

.drawer__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.drawer__hint {
  margin: 0;
  font-size: 12px;
  color: var(--fg-faint);
}

.drawer__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-muted);
}

.drawer__error {
  margin: 0;
  font-size: 12.5px;
  color: var(--err);
}

.drawer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.drawer__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.drawer__btn:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.drawer__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.drawer__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

.drawer__btn--primary:hover:not(:disabled) {
  background: var(--fg-hover);
}

.drawer__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .drawer__input {
    transition: none;
  }
}
</style>
