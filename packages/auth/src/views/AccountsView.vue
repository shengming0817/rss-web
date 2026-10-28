<script setup lang="ts">
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VTable,
  VTextField,
} from 'vuetify/components'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccounts } from '../useAccounts'
import LocalProfileEditor from './LocalProfileEditor.vue'
const dialogId = useId()
const createActivator = ref<HTMLElement>()
const profileActivator = ref<HTMLElement>()
const changeActivator = ref<HTMLElement>()
const resetActivator = ref<HTMLElement>()
const { t } = useI18n()
const {
  session,
  busy,
  error,
  errorMessage,
  run,
  rows,
  loaded,
  next,
  login,
  password,
  resetPassword,
  creating,
  closeCreate,
  profileTarget,
  resetTarget,
  pending,
  load,
  create,
  confirm,
  openReset,
  closeReset,
  reset,
} = useAccounts()
</script>
<template>
  <section class="auth-page">
    <h1>{{ t('identity.accounts') }}</h1>
    <p v-if="error" role="alert">{{ errorMessage }}</p>
    <p v-if="session.state.value.navigation !== 'ready'" role="status">
      {{ t('identity.navigationUnavailable') }}
    </p>
    <p v-else-if="!session.managementHint.value">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else>
      <VBtn :disabled="!!busy" type="submit" @click="run(() => load())">
        {{ t(loaded ? 'identity.reload' : 'identity.loadList') }}
      </VBtn>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="auth-table-scroll">
          <VTable>
            <thead>
              <tr>
                <th>{{ t('identity.account') }}</th>
                <th>{{ t('identity.state') }}</th>
                <th>{{ t('identity.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in rows" :key="a.principalId">
                <td>
                  {{ a.login ?? a.principalId }}<small>{{ a.principalId }}</small>
                </td>
                <td>
                  {{ t(a.enabled ? 'identity.enabled' : 'identity.disabled') }} ·
                  {{ t(a.memberActive ? 'identity.memberActive' : 'identity.memberInactive') }}
                </td>
                <td class="auth-actions">
                  <VBtn
                    :disabled="!!busy"
                    @click="
                      ($event: MouseEvent) => {
                        profileActivator = $event.currentTarget as HTMLElement
                        profileTarget = a
                      }
                    "
                    >{{ t('identity.localProfile') }}</VBtn
                  >
                  <VBtn
                    :disabled="!!busy"
                    type="submit"
                    @keydown.esc="!busy && (pending = null)"
                    @click="
                      ($event: MouseEvent) => {
                        changeActivator = $event.currentTarget as HTMLElement
                        pending = { account: a, field: 'enabled', enabled: !a.enabled }
                      }
                    "
                  >
                    {{ t(a.enabled ? 'identity.disable' : 'identity.enable') }}
                  </VBtn>
                  <VBtn
                    :disabled="!!busy"
                    type="submit"
                    @keydown.esc="!busy && (pending = null)"
                    @click="
                      ($event: MouseEvent) => {
                        changeActivator = $event.currentTarget as HTMLElement
                        pending = { account: a, field: 'membership', enabled: !a.memberActive }
                      }
                    "
                  >
                    {{ t(a.memberActive ? 'identity.disableMember' : 'identity.enableMember') }}
                  </VBtn>
                  <VBtn
                    v-if="
                      a.hasLocalPassword &&
                      a.principalId !== session.state.value.identity?.principalId
                    "
                    :disabled="!!busy"
                    type="submit"
                    @click="
                      ($event: MouseEvent) => {
                        resetActivator = $event.currentTarget as HTMLElement
                        openReset(a)
                      }
                    "
                  >
                    {{ t('identity.resetPassword') }}
                  </VBtn>
                </td>
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
      </VBtn>
      <VBtn
        type="button"
        :disabled="busy"
        @click="
          ($event: MouseEvent) => {
            createActivator = $event.currentTarget as HTMLElement
            creating = true
          }
        "
        >{{ t('identity.createAccount') }}</VBtn
      >
      <VDialog
        :model-value="creating"
        :activator="createActivator"
        :open-on-click="false"
        :persistent="busy"
        :aria-label="t('identity.createAccount')"
        content-class="auth-side-dialog"
        @update:model-value="!$event && closeCreate()"
        ><VCard
          ><VCardTitle tag="h2" class="auth-dialog-heading"
            ><span>{{ t('identity.createAccount') }}</span
            ><VBtn
              variant="text"
              :aria-label="t('identity.cancel')"
              :disabled="busy"
              @click="closeCreate()"
              >{{ t('identity.cancel') }}</VBtn
            ></VCardTitle
          ><VCardText
            ><p v-if="error" role="alert">{{ errorMessage }}</p>
            <form class="auth-form" @submit.prevent="create">
              <h2>{{ t('identity.createAccount') }}</h2>
              <VTextField
                id="account-login"
                v-model="login"
                autocomplete="off"
                required
                :label="t('identity.username')"
              />
              <VTextField
                id="account-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                minlength="15"
                required
                :label="t('identity.password')"
              /><VBtn type="submit" :disabled="!!busy">{{ t('identity.create') }}</VBtn>
            </form></VCardText
          ></VCard
        ></VDialog
      >
    </template>
    <VDialog
      :model-value="profileTarget !== null"
      :activator="profileActivator"
      :open-on-click="false"
      :persistent="busy"
      :aria-label="t('identity.localProfile')"
      content-class="auth-side-dialog"
      @update:model-value="!$event && (profileTarget = null)"
      ><VCard
        ><VCardTitle tag="h2" class="auth-dialog-heading"
          ><span>{{ t('identity.localProfile') }}</span
          ><VBtn
            variant="text"
            :aria-label="t('identity.cancel')"
            :disabled="busy"
            @click="profileTarget = null"
            >{{ t('identity.cancel') }}</VBtn
          ></VCardTitle
        ><VCardText
          ><LocalProfileEditor
            v-if="profileTarget"
            :key="profileTarget.principalId"
            :principal-id="profileTarget.principalId" /></VCardText></VCard
    ></VDialog>
    <VDialog
      :model-value="pending !== null"
      :activator="changeActivator"
      :open-on-click="false"
      :persistent="true"
      :aria-label="t('identity.confirmChange')"
      :aria-describedby="`${dialogId}-3`"
      role="alertdialog"
      @update:model-value="!$event && (pending = null)"
      @keydown.esc.stop="!busy && (pending = null)"
      ><VCard
        ><VCardTitle tag="h2" class="auth-dialog-heading"
          ><span>{{ t('identity.confirmChange') }}</span
          ><VBtn
            variant="text"
            :aria-label="t('identity.cancel')"
            :disabled="busy"
            @click="pending = null"
            >{{ t('identity.cancel') }}</VBtn
          ></VCardTitle
        ><VCardText
          ><p :id="`${dialogId}-3`">
            {{
              `${pending?.account.login ?? pending?.account.principalId ?? ''} · ${t('identity.changeHelp')}`
            }}
          </p></VCardText
        ><VCardActions class="auth-actions">
          <VBtn type="submit" @click="pending = null">{{ t('identity.cancel') }}</VBtn>
          <VBtn color="primary" :disabled="!!busy" type="submit" @click="confirm">
            {{ t('identity.confirm') }}
          </VBtn>
        </VCardActions></VCard
      ></VDialog
    >
    <VDialog
      :model-value="resetTarget !== null"
      :activator="resetActivator"
      :open-on-click="false"
      :persistent="busy"
      :aria-label="t('identity.resetPassword')"
      :aria-describedby="`${dialogId}-4`"
      @update:model-value="!$event && closeReset()"
      ><VCard
        ><VCardTitle tag="h2" class="auth-dialog-heading"
          ><span>{{ t('identity.resetPassword') }}</span
          ><VBtn
            variant="text"
            :aria-label="t('identity.cancel')"
            :disabled="busy"
            @click="closeReset()"
            >{{ t('identity.cancel') }}</VBtn
          ></VCardTitle
        ><VCardText
          ><p :id="`${dialogId}-4`">
            {{
              `${resetTarget?.login ?? resetTarget?.principalId ?? ''} · ${t('identity.resetHelp')}`
            }}
          </p>
          <form class="auth-form" @submit.prevent="reset">
            <VTextField
              id="reset-password"
              v-model="resetPassword"
              type="password"
              autocomplete="new-password"
              minlength="15"
              required
              :label="t('identity.newPassword')"
            />
            <VBtn color="primary" type="submit" :disabled="!!busy">
              {{ t('identity.confirm') }}
            </VBtn>
          </form></VCardText
        ></VCard
      ></VDialog
    >
  </section>
</template>
