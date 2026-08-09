<script setup lang="ts">
/**
 * FirstRunSetupView — first-run admin bootstrap wizard.
 *
 * Five steps (Preflight → Two planes → Operator → Admin → Submit → Done) that
 * port docs/design/.../first-run-setup.jsx to the real backend: the simulated
 * env probes / response-scenario switcher / debug aside are dropped; what
 * remains drives an actual POST /setup/admin (operator Basic Auth header +
 * admin JSON body, the two identity planes).
 *
 * On mount we GET setup/status; an already-provisioned system (hasAdmin) or a
 * 410 on submit silently redirects to /login (PRD R9 — no first-run oracle).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { isGoCellRequestError } from '@gocell/request'
import { createAdmin, fetchSetupStatus, SETUP_ADMIN_URL } from '../api/setup'
import { useSetupWizard, type SetupStep } from '../composables/useSetupWizard'
import {
  pwChecks,
  pwScore,
  passwordStrength,
  validateAdmin,
  validateOperator,
} from '../lib/validation'

const { t } = useI18n()
const router = useRouter()
const wizard = useSetupWizard()

type CheckState = 'checking' | 'ready' | 'failed'
const checkState = ref<CheckState>('checking')
const submitting = ref(false)
const submitErrorKey = ref<string | null>(null)
const showOpPassword = ref(false)
const showAdminPassword = ref(false)
const stepHeading = ref<HTMLElement | null>(null)

// a11y: on each step change move focus to the step heading so screen-reader
// users get the new-context signal (SPA soft-navigation pattern).
watch(
  () => wizard.currentStep.value,
  () => void nextTick(() => stepHeading.value?.focus()),
)

const opErrors = computed(() => validateOperator(wizard.operator))
const adminErrors = computed(() => validateAdmin(wizard.admin))
const adminChecks = computed(() => pwChecks(wizard.admin.password))
const adminStrength = computed(() => passwordStrength(pwScore(adminChecks.value)))
const strengthBars = computed(() => {
  const score = pwScore(adminChecks.value)
  return Array.from({ length: 5 }, (_, i) => (i < score ? adminStrength.value : null))
})
const checkRows = computed(() => [
  { key: 'len', ok: adminChecks.value.len },
  { key: 'ctrl', ok: adminChecks.value.ctrl },
  { key: 'case', ok: adminChecks.value.case },
  { key: 'num', ok: adminChecks.value.num },
  { key: 'sym', ok: adminChecks.value.sym },
])

/** Illustrative wire preview — password is masked, never the real value. */
const maskedBody = computed(() =>
  JSON.stringify(
    {
      username: wizard.admin.username || '<admin>',
      email: wizard.admin.email || '<admin@corp.example>',
      password: '••••••••',
    },
    null,
    2,
  ),
)

onMounted(async () => {
  try {
    const hasAdmin = await fetchSetupStatus()
    if (hasAdmin) {
      await router.replace('/login')
      return
    }
    checkState.value = 'ready'
  } catch {
    checkState.value = 'failed'
  }
})

async function onSubmit(): Promise<void> {
  submitting.value = true
  submitErrorKey.value = null
  try {
    await createAdmin(
      { username: wizard.operator.username, password: wizard.operator.password },
      {
        username: wizard.admin.username,
        email: wizard.admin.email,
        password: wizard.admin.password,
      },
    )
    wizard.complete()
  } catch (err: unknown) {
    if (isGoCellRequestError(err) && err.response?.status === 410) {
      // First-run window already closed — silent redirect, no oracle (R9).
      await router.replace('/login')
      return
    }
    submitErrorKey.value = isGoCellRequestError(err)
      ? (err.i18nKey ?? 'errors.unknown')
      : 'errors.unknown'
  } finally {
    submitting.value = false
  }
}

function goLogin(): void {
  void router.push('/login')
}

/** Enter inside a credential step submits its form → advance when the step is valid. */
function onStepEnter(): void {
  if (wizard.canGoNext.value) wizard.goNext()
}

