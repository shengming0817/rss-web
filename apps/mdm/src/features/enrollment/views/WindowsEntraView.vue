<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../usePermission'
import { useOperation } from '../../../services/useOperation'
import OperationsFrame from '../../operations/components/OperationsFrame.vue'
const runtime = useMdm(),
  client = runtime.onboarding.entra,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission('authorization_read', 'authorization_write'),
  { run, runWrite, busy, uncertain, failure } = useOperation(
    ['service_unavailable'],
    () => runtime.session.state.value.session?.id,
  )
const current = ref<Awaited<ReturnType<typeof client.policy>>>(),
  enabled = ref(false),
  allUsers = ref(false),
  users = ref(''),
  termsVersion = ref(''),
  termsText = ref(''),
  allowBackground = ref(false),
  freshRead = ref(false)
function confirmComparison() {
  if (!freshRead.value || busy.value) return
  uncertain.value = false
  freshRead.value = false
}
function refresh() {
  if (!canRead.value) return
  void run(
    () => client.policy(),
    (v) => {
      current.value = v
      freshRead.value = true
    },
  )
}
function load() {
  if (!current.value) return
  const p = current.value.policy
  enabled.value = p.enabled
  allUsers.value = p.allUsers
  users.value = p.users.join('\n')
  termsVersion.value = p.termsVersion
  termsText.value = p.termsText
  allowBackground.value = p.allowBackground
}
function save() {
  if (!canWrite.value || !current.value || uncertain.value) return
  if (
    current.value.policy.termsText !== termsText.value &&
    current.value.policy.termsVersion === termsVersion.value
  ) {
    failure.value = 'conflict'
    return
  }
  freshRead.value = false
  void runWrite(() =>
    client.save(current.value!.revision, crypto.randomUUID(), {
      enabled: enabled.value,
      allUsers: allUsers.value,
      users: allUsers.value
        ? []
        : users.value
            .split(/\r?\n/)
            .map((v) => v.trim())
            .filter(Boolean),
      termsVersion: termsVersion.value,
      termsText: termsText.value,
      allowBackground: allowBackground.value,
    }),
  ).then((ok) => {
    if (ok) refresh()
  })
}
watch(
  canRead,
  (allowed) => {
    current.value = undefined
    enabled.value = false
    allUsers.value = false
    users.value = ''
    termsVersion.value = ''
    termsText.value = ''
    allowBackground.value = false
    freshRead.value = false
    if (allowed) refresh()
  },
  { immediate: true },
)
watch(current, (value) => {
  if (value && !termsVersion.value && !termsText.value) load()
})
</script>
<template>
  <OperationsFrame :title="t('onboarding.windowsEntra')" :busy="busy" :failure="failure">
    <p>{{ t('onboarding.entraGuide') }}</p>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <button type="button" :disabled="busy" @click="refresh">{{ t('devices.reload') }}</button>
      <dl v-if="current">
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ current.revision }}</dd>
        <dt>{{ t('onboarding.termsVersion') }}</dt>
        <dd>{{ current.policy.termsVersion }}</dd>
        <dt>{{ t('devices.status') }}</dt>
        <dd>{{ t(`devices.${current.policy.enabled ? 'yes' : 'no'}`) }}</dd>
      </dl>
      <pre v-if="current" class="enrollment-terms">{{ current.policy.termsText }}</pre>
      <form v-if="canWrite && current" @submit.prevent="save">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('onboarding.entraPolicy') }}</legend>
          <label><input v-model="enabled" type="checkbox" />{{ t('onboarding.enabled') }}</label
          ><label><input v-model="allUsers" type="checkbox" />{{ t('onboarding.allUsers') }}</label
          ><label v-if="!allUsers"
            >{{ t('onboarding.entraUsers') }}<textarea v-model="users" /></label
          ><label
            >{{ t('onboarding.termsVersion')
            }}<input v-model="termsVersion" maxlength="128" :required="enabled" /></label
          ><label
            >{{ t('onboarding.termsText') }}<textarea v-model="termsText" :required="enabled" />
          </label>
          <p>{{ t('onboarding.termsBudget') }}</p>
          <label
            ><input v-model="allowBackground" type="checkbox" />{{
              t('onboarding.allowBackground')
            }}</label
          ><button>{{ t('registration.save') }}</button>
        </fieldset>
      </form>
      <button v-if="current" type="button" :disabled="busy" @click="load">
        {{ t('onboarding.loadCurrent') }}
      </button>
      <p v-if="uncertain">{{ t('onboarding.compareUnknown') }}</p>
      <button v-if="uncertain && freshRead" type="button" @click="confirmComparison">
        {{ t('onboarding.confirmComparison') }}
      </button>
    </template>
  </OperationsFrame>
</template>
