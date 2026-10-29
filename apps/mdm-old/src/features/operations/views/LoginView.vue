<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VCol,
  VContainer,
  VForm,
  VRow,
  VTextField,
} from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useLoginFlow } from '@rss/auth'
import MdmSurface from '../../../ui/MdmSurface.vue'
const { t } = useI18n()
const {
  session,
  host,
  tenant,
  login,
  password,
  providers,
  busy,
  error,
  errorMessage,
  submit,
  sso,
  continueFlow,
  run,
} = useLoginFlow()
function loginSubmit(event: Event) {
  if ((event.target as HTMLFormElement).reportValidity()) void submit()
}
</script>
<template>
  <MdmSurface>
    <VContainer>
      <VRow justify="center"
        ><VCol cols="12" sm="9" md="6" lg="5">
          <VCard :aria-busy="busy" aria-labelledby="login-title">
            <VCardText
              ><p class="text-overline">{{ host?.brand ?? 'RSS MDM' }}</p></VCardText
            >
            <VCardTitle id="login-title" tag="h1">{{ t('identity.login') }}</VCardTitle>
            <VCardText class="d-flex flex-column ga-4">
              <p>{{ t(host?.descriptionKey ?? 'identity.loginDescription') }}</p>
              <VAlert v-if="session.invalidated.value" type="info" variant="tonal" role="status">{{
                t('identity.expired')
              }}</VAlert>
              <VAlert v-if="error" type="error" variant="tonal">{{ errorMessage }}</VAlert>
              <VBtn
                v-if="
                  session.state.value.status === 'authenticated' &&
                  session.state.value.tenant === tenant
                "
                color="primary"
                :loading="busy"
                :disabled="busy"
                @click="run(continueFlow)"
                >{{ t('identity.continue') }}</VBtn
              >
              <VForm
                v-else-if="tenant"
                :disabled="busy"
                class="d-flex flex-column ga-4"
                @submit.prevent="loginSubmit"
              >
                <VTextField
                  id="login-name"
                  v-model="login"
                  :label="t('identity.username')"
                  autocomplete="username"
                  required
                />
                <VTextField
                  id="login-password"
                  v-model="password"
                  :label="t('identity.password')"
                  type="password"
                  autocomplete="current-password"
                  required
                />
                <VBtn color="primary" type="submit" :loading="busy" :disabled="busy">{{
                  t('identity.login')
                }}</VBtn>
              </VForm>
              <VBtn
                v-for="p in providers"
                :key="p.id"
                variant="outlined"
                :disabled="busy"
                @click="sso(p.id)"
                >{{ t('identity.sso') }} · {{ p.label }}</VBtn
              >
              <p v-if="host" class="text-body-2">{{ host.origin }}</p>
              <VBtn v-if="host" :href="host.switchHref" variant="text">{{
                t(host.switchLabelKey)
              }}</VBtn>
              <p class="text-body-2">{{ t('identity.recoveryHelp') }}</p>
            </VCardText>
          </VCard>
        </VCol></VRow
      >
    </VContainer>
  </MdmSurface>
</template>