function stepMark(step: SetupStep, index: number): string {
  return wizard.isStepDone(step) ? '✓' : String(index)
}
</script>

<template>
  <div class="frs">
    <!-- status gate -->
    <p v-if="checkState === 'checking'" class="frs__status" role="status">
      {{ t('access.firstRun.checking') }}
    </p>
    <p v-else-if="checkState === 'failed'" class="frs__status frs__status--err" role="alert">
      {{ t('access.firstRun.checkFailed') }}
    </p>

    <div v-else class="wizard">
      <!-- step nav -->
      <nav class="wizard__nav" :aria-label="t('access.firstRun.stepsNav')">
        <div class="wizard__brand">
          <span class="wizard__brand-mark" aria-hidden="true">G</span>
          <span class="wizard__brand-name">{{ t('access.firstRun.brand') }}</span>
          <span class="wizard__brand-tag">{{ t('access.firstRun.brandTag') }}</span>
        </div>
        <ul class="wizard__steps">
          <li v-for="(step, i) in wizard.steps" :key="step">
            <button
              type="button"
              class="wizard__step"
              :aria-current="wizard.currentStep.value === step ? 'step' : undefined"
              :data-done="wizard.isStepDone(step) || undefined"
              :disabled="!wizard.isStepAccessible(step)"
              @click="wizard.goTo(step)"
            >
              <span class="wizard__step-mark" aria-hidden="true">{{ stepMark(step, i) }}</span>
              <span class="wizard__step-label">{{ t(`access.firstRun.steps.${step}.nav`) }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <!-- main -->
      <main class="wizard__main">
        <p class="wizard__eyebrow">
          {{ t(`access.firstRun.steps.${wizard.currentStep.value}.eyebrow`) }}
        </p>
        <h1 ref="stepHeading" tabindex="-1" class="wizard__title">
          {{ t(`access.firstRun.steps.${wizard.currentStep.value}.title`) }}
        </h1>
        <p class="wizard__deck">
          {{ t(`access.firstRun.steps.${wizard.currentStep.value}.deck`) }}
        </p>

        <!-- Preflight -->
        <section v-if="wizard.currentStep.value === 'preflight'" class="frs-card">
          <h2 class="frs-card__h">{{ t('access.firstRun.preflight.needsSetupTitle') }}</h2>
          <p class="frs-card__body">{{ t('access.firstRun.preflight.needsSetupBody') }}</p>
          <p class="frs-card__h frs-card__h--sub">
            {{ t('access.firstRun.preflight.envReminderTitle') }}
          </p>
          <ul class="frs-reminders">
            <li>
              <code>{{ t('access.firstRun.preflight.envReminderItem1') }}</code>
            </li>
            <li>
              <code>{{ t('access.firstRun.preflight.envReminderItem2') }}</code>
            </li>
          </ul>
        </section>

        <!-- Two planes -->
        <section v-else-if="wizard.currentStep.value === 'planes'" class="frs-planes">
          <div class="frs-plane">
            <span class="frs-plane__tag">{{ t('access.firstRun.planes.operatorTag') }}</span>
            <h2 class="frs-plane__title">{{ t('access.firstRun.planes.operatorTitle') }}</h2>
            <p class="frs-plane__desc">{{ t('access.firstRun.planes.operatorDesc') }}</p>
          </div>
          <div class="frs-plane">
            <span class="frs-plane__tag">{{ t('access.firstRun.planes.adminTag') }}</span>
            <h2 class="frs-plane__title">{{ t('access.firstRun.planes.adminTitle') }}</h2>
            <p class="frs-plane__desc">{{ t('access.firstRun.planes.adminDesc') }}</p>
          </div>
          <div class="frs-card frs-planes__why">
            <h2 class="frs-card__h">{{ t('access.firstRun.planes.whyTitle') }}</h2>
            <p class="frs-card__body">{{ t('access.firstRun.planes.whyBody') }}</p>
          </div>
        </section>

        <!-- Operator credentials -->
        <form
          v-else-if="wizard.currentStep.value === 'operator'"
          class="frs-card"
          novalidate
          @submit.prevent="onStepEnter"
        >
          <div class="frs-field">
            <label class="frs-label" for="op-username">{{
              t('access.firstRun.operator.username.label')
            }}</label>
            <input
              id="op-username"
              v-model="wizard.operator.username"
              class="frs-input"
              type="text"
              autocomplete="off"
              :placeholder="t('access.firstRun.operator.username.placeholder')"
              :aria-invalid="!!(wizard.operator.username && opErrors.username) || undefined"
              :aria-describedby="
                wizard.operator.username && opErrors.username ? 'op-username-err' : undefined
              "
            />
            <p
              v-if="wizard.operator.username && opErrors.username"
              id="op-username-err"
              class="frs-help frs-help--err"
            >
              {{ t(opErrors.username) }}
            </p>
            <p class="frs-help frs-help--hint">{{ t('access.firstRun.operator.username.hint') }}</p>
          </div>

          <div class="frs-field">
            <label class="frs-label" for="op-password">{{
              t('access.firstRun.operator.password.label')
            }}</label>
            <div class="frs-pw">
              <input
                id="op-password"
                v-model="wizard.operator.password"
                class="frs-input frs-input--pw"
                :type="showOpPassword ? 'text' : 'password'"
                autocomplete="off"
                :placeholder="t('access.firstRun.operator.password.placeholder')"
                :aria-invalid="!!(wizard.operator.password && opErrors.password) || undefined"
                :aria-describedby="
                  wizard.operator.password && opErrors.password ? 'op-password-err' : undefined
                "
              />
              <button
                type="button"
                class="frs-pw__toggle"
                :aria-pressed="showOpPassword"
                :aria-label="
                  showOpPassword
                    ? t('access.firstRun.operator.passwordHide')
                    : t('access.firstRun.operator.passwordShow')
                "
                @click="showOpPassword = !showOpPassword"
              >
                {{
                  showOpPassword
                    ? t('access.firstRun.operator.passwordHide')
                    : t('access.firstRun.operator.passwordShow')
                }}
              </button>
            </div>
            <p
              v-if="wizard.operator.password && opErrors.password"
              id="op-password-err"
              class="frs-help frs-help--err"
            >
              {{ t(opErrors.password) }}
            </p>
            <p class="frs-help frs-help--hint">{{ t('access.firstRun.operator.password.hint') }}</p>
          </div>
          <p class="frs-help">{{ t('access.firstRun.operator.trimNote') }}</p>
          <!-- Enables Enter-to-advance for this multi-input step; visible Next button lives in the shared action bar. -->
          <button
            type="submit"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            :disabled="!wizard.canGoNext.value"
          >
            {{ t('access.firstRun.nextBtn') }}
          </button>
        </form>

        <!-- Admin identity -->
        <form
          v-else-if="wizard.currentStep.value === 'admin'"
          class="frs-card"
          novalidate
          @submit.prevent="onStepEnter"
        >
          <div class="frs-field-pair">
            <div class="frs-field">
              <label class="frs-label" for="admin-username">{{
                t('access.firstRun.admin.username.label')
              }}</label>
              <input
                id="admin-username"
                v-model="wizard.admin.username"
                class="frs-input"
                type="text"
                autocomplete="off"
                :placeholder="t('access.firstRun.admin.username.placeholder')"
                :aria-invalid="!!(wizard.admin.username && adminErrors.username) || undefined"
                :aria-describedby="
                  wizard.admin.username && adminErrors.username ? 'admin-username-err' : undefined
                "
              />
              <p
                v-if="wizard.admin.username && adminErrors.username"
                id="admin-username-err"
                class="frs-help frs-help--err"
              >
                {{ t(adminErrors.username) }}
              </p>
            </div>
            <div class="frs-field">
              <label class="frs-label" for="admin-email">{{
                t('access.firstRun.admin.email.label')
              }}</label>
              <input
                id="admin-email"
                v-model="wizard.admin.email"
                class="frs-input"
                type="email"
                autocomplete="email"
                :placeholder="t('access.firstRun.admin.email.placeholder')"
                :aria-invalid="!!(wizard.admin.email && adminErrors.email) || undefined"
                :aria-describedby="
                  wizard.admin.email && adminErrors.email ? 'admin-email-err' : undefined
                "
              />
              <p
                v-if="wizard.admin.email && adminErrors.email"
                id="admin-email-err"
                class="frs-help frs-help--err"
              >
                {{ t(adminErrors.email) }}
              </p>
            </div>
          </div>

          <div class="frs-field">
            <label class="frs-label" for="admin-password">{{
              t('access.firstRun.admin.password.label')
            }}</label>
            <div class="frs-pw">
              <input
                id="admin-password"
                v-model="wizard.admin.password"
                class="frs-input frs-input--pw"
                :type="showAdminPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('access.firstRun.admin.password.placeholder')"
                :aria-invalid="!!(wizard.admin.password && adminErrors.password) || undefined"
                :aria-describedby="
                  wizard.admin.password && adminErrors.password ? 'admin-password-err' : undefined
                "
              />
              <button
                type="button"
                class="frs-pw__toggle"
                :aria-pressed="showAdminPassword"
                :aria-label="
                  showAdminPassword
                    ? t('access.firstRun.admin.passwordHide')
                    : t('access.firstRun.admin.passwordShow')
                "
                @click="showAdminPassword = !showAdminPassword"
              >
                {{
                  showAdminPassword
                    ? t('access.firstRun.admin.passwordHide')
                    : t('access.firstRun.admin.passwordShow')
                }}
              </button>
            </div>
            <p
              v-if="wizard.admin.password && adminErrors.password"
              id="admin-password-err"
              class="frs-help frs-help--err"
            >
              {{ t(adminErrors.password) }}
            </p>
            <div class="frs-pw-bars" aria-hidden="true">
              <span
                v-for="(band, i) in strengthBars"
                :key="i"
                class="frs-pw-bar"
                :data-on="band || undefined"
              />
            </div>
            <p class="sr-only" aria-live="polite">
              {{ t('access.firstRun.admin.strength.label') }}:
              {{ t(`access.firstRun.admin.strength.${adminStrength}`) }}
            </p>
            <ul class="frs-pw-checks">
              <li v-for="row in checkRows" :key="row.key" :data-ok="row.ok || undefined">
                {{ t(`access.firstRun.admin.checks.${row.key}`) }}
                <!-- non-color state for screen readers (WCAG 1.4.1) -->
                <span class="sr-only">{{
                  row.ok
                    ? t('access.firstRun.admin.checkMet')
                    : t('access.firstRun.admin.checkUnmet')
                }}</span>
              </li>
            </ul>
            <p class="frs-help frs-help--hint">{{ t('access.firstRun.admin.password.hint') }}</p>
          </div>

          <div class="frs-field">
            <label class="frs-label" for="admin-confirm">{{
              t('access.firstRun.admin.confirm.label')
            }}</label>
            <input
              id="admin-confirm"
              v-model="wizard.admin.confirm"
              class="frs-input"
              type="password"
              autocomplete="new-password"
              :aria-invalid="!!(wizard.admin.confirm && adminErrors.confirm) || undefined"
              :aria-describedby="
                wizard.admin.confirm && adminErrors.confirm ? 'admin-confirm-err' : undefined
              "
            />
            <p
              v-if="wizard.admin.confirm && adminErrors.confirm"
              id="admin-confirm-err"
              class="frs-help frs-help--err"
            >
              {{ t(adminErrors.confirm) }}
            </p>
          </div>
          <!-- Enables Enter-to-advance for this multi-input step; visible Next button lives in the shared action bar. -->
          <button
            type="submit"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            :disabled="!wizard.canGoNext.value"
          >
            {{ t('access.firstRun.nextBtn') }}
          </button>
        </form>

        <!-- Submit -->
        <section v-else-if="wizard.currentStep.value === 'submit'" class="frs-card">
          <h2 class="frs-card__h">
            {{ t('access.firstRun.submit.reviewTitle') }}
            <span class="frs-tag">{{ t('access.firstRun.submit.reviewTag') }}</span>
          </h2>
          <pre
            class="frs-wire"
          ><span class="frs-wire__method">{{ t('access.firstRun.submit.wireMethod') }}</span> {{ SETUP_ADMIN_URL }}
{{ t('access.firstRun.submit.wireAuthorization') }}
{{ t('access.firstRun.submit.wireContentType') }}

{{ maskedBody }}</pre>
          <!-- Persistent live region (not v-if) — see LoginView for the rationale. -->
          <p class="frs-help frs-help--err frs-submit-err" role="alert" aria-live="assertive">
            {{ submitErrorKey ? t(submitErrorKey) : '' }}
          </p>
        </section>

        <!-- Done -->
        <section v-else class="frs-card">
          <span class="frs-done-badge">{{ t('access.firstRun.done.badge') }}</span>
          <p class="frs-card__body">{{ t('access.firstRun.done.body') }}</p>
        </section>

        <!-- actions -->
        <div class="wizard__actions">
          <button
            v-if="wizard.currentStep.value !== 'preflight' && wizard.currentStep.value !== 'done'"
            type="button"
            class="wizard__btn wizard__back"
            @click="wizard.goBack()"
          >
            {{ t('access.firstRun.backBtn') }}
          </button>
          <span class="wizard__actions-sep" />
          <button
            v-if="wizard.currentStep.value === 'submit'"
            type="button"
            class="wizard__btn wizard__btn--primary wizard__submit"
            :disabled="submitting"
            :aria-busy="submitting"
            @click="onSubmit()"
          >
            {{
              submitting
                ? t('access.firstRun.submit.submitPending')
                : t('access.firstRun.submit.submitBtn')
            }}
          </button>
          <button
            v-else-if="wizard.currentStep.value === 'done'"
            type="button"
            class="wizard__btn wizard__btn--primary wizard__login"
            @click="goLogin()"
          >
            {{ t('access.firstRun.done.loginBtn') }}
          </button>
          <button
            v-else
            type="button"
            class="wizard__btn wizard__btn--primary wizard__next"
            :disabled="!wizard.canGoNext.value"
            @click="wizard.goNext()"
          >
            {{ t('access.firstRun.nextBtn') }}
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.frs {
  min-height: 100vh;
  background: var(--bg-sunken);
}

.frs__status {
  padding: 48px 24px;
  text-align: center;
  font-size: 14px;
  color: var(--fg-muted);
}

.frs__status--err {
  color: var(--err);
}

.wizard {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

/* ---- nav ---- */
.wizard__nav {
  padding: 28px 20px;
  border-right: 1px solid var(--line);
  background: var(--bg);
}

.wizard__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.wizard__brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r-sm);
  background: var(--fg);
  color: var(--bg);
  font-family: var(--font-serif);
}

