<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ModalShell } from '@rss/core'
import { useIdentitySession } from './session-context'

const { t } = useI18n()
const { signOut, signOutPending, state } = useIdentitySession()
const confirmAll = ref(false)
const profile = computed(() =>
  state.value.status === 'authenticated' || state.value.status === 'refreshing'
    ? state.value.profile
    : undefined,
)

function logout(): void {
  void signOut(false)
}

function logoutAll(): void {
  if (signOutPending.value) return
  confirmAll.value = false
  void signOut(true)
}
</script>

<template>
  <div v-if="profile" class="session-actions">
    <span class="session-actions__subject">{{ profile.subject }}</span>
    <button
      type="button"
      class="v1-ghost"
      data-testid="logout-current"
      :disabled="signOutPending"
      @click="logout"
    >
      {{ t('identity.actions.logout') }}
    </button>
    <button
      type="button"
      class="v1-ghost"
      data-testid="logout-all"
      :disabled="signOutPending"
      @click="confirmAll = true"
    >
      {{ t('identity.actions.logoutAll') }}
    </button>
  </div>
  <ModalShell
    :open="confirmAll"
    role="alertdialog"
    title-id="logout-all-title"
    description-id="logout-all-description"
    @close="confirmAll = false"
  >
    <h2 id="logout-all-title">{{ t('identity.logoutAll.title') }}</h2>
    <p id="logout-all-description">{{ t('identity.logoutAll.description') }}</p>
    <div class="session-actions__dialog-buttons">
      <button type="button" class="v1-ghost" @click="confirmAll = false">
        {{ t('identity.logoutAll.cancel') }}
      </button>
      <button type="button" class="v1-btn" data-testid="confirm-logout-all" @click="logoutAll">
        {{ t('identity.logoutAll.confirm') }}
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.session-actions,
.session-actions__dialog-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.session-actions__subject {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-muted);
  font-size: 12px;
}
.session-actions__dialog-buttons {
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
