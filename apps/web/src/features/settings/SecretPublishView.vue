<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import type { SettingsApi } from '@rss/settings'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import { MANUAL_SOURCE, RSS_SOURCE } from '@rss/shared'
import { toSafeErrorPresentation } from '../../errors/rss-error'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { useSettingsApi } from './settings-context'
import {
  createSecretPublishOperation,
  type SecretPublishOperationState,
} from './secret-publish-operation'
import { SECRET_PUBLISH_INTENT } from './secret-publish-intent'

type SecretPublishRequest = Parameters<SettingsApi['publishSecret']>[0]

const { t } = useI18n()
const api = useSettingsApi()
const authorization = useAuthorizationIntent(SECRET_PUBLISH_INTENT)
const operation = createSecretPublishOperation({
  publishSecret: (request, options) =>
    authorization.execute(() => api.publishSecret(request, options)),
})
const state = shallowRef<SecretPublishOperationState>(operation.getState())
const keyInput = ref('')
const storeIdInput = ref('')
const refKeyInput = ref('')
const refVersionInput = ref('')
const attempted = ref(false)
const revealed = ref(false)
const keyField = ref<HTMLInputElement>()
const storeIdField = ref<HTMLInputElement>()
const refKeyField = ref<HTMLInputElement>()
const refVersionField = ref<HTMLInputElement>()
const prepareButton = ref<HTMLButtonElement>()
const busyStatus = ref<HTMLElement>()
const outcomeStatus = ref<HTMLElement>()
let prepared: SecretPublishRequest | undefined

const invalidKey = computed(() => attempted.value && keyInput.value.length === 0)
const invalidStoreId = computed(() => attempted.value && storeIdInput.value.length === 0)
const invalidRefKey = computed(() => attempted.value && refKeyInput.value.length === 0)
const busy = computed(() => state.value.status === 'publishing')
const locked = computed(() => busy.value || state.value.status === 'unknown')
const safeError = computed(() =>
  state.value.status === 'error' ? toSafeErrorPresentation(state.value.error) : undefined,
)

function clearFields() {
  keyInput.value = ''
  storeIdInput.value = ''
  refKeyInput.value = ''
  refVersionInput.value = ''
  revealed.value = false
}

const unsubscribe = operation.subscribe((next) => {
  state.value = next
  if (next.status === 'publishing') void nextTick(() => busyStatus.value?.focus())
  if (next.status === 'published' || next.status === 'error' || next.status === 'unknown') {
    void nextTick(() => outcomeStatus.value?.focus())
  }
})

function prepare() {
  if (locked.value) return
  attempted.value = true
  const firstInvalid =
    keyInput.value.length === 0
      ? keyField
      : storeIdInput.value.length === 0
        ? storeIdField
        : refKeyInput.value.length === 0
          ? refKeyField
          : undefined
  if (firstInvalid !== undefined) {
    void nextTick(() => firstInvalid.value?.focus())
    return
  }
  prepared = Object.freeze({
    key: keyInput.value,
    storeId: storeIdInput.value,
    refKey: refKeyInput.value,
    ...(refVersionInput.value.length === 0 ? {} : { refVersion: refVersionInput.value }),
  })
  operation.begin()
}

function cancel() {
  prepared = undefined
  operation.cancel()
}

function confirm() {
  const request = prepared
  if (request === undefined || state.value.status !== 'confirming') return
  prepared = undefined
  attempted.value = false
  clearFields()
  void operation.confirm(request)
}

onBeforeRouteLeave((to) => {
  if (
    (state.value.status === 'publishing' || state.value.status === 'unknown') &&
    to.name !== 'login'
  )
    return false
})

onBeforeUnmount(() => {
  prepared = undefined
  clearFields()
  unsubscribe()
  operation.dispose()
})
</script>

