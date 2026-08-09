<script setup lang="ts">
/**
 * ConfirmDialog — config-local copy of the generic destructive confirmation (alertdialog).
 *
 * config-local copy; candidate to promote to @gocell/core (deduplication debt vs. access version).
 *
 * Dumb + reusable: the parent supplies i18n keys and owns the action + busy/error state.
 * role="alertdialog" + the title/message labelling demand an explicit decision.
 */
import { useI18n } from 'vue-i18n'
import { ModalShell } from '@gocell/core/components'

withDefaults(
  defineProps<{
    open: boolean
    titleKey: string
    messageKey: string
    confirmKey: string
    danger?: boolean
    busy?: boolean
    /** Server-error i18n key shown inline; keeps the dialog open on failure. */
    errorKey?: string | null
    /** Cancel-button i18n key — overridable per dialog. */
    cancelKey?: string
  }>(),
  { danger: false, busy: false, errorKey: null },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const { t } = useI18n()
</script>

<template>
  <ModalShell
    :open="open"
    title-id="config-confirm-dialog-title"
    description-id="config-confirm-dialog-message"
    role="alertdialog"
    @close="emit('cancel')"
  >
    <h2 id="config-confirm-dialog-title" class="confirm__title">{{ t(titleKey) }}</h2>
    <p id="config-confirm-dialog-message" class="confirm__message">{{ t(messageKey) }}</p>

    <!-- Optional slot for additional content inside the dialog panel (e.g. version picker).
         Rendered between message and error so it sits within the focus trap. -->
    <slot />

    <p v-if="errorKey" class="confirm__error" role="alert">{{ t(errorKey) }}</p>

    <div class="confirm__actions">
      <button type="button" class="confirm__btn" @click="emit('cancel')">
        {{ t(cancelKey ?? 'config.entries.confirm.cancel') }}
      </button>
      <button
        type="button"
        class="confirm__btn"
        :class="danger ? 'confirm__btn--danger' : 'confirm__btn--primary'"
        :disabled="busy"
        :aria-busy="busy"
        @click="emit('confirm')"
      >
        {{ t(confirmKey) }}
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.confirm__title {
  margin: 0 0 10px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--fg);
}

.confirm__message {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fg-muted);
}

.confirm__error {
  margin: 0 0 16px;
  font-size: 12.5px;
  color: var(--err);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.confirm__btn:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.confirm__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.confirm__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

.confirm__btn--primary:hover:not(:disabled) {
  background: var(--fg-hover);
}

.confirm__btn--danger {
  color: var(--bg);
  background: var(--err-strong);
  border-color: var(--err-strong);
}

.confirm__btn--danger:hover:not(:disabled) {
  background: var(--err-strong);
  filter: brightness(0.92);
}

.confirm__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}
</style>