.wizard__brand-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg);
}

.wizard__brand-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  color: var(--warn);
  border: 1px solid var(--line);
}

.wizard__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wizard__step {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: var(--r);
  text-align: left;
  cursor: pointer;
  color: var(--fg-muted);
}

.wizard__step:hover:not(:disabled) {
  background: var(--line-soft);
}

.wizard__step[aria-current='step'] {
  background: var(--bg-sunken);
  color: var(--fg);
}

.wizard__step:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.wizard__step:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.wizard__step-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--r-pill);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 11px;
}

.wizard__step[data-done] .wizard__step-mark {
  background: var(--ok);
  color: var(--bg);
  border-color: var(--ok);
}

.wizard__step-label {
  font-size: 13px;
}

/* ---- main ---- */
.wizard__main {
  padding: 48px 56px;
  max-width: 720px;
}

.wizard__eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--fg-faint);
  margin: 0 0 8px;
}

.wizard__title {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
  color: var(--fg);
}

.wizard__deck {
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--fg-muted);
}

/* ---- cards / fields ---- */
.frs-card {
  padding: 20px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}

.frs-card__h {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--fg);
}

.frs-card__h--sub {
  margin-top: 16px;
}

.frs-card__body {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--fg-muted);
}

.frs-reminders {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--fg-muted);
}

