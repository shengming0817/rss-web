<script setup lang="ts">
import {
  VBtn,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VForm,
  VSelect,
  VTab,
  VTable,
  VTabs,
  VTextField,
  VWindow,
  VWindowItem,
} from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { useI18n } from 'vue-i18n'
import { useAccountSecurity } from '@rss/auth'
import MdmPage from '../../../ui/MdmPage.vue'
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
  clearLocalSecrets,
  password,
  reauthPassword,
  linkPassword,
  providers,
  selectedProvider,
  owner,
  load,
  reloadSessions,
  change,
  logout,
  reauthenticate,
  link,
  submitConfirmed,
  loginTarget,
} = useAccountSecurity()
</script>
<template>
  <MdmPage :title="t('identity.sessions')" :busy="busy">
    <p v-if="session.logoutOutcome.value === 'unconfirmed'" role="alert">
      {{ t('identity.logoutUnconfirmed') }}
    </p>
    <p v-else-if="error" role="alert">{{ errorMessage }}</p>
    <p class="auth-muted">{{ t('identity.logoutHelp') }}</p>
    <VTabs v-model="tab" :aria-label="t('identity.sessions')"
      ><VTab value="sessions">{{ t('identity.sessions') }}</VTab
      ><VTab value="security">{{ t('identity.authentication') }}</VTab></VTabs
    >
    <VWindow v-model="tab"
      ><VWindowItem value="sessions" eager>
        <div class="auth-actions">
          <VBtn :disabled="!!busy" type="submit" @click="run(reloadSessions)">{{
            t('identity.reload')
          }}</VBtn
          ><VBtn :disabled="!!(busy || !owner)" type="submit" @click="logout(false)">{{
            t('identity.logout')
          }}</VBtn
          ><VBtn :disabled="!!(busy || !owner)" type="submit" @click="confirmAll = true">
            {{ t('identity.logoutAll') }}
          </VBtn>
          <VBtn
            v-if="session.logoutOutcome.value === 'unconfirmed' && !owner"
            variant="text"
            :to="loginTarget(session.state.value.tenant, host)"
          >
            {{ t('identity.login') }}
          </VBtn>
        </div>
        <div class="auth-table">
          <div class="device-table-scroll">
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
      ><VWindowItem value="security" eager
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
            <p>{{ t('identity.operationAuthentication') }}</p>
          </template>
          <VBtn
            :disabled="!!(busy || !owner)"
            type="submit"
            @click="run(() => session.loadSecurity())"
          >
            {{ t('identity.reloadSecurity') }}
          </VBtn>
        </section>
        <VExpansionPanels
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @update:model-value="clearLocalSecrets"
          ><VExpansionPanel>
            <VExpansionPanelTitle>{{ t('identity.changePassword') }}</VExpansionPanelTitle
            ><VExpansionPanelText>
              <VForm
                :disabled="busy"
                @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; change()"
              >
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
              </VForm>
            </VExpansionPanelText></VExpansionPanel
          ></VExpansionPanels
        >
        <VExpansionPanels
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @update:model-value="clearLocalSecrets"
          ><VExpansionPanel>
            <VExpansionPanelTitle>{{ t('identity.reauthenticate') }}</VExpansionPanelTitle
            ><VExpansionPanelText>
              <VForm
                :disabled="busy"
                @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; reauthenticate()"
              >
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
              </VForm>
            </VExpansionPanelText></VExpansionPanel
          ></VExpansionPanels
        >
        <VExpansionPanels
          v-if="session.config.oidcEnabled && providers.length"
          class="auth-task"
          @update:model-value="clearLocalSecrets"
          ><VExpansionPanel>
            <VExpansionPanelTitle>{{ t('identity.linkProvider') }}</VExpansionPanelTitle
            ><VExpansionPanelText>
              <VForm
                :disabled="busy"
                @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; link()"
              >
                <h2>{{ t('identity.linkProvider') }}</h2>
                <VSelect
                  id="link-provider"
                  v-model="selectedProvider"
                  required
                  :items="[...providers.map((p) => ({ title: p.label, value: p.id }))]"
                  :label="t('identity.providers')"
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
              </VForm>
            </VExpansionPanelText></VExpansionPanel
          ></VExpansionPanels
        ></VWindowItem
      ></VWindow
    >
    <OperationDialog
      :open="confirmAll"
      :title="t('identity.logoutAll')"
      :description="t('identity.logoutHelp')"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="confirmAll = $event"
      ><template #footer
        ><VBtn :disabled="busy || !owner" @click="submitConfirmed">{{
          t('identity.confirm')
        }}</VBtn></template
      ></OperationDialog
    >
  </MdmPage>
</template>
