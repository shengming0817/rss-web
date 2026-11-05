import { useEffect, useRef, useState } from 'react'
import { Button, InputNumber, Modal, Select, Tabs } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import {
  createIdentityAdministration,
  validateNewPassword,
  type Provider,
  type Session,
} from '@rss/auth-core'
import { createIdentityAdministrationAdapter } from '@rss/auth-http'
import { useT } from './i18n'
import { identityScope, loginPath, useIdentity, useOperation, useSecretCleanup } from './runtime'
import { Notice, Secret, Task } from './fields'

export function SessionsPage() {
  const { owner, config, flows, snapshot, transport } = useIdentity()
  const t = useT()
  const navigate = useNavigate()
  const op = useOperation()
  const [rows, setRows] = useState<readonly Session[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [trail, setTrail] = useState<(string | undefined)[]>([])
  const acceptedCursor = useRef<string | undefined>(undefined)
  const appliedLimit = useRef(50)
  const [limit, setLimit] = useState(50)
  const [tab, setTab] = useState('sessions')
  const [confirmAll, setConfirmAll] = useState(false)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [reauth, setReauth] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [provider, setProvider] = useState('')
  const [providers, setProviders] = useState<readonly Provider[]>([])
  const clearSecrets = () => {
    setCurrent('')
    setPassword('')
    setReauth('')
    setLinkPassword('')
  }
  useSecretCleanup(clearSecrets)
  const scope = identityScope(owner)
  const observedSession = useRef(snapshot.session)
  useEffect(() => {
    if (!config.oidcEnabled || !scope || op.busy || observedSession.current === snapshot.session)
      return
    observedSession.current = snapshot.session
    void op.run(() => owner.loadSecurity())
  }, [snapshot.session, op.busy, config.oidcEnabled, scope])
  async function load(cursor?: string, navigatePage = false, checkpoint = op.checkpoint) {
    const size = navigatePage ? appliedLimit.current : limit
    const value = await owner.sessions(cursor, size)
    checkpoint()
    if (value.next && (value.next === cursor || trail.includes(value.next)))
      throw new Error('Repeated session cursor')
    const position = trail.lastIndexOf(cursor)
    setTrail(
      cursor === undefined
        ? []
        : cursor === acceptedCursor.current
          ? trail
          : position >= 0
            ? trail.slice(0, position)
            : [...trail, acceptedCursor.current],
    )
    acceptedCursor.current = cursor
    appliedLimit.current = size
    setRows(value.sessions)
    setNext(value.next)
  }
  useEffect(() => {
    if (!scope) return
    void op.run(async (checkpoint) => {
      await load(undefined, false, checkpoint)
      if (config.oidcEnabled) {
        await owner.loadSecurity()
        checkpoint()
        const tenant = owner.getSnapshot().tenant
        if (tenant) {
          const options = await owner.providers(tenant)
          checkpoint()
          setProviders(options)
        }
      }
    })
    // This page is keyed by the authenticated tenant, principal and session.
  }, [])
  function logout(all: boolean) {
    clearSecrets()
    setConfirmAll(false)
    flows.clear()
    const tenant = snapshot.tenant
    void op.run(async () => {
      await owner.logout(all)
      if (tenant) navigate(loginPath(tenant), { replace: true })
    })
  }
  function changePassword() {
    const old = current,
      secret = password
    clearSecrets()
    const tenant = snapshot.tenant
    try {
      validateNewPassword(secret)
    } catch {
      op.setCode('invalid_request')
      return
    }
    void op.run(async () => {
      const api = createIdentityAdministration(
        createIdentityAdministrationAdapter(transport, owner, config.oidcEnabled),
      )
      await api.ownPassword(old, secret)
      flows.clear()
      if (tenant) navigate(loginPath(tenant), { replace: true })
    })
  }
  function reauthenticate() {
    const secret = reauth
    clearSecrets()
    void op.run(async () => {
      await owner.reauthenticate(secret)
    })
  }
  function link() {
    const secret = snapshot.identity?.hasLocalPassword ? linkPassword : null
    clearSecrets()
    if (!snapshot.tenant || !provider || !config.oidcEnabled) return
    const tenant = snapshot.tenant
    void op.run(async (checkpoint) => {
      flows.save('link', tenant)
      try {
        const url = await owner.link(provider, secret)
        checkpoint()
        window.location.assign(url)
      } catch (failure) {
        checkpoint()
        flows.clear()
        throw failure
      }
    })
  }
  const sessionPanel = (
    <div className="auth-page">
      <div className="auth-actions">
        <Button
          disabled={op.busy}
          onClick={() => {
            void op.run(async (checkpoint) => {
              if (identityScope(owner)) await load(undefined, false, checkpoint)
              else if (snapshot.tenant) await owner.check(snapshot.tenant)
            })
          }}
        >
          {t('reload')}
        </Button>
        <Button disabled={op.busy || !scope} onClick={() => logout(false)}>
          {t('logout')}
        </Button>
        <Button disabled={op.busy || !scope} onClick={() => setConfirmAll(true)}>
          {t('logoutAll')}
        </Button>
        {snapshot.logoutOutcome === 'unconfirmed' && snapshot.tenant && (
          <Link to={loginPath(snapshot.tenant)}>{t('login')}</Link>
        )}
      </div>
      <div className="auth-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('session')}</th>
              <th scope="col">{t('expires')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.id}
                  {row.id === snapshot.session?.id && ` (${t('current')})`}
                </td>
                <td>{new Date(row.idleExpiresAt * 1000).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="auth-actions">
        <label htmlFor="session-limit">{t('pageSize')}</label>
        <InputNumber
          id="session-limit"
          min={1}
          max={100}
          value={limit}
          disabled={op.busy || !scope}
          onChange={(value) => setLimit(value ?? 0)}
        />
        <Button
          disabled={op.busy || !scope || !Number.isInteger(limit) || limit < 1 || limit > 100}
          onClick={() => {
            void op.run((checkpoint) => load(undefined, false, checkpoint))
          }}
        >
          {t('apply')}
        </Button>
        <Button
          disabled={op.busy || !scope}
          onClick={() => {
            void op.run((checkpoint) => load(undefined, true, checkpoint))
          }}
        >
          {t('first')}
        </Button>
        <Button
          disabled={op.busy || !scope || !trail.length}
          onClick={() => {
            void op.run((checkpoint) => load(trail.at(-1), true, checkpoint))
          }}
        >
          {t('previous')}
        </Button>
        <Button
          disabled={op.busy || !scope || !next}
          onClick={() => {
            void op.run((checkpoint) => load(next ?? undefined, true, checkpoint))
          }}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
  const security = snapshot.security?.authentication
  const securityPanel = (
    <div className="auth-page">
      {config.oidcEnabled && (
        <section aria-labelledby="security-title">
          <h2 id="security-title">{t('authentication')}</h2>
          {security && (
            <>
              <p>
                {t('authenticationSource')}: {t(security.source)}
              </p>
              <p>
                {t('authTime')}:{' '}
                {security.authTime === null
                  ? t('noAuthTime')
                  : new Date(security.authTime * 1000).toLocaleString()}
              </p>
              <p>
                {t('strength')}: {t(security.acr)}
              </p>
              <p>
                {t('methods')}:{' '}
                {security.amr.map((method) => t(`method_${method}`)).join(' · ') || t('noMethods')}
              </p>
              <p>{t('operationAuthentication')}</p>
            </>
          )}
          <Button
            disabled={op.busy || !scope}
            onClick={() => {
              void op.run(() => owner.loadSecurity())
            }}
          >
            {t('reloadSecurity')}
          </Button>
        </section>
      )}
      {snapshot.identity?.hasLocalPassword && (
        <>
          <Task title={t('changePassword')} onClose={clearSecrets}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                changePassword()
              }}
            >
              <Secret
                id="current-password"
                label={t('currentPassword')}
                autoComplete="current-password"
                required
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                disabled={op.busy}
              />
              <Secret
                id="new-password"
                label={t('newPassword')}
                autoComplete="new-password"
                minLength={15}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={op.busy}
              />
              <Button htmlType="submit" disabled={op.busy}>
                {t('changePassword')}
              </Button>
            </form>
          </Task>
          <Task title={t('reauthenticate')} onClose={clearSecrets}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                reauthenticate()
              }}
            >
              <Secret
                id="reauth-password"
                label={t('currentPassword')}
                autoComplete="current-password"
                required
                value={reauth}
                onChange={(event) => setReauth(event.target.value)}
                disabled={op.busy}
              />
              <Button htmlType="submit" disabled={op.busy}>
                {t('reauthenticate')}
              </Button>
            </form>
          </Task>
        </>
      )}
      {config.oidcEnabled && providers.length > 0 && (
        <Task title={t('linkProvider')} onClose={clearSecrets}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              link()
            }}
          >
            <label htmlFor="link-provider">{t('providers')}</label>
            <Select
              id="link-provider"
              value={provider}
              options={providers.map((item) => ({ value: item.id, label: item.label }))}
              onChange={setProvider}
              disabled={op.busy}
            />
            {snapshot.identity?.hasLocalPassword && (
              <Secret
                id="link-password"
                label={t('currentPassword')}
                autoComplete="current-password"
                required
                value={linkPassword}
                onChange={(event) => setLinkPassword(event.target.value)}
                disabled={op.busy}
              />
            )}
            <Button htmlType="submit" disabled={op.busy || !provider}>
              {t('linkProvider')}
            </Button>
          </form>
        </Task>
      )}
    </div>
  )
  return (
    <section className="auth-page">
      <h1>{t('sessions')}</h1>
      {snapshot.logoutOutcome === 'unconfirmed' ? (
        <p role="alert">{t('logoutUnconfirmed')}</p>
      ) : (
        <Notice error={op.error} />
      )}
      <p className="auth-muted">{t('logoutHelp')}</p>
      <Tabs
        activeKey={tab}
        onChange={(value) => {
          clearSecrets()
          setTab(value)
        }}
        destroyOnHidden
        items={[
          { key: 'sessions', label: t('sessions'), children: sessionPanel },
          { key: 'security', label: t('authentication'), children: securityPanel },
        ]}
      />
      <Modal
        open={confirmAll}
        title={t('logoutAll')}
        onCancel={() => setConfirmAll(false)}
        onOk={() => logout(true)}
        okText={t('confirm')}
        cancelText={t('cancel')}
        confirmLoading={op.busy}
        destroyOnHidden
      >
        <p>{t('logoutHelp')}</p>
      </Modal>
    </section>
  )
}
