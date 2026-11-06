import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { Alert, Button } from 'antd'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { usePresentation } from '@rss/core'
import { useT } from './i18n'
import { identityScope, loginPath, tenantLocator, useIdentity } from './runtime'
import { LoginPage } from './LoginPage'
import { SessionsPage } from './SessionsPage'
import { AccountsPage } from './AccountsPage'
import { ProvidersPage } from './ProvidersPage'

export function IdentityApp() {
  const { owner, snapshot, config } = useIdentity()
  const { locale, setLocale, theme, setTheme } = usePresentation()
  const location = useLocation()
  const t = useT()
  const [acceptedPath, setAcceptedPath] = useState('')
  useLayoutEffect(() => {
    owner.leavePage()
    setAcceptedPath(location.pathname)
  }, [location.pathname, owner])
  useEffect(() => {
    const activity = (event: Event) => {
      if (event.isTrusted) void owner.activity().catch(() => undefined)
    }
    const departure = () => owner.suspend()
    const visible = () => {
      const state = owner.getSnapshot()
      if (
        document.visibilityState === 'visible' &&
        state.tenant &&
        state.status === 'authenticated'
      )
        void owner.check(state.tenant).catch(() => undefined)
    }
    const restore = (event: PageTransitionEvent) => {
      const tenant = owner.getSnapshot().tenant
      if (event.persisted && tenant) void owner.check(tenant).catch(() => undefined)
    }
    document.addEventListener('pointerdown', activity, true)
    document.addEventListener('keydown', activity, true)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', departure)
    window.addEventListener('pageshow', restore)
    return () => {
      document.removeEventListener('pointerdown', activity, true)
      document.removeEventListener('keydown', activity, true)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', departure)
      window.removeEventListener('pageshow', restore)
    }
  }, [owner])
  const tenant = snapshot.tenant
  return (
    <div className="auth-host">
      <a className="auth-skip" href="#identity-main">
        {t('skip')}
      </a>
      <header className="auth-host-header">
        <Link to="/" className="auth-brand">
          <span>R</span> RSS <strong>Identity</strong>
        </Link>
        <div className="auth-actions">
          <Button type="text" onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}>
            {locale === 'zh-CN' ? 'English' : '中文'}
          </Button>
          <Button type="text" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {t('theme')}
          </Button>
        </div>
      </header>
      {snapshot.status === 'authenticated' && tenant && (
        <nav className="auth-navigation" aria-label={t('navigation')}>
          <NavLink to={`/tenants/${tenant}/sessions`}>{t('sessions')}</NavLink>
          {snapshot.host?.navigation.manageAccounts && (
            <NavLink to={`/tenants/${tenant}/accounts`}>{t('accounts')}</NavLink>
          )}
          {config.oidcEnabled && snapshot.host?.navigation.manageProviders && (
            <NavLink to={`/tenants/${tenant}/providers`}>{t('providers')}</NavLink>
          )}
        </nav>
      )}
      {snapshot.status === 'authenticated' && snapshot.navigation === 'unavailable' && (
        <Alert
          type="warning"
          title={t('navigationUnavailable')}
          action={
            <Button
              onClick={() => {
                void owner.loadContext().catch(() => undefined)
              }}
            >
              {t('retryNavigation')}
            </Button>
          }
        />
      )}
      <main id="identity-main" className="auth-host-main" tabIndex={-1}>
        {acceptedPath === location.pathname && (
          <Routes>
            <Route path="/tenants/:tenant/login" element={<LoginPage key={location.pathname} />} />
            <Route path="/auth/resume" element={<LoginPage key={location.pathname} resume />} />
            <Route
              path="/tenants/:tenant/sessions"
              element={<ProtectedPage key={location.pathname} kind="sessions" />}
            />
            <Route
              path="/tenants/:tenant/accounts"
              element={<ProtectedPage key={location.pathname} kind="accounts" />}
            />
            <Route
              path="/tenants/:tenant/providers"
              element={<ProtectedPage key={location.pathname} kind="providers" />}
            />
            <Route path="/auth/error" element={<ErrorPage key={location.pathname} />} />
            <Route path="/" element={<ErrorPage key={location.pathname} />} />
            <Route path="*" element={<ErrorPage key={location.pathname} />} />
          </Routes>
        )}
      </main>
      <footer className="auth-host-footer">{t('footer')}</footer>
    </div>
  )
}
function ProtectedPage({ kind }: { kind: 'sessions' | 'accounts' | 'providers' }) {
  const { tenant: raw } = useParams()
  const tenant = tenantLocator(raw)
  const { owner, snapshot, config } = useIdentity()
  const [checked, setChecked] = useState(false)
  const manualLoad = useRef(false)
  if (snapshot.navigation === 'unavailable') manualLoad.current = true
  const t = useT()
  useEffect(() => {
    let active = true
    if (!tenant || (kind === 'providers' && !config.oidcEnabled)) return
    const current = owner.getSnapshot()
    if (current.tenant === tenant && current.status === 'authenticated') {
      setChecked(true)
      return
    }
    const check = current.tenant !== tenant ? owner.switchTenant(tenant) : owner.check(tenant)
    void check
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecked(true)
      })
    return () => {
      active = false
    }
  }, [owner, tenant, kind, config.oidcEnabled])
  if (!tenant || (kind === 'providers' && !config.oidcEnabled)) return <ErrorPage />
  if (!checked || snapshot.status === 'checking') return <p role="status">{t('continue')}…</p>
  if (kind === 'sessions' && snapshot.logoutOutcome !== 'idle')
    return <SessionsPage key="departure" />
  if (snapshot.status === 'unavailable')
    return <Navigate replace to={`/auth/error?reason=unavailable&tenant=${tenant}`} />
  if (snapshot.status !== 'authenticated' || snapshot.tenant !== tenant)
    return <Navigate replace to={loginPath(tenant)} />
  const scope = identityScope(owner)
  if (kind === 'sessions') return <SessionsPage key={scope} />
  const allowed =
    kind === 'accounts'
      ? snapshot.host?.navigation.manageAccounts
      : snapshot.host?.navigation.manageProviders
  if (snapshot.navigation !== 'ready') return <p role="status">{t('navigationUnavailable')}</p>
  if (!allowed) return <p role="alert">{t('errors.insufficient_privilege')}</p>
  return kind === 'accounts' ? (
    <AccountsPage key={scope} manualLoad={manualLoad.current} />
  ) : (
    <ProvidersPage key={scope} manualLoad={manualLoad.current} />
  )
}
export function ErrorPage() {
  const { owner, flows } = useIdentity()
  const location = useLocation()
  const navigate = useNavigate()
  const t = useT()
  const [pending] = useState(() => flows.take())
  const query = new URLSearchParams(location.search)
  const reason = query.get('reason')
  const tenant = pending?.tenant ?? tenantLocator(query.get('tenant')) ?? owner.getSnapshot().tenant
  return (
    <section className="auth-page" aria-labelledby="error-title">
      <h1 id="error-title">
        {t(reason && ['cancelled', 'unavailable', 'failed'].includes(reason) ? reason : 'entry')}
      </h1>
      <p>{t('restartHelp')}</p>
      {tenant && <Button onClick={() => navigate(loginPath(tenant))}>{t('login')}</Button>}
    </section>
  )
}
