<script setup lang="ts">
import { UiButton, UiTabs, UiDialog } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useAccountSecurity } from '../useAccountSecurity'
const { t } = useI18n()
const {
  session,
  host,
  busy,
  error,
  errorMessage,
  run,
  rows,
  next,
  current,
  tab,
  confirmAll,
  clearClosedSecrets,
  password,
  reauthPassword,
  linkPassword,
  providers,
  selectedProvider,
  owner,
  load,
  reloadSessions,
  stepUp,
  change,
  logout,
  reauthenticate,
  link,
  submitConfirmed,
  loginTarget,
} = useAccountSecurity()
</script>
<template>
  <section class="auth-page">
    <h1>{{ t('identity.sessions') }}</h1>
    <p v-if="session.logoutOutcome.value === 'unconfirmed'" role="alert">
      {{ t('identity.logoutUnconfirmed') }}
    </p>
    <p v-else-if="error" role="alert">{{ errorMessage }}</p>
    <p class="auth-muted">{{ t('identity.logoutHelp') }}</p>
    <UiTabs
      v-model="tab"
      :label="t('identity.sessions')"
      :items="[
        { value: 'sessions', label: t('identity.sessions') },
        { value: 'security', label: t('identity.authentication') },
      ]"
      keep-mounted
      ><template #sessions
        ><div class="auth-actions">
          <UiButton :disabled="!!busy" type="submit" @click="run(reloadSessions)">{{
            t('identity.reload')
          }}</UiButton
          ><UiButton :disabled="!!(busy || !owner)" type="submit" @click="logout(false)">{{
            t('identity.logout')
          }}</UiButton
          ><UiButton :disabled="!!(busy || !owner)" type="submit" @click="confirmAll = true">
            {{ t('identity.logoutAll') }}
          </UiButton>
          <RouterLink
            v-if="session.logoutOutcome.value === 'unconfirmed' && !owner"
            :to="loginTarget(session.state.value.tenant, host)"
          >
            {{ t('identity.login') }}
          </RouterLink>
        </div>
        <div class="auth-table">
          <div class="ui-table-scroll">
            <table class="ui-table">
              <thead>
                <tr>
                  <th>{{ t('identity.session') }}</th>
                  <th>{{ t('identity.expires') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>
                    {{ row.id }}
                    <span v-if="row.id === session.state.value.session?.id"
                      >({{ t('identity.current') }})</span
                    >
                  </td>
                  <td>{{ new Date(row.idleExpiresAt * 1000).toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <UiButton
          v-if="next"
          :disabled="!!busy"
          type="submit"
          @click="run(() => load(next ?? undefined))"
        >
          {{ t('identity.more') }}
        </UiButton></template
      ><template #security
        ><section v-if="session.config.oidcEnabled" aria-labelledby="security-title">
          <h2 id="security-title">{{ t('identity.authentication') }}</h2>
          <template v-if="session.state.value.security">
            <p>
              {{ t('identity.authenticationSource') }}:
              {{ t('identity.' + session.state.value.security.authentication.source) }}
            </p>
            <p>
              {{ t('identity.authTime') }}:
              {{
                session.state.value.security.authentication.authTime === null
                  ? t('identity.noAuthTime')
                  : new Date(
                      session.state.value.security.authentication.authTime * 1000,
                    ).toLocaleString()
              }}
            </p>
            <p>
              {{ t('identity.strength') }}:
              {{ t('identity.' + session.state.value.security.authentication.acr) }}
            </p>
            <p>
              {{ t('identity.methods') }}:
              {{
                session.state.value.security.authentication.amr
                  .map((m) => t('identity.method_' + m))
                  .join(' · ') || t('identity.noMethods')
              }}
            </p>
            <p v-if="!session.state.value.security.eligibleStepUpProviders.length">
              {{ t('identity.noStepUp') }}
            </p>
            <UiButton
              v-for="p in session.state.value.security.eligibleStepUpProviders"
              :key="p.providerId"
              :disabled="!!busy"
              type="submit"
              @click="stepUp(p.providerId)"
            >
              {{ t('identity.stepUp') }} · {{ p.label }}
            </UiButton>
          </template>
          <UiButton
            :disabled="!!(busy || !owner)"
            type="submit"
            @click="run(() => session.loadSecurity())"
          >
            {{ t('identity.reloadSecurity') }}
          </UiButton>
        </section>
        <details
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.changePassword') }}</summary>
          <form @submit.prevent="change">
            <h2>{{ t('identity.changePassword') }}</h2>
            <label for="current-password">{{ t('identity.currentPassword') }}</label
            ><input
              id="current-password"
              v-model="current"
              class="ui-input"
              type="password"
              autocomplete="current-password"
              required
            /><label for="new-password">{{ t('identity.newPassword') }}</label
            ><input
              id="new-password"
              v-model="password"
              class="ui-input"
              type="password"
              autocomplete="new-password"
              minlength="15"
              required
            /><UiButton type="submit" :disabled="!!busy">{{
              t('identity.changePassword')
            }}</UiButton>
          </form>
        </details>
        <details
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.reauthenticate') }}</summary>
          <form @submit.prevent="reauthenticate">
            <h2>{{ t('identity.reauthenticate') }}</h2>
            <label for="reauth-password">{{ t('identity.currentPassword') }}</label>
            <input
              id="reauth-password"
              v-model="reauthPassword"
              class="ui-input"
              type="password"
              autocomplete="current-password"
              required
            />
            <UiButton :disabled="!!busy" type="submit">{{ t('identity.reauthenticate') }}</UiButton>
          </form>
        </details>
        <details
          v-if="session.config.oidcEnabled && providers.length"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.linkProvider') }}</summary>
          <form @submit.prevent="link">
            <h2>{{ t('identity.linkProvider') }}</h2>
            <label for="link-provider">{{ t('identity.providers') }}</label>
            <select id="link-provider" v-model="selectedProvider" class="ui-input" required>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
            <template v-if="session.state.value.identity?.hasLocalPassword">
              <label for="link-password">{{ t('identity.currentPassword') }}</label>
              <input
                id="link-password"
                v-model="linkPassword"
                class="ui-input"
                type="password"
                autocomplete="current-password"
                required
              />
            </template>
            <UiButton :disabled="!!busy" type="submit">{{ t('identity.linkProvider') }}</UiButton>
          </form>
        </details></template
      ></UiTabs
    >
    <UiDialog
      :open="confirmAll"
      :title="t('identity.logoutAll')"
      :description="t('identity.logoutHelp')"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="confirmAll = $event"
      ><template #footer
        ><UiButton :disabled="busy || !owner" @click="submitConfirmed">{{
          t('identity.confirm')
        }}</UiButton></template
      ></UiDialog
    >
  </section>
</template>
