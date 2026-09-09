<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Session } from '../services/decode'
const { t } = useI18n()
const router = useRouter()
const { session, api, flows } = useIdentity()
const { busy, error, run } = useOperation()
const rows = ref<Session[]>([])
const next = ref<string | null>(null)
const current = ref('')
const password = ref('')
async function load(cursor?: string) {
  const value = await api.sessions(cursor)
  rows.value = cursor ? [...rows.value, ...value.sessions] : value.sessions
  next.value = value.next
}
onMounted(() => {
  void run(() => load())
})
async function change() {
  const old = current.value
  const value = password.value
  current.value = ''
  password.value = ''
  await run(async () => {
    await api.ownPassword(old, value)
    flows.clear()
    await router.replace({ name: 'login', params: { tenant: session.state.value.tenant } })
  })
}
async function logout(all: boolean) {
  const tenant = session.state.value.tenant
  flows.clear()
  await run(() => session.logout(all))
  await router.replace({ name: 'login', params: { tenant } })
}
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.sessions') }}</h1>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <div class="identity-actions">
      <button :disabled="busy" @click="run(() => load())">{{ t('identity.reload') }}</button
      ><button :disabled="busy" @click="logout(false)">{{ t('identity.logout') }}</button
      ><button :disabled="busy" @click="logout(true)">{{ t('identity.logoutAll') }}</button>
    </div>
    <div class="identity-table">
      <table>
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
            <td>{{ new Date(row.idle_expires_at * 1000).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="next" :disabled="busy" @click="run(() => load(next ?? undefined))">
      {{ t('identity.more') }}
    </button>
    <form v-if="session.state.value.identity?.has_local_password" @submit.prevent="change">
      <h2>{{ t('identity.changePassword') }}</h2>
      <label for="current-password">{{ t('identity.currentPassword') }}</label
      ><input
        id="current-password"
        v-model="current"
        type="password"
        autocomplete="current-password"
        required
      /><label for="new-password">{{ t('identity.newPassword') }}</label
      ><input
        id="new-password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="15"
        required
      /><button type="submit" :disabled="busy">{{ t('identity.changePassword') }}</button>
    </form>
    <p class="identity-muted">{{ t('identity.logoutHelp') }}</p>
  </section>
</template>
