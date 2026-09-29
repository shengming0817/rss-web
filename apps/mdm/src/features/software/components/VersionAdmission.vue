<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import type { AdmissionChange } from '../clients/admission'
const props = defineProps<{ resource: string; version: string }>()
const { t } = useI18n(),
  client = useMdm().software.admission,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const current = ref<Awaited<ReturnType<typeof client.version>>>(),
  evidence = ref('')
let pending: Operation<AdmissionChange> | undefined
function load() {
  void run(
    () => client.version(props.resource, props.version),
    (v) => {
      current.value = v
      if (pending && v.admission?.operation === pending.operationId) uncertain.value = false
    },
  )
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.changeVersion(props.resource, props.version, p),
    (v) => {
      if (current.value) current.value.admission = v.admission
    },
  )
}
function change(action: AdmissionChange['action']) {
  if (busy.value || uncertain.value || !current.value) return
  pending = operation(
    {
      action,
      evidence: evidence.value
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
    },
    current.value.admission?.revision ?? 0,
  )
  replay()
}
onMounted(load)
</script>
<template>
  <section :aria-busy="busy">
    <h3>{{ t('software.versionAdmission') }} · {{ version }}</h3>
    <p>{{ t('software.admissionHint') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <template v-if="current">
      <p>
        {{
          current.admission ? t(`software.${current.admission.state}`) : t('software.notAdmitted')
        }}
      </p>
      <dl v-if="current.admission">
        <dt>{{ t('software.admissionOperation') }}</dt>
        <dd>{{ current.admission.operation }}</dd>
        <dt>{{ t('software.evidence') }}</dt>
        <dd>{{ current.admission.evidence.join(' · ') }}</dd>
      </dl>
      <label :for="`admission-evidence-${version}`">{{ t('software.evidence') }}</label
      ><textarea
        :id="`admission-evidence-${version}`"
        v-model="evidence"
        :disabled="busy || uncertain"
      />
      <button
        :disabled="busy || uncertain || !evidence.trim() || current.admission?.state === 'approved'"
        @click="change('approve')"
      >
        {{ t('software.approveAdmission') }}
      </button>
      <button
        :disabled="busy || uncertain || !evidence.trim() || current.admission?.state !== 'approved'"
        @click="change('withdraw')"
      >
        {{ t('software.withdrawAdmission') }}
      </button>
    </template>
    <button :disabled="busy" @click="load">{{ t('software.reconcile') }}</button>
    <button v-if="uncertain" :disabled="busy" @click="replay">{{ t('policies.replay') }}</button>
  </section>
</template>
