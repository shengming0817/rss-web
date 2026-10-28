<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { Computer, Binding } from '@rss/device-access/model'
import { AccountBindingSummary } from '@rss/device-access/components'
import { useDa, identityKey } from '../../../context'
import { useRead } from '../../../services/read'
import { useDirectory } from '../../../services/directory'
import { bindingColumns } from '@rss/device-access/client'
import { QueryRows } from '@rss/core'
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { useMutation } from '../../../services/mutation'
import { errorMessage } from '../../../services/status'
import ReadState from '../../../ui/ReadState.vue'
import WriteState from '../../../ui/WriteState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa(),
  selected = ref<Binding | null>(null),
  proofBusy = ref(false),
  proofError = ref('')
const directory = useDirectory(
  bindingColumns,
  100,
  (query, signal) => r.client.bindings(props.device.id, query, signal),
  () => props.device.id,
)
const { data, busy, error, reload } = directory

const locator = ref('')
const detail = useRead(
  (signal) => r.client.binding(props.device.id, locator.value, signal),
  () => props.device.id + ':' + locator.value,
  {
    enabled: () => !!locator.value,
    accepted(value) {
      selected.value = value
    },
  },
)
function inspect(id: string) {
  if (locator.value === id) void detail.reload()
  else locator.value = id
}
watch(
  () => props.device.id,
  () => {
    selected.value = null
    locator.value = ''
    proofError.value = ''
  },
  { flush: 'sync' },
)
const op = useMutation(() => props.device.id + '/binding/' + (selected.value?.id ?? ''))
async function resetFactors() {
  const b = selected.value
  if (!b) return
  const result = await op.run(
    (operationId, signal) =>
      r.client.changeBinding(
        props.device.id,
        b.id,
        { operationId, expectedRevision: b.revision, action: { kind: 'reset_factors' } },
        signal,
      ),
    true,
  )
  if (result) selected.value = result
}
async function query() {
  const b = selected.value
  if (!b) return
  const result = await op.query((id, signal) =>
    r.client.bindingOperation(props.device.id, id, signal),
  )
  if (result) selected.value = result
}
let proofController: AbortController | undefined,
  proofEpoch = 0
function cancelProof() {
  proofEpoch++
  proofController?.abort()
  proofController = undefined
  proofBusy.value = false
  proofError.value = ''
  void r.security.cancel().catch(() => undefined)
}
watch(
  [() => selected.value?.id, () => props.device.id, () => identityKey(r.session)],
  cancelProof,
  { flush: 'sync' },
)
onBeforeUnmount(cancelProof)
async function prove() {
  const b = selected.value
  if (!b || proofBusy.value) return
  proofBusy.value = true
  proofError.value = ''
  const version = proofEpoch
  const control = new AbortController()
  proofController = control
  try {
    const c = await r.client.bindingChallenge(
      props.device.id,
      b.id,
      {
        operationId: op.state.value.id,
        expectedRevision: b.revision,
        action: { kind: 'reset_factors' },
      },
      control.signal,
    )
    await r.security.prove(c, control.signal)
    if (version !== proofEpoch || control.signal.aborted) return
    proofError.value = '认证完成，请再次明确提交。'
  } catch (e) {
    if (version === proofEpoch) proofError.value = errorMessage(e)
  } finally {
    if (version === proofEpoch) proofBusy.value = false
  }
}
</script>
<template>
  <h2 class="mb-5">{{ $t('da.m32249c7116') }}</h2>
  <DirectoryControls :query="directory" :busy="busy" /><ReadState
    :busy="busy"
    :error="error"
    @retry="reload"
  /><ReadState
    :busy="detail.busy.value"
    :error="detail.error.value"
    @retry="detail.reload"
  /><QueryRows
    v-if="data && !data.summaries"
    :items="data.items"
    :fields="directory.applied.value?.fields ?? bindingColumns"
    :required="['id']"
    @open="(row) => inspect(String(row.id))"
  /><template v-if="data"
    ><section v-for="b in data.summaries ?? []" :key="b.id" class="panel explanatory mb-4">
      <AccountBindingSummary :binding="b" /><v-btn
        class="mt-4"
        variant="outlined"
        @click="inspect(b.id)"
        >{{ $t('da.m0eedf871b8') }}</v-btn
      >
    </section>
    <p v-if="!data.items.length" class="empty">{{ $t('da.m60df48a3c6') }}</p> </template
  ><v-alert type="info" :icon="false" class="mt-5">{{ $t('da.me6c3855132') }}</v-alert
  ><v-dialog
    :model-value="!!selected"
    max-width="650"
    @update:model-value="
      (v) => {
        if (!v) selected = null
      }
    "
    ><v-card v-if="selected"
      ><v-card-title>{{ $t('da.m3321ee31f4') }}</v-card-title
      ><v-card-text
        ><AccountBindingSummary :binding="selected" />
        <p class="small muted mt-4">{{ $t('da.m619a1a1143') }}</p>
        <WriteState :state="op.state.value" queryable @query="query" /><v-btn
          v-if="op.state.value.state === 'accepted'"
          class="mt-4"
          variant="outlined"
          @click="query"
          >重新读取原操作</v-btn
        ><v-btn v-if="op.state.value.proof" class="mt-4" :loading="proofBusy" @click="prove">{{
          $t('da.mc5058461b8')
        }}</v-btn>
        <p v-if="proofError" role="status">{{ proofError }}</p></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="selected = null">{{ $t('da.m6c14bd7f6f') }}</v-btn
        ><v-btn color="primary" :disabled="op.locked.value" @click="resetFactors">{{
          $t('da.m508d8472ad')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
