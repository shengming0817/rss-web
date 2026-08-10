<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useLocaleStore, useThemeStore } from '@rss/core'
import { identityErrorKey, type IdentityErrorKey } from './identity-error'
import { useIdentitySession } from './session-context'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { session, state } = useIdentitySession()
const themeStore = useThemeStore()
const localeStore = useLocaleStore()
const username = ref('')
const password = ref('')
const usernameInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()
const errorAlert = ref<HTMLElement>()
const errorKey = ref<IdentityErrorKey | 'identity.errors.required'>()
let operation: AbortController | undefined

const busy = computed(
  () => state.value.status === 'authenticating' || state.value.status === 'verifying',
)
const statusKey = computed(() =>
  state.value.status === 'verifying'
    ? 'identity.login.verifyingProfile'
    : 'identity.login.authenticating',
)
const noticeKey = computed(() => {
  if (route.query.notice === 'logout-unconfirmed') return 'identity.notice.logoutUnconfirmed'
  if (route.query.notice === 'signed-out') return 'identity.notice.signedOut'
  if (state.value.status === 'expired') return 'identity.notice.sessionExpired'
  return undefined
})
const themeLabel = computed(() =>
  themeStore.theme === 'light' ? t('shell.theme.dark') : t('shell.theme.light'),
)

async function submit(): Promise<void> {
  if (busy.value || operation !== undefined) return
  const normalizedUsername = username.value.trim()
  if (normalizedUsername.length === 0) {
    errorKey.value = 'identity.errors.required'
    usernameInput.value?.focus()
    return
  }
  if (password.value.length === 0) {
    errorKey.value = 'identity.errors.required'
    passwordInput.value?.focus()
    return
  }
  errorKey.value = undefined
  operation = new AbortController()
  const submittedPassword = password.value
  password.value = ''
  try {
    await session.login(
      { username: normalizedUsername, password: submittedPassword },
      { signal: operation.signal },
    )
    await router.replace({ name: 'home' })
  } catch (error: unknown) {
    errorKey.value = identityErrorKey(error)
    if (errorKey.value !== undefined) {
      await nextTick()
      errorAlert.value?.focus()
    }
  } finally {
    operation = undefined
  }
}

onBeforeUnmount(() => operation?.abort())
onMounted(() => void nextTick(() => usernameInput.value?.focus()))
</script>

<template>
  <main id="login-content" class="login" tabindex="-1">
    <section class="login__card" :aria-busy="busy">
      <div class="login__preferences">
        <button
          type="button"
          class="v1-ghost"
          :aria-label="t('shell.locale.toggle')"
          @click="localeStore.setLocale(localeStore.locale === 'zh-CN' ? 'en-US' : 'zh-CN')"
        >
          {{ localeStore.locale === 'zh-CN' ? 'English' : '中文' }}
        </button>
        <button
          type="button"
          class="v1-ghost"
          data-testid="theme-toggle"
          :aria-label="themeLabel"
          @click="themeStore.toggleTheme()"
        >
          {{ themeLabel }}
        </button>
      </div>
      <p class="login__eyebrow">{{ t('shell.brand') }}</p>
      <h1>{{ t('identity.login.title') }}</h1>
      <p class="login__subtitle">{{ t('identity.login.subtitle') }}</p>
      <p v-if="noticeKey" class="login__notice" role="status">{{ t(noticeKey) }}</p>
      <p v-if="errorKey" ref="errorAlert" class="login__error" role="alert" tabindex="-1">
        {{ t(errorKey) }}
      </p>
      <form class="login__form" novalidate @submit.prevent="submit">
        <div class="login__field">
          <label for="identity-username">{{ t('identity.login.username') }}</label>
          <input
            id="identity-username"
            ref="usernameInput"
            v-model="username"
            name="username"
            type="text"
            autocomplete="username"
            :disabled="busy"
            :aria-invalid="errorKey === 'identity.errors.required'"
            required
          />
        </div>
        <div class="login__field">
          <label for="identity-password">{{ t('identity.login.password') }}</label>
          <input
            id="identity-password"
            ref="passwordInput"
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            :disabled="busy"
            :aria-invalid="errorKey === 'identity.errors.required'"
            required
          />
        </div>
        <button class="v1-btn login__submit" type="submit" :disabled="busy">
          {{ busy ? t(statusKey) : t('identity.login.submit') }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg);
}
.login__card {
  width: min(100%, 420px);
  padding: 32px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--bg-raised);
  box-shadow: var(--shadow-lg);
}
.login__eyebrow {
  color: var(--accent);
  font-weight: 700;
  margin: 0 0 8px;
}
.login__preferences {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 16px;
}
.login h1 {
  margin: 0;
  color: var(--fg);
}
.login__subtitle {
  margin: 8px 0 24px;
  color: var(--fg-muted);
}
.login__notice,
.login__error {
  padding: 10px 12px;
  border-radius: var(--r-sm);
  margin: 0 0 16px;
}
.login__notice {
  background: var(--bg-hover);
  color: var(--fg-muted);
}
.login__error {
  border: 1px solid var(--danger);
  color: var(--danger);
}
.login__form,
.login__field {
  display: grid;
  gap: 8px;
}
.login__form {
  gap: 18px;
}
.login__field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.login__field input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.login__field input:focus-visible,
.login__error:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.login__submit {
  min-height: 42px;
  justify-content: center;
}
</style>
