<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { isRssApiError } from '@rss/api/identity'
import { useIdentity } from '../context'
import { profileObject, type LocalProfile } from '../services/profile'
const props = defineProps<{ principalId: string }>()
const { api, session } = useIdentity(),
  { t } = useI18n()
const revision = ref<number>(),
  displayName = ref(''),
  username = ref(''),
  email = ref(''),
  extensions = ref('{}'),
  age = ref(14400)
const busy = ref(false),
  error = ref(''),
  pending = ref<{ id: string; state: 'unknown' | 'conflict' }>()
let generation = 0
function clear() {
  generation++
  revision.value = undefined
  displayName.value = ''
  username.value = ''
  email.value = ''
  extensions.value = '{}'
  pending.value = undefined
  error.value = ''
}
function denied(e: unknown) {
  if (isRssApiError(e) && (e.status === 401 || e.status === 403)) clear()
  error.value = isRssApiError(e) && e.cause === 'wire' ? e.code : 'unknown_result'
}
async function load() {
  if (busy.value) return
  const own = generation
  busy.value = true
  error.value = ''
  try {
    const v = await api.localProfile(props.principalId)
    if (own !== generation) return
    revision.value = v.revision
    displayName.value = v.value?.displayName ?? ''
    username.value = v.value?.username ?? ''
    email.value = v.value?.email ?? ''
    extensions.value = JSON.stringify(v.value?.extensions ?? {}, null, 2)
    age.value = v.value?.maxAgeSeconds ?? 14400
    if (pending.value?.state === 'conflict') pending.value = undefined
  } catch (e) {
    if (own === generation) denied(e)
  } finally {
    busy.value = false
  }
}
async function save(remove = false) {
  if (busy.value || pending.value || revision.value === undefined) return
  let value: LocalProfile | null
  try {
    value = remove
      ? null
      : {
          displayName: displayName.value || null,
          username: username.value || null,
          email: email.value || null,
          extensions: profileObject(JSON.parse(extensions.value)),
          maxAgeSeconds: age.value,
        }
  } catch {
    error.value = 'invalid_request'
    return
  }
  const own = generation,
    id = crypto.randomUUID(),
    expected = revision.value
  pending.value = { id, state: 'unknown' }
  busy.value = true
  error.value = ''
  displayName.value = ''
  username.value = ''
  email.value = ''
  extensions.value = '{}'
  try {
    await api.saveLocalProfile(props.principalId, id, expected, value)
    if (own !== generation) return
    pending.value = undefined
  } catch (e) {
    if (own === generation) {
      if (isRssApiError(e) && e.cause === 'wire' && e.status === 409)
        pending.value = { id, state: 'conflict' }
      else if (isRssApiError(e) && e.cause === 'wire' && e.status !== undefined && e.status < 500)
        pending.value = undefined
      denied(e)
    }
  } finally {
    busy.value = false
  }
  if (own === generation && !pending.value) await load()
}
async function receipt() {
  const p = pending.value
  if (!p || busy.value) return
  const own = generation
  busy.value = true
  error.value = ''
  try {
    const r = await api.localProfileOperation(props.principalId, p.id)
    if (own !== generation) return
    if (r) pending.value = undefined
    else error.value = 'profile_receipt_missing'
  } catch (e) {
    if (own === generation) denied(e)
  } finally {
    busy.value = false
  }
  if (own === generation && !pending.value) await load()
}
watch(
  () => [props.principalId, session.state.value.status, session.state.value.session?.id],
  () => {
    clear()
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(clear)
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
    <form v-if="revision !== undefined" class="auth-form" @submit.prevent="save()">
      <label for="local-display">{{ t('identity.profileDisplayName') }}</label
      ><input
        id="local-display"
        v-model="displayName"
        class="ui-input"
        :disabled="busy || !!pending"
        maxlength="2048"
      />
      <label for="local-username">{{ t('identity.username') }}</label
      ><input
        id="local-username"
        v-model="username"
        class="ui-input"
        :disabled="busy || !!pending"
        maxlength="2048"
      />
      <label for="local-email">{{ t('identity.profileEmail') }}</label
      ><input
        id="local-email"
        v-model="email"
        class="ui-input"
        :disabled="busy || !!pending"
        type="email"
        maxlength="2048"
      />
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
