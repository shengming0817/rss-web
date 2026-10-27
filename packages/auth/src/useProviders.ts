import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentity } from './context'
import { useOperation } from './services/operation'
import type { Provider, ProviderSettings } from './services/decode'
export function useProviders() {
  const { t } = useI18n()
  const { api, session } = useIdentity()
  const { busy, error, errorMessage, run, checkpoint } = useOperation()
  const blocked = computed(() =>
    ['configuration_changed', 'unknown_result', 'identity_unavailable'].includes(error.value),
  )
  const editorOpen = ref(false)
  function newProvider() {
    if (busy.value || blocked.value) return
    clear()
    editorOpen.value = true
  }
  function closeEditor() {
    editorOpen.value = false
    clientSecret.value = ''
    caPem.value = ''
  }
  const rows = ref<Provider[]>([])
  const loaded = ref(false)
  const selected = ref<Provider | null>(null)
  const report = ref('')
  const pending = ref<Provider | null>(null)
  const issuer = ref('')
  const client = ref('')
  const clientSecret = ref('')
  const caPem = ref('')
  const scopes = ref('openid profile email')
  const extensionsClaim = ref('')
  const profileMaxAge = ref(14400)
  const groups = ref('groups')
  const jit = ref(false)
  function clear() {
    editorOpen.value = false
    selected.value = null
    issuer.value = ''
    client.value = ''
    clientSecret.value = ''
    caPem.value = ''
    scopes.value = 'openid profile email'
    extensionsClaim.value = ''
    profileMaxAge.value = 14400
    groups.value = 'groups'
    jit.value = false
    report.value = ''
  }
  function edit(p: Provider) {
    editorOpen.value = true
    selected.value = p
    issuer.value = p.settings.issuer
    client.value = p.settings.clientId
    clientSecret.value = ''
    caPem.value = ''
    scopes.value = p.settings.scopes.join(' ')
    extensionsClaim.value = p.settings.claims.profile.extensionsClaim ?? ''
    profileMaxAge.value = p.settings.claims.profile.maxAgeSeconds
    groups.value = p.settings.claims.groups ?? ''
    jit.value = p.settings.jit
    report.value = ''
  }
  watch(
    [
      () => session.state.value.status,
      () => session.state.value.tenant,
      () => session.state.value.identity?.principalId,
      () => session.state.value.session?.id,
    ],
    () => {
      clear()
      rows.value = []
      loaded.value = false
      pending.value = null
    },
    { flush: 'sync' },
  )
  async function load() {
    clear()
    const value = await api.providers()
    checkpoint()
    rows.value = value
    loaded.value = true
  }
  onMounted(() => {
    if (session.providerHint.value) void run(load)
  })
  onBeforeUnmount(() => {
    clientSecret.value = ''
    caPem.value = ''
  })
  async function save() {
    const current = selected.value
    const settings: ProviderSettings = {
      issuer: issuer.value,
      clientId: client.value,
      redirectUri: `${session.config.canonicalOrigin}/api/v1/identity/oidc/callback`,
      scopes: scopes.value.split(/\s+/).filter(Boolean),
      claims: {
        subject: current ? { ...current.settings.claims.subject } : { kind: 'oidc' },
        profile: {
          extensionsClaim: extensionsClaim.value || null,
          maxAgeSeconds: profileMaxAge.value,
        },
        groups: groups.value || null,
        departmentSnapshot: current ? current.settings.claims.departmentSnapshot : null,
      },
      jit: jit.value,
    }
    const secret = clientSecret.value
    const ca = caPem.value || null
    clientSecret.value = ''
    caPem.value = ''
    await run(async () => {
      if (current) await api.updateProvider(current, settings, secret, ca)
      else await api.createProvider(settings, secret, ca)
      checkpoint()
      clear()
      await load()
    })
  }
  function toggle(p: Provider) {
    if (p.enabled) pending.value = p
    else void changeEnabled(p)
  }
  async function confirmDisable() {
    const p = pending.value
    pending.value = null
    if (p) await changeEnabled(p)
  }
  async function changeEnabled(p: Provider) {
    await run(async () => {
      await api.enableProvider(p, !p.enabled)
      clear()
      await load()
    })
  }
  async function test(p: Provider) {
    report.value = ''
    await run(async () => {
      const result = await api.testProvider(p)
      report.value = result.passed
        ? t('identity.testPassed')
        : `${t('identity.testFailed')} · ${result.diagnostic}`
    })
  }

  return {
    session,
    busy,
    error,
    errorMessage,
    run,
    blocked,
    editorOpen,
    newProvider,
    closeEditor,
    rows,
    loaded,
    selected,
    report,
    pending,
    issuer,
    client,
    clientSecret,
    caPem,
    scopes,
    extensionsClaim,
    profileMaxAge,
    groups,
    jit,
    edit,
    load,
    save,
    toggle,
    confirmDisable,
    test,
  }
}
