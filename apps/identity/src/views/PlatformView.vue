<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ModalShell } from '@rss/core/components'
import { isRssApiError } from '@rss/api/identity'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import { operationQuery } from '../services/navigation'
import { uuid, type Tenant, type OperationReply } from '../services/decode'
const { session, api } = useIdentity()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { busy, error, run, checkpoint } = useOperation()
const rows = ref<Tenant[]>([])
const next = ref<string | null>(null)
const contextReady = ref(false)
const name = ref('')
const login = ref('')
const password = ref('')
const proposal = ref<{
  tenant_id: string
  principal_id: string
  operation_id: string
  name: string
  login: string
} | null>(null)
const receipt = ref<OperationReply | null>(null)
let expected: { tenant_id: string; principal_id: string } | undefined
type Outcome =
  | 'idle'
  | 'submitting'
  | 'active'
  | 'pending'
  | 'rejected'
  | 'not_completed'
  | 'unknown'
const outcome = ref<Outcome>(operationQuery(route.query).operation ? 'unknown' : 'idle')
const operationId = computed(() => operationQuery(route.query).operation)
const authenticated = computed(() => session.state.value.status === 'authenticated')
const approved = computed(
  () =>
    authenticated.value &&
    contextReady.value &&
    session.state.value.identity?.platform_administrator,
)
const identityKey = computed(() =>
  authenticated.value
    ? [
        session.state.value.tenant,
        session.state.value.identity?.principal_id,
        session.state.value.session?.id,
      ].join('/')
    : null,
)
const ownerKey = identityKey.value
watch(identityKey, (value) => {
  contextReady.value = false
  rows.value = []
  next.value = null
  proposal.value = null
  password.value = ''
  name.value = ''
  login.value = ''
  if (value && value !== ownerKey) {
    receipt.value = null
    outcome.value = operationId.value ? 'unknown' : 'idle'
  }
})
watch(operationId, () => {
  if (outcome.value !== 'submitting') {
    expected = undefined
    receipt.value = null
    outcome.value = operationId.value ? 'unknown' : 'idle'
  }
})
async function list(cursor?: string) {
  const page = await api.tenants(cursor)
  checkpoint()
  rows.value = cursor ? [...rows.value, ...page.tenants] : page.tenants
  next.value = page.next
}
async function initialize() {
  if (!authenticated.value || !session.state.value.identity?.platform_administrator) return
  await api.platformContext()
  checkpoint()
  contextReady.value = true
  await list()
}
onMounted(() => {
  void run(initialize)
  document.addEventListener('visibilitychange', visible)
})
onBeforeUnmount(() => {
  password.value = ''
  proposal.value = null
  document.removeEventListener('visibilitychange', visible)
})
function visible() {
  if (document.visibilityState !== 'visible' || busy.value) return
  void run(async () => {
    const tenant = session.state.value.tenant
    if (tenant) {
      await session.check(tenant)
      checkpoint()
      await initialize()
    }
  })
}
function prepare() {
  if (!approved.value || busy.value || operationId.value) return
  proposal.value = {
    tenant_id: uuid(crypto.randomUUID()),
    principal_id: uuid(crypto.randomUUID()),
    operation_id: uuid(crypto.randomUUID()),
    name: name.value,
    login: login.value,
  }
}
async function create() {
  if (!approved.value || busy.value || !proposal.value || operationId.value) return
  const value = proposal.value
  const secret = password.value
  expected = { tenant_id: value.tenant_id, principal_id: value.principal_id }
  password.value = ''
  proposal.value = null
  outcome.value = 'submitting'
  await run(async () => {
    await router.replace({
      name: 'platform',
      params: { tenant: session.state.value.tenant },
      query: { operation: value.operation_id },
    })
    checkpoint()
    try {
      const result = await api.createTenant({
        tenant_id: value.tenant_id,
        name: value.name,
        administrator: {
          operation_id: value.operation_id,
          principal_id: value.principal_id,
          login: value.login,
          password: secret,
        },
      })
      checkpoint()
      receipt.value = result
      outcome.value = result.active ? 'active' : 'pending'
    } catch (failure) {
      checkpoint()
      outcome.value =
        isRssApiError(failure) && failure.cause === 'wire'
          ? failure.code === 'operation_not_completed'
            ? 'not_completed'
            : failure.status !== undefined && failure.status < 500
              ? 'rejected'
              : 'unknown'
          : 'unknown'
      throw failure
    }
    // Do not couple the confirmed command receipt to a subsequent list request.
  })
}
async function lookup() {
  const id = operationId.value
  if (!approved.value || !id || busy.value) return
  await run(async () => {
    const result = await api.tenantOperation(id, expected)
    checkpoint()
    if (operationId.value !== id) return
    receipt.value = result
    outcome.value = result.active ? 'active' : 'pending'
  })
}
async function newOperation() {
  if (
    !approved.value ||
    busy.value ||
    !['active', 'rejected', 'not_completed'].includes(outcome.value)
  )
    return
  await router.replace({ name: 'platform', params: { tenant: session.state.value.tenant } })
}
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.platform') }}</h1>
    <p>{{ t('identity.platformHelp') }}</p>
    <p v-if="error" role="alert">{{ t('identity.errors.' + error) }}</p>
    <p v-if="authenticated && !session.state.value.identity?.platform_administrator" role="alert">
      {{ t('identity.errors.platform_administrator_required') }}
    </p>
    <RouterLink
      v-if="!authenticated"
      :to="{
        name: 'login',
        params: { tenant: route.params['tenant'] },
        query: operationQuery(route.query),
      }"
      >{{ t('identity.login') }}</RouterLink
    >
    <section v-if="operationId" aria-labelledby="operation-title">
      <h2 id="operation-title">{{ t('identity.provisioningResult') }}</h2>
      <p>
        {{ t('identity.operationId') }}: <code>{{ operationId }}</code>
      </p>
      <p role="status" data-testid="provisioning-outcome">{{ t('identity.outcome_' + outcome) }}</p>
      <template v-if="receipt">
        <p>{{ t('identity.tenantId') }}: {{ receipt.operation.tenant_id }}</p>
        <p>{{ t('identity.initialAdministrator') }}: {{ receipt.operation.principal_id }}</p>
        <RouterLink
          v-if="receipt.active"
          :to="{ name: 'login', params: { tenant: receipt.operation.tenant_id } }"
          >{{ t('identity.tenantLogin') }}</RouterLink
        >
      </template>
      <button :disabled="busy || !approved" @click="lookup">
        {{ t('identity.lookupOperation') }}
      </button>
      <button
        v-if="['active', 'rejected', 'not_completed'].includes(outcome)"
        :disabled="busy || !approved"
        @click="newOperation"
      >
        {{ t('identity.newTenant') }}
      </button>
    </section>
    <template v-if="approved">
      <h2>{{ t('identity.tenants') }}</h2>
      <button :disabled="busy" @click="run(() => list())">{{ t('identity.reload') }}</button>
      <div class="identity-table">
        <table>
          <thead>
            <tr>
              <th>{{ t('identity.tenantName') }}</th>
              <th>{{ t('identity.tenantId') }}</th>
              <th>{{ t('identity.initialAdministrator') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.tenant_id">
              <td>{{ row.name }}</td>
              <td>{{ row.tenant_id }}</td>
              <td>{{ row.initial_principal_id }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="next" :disabled="busy" @click="run(() => list(next ?? undefined))">
        {{ t('identity.more') }}
      </button>
      <form v-if="!operationId" @submit.prevent="prepare">
        <h2>{{ t('identity.newTenant') }}</h2>
        <label for="tenant-name">{{ t('identity.tenantName') }}</label>
        <input
          id="tenant-name"
          v-model="name"
          maxlength="128"
          required
          :disabled="busy || !!proposal"
        />
        <label for="tenant-admin-login">{{ t('identity.initialAdminLogin') }}</label>
        <input
          id="tenant-admin-login"
          v-model="login"
          autocomplete="off"
          maxlength="128"
          required
          :disabled="busy || !!proposal"
        />
        <label for="tenant-admin-password">{{ t('identity.newPassword') }}</label>
        <input
          id="tenant-admin-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="15"
          required
          :disabled="busy || !!proposal"
        />
        <button type="submit" :disabled="busy || !!proposal">{{ t('identity.create') }}</button>
      </form>
    </template>
    <ModalShell
      :open="proposal !== null"
      title-id="tenant-confirm-title"
      role="alertdialog"
      @close="proposal = null"
    >
      <h2 id="tenant-confirm-title">{{ t('identity.confirmTenant') }}</h2>
      <p>{{ proposal?.name }} · {{ proposal?.login }}</p>
      <p>{{ t('identity.tenantId') }}: {{ proposal?.tenant_id }}</p>
      <button @click="proposal = null">{{ t('identity.cancel') }}</button>
      <button :disabled="busy" @click="create">{{ t('identity.confirm') }}</button>
    </ModalShell>
  </section>
</template>
