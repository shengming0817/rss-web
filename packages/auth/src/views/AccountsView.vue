<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Account } from '../services/decode'
const { t } = useI18n()
const { api, session } = useIdentity()
const { busy, error, run } = useOperation()
const rows = ref<Account[]>([])
const loaded = ref(false)
const next = ref<string | null>(null)
const login = ref('')
const password = ref('')
const resetTarget = ref<Account | null>(null)
const pending = ref<{
  account: Account
  field: 'enabled' | 'membership'
  enabled: boolean
} | null>(null)
async function load(cursor?: string) {
  const value = await api.accounts(cursor)
  rows.value = cursor ? [...rows.value, ...value.accounts] : value.accounts
  next.value = value.next
  loaded.value = true
}
onMounted(() => {
  if (session.managementHint.value) void run(() => load())
})
async function create() {
  const secret = password.value
  password.value = ''
  await run(async () => {
    await api.createAccount(login.value, secret)
    login.value = ''
    await load()
  })
}
async function confirm() {
  const v = pending.value
  pending.value = null
  if (v)
    await run(async () => {
      await api.setAccount(v.account, v.field, v.enabled)
      if (session.state.value.status === 'authenticated') await load()
    })
}
function openReset(account: Account) {
  password.value = ''
  resetTarget.value = account
}
function closeReset() {
  resetTarget.value = null
  password.value = ''
}
async function reset() {
  const target = resetTarget.value
  const secret = password.value
  resetTarget.value = null
  password.value = ''
  if (target)
    await run(async () => {
      await api.resetPassword(target.principalId, secret)
      await load()
    })
}
</script>
<template>
  <section class="auth-page">
    <h1>{{ t('identity.accounts') }}</h1>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p v-if="session.state.value.navigation !== 'ready'" role="status">
      {{ t('identity.navigationUnavailable') }}
    </p>
    <p v-else-if="!session.managementHint.value">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else>
      <UiButton :disabled="!!busy" type="submit" @click="run(() => load())">
        {{ t(loaded ? 'identity.reload' : 'identity.loadList') }}
      </UiButton>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="ui-table-scroll">
          <table class="ui-table">
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
                  <UiButton
                    :disabled="!!busy"
                    type="submit"
                    @click="pending = { account: a, field: 'enabled', enabled: !a.enabled }"
                  >
                    {{ t(a.enabled ? 'identity.disable' : 'identity.enable') }}
                  </UiButton>
                  <UiButton
                    :disabled="!!busy"
                    type="submit"
                    @click="pending = { account: a, field: 'membership', enabled: !a.memberActive }"
                  >
                    {{ t(a.memberActive ? 'identity.disableMember' : 'identity.enableMember') }}
                  </UiButton>
                  <UiButton
                    v-if="
                      a.hasLocalPassword &&
                      a.principalId !== session.state.value.identity?.principalId
                    "
                    :disabled="!!busy"
                    type="submit"
                    @click="openReset(a)"
                  >
                    {{ t('identity.resetPassword') }}
                  </UiButton>
                </td>
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
      </UiButton>
      <form @submit.prevent="create">
        <h2>{{ t('identity.createAccount') }}</h2>
        <label for="account-login">{{ t('identity.username') }}</label
        ><input id="account-login" v-model="login" class="ui-input" autocomplete="off" required />
        <label for="account-password">{{ t('identity.password') }}</label
        ><input
          id="account-password"
          v-model="password"
          class="ui-input"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
        /><UiButton type="submit" :disabled="!!busy">{{ t('identity.create') }}</UiButton>
      </form>
    </template>
    <UiDialog
      :open="pending !== null"
      :title="t('identity.confirmChange')"
      :description="`${pending?.account.login ?? pending?.account.principalId ?? ''} · ${t('identity.changeHelp')}`"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="!$event && (pending = null)"
    >
      <template #footer>
        <UiButton class="ui-button" type="submit" @click="pending = null">{{
          t('identity.cancel')
        }}</UiButton>
        <UiButton
          class="ui-button ui-button--primary"
          :disabled="!!busy"
          type="submit"
          @click="confirm"
        >
          {{ t('identity.confirm') }}
        </UiButton>
      </template>
    </UiDialog>
    <UiDialog
      :open="resetTarget !== null"
      :title="t('identity.resetPassword')"
      :description="t('identity.resetHelp')"
      :close-label="t('identity.cancel')"
      @update:open="!$event && closeReset()"
    >
      <form @submit.prevent="reset">
        <label for="reset-password">{{ t('identity.newPassword') }}</label>
        <input
          id="reset-password"
          v-model="password"
          class="ui-input"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
        />
        <UiButton class="ui-button ui-button--primary" type="submit" :disabled="!!busy">
          {{ t('identity.confirm') }}
        </UiButton>
      </form>
    </UiDialog>
  </section>
</template>