<template>
  <section class="secret-publish" aria-labelledby="secret-publish-title">
    <header>
      <h1 id="secret-publish-title" class="v1-h1">
        {{ t('secretReferencePublish.title') }}
      </h1>
      <p class="v1-sub">{{ t('secretReferencePublish.subtitle') }}</p>
      <SourceBadge :source="RSS_SOURCE" />
    </header>

    <form novalidate :aria-busy="busy" @submit.prevent="prepare">
      <div class="secret-publish__form-header">
        <h2>{{ t('secretReferencePublish.draftTitle') }}</h2>
        <SourceBadge :source="MANUAL_SOURCE" />
      </div>

      <label for="secret-key">{{ t('secretReferencePublish.key') }}</label>
      <input
        id="secret-key"
        ref="keyField"
        v-model="keyInput"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :disabled="locked"
        :aria-invalid="invalidKey"
        :aria-describedby="invalidKey ? 'secret-key-hint secret-key-error' : 'secret-key-hint'"
      />
      <p id="secret-key-hint">{{ t('secretReferencePublish.keyHint') }}</p>
      <p v-if="invalidKey" id="secret-key-error" role="alert">
        {{ t('secretReferencePublish.required') }}
      </p>

      <label for="secret-store-id">{{ t('secretReferencePublish.storeId') }}</label>
      <input
        id="secret-store-id"
        ref="storeIdField"
        v-model="storeIdInput"
        :type="revealed ? 'text' : 'password'"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :disabled="locked"
        :aria-invalid="invalidStoreId"
        :aria-describedby="
          invalidStoreId ? 'secret-store-id-hint secret-store-id-error' : 'secret-store-id-hint'
        "
      />
      <p id="secret-store-id-hint">{{ t('secretReferencePublish.storeIdHint') }}</p>
      <p v-if="invalidStoreId" id="secret-store-id-error" role="alert">
        {{ t('secretReferencePublish.required') }}
      </p>

      <label for="secret-ref-key">{{ t('secretReferencePublish.refKey') }}</label>
      <input
        id="secret-ref-key"
        ref="refKeyField"
        v-model="refKeyInput"
        :type="revealed ? 'text' : 'password'"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :disabled="locked"
        :aria-invalid="invalidRefKey"
        :aria-describedby="
          invalidRefKey ? 'secret-ref-key-hint secret-ref-key-error' : 'secret-ref-key-hint'
        "
      />
      <p id="secret-ref-key-hint">{{ t('secretReferencePublish.refKeyHint') }}</p>
      <p v-if="invalidRefKey" id="secret-ref-key-error" role="alert">
        {{ t('secretReferencePublish.required') }}
      </p>

      <label for="secret-ref-version">{{ t('secretReferencePublish.refVersion') }}</label>
      <input
        id="secret-ref-version"
        ref="refVersionField"
        v-model="refVersionInput"
        :type="revealed ? 'text' : 'password'"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :disabled="locked"
        aria-describedby="secret-ref-version-hint"
      />
      <p id="secret-ref-version-hint">{{ t('secretReferencePublish.refVersionHint') }}</p>

      <div class="secret-publish__actions">
        <button
          type="button"
          class="v1-ghost"
          data-action="reveal-secret-reference"
          :disabled="locked"
          :aria-pressed="revealed"
          @click="revealed = !revealed"
        >
          {{ t(revealed ? 'secretReferencePublish.hide' : 'secretReferencePublish.reveal') }}
        </button>
        <button
          ref="prepareButton"
          type="submit"
          class="v1-btn"
          data-action="prepare-secret-publish"
          :disabled="locked"
        >
          {{ t('secretReferencePublish.prepare') }}
        </button>
      </div>
    </form>

    <p v-if="busy" ref="busyStatus" role="status" tabindex="-1" aria-live="polite">
      {{ t('secretReferencePublish.publishing') }}
    </p>
    <p v-if="state.status === 'published'" ref="outcomeStatus" role="status" tabindex="-1">
      {{
        t('secretReferencePublish.published', {
          key: state.receipt.key,
          version: state.receipt.version,
        })
      }}
    </p>
    <div v-if="safeError" ref="outcomeStatus" tabindex="-1">
      <ErrorPage :error="safeError" :heading-level="2" :show-recovery="false" role="alert" />
    </div>
    <p v-if="state.status === 'unknown'" ref="outcomeStatus" role="alert" tabindex="-1">
      {{ t('secretReferencePublish.unknown') }}
    </p>

    <ModalShell
      :open="state.status === 'confirming'"
      role="alertdialog"
      title-id="secret-publish-confirm-title"
      description-id="secret-publish-confirm-description"
      @close="cancel"
    >
      <h2 id="secret-publish-confirm-title">{{ t('secretReferencePublish.confirmTitle') }}</h2>
      <p id="secret-publish-confirm-description">
        {{ t('secretReferencePublish.confirmDescription') }}
      </p>
      <div class="secret-publish__actions">
        <button type="button" class="v1-ghost" data-action="cancel-secret-publish" @click="cancel">
          {{ t('secretReferencePublish.cancel') }}
        </button>
        <button type="button" class="v1-btn" data-action="confirm-secret-publish" @click="confirm">
          {{ t('secretReferencePublish.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.secret-publish {
  display: grid;
  gap: 20px;
  max-width: 760px;
  padding: 32px;
}
.secret-publish form {
  display: grid;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.secret-publish input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.secret-publish__form-header,
.secret-publish__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
