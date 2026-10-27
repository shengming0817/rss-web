<script setup lang="ts">
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VSelect,
  VTab,
  VTable,
  VTabs,
  VTextField,
  VWindow,
  VWindowItem,
} from 'vuetify/components'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountSecurity } from '../useAccountSecurity'
const pageId = useId()
const dialogActivator = ref<HTMLElement>()
function rememberActivator(event: MouseEvent) {
  dialogActivator.value = event.currentTarget as HTMLElement
}
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
    <VTabs v-model="tab" :aria-label="t('identity.sessions')"
      ><VTab
        :id="`${pageId}-tab-sessions`"
        :aria-controls="`${pageId}-panel-sessions`"
        value="sessions"
        >{{ t('identity.sessions') }}</VTab
      ><VTab
        :id="`${pageId}-tab-security`"
        :aria-controls="`${pageId}-panel-security`"
        value="security"
        >{{ t('identity.authentication') }}</VTab
      ></VTabs
    ><VWindow v-model="tab"
      ><VWindowItem
        :id="`${pageId}-panel-sessions`"
        role="tabpanel"
        :aria-labelledby="`${pageId}-tab-sessions`"
        value="sessions"
        eager
        ><div class="auth-actions">
          <VBtn :disabled="!!busy" type="submit" @click="run(reloadSessions)">{{
            t('identity.reload')
          }}</VBtn
          ><VBtn :disabled="!!(busy || !owner)" type="submit" @click="logout(false)">{{
            t('identity.logout')
          }}</VBtn
          ><VBtn
            :disabled="!!(busy || !owner)"
            type="submit"
            @click="
              rememberActivator($event)
              confirmAll = true
            "
          >
            {{ t('identity.logoutAll') }}
          </VBtn>
          <RouterLink
            v-if="session.logoutOutcome.value === 'unconfirmed' && !owner"
            :to="loginTarget(session.state.value.tenant, host)"
          >
            {{ t('identity.login') }}
          </RouterLink>
        </div>
        <div class="auth-table">
          <div class="auth-table-scroll">
            <VTable>
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
            </VTable>
          </div>
        </div>
        <VBtn
          v-if="next"
          :disabled="!!busy"
          type="submit"
          @click="run(() => load(next ?? undefined))"
        >
          {{ t('identity.more') }}
        </VBtn></VWindowItem
      ><VWindowItem
        :id="`${pageId}-panel-security`"
        role="tabpanel"
        :aria-labelledby="`${pageId}-tab-security`"
        value="security"
        eager
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
            <VBtn
              v-for="p in session.state.value.security.eligibleStepUpProviders"
              :key="p.providerId"
              :disabled="!!busy"
              type="submit"
              @click="stepUp(p.providerId)"
            >
              {{ t('identity.stepUp') }} · {{ p.label }}
            </VBtn>
          </template>
          <VBtn
            :disabled="!!(busy || !owner)"
            type="submit"
            @click="run(() => session.loadSecurity())"
          >
            {{ t('identity.reloadSecurity') }}
          </VBtn>
        </section>
        <details
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.changePassword') }}</summary>
          <form @submit.prevent="change">
            <h2>{{ t('identity.changePassword') }}</h2>
            <VTextField
              id="current-password"
              v-model="current"
              type="password"
              autocomplete="current-password"
              required
              :label="t('identity.currentPassword')"
            /><VTextField
              id="new-password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="15"
              required
              :label="t('identity.newPassword')"
            /><VBtn type="submit" :disabled="!!busy">{{ t('identity.changePassword') }}</VBtn>
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

            <VTextField
              id="reauth-password"
              v-model="reauthPassword"
              type="password"
              autocomplete="current-password"
              required
              :label="t('identity.currentPassword')"
            />
            <VBtn :disabled="!!busy" type="submit">{{ t('identity.reauthenticate') }}</VBtn>
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

            <VSelect
              id="link-provider"
              v-model="selectedProvider"
              :items="providers"
              item-title="label"
              item-value="id"
              :label="t('identity.providers')"
              required
            />
            <template v-if="session.state.value.identity?.hasLocalPassword">
              <VTextField
                id="link-password"
                v-model="linkPassword"
                type="password"
                autocomplete="current-password"
                required
                :label="t('identity.currentPassword')"
              />
            </template>
            <VBtn :disabled="!!busy" type="submit">{{ t('identity.linkProvider') }}</VBtn>
          </form>
        </details></VWindowItem
      ></VWindow
    >
    <VDialog
      :model-value="confirmAll"
      :activator="dialogActivator"
      :open-on-click="false"
      :persistent="true"
      :aria-label="t('identity.logoutAll')"
      :aria-describedby="`${pageId}-1`"
      role="alertdialog"
      @update:model-value="confirmAll = $event"
      @keydown.esc.stop="!busy && (confirmAll = false)"
      ><VCard
        ><VCardTitle tag="h2" class="auth-dialog-heading"
          ><span>{{ t('identity.logoutAll') }}</span
          ><VBtn
            variant="text"
            :aria-label="t('identity.cancel')"
            :disabled="busy"
            @click="confirmAll = false"
            >{{ t('identity.cancel') }}</VBtn
          ></VCardTitle
        ><VCardText
          ><p :id="`${pageId}-1`">{{ t('identity.logoutHelp') }}</p></VCardText
        ><VCardActions class="auth-actions"
          ><VBtn :disabled="busy || !owner" @click="submitConfirmed">{{
            t('identity.confirm')
          }}</VBtn></VCardActions
        ></VCard
      ></VDialog
    >
  </section>
</template>
