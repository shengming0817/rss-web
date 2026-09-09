<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ModalShell } from '@rss/core/components'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Account } from '../services/decode'
const { t } = useI18n()
const { api, session } = useIdentity()
const { busy, error, run } = useOperation()
const rows = ref<Account[]>([])
const next = ref<string | null>(null)
const login = ref('')
const password = ref('')
const role = ref('member')
const resetTarget = ref<Account | null>(null)
const pending = ref<{
  account: Account
  field: 'enabled' | 'administrator' | 'membership'
  enabled: boolean
} | null>(null)
async function load(cursor?: string) {
  const value = await api.accounts(cursor)
  rows.value = cursor ? [...rows.value, ...value.accounts] : value.accounts
  next.value = value.next
}
onMounted(() => {
  if (session.state.value.identity?.administrator) void run(() => load())
})
async function create() {
  const secret = password.value
  password.value = ''
  await run(async () => {
    await api.createAccount(login.value, secret, role.value)
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
      await api.resetPassword(target.principal_id, secret)
      await load()
    })
}
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.accounts') }}</h1>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p v-if="!session.state.value.identity?.administrator">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else>
      <button :disabled="busy" @click="run(() => load())">{{ t('identity.reload') }}</button>
      <div class="identity-table">
        <table>
          <thead>
            <tr>
              <th>{{ t('identity.account') }}</th>
              <th>{{ t('identity.state') }}</th>
              <th>{{ t('identity.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in rows" :key="a.principal_id">
              <td>
                {{ a.login ?? a.principal_id }}<small>{{ a.principal_id }}</small
                ><small v-if="a.emergency">{{ t('identity.emergency') }}</small>
              </td>
              <td>
                {{ t(a.enabled ? 'identity.enabled' : 'identity.disabled') }} ·
                {{ t(a.member_active ? 'identity.memberActive' : 'identity.memberInactive')
                }}<small v-if="a.administrator">{{ t('identity.administrator') }}</small>
              </td>
              <td class="identity-actions">
                <button
                  :disabled="busy"
                  @click="pending = { account: a, field: 'enabled', enabled: !a.enabled }"
                >
                  {{ t(a.enabled ? 'identity.disable' : 'identity.enable') }}
                </button>
                <button
                  :disabled="busy"
                  @click="pending = { account: a, field: 'membership', enabled: !a.member_active }"
                >
                  {{ t(a.member_active ? 'identity.disableMember' : 'identity.enableMember') }}
                </button>
                <button
                  :disabled="busy"
                  @click="
                    pending = { account: a, field: 'administrator', enabled: !a.administrator }
                  "
                >
                  {{ t(a.administrator ? 'identity.revokeAdmin' : 'identity.grantAdmin') }}
                </button>
                <button
                  v-if="
                    a.has_local_password &&
                    a.principal_id !== session.state.value.identity?.principal_id
                  "
                  :disabled="busy"
                  @click="openReset(a)"
                >
                  {{ t('identity.resetPassword') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="next" :disabled="busy" @click="run(() => load(next ?? undefined))">
        {{ t('identity.more') }}
      </button>
      <form @submit.prevent="create">
        <h2>{{ t('identity.createAccount') }}</h2>
        <label for="account-login">{{ t('identity.username') }}</label
        ><input id="account-login" v-model="login" autocomplete="off" required />
        <label for="account-role">{{ t('identity.role') }}</label
        ><select id="account-role" v-model="role">
          <option value="member">{{ t('identity.member') }}</option>
          <option value="administrator">{{ t('identity.administrator') }}</option>
          <option value="emergency">{{ t('identity.emergency') }}</option>
        </select>
        <label for="account-password">{{ t('identity.password') }}</label
        ><input
          id="account-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
        /><button type="submit" :disabled="busy">{{ t('identity.create') }}</button>
      </form>
    </template>
    <ModalShell
      :open="pending !== null"
      title-id="change-title"
      description-id="change-detail"
      role="alertdialog"
      @close="pending = null"
      ><h2 id="change-title">{{ t('identity.confirmChange') }}</h2>
      <p id="change-detail">
        {{ pending?.account.login ?? pending?.account.principal_id }} ·
        {{ t('identity.changeHelp') }}
      </p>
      <button @click="pending = null">{{ t('identity.cancel') }}</button
      ><button :disabled="busy" @click="confirm">{{ t('identity.confirm') }}</button></ModalShell
    >
    <ModalShell :open="resetTarget !== null" title-id="reset-title" @close="closeReset"
      ><h2 id="reset-title">{{ t('identity.resetPassword') }}</h2>
      <p>{{ t('identity.resetHelp') }}</p>
      <form @submit.prevent="reset">
        <label for="reset-password">{{ t('identity.newPassword') }}</label
        ><input
          id="reset-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
        /><button type="submit" :disabled="busy">{{ t('identity.confirm') }}</button>
      </form></ModalShell
    >
  </section>
</template>
