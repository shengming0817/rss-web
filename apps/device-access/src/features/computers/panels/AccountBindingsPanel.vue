<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Computer, Binding } from '@rss/device-access/model'
import { AccountBindingSummary } from '@rss/device-access/components'
import { useDa } from '../../../context'
import { useRead } from '../../../services/read'
import { useMutation } from '../../../services/mutation'
import { errorMessage } from '../../../services/status'
import ReadState from '../../../ui/ReadState.vue'
import WriteState from '../../../ui/WriteState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa(),
  cursor = ref<string | null>(null),
  selected = ref<Binding | null>(null),
  proofBusy = ref(false),
  proofError = ref('')
const { data, busy, error, reload } = useRead(
  (signal) => r.client.bindings(props.device.id, cursor.value, signal),
  () => props.device.id + ':' + (cursor.value ?? ''),
)
watch(
  () => props.device.id,
  () => {
    selected.value = null
    cursor.value = null
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
async function prove() {
  const b = selected.value
  if (!b || proofBusy.value) return
  proofBusy.value = true
  proofError.value = ''
  const control = new AbortController()
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
    proofError.value = '认证完成，请再次明确提交。'
  } catch (e) {
    proofError.value = errorMessage(e)
  } finally {
    proofBusy.value = false
  }
}
</script>
<template>
  <h2 class="mb-5">{{ $t('da.m32249c7116') }}</h2>
  <ReadState :busy="busy" :error="error" @retry="reload" /><template v-if="data"
    ><section v-for="b in data.items" :key="b.id" class="panel explanatory mb-4">
      <AccountBindingSummary :binding="b" /><v-btn
        class="mt-4"
        variant="outlined"
        @click="selected = b"
        >{{ $t('da.m0eedf871b8') }}</v-btn
      >
    </section>
    <p v-if="!data.items.length" class="empty">{{ $t('da.m60df48a3c6') }}</p>
    <v-btn v-if="data.nextCursor" variant="text" @click="cursor = data!.nextCursor">{{
      $t('da.mc74f901317')
    }}</v-btn></template
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
          v-if="op.state.value.proof"
          class="mt-4"
          :loading="proofBusy"
          @click="prove"
          >{{ $t('da.mc5058461b8') }}</v-btn
        >
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
