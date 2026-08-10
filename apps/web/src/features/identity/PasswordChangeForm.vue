<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { passwordChangeErrorKey, type PasswordChangeErrorKey } from './identity-error'
import { PASSWORD_CHANGE_INTENT } from './password-change-intent'
import { useIdentitySession } from './session-context'

const { t } = useI18n()
const { session, state } = useIdentitySession()
const authorization = useAuthorizationIntent(PASSWORD_CHANGE_INTENT)
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const currentInput = ref<HTMLInputElement>()
const newInput = ref<HTMLInputElement>()
const confirmationInput = ref<HTMLInputElement>()
const errorAlert = ref<HTMLElement>()
const busy = ref(false)
const refreshing = computed(() => state.value.status === 'refreshing')
const unavailable = computed(() => busy.value || refreshing.value)
const errorKey = ref<PasswordChangeErrorKey>()
let operation: AbortController | undefined

function clearFields(): void {
  currentPassword.value = ''
  newPassword.value = ''
  confirmation.value = ''
}

async function submit(): Promise<void> {
  if (unavailable.value || operation !== undefined) return
  if (currentPassword.value.length === 0) {
    errorKey.value = 'identity.passwordChange.errors.required'
    currentInput.value?.focus()
    return
  }
  if (newPassword.value.length === 0) {
    errorKey.value = 'identity.passwordChange.errors.required'
    newInput.value?.focus()
    return
  }
  if (confirmation.value !== newPassword.value) {
    errorKey.value = 'identity.passwordChange.errors.mismatch'
    confirmationInput.value?.focus()
    return
  }

  const request = {
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
  }
  clearFields()
  errorKey.value = undefined
  busy.value = true
  operation = new AbortController()
  try {
    await authorization.execute(() =>
      session.changePassword(request, { signal: operation!.signal }),
    )
  } catch (error: unknown) {
    errorKey.value = passwordChangeErrorKey(error)
    if (errorKey.value !== undefined) {
      await nextTick()
      errorAlert.value?.focus()
    }
  } finally {
    clearFields()
    operation = undefined
    busy.value = false
  }
}

onBeforeUnmount(() => {
  operation?.abort()
  clearFields()
})
</script>

<template>
  <section class="password-change" aria-labelledby="password-change-title">
    <h2 id="password-change-title">{{ t('identity.passwordChange.title') }}</h2>
    <p>{{ t('identity.passwordChange.description') }}</p>
    <p class="password-change__policy">{{ t('identity.passwordChange.policyHint') }}</p>
    <p v-if="errorKey" ref="errorAlert" role="alert" tabindex="-1">
      {{ t(errorKey) }}
    </p>
    <p v-if="refreshing" role="status">{{ t('identity.passwordChange.refreshing') }}</p>
    <form novalidate :aria-busy="unavailable" @submit.prevent="submit">
      <label for="password-current">{{ t('identity.passwordChange.current') }}</label>
      <input
        id="password-current"
        ref="currentInput"
        v-model="currentPassword"
        name="currentPassword"
        type="password"
        autocomplete="current-password"
        :disabled="unavailable"
        required
      />
      <label for="password-new">{{ t('identity.passwordChange.new') }}</label>
      <input
        id="password-new"
        ref="newInput"
        v-model="newPassword"
        name="newPassword"
        type="password"
        autocomplete="new-password"
        :disabled="unavailable"
        required
      />
      <label for="password-confirm">{{ t('identity.passwordChange.confirm') }}</label>
      <input
        id="password-confirm"
        ref="confirmationInput"
        v-model="confirmation"
        name="passwordConfirmation"
        type="password"
        autocomplete="new-password"
        :disabled="unavailable"
        required
      />
      <button type="submit" class="v1-btn" :disabled="unavailable" :aria-busy="unavailable">
        {{ busy ? t('identity.passwordChange.submitting') : t('identity.passwordChange.submit') }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.password-change {
  max-width: 720px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.password-change form {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}
.password-change input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.password-change button {
  justify-content: center;
  min-height: 42px;
  margin-top: 8px;
}
.password-change__policy {
  color: var(--fg-muted);
}
[role='alert'] {
  color: var(--danger);
}
</style>
