<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ErrorPage, ModalShell, SourceBadge } from '@rss/core'
import { MANUAL_SOURCE, RSS_SOURCE } from '@rss/shared'
import { useAuthorizationIntent } from '../authorization/authorization-context'
import { useSettingsApi } from './settings-context'
import { SECRET_RESOLVE_INTENT } from './secret-resolve-intent'
import {
  createSecretMaterialRevealOperation,
  type SecretMaterialClearReason,
  type SecretMaterialRevealState,
} from './secret-material-reveal-operation'

const { t } = useI18n()
const api = useSettingsApi()
const authorization = useAuthorizationIntent(SECRET_RESOLVE_INTENT)
const operation = createSecretMaterialRevealOperation({
  resolveSecret: (key, options) => authorization.execute(() => api.resolveSecret(key, options)),
})
const state = shallowRef<SecretMaterialRevealState>(operation.getState())
const keyInput = ref('')
const attempted = ref(false)
const keyField = ref<HTMLInputElement>()
const busyStatus = ref<HTMLElement>()
const activeHeading = ref<HTMLElement>()
const materialNode = ref<HTMLElement>()
const outcomeStatus = ref<HTMLElement>()
const clearedStatus = ref<HTMLElement>()

const invalidKey = computed(() => attempted.value && keyInput.value.length === 0)
const locked = computed(() => state.value.status === 'resolving' || state.value.status === 'active')

function removeMaterialFromDom(): void {
  materialNode.value?.replaceChildren()
}

let previousStatus = state.value.status
const unsubscribe = operation.subscribe((next) => {
  const prior = previousStatus
  previousStatus = next.status
  if (next.status !== 'active') removeMaterialFromDom()
  state.value = next
  if (next.status === 'resolving') void nextTick(() => busyStatus.value?.focus())
  if (next.status === 'active' && prior !== 'active') {
    void nextTick(() => {
      if (materialNode.value !== undefined) operation.renderActiveInto(materialNode.value)
      activeHeading.value?.focus()
    })
  }
  if (next.status === 'error') void nextTick(() => outcomeStatus.value?.focus())
  if (next.status === 'cleared' && (next.reason === 'manual' || next.reason === 'expired')) {
    void nextTick(() => clearedStatus.value?.focus())
  }
})

function prepare(): void {
  if (locked.value) return
  attempted.value = true
  if (keyInput.value.length === 0) {
    void nextTick(() => keyField.value?.focus())
    return
  }
  operation.begin(keyInput.value)
}

function cancel(): void {
  operation.cancel()
}

function confirm(): void {
  if (state.value.status !== 'confirming') return
  keyInput.value = ''
  attempted.value = false
  void operation.confirm()
}

function clear(reason: SecretMaterialClearReason): void {
  removeMaterialFromDom()
  operation.clear(reason)
}

function hide(): void {
  if (state.value.status === 'active') clear('manual')
}

function copy(): void {
  void operation.copy((material) => {
    if (navigator.clipboard === undefined) return Promise.reject(new Error('clipboard unavailable'))
    return navigator.clipboard.writeText(material)
  })
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') clear('hidden')
}

function onPageHide(): void {
  clear('pagehide')
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
})

onBeforeRouteLeave(() => {
  clear('route')
})

onBeforeUnmount(() => {
  clear('unmount')
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', onPageHide)
  unsubscribe()
  operation.dispose()
  keyInput.value = ''
})
</script>

