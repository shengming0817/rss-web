<script setup lang="ts">
import { VAlert, VBtn, VCheckbox, VForm, VTextField, VTextarea } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useLocalProfile } from '@rss/auth'
const props = defineProps<{ principalId: string }>()
const { t } = useI18n()
const {
  revision,
  displayName,
  username,
  email,
  extensions,
  age,
  displayMissing,
  usernameMissing,
  emailMissing,
  compared,
  busy,
  error,
  pending,
  load,
  save,
  resumeEditing,
  receipt,
} = useLocalProfile(() => props.principalId)
</script>
<template>
  <section class="d-flex flex-column ga-4">
    <p>{{ t('identity.localProfileHelp') }}</p>
    <VAlert v-if="error" type="warning">{{ t(`identity.errors.${error}`) }}</VAlert>
    <VAlert v-if="pending" type="warning"
      >{{ t('identity.profilePending') }} <code>{{ pending.id }}</code></VAlert
    >
    <div class="d-flex flex-wrap ga-2">
      <VBtn :disabled="busy" @click="load">{{ t('identity.reload') }}</VBtn>
      <VBtn v-if="pending" :disabled="busy" @click="receipt">{{
        t('identity.profileReceipt')
      }}</VBtn>
      <VBtn v-if="pending && compared" :disabled="busy" @click="resumeEditing">{{
        t('identity.profileResume')
      }}</VBtn>
    </div>
    <p v-if="pending && compared">{{ t('identity.profileComparedHelp') }}</p>
    <VForm
      v-if="revision !== undefined"
      :disabled="busy || !!pending"
      class="d-flex flex-column ga-2"
      @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (save())"
    >
      <VTextField
        id="local-display"
        v-model="displayName"
        :label="t('identity.profileDisplayName')"
        maxlength="2048"
        @update:model-value="displayMissing = false"
      />
      <VCheckbox
        id="local-display-missing"
        v-model="displayMissing"
        :label="t('identity.profileNotProvided')"
      />
      <VTextField
        id="local-username"
        v-model="username"
        :label="t('identity.username')"
        maxlength="2048"
        @update:model-value="usernameMissing = false"
      />
      <VCheckbox
        id="local-username-missing"
        v-model="usernameMissing"
        :label="t('identity.profileNotProvided')"
      />
      <VTextField
        id="local-email"
        v-model="email"
        :label="t('identity.profileEmail')"
        type="email"
        maxlength="2048"
        @update:model-value="emailMissing = false"
      />
      <VCheckbox
        id="local-email-missing"
        v-model="emailMissing"
        :label="t('identity.profileNotProvided')"
      />
      <VTextarea
        id="local-extensions"
        v-model="extensions"
        :label="t('identity.profileExtensions')"
        rows="8"
      />
      <VTextField
        id="local-profile-age"
        v-model.number="age"
        :label="t('identity.profileAge')"
        type="number"
        min="60"
        max="86400"
        required
      />
      <div class="d-flex flex-wrap ga-2">
        <VBtn type="submit" color="primary" :disabled="busy || !!pending">{{
          t('identity.save')
        }}</VBtn
        ><VBtn type="button" color="error" :disabled="busy || !!pending" @click="save(true)">{{
          t('identity.profileDelete')
        }}</VBtn>
      </div>
    </VForm>
  </section>
</template>
