<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VFileInput,
  VList,
  VListItem,
} from 'vuetify/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import { pkiPublications, type PkiPurpose, type Publication } from '../../settings/clients/pki'
import { inputDigest } from '../../settings/clients/value'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const props = defineProps<{ purpose: PkiPurpose }>()
const runtime = useMdm(),
  { t } = useI18n(),
  { canWrite } = usePermission('credentials', 'credentials'),
  { run, busy, failure, pending, locked, submit, compared, markCompared, resolveConflict } =
    useSettingsAction(() => `pki-crl:${props.purpose}`)
const open = ref(false),
  publications = ref<Publication[]>(),
  received = ref(false),
  reviewed = ref(false)
function close() {
  open.value = false
  publications.value = undefined
  reviewed.value = false
}
async function compare() {
  if (await run(() => runtime.settings.pki.read(props.purpose))) markCompared()
}
async function file(selected: File | File[] | null) {
  if (Array.isArray(selected)) selected = selected[0] ?? null
  publications.value = undefined
  reviewed.value = false
  if (!selected) return
  if (selected.size > 24 * 1024 * 1024) {
    failure.value = 'requestTooLarge'
    return
  }
  await run(
    async () => pkiPublications(JSON.parse(await selected.text())),
    (value) => {
      publications.value = value
    },
  )
}
async function publish() {
  if (!publications.value || locked.value || !canWrite.value || !reviewed.value) return
  const input = publications.value
  received.value = false
  await submit(
    'crl',
    0,
    { purpose: props.purpose, publicationsSha256: inputDigest(JSON.stringify(input)) },
    (id) => runtime.settings.pki.publish(id, props.purpose, input),
    () => {
      received.value = true
      publications.value = undefined
    },
  )
}
useSettingsFacts(() => {
  close()
  received.value = false
})
</script>
<template>
  <v-card :title="t('security.pki.publish')" class="mb-4"
    ><v-card-text
      ><p class="mb-4">{{ t('security.pki.crlHint') }}</p>
      <v-btn :disabled="locked || !canWrite" @click="open = true">{{
        t('security.pki.publish')
      }}</v-btn
      ><OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :query-supported="false"
        :compared="compared"
        @compare="compare"
        @edit="resolveConflict" /></v-card-text
  ></v-card>
  <v-dialog
    :model-value="open"
    :persistent="busy"
    max-width="760"
    scrollable
    :aria-label="t('security.pki.publish')"
    @update:model-value="!$event && close()"
    ><v-card
      ><v-card-title>{{ t('security.pki.publish') }}</v-card-title
      ><v-card-text
        ><p class="mb-3">{{ t('security.pki.publicHint') }}</p>
        <p class="mb-3">{{ t('security.pki.crlHint') }}</p>
        <v-file-input
          id="pki-crl-file"
          :label="t('security.pki.crlFile')"
          accept="application/json,.json"
          :disabled="locked || !canWrite"
          @update:model-value="file" />
        <p>{{ t('security.pki.purpose') }} · {{ t(`security.pki.${purpose}`) }}</p>
        <v-list v-if="publications"
          ><v-list-item
            v-for="item in publications"
            :key="item.issuer"
            :title="item.issuer" /></v-list
        ><v-alert v-if="failure" type="error" variant="tonal" class="my-3">{{
          t('devices.' + failure)
        }}</v-alert
        ><v-alert v-if="received" type="success" variant="tonal" class="my-3"
          >{{ t('security.pki.publish') }} · HTTP 204</v-alert
        ><OperationNotice
          :operation="pending"
          :busy="busy"
          :can-write="canWrite"
          :query-supported="false"
          :compared="compared"
          @compare="compare"
          @edit="resolveConflict" /></v-card-text
      ><v-card-actions
        ><v-btn :disabled="busy" @click="close">{{ t('security.pki.close') }}</v-btn
        ><v-btn
          v-if="!reviewed"
          :disabled="locked || !canWrite || !publications"
          @click="reviewed = true"
          >{{ t('security.pki.review') }}</v-btn
        ><v-btn v-else :disabled="locked || !canWrite || !publications" @click="publish">{{
          t('security.pki.publish')
        }}</v-btn></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
