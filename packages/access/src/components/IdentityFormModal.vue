<script setup lang="ts">
/**
 * IdentityFormModal — create a new user, or edit an existing one's email.
 *
 * Mode is derived from the `user` prop: present → edit (username read-only,
 * email + requirePasswordReset editable via PATCH), absent → create (username +
 * email + password via POST). Validation errors surface inline (i18n keys via
 * validators); a server error is shown in a live region and keeps the modal open.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGoCellRequestError } from '@gocell/request'
import type { HttpAuthUserCreateV1Request, HttpAuthUserPatchV1Request } from '@gocell/contracts'
import { useIdentitiesStore } from '../stores/useIdentitiesStore'
import type { Identity } from '../api/identities'
import {
  validateCreateIdentity,
  validateEditIdentity,
  type CreateIdentityErrors,
} from '../lib/identityValidation'
import { ModalShell } from '@gocell/core/components'

const props = withDefaults(defineProps<{ open: boolean; user?: Identity | null }>(), {
  user: null,
})
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const store = useIdentitiesStore()

const isEdit = computed(() => props.user !== null)

const form = reactive({ username: '', email: '', password: '', requirePasswordReset: false })
const submitted = ref(false)
const submitting = ref(false)
const errorKey = ref<string | null>(null)

const errors = computed<CreateIdentityErrors>(() =>
  isEdit.value
    ? { username: null, email: validateEditIdentity({ email: form.email }).email, password: null }
    : validateCreateIdentity(form),
)

const titleKey = computed(() =>
  isEdit.value ? 'access.identities.form.editTitle' : 'access.identities.form.createTitle',
)

/** Reset the form to its initial state whenever the modal (re)opens. */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    submitted.value = false
    submitting.value = false
    errorKey.value = null
    form.username = props.user?.username ?? ''
    form.email = props.user?.email ?? ''
    form.password = ''
    form.requirePasswordReset = false
  },
  { immediate: true },
)

/** Submitted error for a field as a plain string ('' = none) — lets the template
 *  guard with v-if and pass straight to t() without a `string | null` cast. */
function fieldError(field: keyof CreateIdentityErrors): string {
  return submitted.value ? (errors.value[field] ?? '') : ''
}

async function onSubmit(): Promise<void> {
  submitted.value = true
  errorKey.value = null
  if (errors.value.username || errors.value.email || errors.value.password) return

  submitting.value = true
  try {
    if (isEdit.value && props.user) {
      const body: HttpAuthUserPatchV1Request = { email: form.email }
      if (form.requirePasswordReset) body.requirePasswordReset = true
      await store.edit(props.user.id, body)
    } else {
      const body: HttpAuthUserCreateV1Request = {
        username: form.username,
        email: form.email,
        password: form.password,
      }
      if (form.requirePasswordReset) body.requirePasswordReset = true
      await store.create(body)
    }
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
  <ModalShell :open="open" title-id="identity-form-title" @close="emit('close')">
    <h2 id="identity-form-title" class="modal__title">{{ t(titleKey) }}</h2>

    <form class="modal__form" novalidate @submit.prevent="onSubmit">
      <div class="modal__field">
        <label class="modal__label" for="identity-username">
          {{ t('access.identities.form.username.label') }}
        </label>
        <input
          id="identity-username"
          v-model="form.username"
          class="modal__input"
          type="text"
          autocomplete="off"
          :readonly="isEdit"
          :placeholder="t('access.identities.form.username.placeholder')"
          :aria-invalid="!!fieldError('username') || undefined"
          :aria-describedby="fieldError('username') ? 'identity-username-error' : undefined"
        />
        <p
          v-if="fieldError('username')"
          id="identity-username-error"
          class="modal__error"
          role="alert"
        >
          {{ t(fieldError('username')) }}
        </p>
      </div>

      <div class="modal__field">
        <label class="modal__label" for="identity-email">
          {{ t('access.identities.form.email.label') }}
        </label>
        <input
          id="identity-email"
          v-model="form.email"
          class="modal__input"
          type="email"
          autocomplete="off"
          :placeholder="t('access.identities.form.email.placeholder')"
          :aria-invalid="!!fieldError('email') || undefined"
          :aria-describedby="fieldError('email') ? 'identity-email-error' : undefined"
        />
        <p v-if="fieldError('email')" id="identity-email-error" class="modal__error" role="alert">
          {{ t(fieldError('email')) }}
        </p>
      </div>

      <div v-if="!isEdit" class="modal__field">
        <label class="modal__label" for="identity-password">
          {{ t('access.identities.form.password.label') }}
        </label>
        <input
          id="identity-password"
          v-model="form.password"
          class="modal__input"
          type="password"
          autocomplete="new-password"
          :placeholder="t('access.identities.form.password.placeholder')"
          :aria-invalid="!!fieldError('password') || undefined"
          :aria-describedby="fieldError('password') ? 'identity-password-error' : undefined"
        />
        <p
          v-if="fieldError('password')"
          id="identity-password-error"
          class="modal__error"
          role="alert"
        >
          {{ t(fieldError('password')) }}
        </p>
      </div>

      <label class="modal__checkbox" for="identity-require-password-reset">
        <input
          id="identity-require-password-reset"
          v-model="form.requirePasswordReset"
          type="checkbox"
        />
        <span>{{ t('access.identities.form.requirePasswordReset') }}</span>
      </label>

      <p v-if="errorKey" class="modal__error" role="alert">{{ t(errorKey) }}</p>

      <div class="modal__actions">
        <button type="button" class="modal__btn" @click="emit('close')">
          {{ t('access.identities.form.cancel') }}
        </button>
        <button
          type="submit"
          class="modal__btn modal__btn--primary"
          :disabled="submitting"
          :aria-busy="submitting"
        >
          {{
            submitting ? t('access.identities.form.submitting') : t('access.identities.form.submit')
          }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.modal__title {
  margin: 0 0 16px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 400;
  color: var(--fg);
}

.modal__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.modal__input {
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

.modal__input:read-only {
  color: var(--fg-muted);
  background: var(--bg-sunken);
}

.modal__input::placeholder {
  color: var(--fg-faint);
}

.modal__input:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.modal__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-muted);
}

.modal__error {
  margin: 0;
  font-size: 12.5px;
  color: var(--err);
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.modal__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.modal__btn:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.modal__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.modal__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

.modal__btn--primary:hover:not(:disabled) {
  background: var(--fg-hover);
}

.modal__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .modal__input {
    transition: none;
  }
}
</style>
