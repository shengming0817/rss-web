<script setup lang="ts">
import { VBtn, VCheckbox, VTextField, VTextarea } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useLocalProfile } from '../useLocalProfile'
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
  <section class="auth-form">
    <h2>{{ t('identity.localProfile') }}</h2>
    <p>{{ t('identity.localProfileHelp') }}</p>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p v-if="pending" role="status">
      {{ t('identity.profilePending') }} <code>{{ pending.id }}</code>
    </p>
    <VBtn :disabled="busy" @click="load">{{ t('identity.reload') }}</VBtn>
    <VBtn v-if="pending" :disabled="busy" @click="receipt">{{ t('identity.profileReceipt') }}</VBtn>
    <p v-if="pending && compared">{{ t('identity.profileComparedHelp') }}</p>
    <VBtn v-if="pending && compared" :disabled="busy" @click="resumeEditing">{{
      t('identity.profileResume')
    }}</VBtn>
    <form v-if="revision !== undefined" class="auth-form" @submit.prevent="save()">
      <VTextField
        id="local-display"
        v-model="displayName"
        :disabled="busy || !!pending"
        maxlength="2048"
        :label="t('identity.profileDisplayName')"
        @input="displayMissing = false"
      />
      <VCheckbox
        id="local-display-missing"
        v-model="displayMissing"
        :disabled="busy || !!pending"
        :label="t('identity.profileNotProvided')"
      />
      <VTextField
        id="local-username"
        v-model="username"
        :disabled="busy || !!pending"
        maxlength="2048"
        :label="t('identity.username')"
        @input="usernameMissing = false"
      />
      <VCheckbox
        id="local-username-missing"
        v-model="usernameMissing"
        :disabled="busy || !!pending"
        :label="t('identity.profileNotProvided')"
      />
      <VTextField
        id="local-email"
        v-model="email"
        :disabled="busy || !!pending"
        type="email"
        maxlength="2048"
        :label="t('identity.profileEmail')"
        @input="emailMissing = false"
      />
      <VCheckbox
        id="local-email-missing"
        v-model="emailMissing"
        :disabled="busy || !!pending"
        :label="t('identity.profileNotProvided')"
      />
      <VTextarea
        id="local-extensions"
        v-model="extensions"
        :disabled="busy || !!pending"
        rows="8"
        :label="t('identity.profileExtensions')"
        auto-grow
      />
      <VTextField
        id="local-profile-age"
        v-model.number="age"
        :disabled="busy || !!pending"
        type="number"
        min="60"
        max="86400"
        required
        :label="t('identity.profileAge')"
      />
      <VBtn type="submit" :disabled="busy || !!pending">{{ t('identity.save') }}</VBtn>
      <VBtn type="button" :disabled="busy || !!pending" @click="save(true)">{{
        t('identity.profileDelete')
      }}</VBtn>
    </form>
  </section>
</template>
