<script setup lang="ts">
import { VBtn, VForm, VTable, VTextField } from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { useI18n } from 'vue-i18n'
import { useAccounts } from '@rss/auth'
import LocalProfileEditor from '../components/LocalProfileEditor.vue'
import MdmPage from '../../../ui/MdmPage.vue'
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
  <MdmPage :title="t('operations.userManagement')" :busy="busy">
    <p>{{ t('operations.usersHint') }}</p>
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
        <div class="ui-table-scroll">
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
                  <VBtn :disabled="!!busy" @click="profileTarget = a">{{
                    t('identity.localProfile')
                  }}</VBtn>
                  <VBtn
                    :disabled="!!busy"
                    type="submit"
                    @click="pending = { account: a, field: 'enabled', enabled: !a.enabled }"
                  >
                    {{ t(a.enabled ? 'identity.disable' : 'identity.enable') }}
                  </VBtn>
                  <VBtn
                    :disabled="!!busy"
                    type="submit"
                    @click="pending = { account: a, field: 'membership', enabled: !a.memberActive }"
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
                    @click="openReset(a)"
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
      <VBtn type="button" :disabled="busy" @click="creating = true">{{
        t('identity.createAccount')
      }}</VBtn>
      <OperationDialog
        :open="creating"
        :title="t('identity.createAccount')"
        :close-label="t('identity.cancel')"
        placement="right"
        :dismissible="!busy"
        @update:open="!$event && closeCreate()"
      >
        <p v-if="error" role="alert">{{ errorMessage }}</p>
        <VForm
          :disabled="busy"
          class="auth-form"
          @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (create())"
        >
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
        </VForm>
      </OperationDialog>
    </template>
    <OperationDialog
      :open="profileTarget !== null"
      :title="t('identity.localProfile')"
      :close-label="t('identity.cancel')"
      placement="right"
      @update:open="!$event && (profileTarget = null)"
    >
      <LocalProfileEditor
        v-if="profileTarget"
        :key="profileTarget.principalId"
        :principal-id="profileTarget.principalId"
      />
    </OperationDialog>
    <OperationDialog
      :open="pending !== null"
      :title="t('identity.confirmChange')"
      :description="`${pending?.account.login ?? pending?.account.principalId ?? ''} · ${t('identity.changeHelp')}`"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="!$event && (pending = null)"
    >
      <template #footer>
        <VBtn class="ui-button" type="submit" @click="pending = null">{{
          t('identity.cancel')
        }}</VBtn>
        <VBtn
          class="ui-button ui-button--primary"
          :disabled="!!busy"
          type="submit"
          @click="confirm"
        >
          {{ t('identity.confirm') }}
        </VBtn>
      </template>
    </OperationDialog>
    <OperationDialog
      :open="resetTarget !== null"
      :title="t('identity.resetPassword')"
      :description="`${resetTarget?.login ?? resetTarget?.principalId ?? ''} · ${t('identity.resetHelp')}`"
      :close-label="t('identity.cancel')"
      @update:open="!$event && closeReset()"
    >
      <VForm
        :disabled="busy"
        class="auth-form"
        @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (reset())"
      >
        <VTextField
          id="reset-password"
          v-model="resetPassword"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
          :label="t('identity.newPassword')"
        />
        <VBtn class="ui-button ui-button--primary" type="submit" :disabled="!!busy">
          {{ t('identity.confirm') }}
        </VBtn>
      </VForm>
    </OperationDialog>
  </MdmPage>
</template>