<template>
  <section class="secret-material" aria-labelledby="secret-material-title">
    <header>
      <h1 id="secret-material-title" class="v1-h1">{{ t('secretMaterialReveal.title') }}</h1>
      <p class="v1-sub">{{ t('secretMaterialReveal.subtitle') }}</p>
      <SourceBadge :source="RSS_SOURCE" />
    </header>

    <form :aria-busy="state.status === 'resolving'" novalidate @submit.prevent="prepare">
      <div class="secret-material__heading">
        <h2>{{ t('secretMaterialReveal.draftTitle') }}</h2>
        <SourceBadge :source="MANUAL_SOURCE" />
      </div>
      <label for="secret-material-key">{{ t('secretMaterialReveal.key') }}</label>
      <input
        id="secret-material-key"
        ref="keyField"
        v-model="keyInput"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :disabled="locked"
        :aria-invalid="invalidKey"
        :aria-describedby="
          invalidKey
            ? 'secret-material-key-hint secret-material-key-error'
            : 'secret-material-key-hint'
        "
      />
      <p id="secret-material-key-hint">{{ t('secretMaterialReveal.keyHint') }}</p>
      <p v-if="invalidKey" id="secret-material-key-error" role="alert">
        {{ t('secretMaterialReveal.required') }}
      </p>
      <button type="submit" class="v1-btn" data-action="prepare-secret-material" :disabled="locked">
        {{ t('secretMaterialReveal.prepare') }}
      </button>
    </form>

    <p
      v-if="state.status === 'resolving'"
      ref="busyStatus"
      data-secret-material-busy
      role="status"
      aria-live="polite"
      tabindex="-1"
    >
      {{ t('secretMaterialReveal.resolving') }}
    </p>

    <section
      v-if="state.status === 'active'"
      data-secret-material-view
      class="secret-material__active"
      aria-labelledby="secret-material-active-title"
      @keydown.esc.prevent.stop="hide"
    >
      <div class="secret-material__heading">
        <h2 id="secret-material-active-title" ref="activeHeading" tabindex="-1">
          {{ t('secretMaterialReveal.activeTitle') }}
        </h2>
        <SourceBadge :source="RSS_SOURCE" />
      </div>
      <p role="alert">{{ t('secretMaterialReveal.activeWarning') }}</p>
      <p>{{ t('secretMaterialReveal.lease') }}</p>
      <code
        ref="materialNode"
        data-secret-material-active
        class="secret-material__value"
        dir="ltr"
        translate="no"
        :aria-label="t('secretMaterialReveal.materialLabel')"
      ></code>
      <p>{{ t('secretMaterialReveal.clipboardWarning') }}</p>
      <div class="secret-material__actions">
        <button type="button" class="v1-btn" data-action="copy-secret-material" @click="copy">
          {{ t('secretMaterialReveal.copy') }}
        </button>
        <button type="button" class="v1-ghost" data-action="hide-secret-material" @click="hide">
          {{ t('secretMaterialReveal.hide') }}
        </button>
      </div>
      <p data-copy-status role="status" aria-live="polite" aria-atomic="true">
        {{
          state.copy === 'copied'
            ? t('secretMaterialReveal.copied')
            : state.copy === 'failed'
              ? t('secretMaterialReveal.copyFailed')
              : ''
        }}
      </p>
    </section>

    <p
      v-if="state.status === 'cleared'"
      ref="clearedStatus"
      data-secret-material-cleared
      role="status"
      aria-live="polite"
      tabindex="-1"
    >
      {{
        t(
          state.reason === 'expired'
            ? 'secretMaterialReveal.expired'
            : 'secretMaterialReveal.cleared',
        )
      }}
    </p>

    <div
      v-if="state.status === 'error'"
      ref="outcomeStatus"
      data-secret-material-outcome
      tabindex="-1"
    >
      <ErrorPage :error="state.error" :heading-level="2" :show-recovery="false" role="alert" />
    </div>

    <ModalShell
      :open="state.status === 'confirming'"
      role="alertdialog"
      title-id="secret-material-confirm-title"
      description-id="secret-material-confirm-description"
      @close="cancel"
    >
      <h2 id="secret-material-confirm-title">{{ t('secretMaterialReveal.confirmTitle') }}</h2>
      <p id="secret-material-confirm-description">
        {{ t('secretMaterialReveal.confirmDescription') }}
      </p>
      <div class="secret-material__actions">
        <button type="button" class="v1-ghost" data-action="cancel-secret-material" @click="cancel">
          {{ t('secretMaterialReveal.cancel') }}
        </button>
        <button type="button" class="v1-btn" data-action="confirm-secret-material" @click="confirm">
          {{ t('secretMaterialReveal.confirm') }}
        </button>
      </div>
    </ModalShell>
  </section>
</template>

<style scoped>
.secret-material {
  display: grid;
  gap: 20px;
  max-width: 760px;
  padding: 32px;
}
.secret-material form,
.secret-material__active {
  display: grid;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.secret-material input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  color: var(--fg);
  background: var(--bg);
}
.secret-material__heading,
.secret-material__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.secret-material__value {
  display: block;
  padding: 12px;
  overflow-wrap: anywhere;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--bg);
}
</style>
