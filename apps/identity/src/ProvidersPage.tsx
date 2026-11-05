import { useEffect, useState } from 'react'
import { Button, Checkbox, Drawer, Input, InputNumber, Modal } from 'antd'
import type { IdentityProvider, ProviderSettings, ProviderTest } from '@rss/auth-core'
import { useT } from './i18n'
import {
  unresolved,
  useAdministration,
  useIdentity,
  useOperation,
  useSecretCleanup,
} from './runtime'
import { Field, Notice, Secret } from './fields'

export function editedProviderSettings(
  current: IdentityProvider | null,
  origin: string,
  draft: {
    issuer: string
    client: string
    scopes: string
    extensionsClaim: string
    profileAge: number
    groups: string
    jit: boolean
  },
): ProviderSettings {
  return {
    issuer: current?.settings.issuer ?? draft.issuer,
    clientId: draft.client,
    redirectUri: current?.settings.redirectUri ?? `${origin}/api/v1/identity/oidc/callback`,
    scopes: draft.scopes.split(/\s+/).filter(Boolean),
    jit: draft.jit,
    claims: {
      subject: current ? { ...current.settings.claims.subject } : { kind: 'oidc' },
      profile: { extensionsClaim: draft.extensionsClaim || null, maxAgeSeconds: draft.profileAge },
      groups: draft.groups || null,
      departmentSnapshot: current?.settings.claims.departmentSnapshot
        ? { ...current.settings.claims.departmentSnapshot }
        : null,
    },
  }
}
export function ProvidersPage() {
  const api = useAdministration()
  const { config } = useIdentity()
  const t = useT()
  const op = useOperation()
  const [rows, setRows] = useState<readonly IdentityProvider[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selected, setSelected] = useState<IdentityProvider | null>(null)
  const [pending, setPending] = useState<IdentityProvider | null>(null)
  const [report, setReport] = useState<ProviderTest | null>(null)
  const [issuer, setIssuer] = useState('')
  const [client, setClient] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [caPem, setCaPem] = useState('')
  const [scopes, setScopes] = useState('openid profile email')
  const [extensionsClaim, setExtensionsClaim] = useState('')
  const [profileAge, setProfileAge] = useState(14400)
  const [groups, setGroups] = useState('groups')
  const [jit, setJit] = useState(false)
  const clearSecrets = () => {
    setClientSecret('')
    setCaPem('')
  }
  useSecretCleanup(clearSecrets)
  const blocked = unresolved(op.code)
  function closeEditor() {
    setEditorOpen(false)
    clearSecrets()
  }
  function clear() {
    closeEditor()
    setSelected(null)
    setIssuer('')
    setClient('')
    setScopes('openid profile email')
    setExtensionsClaim('')
    setProfileAge(14400)
    setGroups('groups')
    setJit(false)
    setReport(null)
  }
  async function load(checkpoint = op.checkpoint) {
    clear()
    const providers = await api.providers()
    checkpoint()
    setRows(providers)
    setLoaded(true)
  }
  useEffect(() => {
    void op.run((checkpoint) => load(checkpoint))
  }, [])
  function edit(provider: IdentityProvider) {
    clearSecrets()
    setSelected(provider)
    setIssuer(provider.settings.issuer)
    setClient(provider.settings.clientId)
    setScopes(provider.settings.scopes.join(' '))
    setExtensionsClaim(provider.settings.claims.profile.extensionsClaim ?? '')
    setProfileAge(provider.settings.claims.profile.maxAgeSeconds)
    setGroups(provider.settings.claims.groups ?? '')
    setJit(provider.settings.jit)
    setReport(null)
    setEditorOpen(true)
  }
  function save() {
    const settings = editedProviderSettings(selected, config.canonicalOrigin, {
      issuer,
      client,
      scopes,
      extensionsClaim,
      profileAge,
      groups,
      jit,
    })
    const secret = clientSecret,
      ca = caPem || null
    clearSecrets()
    const current = selected
    void op.run(async (checkpoint) => {
      if (current) await api.updateProvider(current.id, current.version, settings, secret, ca)
      else await api.createProvider(settings, secret, ca)
      checkpoint()
      clear()
      await load(checkpoint)
    })
  }
  function toggle(provider: IdentityProvider) {
    setPending(null)
    void op.run(async (checkpoint) => {
      await api.enableProvider(provider.id, provider.version, !provider.enabled)
      checkpoint()
      await load(checkpoint)
    })
  }
  return (
    <section className="auth-page">
      <h1>{t('providers')}</h1>
      <Notice error={op.error} />
      {report && (
        <div role="status">
          {report.passed ? (
            <>
              <p>{t('testPassed')}</p>
              <p>{report.checks.join(' · ')}</p>
              <p>
                {t('tlsVerified')}: {String(report.tlsVerified)} ·{' '}
                {t('authorizationResponseIssuer')}: {String(report.authorizationResponseIssuer)}
              </p>
            </>
          ) : (
            <p>
              {t('testFailed')} · {report.diagnostic}
            </p>
          )}
        </div>
      )}
      <div className="auth-actions">
        <Button
          disabled={op.busy}
          onClick={() => {
            void op.run((checkpoint) => load(checkpoint))
          }}
        >
          {t(loaded ? 'reload' : 'loadList')}
        </Button>
        <Button
          type="primary"
          disabled={op.busy || blocked}
          onClick={() => {
            clear()
            setEditorOpen(true)
          }}
        >
          {t('newProvider')}
        </Button>
      </div>
      {!loaded && <p role="status">{t('listNotLoaded')}</p>}
      {loaded && (
        <div className="auth-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('issuer')}</th>
                <th scope="col">{t('state')}</th>
                <th scope="col">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    {provider.settings.issuer}
                    <small>{provider.id}</small>
                  </td>
                  <td>
                    {t(provider.enabled ? 'enabled' : 'disabled')} · v{provider.version}
                  </td>
                  <td>
                    <div className="auth-actions">
                      <Button disabled={op.busy || blocked} onClick={() => edit(provider)}>
                        {t('edit')}
                      </Button>
                      <Button
                        disabled={op.busy || blocked}
                        onClick={() => {
                          if (provider.enabled) setPending(provider)
                          else toggle(provider)
                        }}
                      >
                        {t(provider.enabled ? 'disableProvider' : 'enableProvider')}
                      </Button>
                      <Button
                        disabled={op.busy || blocked}
                        onClick={() => {
                          setReport(null)
                          void op.run(async (checkpoint) => {
                            const value = await api.testProvider(provider.id)
                            checkpoint()
                            setReport(value)
                          })
                        }}
                      >
                        {t('test')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer
        open={editorOpen}
        title={t(selected ? 'editProvider' : 'newProvider')}
        onClose={closeEditor}
        footer={null}
        destroyOnHidden
        size="large"
        maskClosable={!op.busy}
        closable={!op.busy}
      >
        <Notice error={op.error} />
        <p>{t('providerHelp')}</p>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Field
            id="issuer"
            label={t('issuer')}
            type="url"
            value={issuer}
            readOnly={selected !== null}
            required
            disabled={op.busy || blocked}
            onChange={(event) => setIssuer(event.target.value)}
          />
          <Field
            id="client-id"
            label={t('client')}
            value={client}
            maxLength={256}
            required
            disabled={op.busy || blocked}
            onChange={(event) => setClient(event.target.value)}
          />
          <Secret
            id="client-secret"
            label={t('clientSecret')}
            value={clientSecret}
            autoComplete="new-password"
            required
            disabled={op.busy || blocked}
            onChange={(event) => setClientSecret(event.target.value)}
          />
          <label htmlFor="ca-pem">{t('caPem')}</label>
          <Input.TextArea
            id="ca-pem"
            value={caPem}
            autoComplete="off"
            rows={5}
            disabled={op.busy || blocked}
            onChange={(event) => setCaPem(event.target.value)}
          />
          <Field
            id="scopes"
            label={t('scopes')}
            value={scopes}
            required
            disabled={op.busy || blocked}
            onChange={(event) => setScopes(event.target.value)}
          />
          <Field
            id="profile-claim"
            label={t('profileClaim')}
            value={extensionsClaim}
            maxLength={128}
            disabled={op.busy || blocked}
            onChange={(event) => setExtensionsClaim(event.target.value)}
          />
          <label htmlFor="profile-age">{t('profileAge')}</label>
          <InputNumber
            id="profile-age"
            min={60}
            max={86400}
            value={profileAge}
            disabled={op.busy || blocked}
            onChange={(value) => setProfileAge(value ?? 0)}
          />
          <Field
            id="groups-claim"
            label={t('groupsClaim')}
            value={groups}
            maxLength={64}
            disabled={op.busy || blocked}
            onChange={(event) => setGroups(event.target.value)}
          />
          <Checkbox
            id="jit"
            checked={jit}
            disabled={op.busy || blocked}
            onChange={(event) => setJit(event.target.checked)}
          >
            {t('jit')}
          </Checkbox>
          {selected && (
            <dl>
              <dt>{t('redirectUri')}</dt>
              <dd>{selected.settings.redirectUri}</dd>
              <dt>{t('subjectMapping')}</dt>
              <dd>{JSON.stringify(selected.settings.claims.subject)}</dd>
              <dt>{t('departmentSnapshot')}</dt>
              <dd>{JSON.stringify(selected.settings.claims.departmentSnapshot)}</dd>
            </dl>
          )}
          <Button
            type="primary"
            htmlType="submit"
            disabled={
              op.busy ||
              blocked ||
              !Number.isInteger(profileAge) ||
              profileAge < 60 ||
              profileAge > 86400
            }
          >
            {t('save')}
          </Button>
        </form>
      </Drawer>
      <Modal
        open={pending !== null}
        title={t('disableProvider')}
        onCancel={() => setPending(null)}
        onOk={() => {
          if (pending) toggle(pending)
        }}
        okText={t('confirm')}
        cancelText={t('cancel')}
        confirmLoading={op.busy}
        destroyOnHidden
      >
        <p>
          {pending?.settings.issuer} · {t('disableProviderHelp')}
        </p>
      </Modal>
    </section>
  )
}
