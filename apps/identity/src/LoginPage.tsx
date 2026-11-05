import { useEffect, useState } from 'react'
import { Button } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import type { Provider } from '@rss/auth-core'
import { useT } from './i18n'
import {
  identityScope,
  sessionPath,
  tenantLocator,
  useIdentity,
  useOperation,
  useSecretCleanup,
} from './runtime'
import { Field, Notice, Secret } from './fields'

export function LoginPage({ resume = false }: { resume?: boolean }) {
  const { owner, config, flows, snapshot } = useIdentity()
  const { tenant: raw } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const op = useOperation()
  const [tenant, setTenant] = useState<string | null>(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [providers, setProviders] = useState<readonly Provider[]>([])
  useSecretCleanup(() => setPassword(''))
  const scope = identityScope(owner)
  useEffect(() => {
    setPassword('')
  }, [scope, snapshot.tenant])
  useEffect(() => {
    void op.run(async (checkpoint) => {
      const pending = resume ? flows.take() : null
      const selected = resume ? pending?.tenant : tenantLocator(raw)
      if (!selected || (resume && !config.oidcEnabled)) {
        navigate('/auth/error', { replace: true })
        return
      }
      setTenant(selected)
      if (owner.getSnapshot().tenant !== selected) await owner.switchTenant(selected)
      else await owner.check(selected)
      checkpoint()
      if (resume) {
        if (owner.getSnapshot().status !== 'authenticated') {
          navigate('/auth/error', { replace: true })
          return
        }
        flows.clear()
        navigate(sessionPath(selected), { replace: true })
      } else if (config.oidcEnabled) {
        const available = await owner.providers(selected)
        checkpoint()
        setProviders(available)
      }
    })
    // This instance owns one route locator and is replaced when the path changes.
  }, [])
  function submit() {
    const secret = password
    setPassword('')
    if (!tenant) return
    void op.run(async (checkpoint) => {
      await owner.login(tenant, login, secret)
      checkpoint()
      flows.clear()
      navigate(sessionPath(tenant), { replace: true })
    })
  }
  function sso(provider: string) {
    setPassword('')
    if (!tenant || !config.oidcEnabled) return
    void op.run(async (checkpoint) => {
      flows.save('sso', tenant)
      try {
        const url = await owner.beginSso(tenant, provider)
        checkpoint()
        window.location.assign(url)
      } catch (failure) {
        checkpoint()
        flows.clear()
        throw failure
      }
    })
  }
  return (
    <section className="auth-page auth-login" aria-labelledby="login-title">
      <p className="auth-eyebrow">RSS Identity</p>
      <h1 id="login-title">{t('login')}</h1>
      <p>{t('loginDescription')}</p>
      {snapshot.invalidated && <p role="status">{t('expired')}</p>}
      <Notice error={op.error} />
      {snapshot.status === 'authenticated' && snapshot.tenant === tenant ? (
        <Button
          type="primary"
          disabled={op.busy}
          onClick={() => {
            flows.clear()
            if (tenant) navigate(sessionPath(tenant), { replace: true })
          }}
        >
          {t('continue')}
        </Button>
      ) : (
        tenant &&
        !resume && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <Field
              id="login-name"
              label={t('username')}
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              required
              disabled={op.busy}
            />
            <Secret
              id="login-password"
              label={t('password')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={op.busy}
            />
            <Button type="primary" htmlType="submit" disabled={op.busy}>
              {t('login')}
            </Button>
          </form>
        )
      )}
      {config.oidcEnabled && !resume && (
        <div className="auth-actions">
          {providers.map((provider) => (
            <Button key={provider.id} disabled={op.busy} onClick={() => sso(provider.id)}>
              {t('sso')} · {provider.label}
            </Button>
          ))}
        </div>
      )}
      <p className="auth-muted">{t('recoveryHelp')}</p>
    </section>
  )
}