.frs-reminders code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg);
}

.frs-planes {
  display: grid;
  gap: 14px;
}

.frs-plane {
  padding: 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}

.frs-plane__tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-faint);
}

.frs-plane__title {
  font-size: 15px;
  font-weight: 600;
  margin: 4px 0 6px;
  color: var(--fg);
}

.frs-plane__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--fg-muted);
}

.frs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.frs-field-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.frs-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg);
}

.frs-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  font-size: 13px;
  color: var(--fg);
}

.frs-input::placeholder {
  color: var(--fg-faint);
}

.frs-input:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.frs-input[aria-invalid='true'] {
  border-color: var(--err);
}

.frs-pw {
  position: relative;
  display: flex;
  align-items: center;
}

.frs-input--pw {
  padding-right: 56px;
}

.frs-pw__toggle {
  position: absolute;
  right: 6px;
  height: 30px;
  padding: 0 8px;
  font-size: 11px;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-radius: var(--r-sm);
  cursor: pointer;
}

.frs-pw__toggle:hover {
  color: var(--fg);
  background: var(--line-soft);
}

.frs-pw__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.frs-help {
  margin: 0;
  font-size: 11.5px;
  color: var(--fg-muted);
}

.frs-help--hint {
  font-family: var(--font-mono);
  color: var(--fg-faint);
}

