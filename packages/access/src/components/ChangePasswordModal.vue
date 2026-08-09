<script setup lang="ts">
/**
 * ChangePasswordModal — change a user's password (old + new + confirm).
 *
 * Backs `POST /users/{id}/password` (old + new; rotates the session for
 * self-service changes). Validation is inline (i18n keys via validators); a
 * server error stays in a live region and keeps the modal open.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGoCellRequestError } from '@gocell/request'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import { validateChangePassword, type ChangePasswordErrors } from '../lib/identityValidation'
import { ModalShell } from '@gocell/core/components'

const props = defineProps<{ open: boolean; user: Identity | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const store = useIdentitiesStore()

const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const submitted = ref(false)
const submitting = ref(false)
const errorKey = ref<string | null>(null)

const errors = computed<ChangePasswordErrors>(() => validateChangePassword(form))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    submitted.value = false
    submitting.value = false
    errorKey.value = null
    form.oldPassword = ''
    form.newPassword = ''
    form.confirm = ''
  },
  { immediate: true },
)

/** Submitted error for a field as a plain string ('' = none) — lets the template
 *  guard with v-if and pass straight to t() without a `string | null` cast. */
function fieldError(field: keyof ChangePasswordErrors): string {
  return submitted.value ? (errors.value[field] ?? '') : ''
}

async function onSubmit(): Promise<void> {
  submitted.value = true
  errorKey.value = null
  if (!props.user) return
  if (errors.value.oldPassword || errors.value.newPassword || errors.value.confirm) return

  submitting.value = true
  try {
    await store.changePassword(props.user.id, {
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    })
    emit('saved')
    emit('close')
  } catch (err: unknown) {
    errorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <ModalShell :open="open" title-id="change-password-title" @close="emit('close')">
    <h2 id="change-password-title" class="cp__title">
      {{ t('access.identities.password.title') }}
    </h2>

    <form class="cp__form" novalidate @submit.prevent="onSubmit">
      <div class="cp__field">
        <label class="cp__label" for="cp-old">{{
          t('access.identities.password.old.label')
        }}</label>
        <input
          id="cp-old"
          v-model="form.oldPassword"
          class="cp__input"
          type="password"
          autocomplete="current-password"
          :aria-invalid="!!fieldError('oldPassword') || undefined"
          :aria-describedby="fieldError('oldPassword') ? 'cp-old-error' : undefined"
        />
        <p v-if="fieldError('oldPassword')" id="cp-old-error" class="cp__error" role="alert">
          {{ t(fieldError('oldPassword')) }}
        </p>
      </div>

      <div class="cp__field">
        <label class="cp__label" for="cp-new">{{
          t('access.identities.password.new.label')
        }}</label>
        <input
          id="cp-new"
          v-model="form.newPassword"
          class="cp__input"
          type="password"
          autocomplete="new-password"
          :aria-invalid="!!fieldError('newPassword') || undefined"
          :aria-describedby="fieldError('newPassword') ? 'cp-new-error' : undefined"
        />
        <p v-if="fieldError('newPassword')" id="cp-new-error" class="cp__error" role="alert">
          {{ t(fieldError('newPassword')) }}
        </p>
      </div>

      <div class="cp__field">
        <label class="cp__label" for="cp-confirm">
          {{ t('access.identities.password.confirm.label') }}
        </label>
        <input
          id="cp-confirm"
          v-model="form.confirm"
          class="cp__input"
          type="password"
          autocomplete="new-password"
          :aria-invalid="!!fieldError('confirm') || undefined"
          :aria-describedby="fieldError('confirm') ? 'cp-confirm-error' : undefined"
        />
        <p v-if="fieldError('confirm')" id="cp-confirm-error" class="cp__error" role="alert">
          {{ t(fieldError('confirm')) }}
        </p>
      </div>

      <p v-if="errorKey" class="cp__error" role="alert">{{ t(errorKey) }}</p>

      <div class="cp__actions">
        <button type="button" class="cp__btn" @click="emit('close')">
          {{ t('access.identities.password.cancel') }}
        </button>
        <button
          type="submit"
          class="cp__btn cp__btn--primary"
          :disabled="submitting"
          :aria-busy="submitting"
        >
          {{
            submitting
              ? t('access.identities.password.submitting')
              : t('access.identities.password.submit')
          }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.cp__title {
  margin: 0 0 16px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--fg);
}

.cp__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cp__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.cp__input {
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

.cp__input:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.cp__error {
  margin: 0;
  font-size: 12.5px;
  color: var(--err);
}

.cp__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.cp__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.cp__btn:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.cp__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.cp__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

/* Override the generic .cp__btn:hover (which would turn the filled primary
   button --bg-sunken → white text on grey = invisible). */
.cp__btn--primary:hover:not(:disabled) {
  background: var(--fg-hover);
}

.cp__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .cp__input {
    transition: none;
  }
}
</style>
