<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { Computer, Material, OriginalOperation } from '@rss/device-access/model'
import { RecoveryMetadataSummary, AccessAutomationStatus } from '@rss/device-access/components'
import { useDa, identityKey } from '../../../context'
import { useRead } from '../../../services/read'
import { useDirectory } from '../../../services/directory'
import { materialColumns } from '@rss/device-access/client'
import { QueryRows } from '@rss/core'
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { useMutation } from '../../../services/mutation'
import { errorMessage } from '../../../services/status'
import ReadState from '../../../ui/ReadState.vue'
import WriteState from '../../../ui/WriteState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa(),
  selected = ref<Material | null>(null),
  modal = ref(''),
  secret = ref(''),
  result = ref<OriginalOperation>(),
  proofBusy = ref(false),
  proofMessage = ref('')
const directory = useDirectory(
  materialColumns,
  100,
  (query, signal) => r.client.materials(props.device.id, query, signal),
  () => props.device.id,
)
const { data, busy, error, reload } = directory

const locator = ref<{ id: string; version: number; kind: string }>()
const detail = useRead(
  (signal) => r.client.material(props.device.id, locator.value!.id, locator.value!.version, signal),
  () => props.device.id + ':' + JSON.stringify(locator.value),
  {
    enabled: () => !!locator.value,
    accepted(value) {
      open(value, locator.value!.kind)
    },
  },
)
function inspect(id: string, version: number, kind = 'inspect') {
  const next = { id, version, kind }
  if (JSON.stringify(locator.value) === JSON.stringify(next)) void detail.reload()
  else locator.value = next
}
const rotation = useMutation(() => props.device.id + '/rotation/' + selected.value?.id),
  disclosure = useMutation(() => props.device.id + '/disclosure/' + selected.value?.id)
let timer: ReturnType<typeof setTimeout> | undefined,
  proofAbort: AbortController | undefined,
  epoch = 0
