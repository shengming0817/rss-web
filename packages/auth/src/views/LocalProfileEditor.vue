<script setup lang="ts">
import { UiButton } from '@rss/core/components'
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
    <UiButton :disabled="busy" @click="load">{{ t('identity.reload') }}</UiButton>
    <UiButton v-if="pending" :disabled="busy" @click="receipt">{{
      t('identity.profileReceipt')
    }}</UiButton>
    <p v-if="pending && compared">{{ t('identity.profileComparedHelp') }}</p>
    <UiButton v-if="pending && compared" :disabled="busy" @click="resumeEditing">{{
      t('identity.profileResume')
    }}</UiButton>
    <form v-if="revision !== undefined" class="auth-form" @submit.prevent="save()">
      <label for="local-display">{{ t('identity.profileDisplayName') }}</label
      ><input
        id="local-display"
        v-model="displayName"
        class="ui-input"
        :disabled="busy || !!pending"
        maxlength="2048"
        @input="displayMissing = false"
      />
      <label
        ><input
          id="local-display-missing"
          v-model="displayMissing"
          type="checkbox"
          :disabled="busy || !!pending"
        />{{ t('identity.profileNotProvided') }}</label
      >
      <label for="local-username">{{ t('identity.username') }}</label
      ><input
        id="local-username"
        v-model="username"
        class="ui-input"
        :disabled="busy || !!pending"
        maxlength="2048"
        @input="usernameMissing = false"
      />
      <label
        ><input
          id="local-username-missing"
          v-model="usernameMissing"
          type="checkbox"
          :disabled="busy || !!pending"
        />{{ t('identity.profileNotProvided') }}</label
      >
      <label for="local-email">{{ t('identity.profileEmail') }}</label
      ><input
        id="local-email"
        v-model="email"
        class="ui-input"
        :disabled="busy || !!pending"
        type="email"
        maxlength="2048"
        @input="emailMissing = false"
      />
      <label
        ><input
          id="local-email-missing"
          v-model="emailMissing"
          type="checkbox"
          :disabled="busy || !!pending"
        />{{ t('identity.profileNotProvided') }}</label
      >
      <label for="local-extensions">{{ t('identity.profileExtensions') }}</label
      ><textarea
        id="local-extensions"
        v-model="extensions"
        class="ui-input"
        :disabled="busy || !!pending"
        rows="8"
      />
      <label for="local-profile-age">{{ t('identity.profileAge') }}</label
      ><input
        id="local-profile-age"
        v-model.number="age"
        class="ui-input"
        :disabled="busy || !!pending"
        type="number"
        min="60"
        max="86400"
        required
      />
      <UiButton type="submit" :disabled="busy || !!pending">{{ t('identity.save') }}</UiButton>
      <UiButton type="button" :disabled="busy || !!pending" @click="save(true)">{{
        t('identity.profileDelete')
      }}</UiButton>
    </form>
  </section>
</template>
