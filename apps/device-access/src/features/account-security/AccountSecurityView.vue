<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import type { Credential } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { useMutation } from '../../services/mutation'
import { errorMessage } from '../../services/status'
import ReadState from '../../ui/ReadState.vue'
import WriteState from '../../ui/WriteState.vue'
const r = useDa(),
  router = useRouter(),
  name = ref(''),
  open = ref(false),
  selected = ref<Credential | null>(null),
  message = ref(''),
  proofBusy = ref(false)
const { data, busy, error, reload } = useRead((signal) => r.security.list(signal))
const registration = useMutation(() => '/security/register'),
  removal = useMutation(() => '/security/remove/' + selected.value?.id)
let proofAbort: AbortController | undefined
let epoch = 0
onBeforeUnmount(() => {
  epoch++
  proofAbort?.abort()
  void r.security.cancel().catch(() => undefined)
})
async function register() {
  const version = epoch
  const label = name.value.trim()
  if (!label) return
  name.value = ''
  const value = await registration.run((_id, signal) => r.security.register(label, signal))
  if (value && version === epoch && open.value) {
    open.value = false
    await reload()
  }
}
async function remove() {
  const c = selected.value
  if (!c) return
  await removal.run(async (_id, signal) => {
    await r.security.remove(c.id, signal)
    return true
  })
  await reload()
}
async function prove() {
  const version = epoch
  proofBusy.value = true
  proofAbort = new AbortController()
  try {
    await r.security.reauthenticate(proofAbort.signal)
    if (version === epoch) message.value = '认证完成，请重新输入名称并明确注册。'
  } catch (e) {
    if (version === epoch) message.value = errorMessage(e)
  } finally {
    if (version === epoch) proofBusy.value = false
  }
}
function closeRemoval() {
  selected.value = null
  removal.cancel()
  void r.security.cancel().catch(() => undefined)
}
function close() {
  epoch++
  proofBusy.value = false
  message.value = ''
  registration.cancel()
  proofAbort?.abort()
  open.value = false
  name.value = ''
  void r.security.cancel().catch(() => undefined)
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">ACCOUNT SECURITY</p>
      <h1>{{ $t('da.m59a0b9298e') }}</h1>
      <p class="muted">{{ $t('da.mccff56d899') }}</p>
    </div>
    <v-btn
      color="primary"
      :disabled="registration.locked.value || r.session.state.value.status !== 'authenticated'"
      @click="open = true"
      >{{ $t('da.mdf02e99c31') }}</v-btn
    >
  </div>
  <v-alert
    v-if="r.session.logoutOutcome.value === 'unconfirmed'"
    type="warning"
    :icon="false"
    class="mb-5"
    >{{ $t('da.m92e8cbb181') }}</v-alert
  ><v-btn
    v-if="r.session.state.value.status !== 'authenticated'"
    class="mb-5"
    @click="router.replace({ name: 'login' })"
    >{{ $t('da.mc2ac8f1515') }}</v-btn
  ><ReadState :busy="busy" :error="error" @retry="reload" />
  <section v-if="data" class="panel">
    <v-table
      ><thead>
        <tr>
          <th>{{ $t('da.ma1d7ffc244') }}</th>
          <th>{{ $t('da.m785b52eb97') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in data" :key="c.id">
          <td>{{ c.label }}</td>
          <td>{{ $t('da.m021294dfa3') }}</td>
          <td>
            <v-btn variant="text" color="error" @click="selected = c">{{
              $t('da.m2f752c005e')
            }}</v-btn>
          </td>
        </tr>
      </tbody></v-table
    >
    <p v-if="!data.length" class="empty">{{ $t('da.ma49136cc54') }}</p>
  </section>
  <WriteState :state="registration.state.value" /><v-alert type="info" :icon="false" class="mt-5">{{
    $t('da.meecfb3ac53')
  }}</v-alert
  ><v-dialog
    v-model="open"
    max-width="620"
    @update:model-value="
      (v) => {
        if (!v) close()
      }
    "
    ><v-card
      ><v-card-title>{{ $t('da.m0144e25103') }}</v-card-title
      ><v-card-text
        ><v-text-field
          v-model="name"
          :label="$t('da.ma1d7ffc244')"
          maxlength="128"
          :disabled="registration.locked.value"
        /><WriteState :state="registration.state.value" /><v-btn
          v-if="registration.state.value.proof"
          class="mt-4"
          :loading="proofBusy"
          @click="prove"
          >{{ $t('da.m832c686fb0') }}</v-btn
        >
        <p v-if="message" role="status">{{ message }}</p></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="close">{{ $t('da.m4d0b4688c7') }}</v-btn
        ><v-btn
          color="primary"
          :disabled="!name.trim() || registration.locked.value"
          @click="register"
          >{{ $t('da.mc7ddb75b0c') }}</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  ><v-dialog
    :model-value="!!selected"
    max-width="620"
    @update:model-value="
      (v) => {
        if (!v) closeRemoval()
      }
    "
    ><v-card v-if="selected"
      ><v-card-title>移除 {{ selected.label }}</v-card-title
      ><v-card-text
        ><p>{{ $t('da.m96291912da') }}</p>
        <WriteState :state="removal.state.value" /></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="closeRemoval">{{ $t('da.m6c14bd7f6f') }}</v-btn
        ><v-btn color="error" :disabled="removal.locked.value" @click="remove">{{
          $t('da.m050ff5c725')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