function clear() {
  secret.value = ''
  clearTimeout(timer)
  proofAbort?.abort()
  epoch++
  proofMessage.value = ''
}
function close() {
  clear()
  modal.value = ''
  locator.value = undefined
  selected.value = null
}
function open(m: Material, kind: string) {
  clear()
  selected.value = m
  modal.value = kind
  result.value = undefined
}
watch(
  () => props.device.id,
  () => {
    close()
  },
  { flush: 'sync' },
)
watch(() => identityKey(r.session), close, { flush: 'sync' })
function hidden() {
  if (document.hidden) close()
}
document.addEventListener('visibilitychange', hidden)
onBeforeUnmount(() => {
  clear()
  document.removeEventListener('visibilitychange', hidden)
})
async function reveal() {
  const m = selected.value
  if (!m) return
  const e = epoch
  const value = await disclosure.run((id, signal) =>
    r.client.reveal(props.device.id, m, id, signal),
  )
  if (value && epoch === e && modal.value === 'reveal') {
    secret.value = value
    timer = setTimeout(clear, 30_000)
  }
}
async function rotate() {
  const m = selected.value
  if (!m) return
  result.value = await rotation.run(
    (id, signal) => r.client.rotate(props.device.id, m, id, signal),
    true,
  )
}
async function query() {
  result.value = await rotation.query((id, signal) =>
    r.client.operation(props.device.id, id, signal),
  )
}
async function prove() {
  const m = selected.value
  if (!m || proofBusy.value) return
  proofBusy.value = true
  proofAbort = new AbortController()
  const e = epoch
  try {
    const c = await r.client.materialChallenge(
      props.device.id,
      m,
      disclosure.state.value.id,
      proofAbort.signal,
    )
    await r.security.prove(c, proofAbort.signal)
    if (epoch === e) proofMessage.value = '认证完成，请再次明确查阅。'
  } catch (error) {
    if (epoch === e) proofMessage.value = errorMessage(error)
  } finally {
    proofBusy.value = false
  }
}
</script>
<template>
  <h2>{{ $t('da.mc867fc2153') }}</h2>
  <p class="small muted mb-5">{{ $t('da.m34a19c6e24') }}</p>
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
    :fields="directory.applied.value?.fields ?? materialColumns"
    :required="['id', 'version']"
    @open="(row) => inspect(String(row.id), Number(row.version))"
  /><template v-if="data"
    ><RecoveryMetadataSummary :materials="data.summaries ?? []" />
    <div v-for="m in data.summaries ?? []" :key="m.id + ':' + m.version" class="material-actions">
      <span>{{ m.subject.kind }} · v{{ m.version }}</span
      ><v-btn
        size="small"
        variant="text"
        :disabled="m.subject.kind !== 'rss_login' || !m.current"
        @click="inspect(m.id, m.version, 'reveal')"
        >{{ $t('da.m5e0a4efc9e') }}</v-btn
      ><v-btn
        size="small"
        color="primary"
        :disabled="
          m.subject.kind !== 'rss_login' || !m.current || !r.client.capabilities.rotation.available
        "
        @click="inspect(m.id, m.version, 'rotate')"
        >{{ $t('da.mf4b0208c22') }}</v-btn
      >
    </div>
    <p v-if="!data.items.length" class="empty">{{ $t('da.me1fa48df2a') }}</p> </template
  ><v-alert
    v-if="!r.client.capabilities.rotation.available"
    type="info"
    :icon="false"
    class="mt-5"
    >{{ $t('da.mf9a5394d54') }}</v-alert
  >
  <p class="small muted mt-5">{{ $t('da.m73cadbfccc') }}</p>
  <v-dialog
    :model-value="!!modal"
    max-width="650"
    @update:model-value="
      (v) => {
        if (!v) close()
      }
    "
    ><v-card v-if="selected"
      ><v-card-title>{{
        modal === 'reveal' ? '受控查阅' : modal === 'rotate' ? '核对本机材料轮换' : '完整材料元数据'
      }}</v-card-title
      ><v-card-text
        ><div class="target-summary">
          <strong>{{ device.name }} · {{ selected.subject.kind }} · v{{ selected.version }}</strong>
        </div>
        <RecoveryMetadataSummary :materials="[selected]" />
        <template v-if="modal === 'reveal'"
          ><v-alert type="warning" :icon="false" class="my-5">{{ $t('da.mec73dbb549') }}</v-alert>
          <div v-if="secret" class="secret-preview">{{ secret }}</div>
          <v-btn v-else color="primary" :disabled="disclosure.locked.value" @click="reveal">{{
            $t('da.m828a16e1bf')
          }}</v-btn
          ><v-btn v-if="secret" variant="text" @click="clear">{{ $t('da.m3808d2143b') }}</v-btn
          ><WriteState :state="disclosure.state.value" /><v-btn
            v-if="disclosure.state.value.proof"
            class="mt-4"
            :loading="proofBusy"
            @click="prove"
            >{{ $t('da.mc5058461b8') }}</v-btn
          >
          <p v-if="proofMessage" role="status">{{ proofMessage }}</p></template
        ><template v-else-if="modal === 'rotate'"
          ><p class="my-5">{{ $t('da.m4c86d52ab2') }}</p>
          <AccessAutomationStatus v-if="result" :operation="result" /><WriteState
            :state="rotation.state.value"
            queryable
            @query="query"
          /><v-btn
            v-if="rotation.state.value.state === 'accepted'"
            variant="outlined"
            class="mt-4"
            @click="query"
            >{{ $t('da.me472e21603') }}</v-btn
          ></template
        ></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn @click="close">{{ $t('da.m6c14bd7f6f') }}</v-btn
        ><v-btn
          v-if="modal === 'rotate'"
          color="primary"
          :disabled="rotation.locked.value"
          @click="rotate"
          >{{ $t('da.m5232f21f53') }}</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
