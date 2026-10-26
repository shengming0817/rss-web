<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import type { Application, ApplicationInput } from '@rss/device-access/model'
import { useDa } from '../../context'
import { useMutation } from '../../services/mutation'
import { errorMessage } from '../../services/status'
import WriteState from '../../ui/WriteState.vue'
const props = defineProps<{ existing: Application | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const r = useDa(),
  id = ref(props.existing?.id ?? ''),
  callback = ref(props.existing?.callback ?? ''),
  enabled = ref(props.existing?.enabled ?? false),
  capabilities = ref<Application['capabilities']>(props.existing?.capabilities ?? ['native_key']),
  proofBusy = ref(false),
  proofMessage = ref('')
const op = useMutation(() => '/application/' + (props.existing?.id ?? 'new'))
let active = true,
  proofAbort: AbortController | undefined
onBeforeUnmount(() => {
  active = false
  proofAbort?.abort()
})
const valid = computed(() => {
  try {
    const u = new URL(callback.value)
    return (
      /^[A-Za-z0-9_-]{1,64}$/.test(id.value) &&
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      capabilities.value.length > 0
    )
  } catch {
    return false
  }
})
function input(operationId: string): ApplicationInput {
  return {
    id: id.value,
    operationId,
    expectedRevision: props.existing?.revision ?? 0,
    callback: callback.value,
    enabled: enabled.value,
    capabilities: [...capabilities.value],
  }
}
async function save() {
  if (!valid.value) return
  const result = await op.run(
    (operationId, signal) => r.client.application(input(operationId), signal),
    false,
  )
  if (result) {
    emit('saved')
    emit('close')
  }
}
async function query() {
  const result = await op.query(
    (id, signal) => r.client.operation(null, id, signal),
    (value) => value.state === 'completed',
  )
  if (result) {
    emit('saved')
    emit('close')
  }
}
async function prove() {
  if (proofBusy.value) return
  proofBusy.value = true
  proofAbort = new AbortController()
  try {
    const c = await r.client.applicationChallenge(input(op.state.value.id), proofAbort.signal)
    await r.security.prove(c, proofAbort.signal)
    if (active) proofMessage.value = '重新认证完成，请再次确认提交。'
  } catch (e) {
    if (active) proofMessage.value = errorMessage(e)
  } finally {
    proofBusy.value = false
  }
}
</script>
<template>
  <v-dialog
    :model-value="true"
    max-width="680"
    scrollable
    @update:model-value="
      (v) => {
        if (!v) emit('close')
      }
    "
    ><v-card
      ><div class="modal-heading">
        <h2>{{ $t('da.mac18e1616a') }}</h2>
        <v-btn variant="text" @click="emit('close')">{{ $t('da.m6c14bd7f6f') }}</v-btn>
      </div>
      <v-card-text class="modal-body"
        ><v-alert type="info" :icon="false" class="mb-5">{{ $t('da.md23c03bd6b') }}</v-alert
        ><v-text-field
          v-model="id"
          :label="$t('da.mf894323a24')"
          :disabled="!!existing || op.locked.value || op.state.value.proof"
          class="mb-5"
        /><v-text-field
          v-model="callback"
          :label="$t('da.mdcfcd7c8e0')"
          :disabled="op.locked.value || op.state.value.proof"
          class="mb-5"
        /><v-select
          v-model="capabilities"
          :items="[
            { title: '平台密钥', value: 'native_key' },
            { title: '密码', value: 'password' },
          ]"
          :label="$t('da.me7bb81b8af')"
          multiple
          :disabled="op.locked.value || op.state.value.proof"
        /><v-switch
          v-model="enabled"
          :label="$t('da.m0a5c42b497')"
          :disabled="op.locked.value || op.state.value.proof"
          color="primary"
          hide-details
        /><WriteState :state="op.state.value" queryable @query="query" /><v-btn
          v-if="op.state.value.proof"
          class="mt-4"
          :loading="proofBusy"
          @click="prove"
          >{{ $t('da.mc5058461b8') }}</v-btn
        >
        <p v-if="proofMessage" role="status">{{ proofMessage }}</p></v-card-text
      ><v-card-actions class="modal-actions"
        ><v-spacer /><v-btn @click="emit('close')">{{ $t('da.m6c14bd7f6f') }}</v-btn
        ><v-btn
          color="primary"
          :disabled="!valid || op.locked.value || !r.client.capabilities.applicationWrite.available"
          @click="save"
          >{{ $t('da.m706df2710a') }}</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
