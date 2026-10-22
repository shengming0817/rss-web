<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@rss/core/components'
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
  { run, busy, failure, pending, locked, submit } = useSettingsAction(
    () => `pki-crl:${props.purpose}`,
  )
const open = ref(false),
  publications = ref<Publication[]>(),
  received = ref(false),
  reviewed = ref(false)
function close() {
  open.value = false
  publications.value = undefined
  reviewed.value = false
}
async function file(event: Event) {
  const input = event.target as HTMLInputElement,
    selected = input.files?.[0]
  input.value = ''
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
  <section class="console-panel">
    <h2>{{ t('security.pki.publish') }}</h2>
    <p>{{ t('security.pki.crlHint') }}</p>
    <UiButton :disabled="locked || !canWrite" @click="open = true">{{
      t('security.pki.publish')
    }}</UiButton
    ><OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
    />
  </section>
  <UiDialog
    :open="open"
    placement="right"
    :dismissible="!busy"
    :title="t('security.pki.publish')"
    :close-label="t('security.pki.close')"
    @update:open="close"
  >
    <p>{{ t('security.pki.publicHint') }}</p>
    <p>{{ t('security.pki.crlHint') }}</p>
    <label for="pki-crl-file">{{ t('security.pki.crlFile') }}</label
    ><input
      id="pki-crl-file"
      type="file"
      accept="application/json,.json"
      :disabled="locked || !canWrite"
      @change="file"
    />
    <p>{{ t('security.pki.purpose') }} · {{ t(`security.pki.${purpose}`) }}</p>
    <ul v-if="publications">
      <li v-for="item in publications" :key="item.issuer" class="console-locator">
        {{ item.issuer }}
      </li>
    </ul>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="received" role="status">{{ t('security.pki.publish') }} · HTTP 204</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
    />
    <template #footer
      ><UiButton
        v-if="!reviewed"
        :disabled="locked || !canWrite || !publications"
        @click="reviewed = true"
        >{{ t('security.pki.review') }}</UiButton
      ><UiButton v-else :disabled="locked || !canWrite || !publications" @click="publish">{{
        t('security.pki.publish')
      }}</UiButton></template
    >
  </UiDialog>
</template>