.frs-help--err {
  color: var(--err);
}

.frs-submit-err {
  margin-top: 12px;
  font-size: 12.5px;
}

.frs-pw-bars {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.frs-pw-bar {
  height: 3px;
  flex: 1;
  border-radius: var(--r-sm);
  background: var(--line);
}

.frs-pw-bar[data-on='weak'] {
  background: var(--err);
}

.frs-pw-bar[data-on='mid'] {
  background: var(--warn);
}

.frs-pw-bar[data-on='strong'] {
  background: var(--ok);
}

.frs-pw-checks {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0 0;
  padding: 0;
  font-size: 11.5px;
  color: var(--fg-faint);
}

.frs-pw-checks li[data-ok] {
  color: var(--ok);
}

.frs-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  color: var(--fg-faint);
  border: 1px solid var(--line);
}

.frs-wire {
  margin: 0;
  padding: 14px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg-muted);
  white-space: pre-wrap;
  word-break: break-all;
}

.frs-wire__method {
  color: var(--ok);
  font-weight: 600;
}

.frs-done-badge {
  display: inline-block;
  margin-bottom: 12px;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--ok);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ok);
}

/* ---- actions ---- */
.wizard__actions {
  display: flex;
  align-items: center;
  margin-top: 24px;
}

.wizard__actions-sep {
  flex: 1;
}

.wizard__btn {
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.wizard__btn:hover:not(:disabled) {
  border-color: var(--fg-faint);
}

.wizard__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.wizard__btn--primary {
  color: var(--bg);
  background: var(--fg);
  border-color: var(--fg);
}

.wizard__btn--primary:hover:not(:disabled) {
  background: oklch(from var(--fg) calc(l + 0.08) c h);
}

.wizard__btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .wizard {
    grid-template-columns: 1fr;
  }
  .wizard__nav {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .wizard__main {
    padding: 32px 24px;
  }
}
</style>
