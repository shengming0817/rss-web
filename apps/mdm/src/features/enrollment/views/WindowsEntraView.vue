<script setup lang="ts">
import {
  VForm,
  VBtn,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VTextField,
  VTextarea,
} from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../usePermission'
import { useOperation } from '../../../services/useOperation'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import MdmPage from '../../../ui/MdmPage.vue'
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
  <MdmPage :title="t('onboarding.windowsEntra')" :busy="busy" :failure="failure">
    <RegistrationStatus channel="windows_mdm" />
    <p>{{ t('onboarding.entraGuide') }}</p>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <v-btn type="button" :disabled="!!busy" @click="refresh">{{ t('devices.reload') }}</v-btn>
      <dl v-if="current">
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ current.revision }}</dd>
        <dt>{{ t('onboarding.termsVersion') }}</dt>
        <dd>{{ current.policy.termsVersion }}</dd>
        <dt>{{ t('devices.status') }}</dt>
        <dd>{{ t(`devices.${current.policy.enabled ? 'yes' : 'no'}`) }}</dd>
      </dl>
      <pre v-if="current" class="enrollment-terms">{{ current.policy.termsText }}</pre>
      <v-expansion-panels
        v-if="canWrite && current"
        multiple
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('console.configure') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <v-form :novalidate="false" @submit.prevent="save">
              <fieldset :disabled="busy || uncertain">
                <legend>{{ t('onboarding.entraPolicy') }}</legend>
                <v-checkbox
                  v-model="enabled"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.enabled')"
                /><v-checkbox
                  v-model="allUsers"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.allUsers')"
                /><v-textarea
                  v-if="!allUsers"
                  v-model="users"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.entraUsers')"
                /><v-text-field
                  v-model="termsVersion"
                  maxlength="128"
                  :required="enabled"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.termsVersion')"
                /><v-textarea
                  v-model="termsText"
                  :required="enabled"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.termsText')"
                />
                <p>{{ t('onboarding.termsBudget') }}</p>
                <v-checkbox
                  v-model="allowBackground"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.allowBackground')"
                /><v-btn type="submit" :disabled="busy || uncertain">{{
                  t('registration.save')
                }}</v-btn>
              </fieldset>
            </v-form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <v-btn v-if="current" type="button" :disabled="!!busy" @click="load">
        {{ t('onboarding.loadCurrent') }}
      </v-btn>
      <p v-if="uncertain">{{ t('onboarding.compareUnknown') }}</p>
      <v-btn v-if="uncertain && freshRead" type="button" @click="confirmComparison">
        {{ t('onboarding.confirmComparison') }}
      </v-btn>
    </template>
  </MdmPage>
</template>
