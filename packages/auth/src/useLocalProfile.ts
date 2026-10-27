import { ref, watch, onBeforeUnmount } from 'vue'
import { isRssApiError } from '@rss/api/identity'
import { useIdentity } from './context'
import type { LocalProfile } from './services/profile'
import { profileObject } from './profile-json'
export function useLocalProfile(principalId: () => string) {
  const { api, session } = useIdentity()
  const revision = ref<number>(),
    displayName = ref(''),
    username = ref(''),
    email = ref(''),
    extensions = ref('{}'),
    age = ref(14400)
  const displayMissing = ref(true),
    usernameMissing = ref(true),
    emailMissing = ref(true)
  const compared = ref(false)
  const busy = ref(false),
    error = ref(''),
    pending = ref<{ id: string; state: 'unknown' | 'conflict' }>()
  let generation = 0
  function clear() {
    generation++
    compared.value = false
    displayMissing.value = usernameMissing.value = emailMissing.value = true
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
      const v = await api.localProfile(principalId())
      if (own !== generation) return
      revision.value = v.revision
      displayMissing.value = v.value?.displayName == null
      usernameMissing.value = v.value?.username == null
      emailMissing.value = v.value?.email == null
      displayName.value = v.value?.displayName ?? ''
      username.value = v.value?.username ?? ''
      email.value = v.value?.email ?? ''
      extensions.value = JSON.stringify(v.value?.extensions ?? {}, null, 2)
      age.value = v.value?.maxAgeSeconds ?? 14400
      if (pending.value) compared.value = true
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
            displayName: displayMissing.value ? null : displayName.value,
            username: usernameMissing.value ? null : username.value,
            email: emailMissing.value ? null : email.value,
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
    compared.value = false
    pending.value = { id, state: 'unknown' }
    busy.value = true
    error.value = ''
    displayName.value = ''
    username.value = ''
    email.value = ''
    extensions.value = '{}'
    try {
      await api.saveLocalProfile(principalId(), id, expected, value)
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
  function resumeEditing() {
    if (!busy.value && compared.value) {
      pending.value = undefined
      compared.value = false
      error.value = ''
    }
  }
  async function receipt() {
    const p = pending.value
    if (!p || busy.value) return
    const own = generation
    busy.value = true
    error.value = ''
    try {
      const r = await api.localProfileOperation(principalId(), p.id)
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
    [
      principalId,
      () => session.state.value.status,
      () => session.state.value.tenant,
      () => session.state.value.identity?.principalId,
      () => session.state.value.session?.id,
    ],
    () => {
      clear()
      void load()
    },
    { immediate: true },
  )
  onBeforeUnmount(clear)

  return {
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
  }
}
