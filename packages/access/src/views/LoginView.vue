<script setup lang="ts">
/**
 * LoginView — username + password → POST /sessions/login (via authStore.login).
 *
 * Full-screen standalone layout (rendered outside AppShell). Error handling is
 * oracle-safe: the backend returns a uniform ERR_AUTH_LOGIN_FAILED for any
 * credential failure, and we surface only its i18n key — never a field-specific
 * "wrong password" hint that would leak account existence (PRD R3 / §8.3).
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { isGoCellRequestError } from '@gocell/request'
import { useAuthStore } from '../stores/useAuthStore'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorKey = ref<string | null>(null)
const usernameInput = ref<HTMLInputElement | null>(null)

const sessionExpired = computed(() => route.query.reason === 'expired')
const canSubmit = computed(
  () => username.value.length > 0 && password.value.length > 0 && !loading.value,
)

onMounted(() => usernameInput.value?.focus())

/**
 * Open-redirect guard: only honour same-origin, root-relative paths. Absolute
 * (`https://evil.com`) and protocol-relative (`//evil.com`) targets fall back
 * to `/` so a crafted `?redirect=` cannot bounce the user off-site post-login.
 */
function safeRedirect(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  loading.value = true
  errorKey.value = null
  try {
    await auth.login({ username: username.value, password: password.value })
    await router.push(safeRedirect(route.query.redirect))
  } catch (err: unknown) {
    errorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__brand">
        <span class="login__brand-mark" aria-hidden="true">G</span>
        <span class="login__brand-name">{{ t('access.login.brand') }}</span>
      </div>
      <h1 class="login__title">{{ t('access.login.title') }}</h1>
      <p class="login__subtitle">{{ t('access.login.subtitle') }}</p>

      <p v-if="sessionExpired" class="login__notice" role="status">
        {{ t('access.login.sessionExpired') }}
      </p>

      <form class="login__form" novalidate @submit.prevent="onSubmit">
        <div class="login__field">
          <label class="login__label" for="login-username">{{
            t('access.login.username.label')
          }}</label>
          <input
            id="login-username"
            ref="usernameInput"
            v-model="username"
            class="login__input"
            type="text"
            autocomplete="username"
            :placeholder="t('access.login.username.placeholder')"
            :aria-invalid="!!errorKey || undefined"
            :aria-describedby="errorKey ? 'login-error' : undefined"
          />
        </div>

        <div class="login__field">
          <label class="login__label" for="login-password">{{
            t('access.login.password.label')
          }}</label>
          <div class="login__pw">
            <input
              id="login-password"
              v-model="password"
              class="login__input login__input--pw"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              :placeholder="t('access.login.password.placeholder')"
              :aria-invalid="!!errorKey || undefined"
              :aria-describedby="errorKey ? 'login-error' : undefined"
            />
            <button
              type="button"
              class="login__pw-toggle"
              :aria-pressed="showPassword"
              :aria-label="
                showPassword ? t('access.login.passwordHide') : t('access.login.passwordShow')
              "
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? t('access.login.passwordHide') : t('access.login.passwordShow') }}
            </button>
          </div>
        </div>

        <!-- Persistent live region (not v-if): the alert node must exist before
             its text changes so screen readers reliably re-announce, incl. a
             repeated identical error on a second failed submit. -->
        <p id="login-error" class="login__error" role="alert" aria-live="assertive">
          {{ errorKey ? t(errorKey) : '' }}
        </p>

        <button type="submit" class="login__submit" :disabled="!canSubmit" :aria-busy="loading">
          {{ loading ? t('access.login.submitPending') : t('access.login.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg-sunken);
}

.login__card {
  width: 100%;
  max-width: 380px;
  padding: 32px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
}

.login__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.login__brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  background: var(--fg);
  color: var(--bg);
  font-family: var(--font-serif);
  font-size: 16px;
}

.login__brand-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg-muted);
  letter-spacing: 0.02em;
}

.login__title {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
  color: var(--fg);
}

.login__subtitle {
  margin: 0 0 24px;
  font-size: 13px;
  color: var(--fg-muted);
}

.login__notice {
  margin: 0 0 16px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login__label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.login__input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  font-size: 13px;
  color: var(--fg);
  transition: border-color 0.15s;
}

.login__input::placeholder {
  color: var(--fg-faint);
}

.login__input:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.login__pw {
  position: relative;
  display: flex;
  align-items: center;
}

.login__input--pw {
  padding-right: 56px;
}

.login__pw-toggle {
  position: absolute;
  right: 6px;
  height: 30px;
  padding: 0 8px;
  font-size: 11.5px;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-radius: var(--r-sm);
  cursor: pointer;
}

.login__pw-toggle:hover {
  color: var(--fg);
  background: var(--line-soft);
}

.login__pw-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.login__error {
  margin: 0;
  font-size: 12.5px;
  color: var(--err);
}

.login__submit {
  height: 38px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--bg);
  background: var(--fg);
  border: 1px solid var(--fg);
  border-radius: var(--r);
  cursor: pointer;
  transition: opacity 0.15s;
}

.login__submit:hover:not(:disabled) {
  background: oklch(from var(--fg) calc(l + 0.08) c h);
}

.login__submit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.login__submit:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .login__input,
  .login__submit {
    transition: none;
  }
}
</style>
