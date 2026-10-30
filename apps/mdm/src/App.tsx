import { Policies } from './Policies'
import { Scopes } from './Scopes'
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Button,
  ConfigProvider,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Result,
  Space,
  Spin,
} from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  matchPath,
  useLocation,
} from 'react-router-dom'
import type { Provider } from '@rss/auth-core'
import type { Runtime } from './runtime'
import { Authorization } from './Authorization'
import { Tenants } from './Tenants'
import { UserProfiles } from './UserProfiles'
import { IdentityAdministration } from './IdentityAdministration'
import { Passkeys } from './Passkeys'
import { Devices } from './Devices'
import { Certificates } from './Certificates'
import { Audit } from './Audit'
import { Webhooks } from './Webhooks'
import { RecoveryDisclosure } from './RecoveryDisclosure'
import { DeviceDetail } from './DeviceDetail'
import { Enrollment } from './Enrollment'
import { Connections } from './Connections'
import { Inventory } from './Inventory'
import { GroupsPage } from './Groups'
import { Compliance } from './Compliance'
import { Resources } from './Resources'
import { Software } from './Software'
import { EntraTerms, PublicDownloads } from './PublicEnrollment'
import { StyleProvider } from '@ant-design/cssinjs'
import { mdmTheme } from './theme'
import { messages, type Locale, type MessageKey } from './i18n'

type Ui = { runtime: Runtime; locale: Locale }
function useSession(runtime: Runtime) {
  return useSyncExternalStore(runtime.owner.subscribe, runtime.owner.getSnapshot)
}
function useOperation(locale: Locale) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const t = messages(locale)
  async function run(work: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      const code =
        failure &&
        typeof failure === 'object' &&
        'code' in failure &&
        typeof failure.code === 'string'
          ? failure.code
          : ''
      setError(Object.hasOwn(t, code) ? t[code as MessageKey] : t.unknown)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, clear: () => setError('') }
}
function Login({ runtime, locale }: Ui) {
  const t = messages(locale),
    state = useSession(runtime),
    operation = useOperation(locale)
  const [form] = Form.useForm<{ login: string; password: string }>()
  const [providers, setProviders] = useState<readonly Provider[]>([])
  const [providerError, setProviderError] = useState(false)
  useEffect(() => {
    let live = true
    void runtime.owner.providers(runtime.tenant).then(
      (value) => {
        if (live) setProviders(value)
      },
      () => {
        if (live) setProviderError(true)
      },
    )
    return () => {
      live = false
      form.resetFields()
    }
  }, [runtime, form])
  if (state.status === 'authenticated') return <Navigate to={runtime.home} replace />
  return (
    <main id="main" className="auth-page" tabIndex={-1}>
      <section className="auth-card" aria-labelledby="login-title">
        <Brand />
        <p className="eyebrow">{runtime.management ? t.management : t.business}</p>
        <h1 id="login-title">{t.loginTitle}</h1>
        <p className="subtitle">{t.loginHint}</p>
        {state.invalidated && <Alert type="warning" title={t.invalidated} showIcon />}
        {state.logoutOutcome === 'unconfirmed' && (
          <Alert type="warning" title={t.logoutUnknown} showIcon />
        )}
        {operation.error && <Alert type="error" title={operation.error} showIcon role="alert" />}
        {(state.status === 'unavailable' ||
          state.logoutOutcome === 'unconfirmed' ||
          state.invalidated) && (
          <Button
            loading={operation.busy}
            block
            onClick={() => void operation.run(() => runtime.owner.check(runtime.tenant))}
          >
            {t.retry}
          </Button>
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => {
            form.setFieldValue('password', '')
            void operation.run(() =>
              runtime.owner.login(runtime.tenant, value.login, value.password),
            )
          }}
        >
          <Form.Item
            name="login"
            label={t.account}
            rules={[{ required: true, message: t.account }]}
          >
            <Input autoComplete="username" autoFocus maxLength={128} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t.password}
            rules={[{ required: true, message: t.password }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={operation.busy}
            disabled={
              state.status === 'unavailable' || state.logoutOutcome !== 'idle' || state.invalidated
            }
          >
            {t.login}
          </Button>
        </Form>
        {runtime.oidcEnabled && (
          <>
            <Divider>{t.sso}</Divider>
            {providerError && <Alert type="warning" title={t.unavailable} />}
            <Space direction="vertical" className="full-width">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  block
                  disabled={operation.busy}
                  onClick={() =>
                    void operation.run(async () => {
                      runtime.flows.save('sso', runtime.tenant)
                      try {
                        window.location.assign(
                          await runtime.owner.beginSso(runtime.tenant, provider.id),
                        )
                      } catch (error) {
                        runtime.flows.clear()
                        throw error
                      }
                    })
                  }
                >
                  {provider.label}
                </Button>
              ))}
            </Space>
          </>
        )}
        <a className="tenant-switch" href={runtime.management ? '/login' : '/platform'}>
          {runtime.management ? t.business : t.management} →
        </a>
      </section>
    </main>
  )
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        R
      </span>
      <span>
        RSS<span className="brand-tag">MDM</span>
      </span>
    </div>
  )
}
export interface FeatureRoute {
  path: string
  label: MessageKey
  realm?: 'tenant' | 'management'
  navigation?: boolean
  render: (ui: Ui) => ReactNode
}
/** Product features register implemented routes here; they do not assemble authentication. */
const featureRoutes: readonly FeatureRoute[] = [
  { path: '/', label: 'workspace', render: (ui) => <Workspace {...ui} /> },
  { path: '/devices', label: 'devices', realm: 'tenant', render: (ui) => <Devices {...ui} /> },
  {
    path: '/inventory',
    label: 'inventory',
    realm: 'tenant',
    render: (ui) => <Inventory {...ui} />,
  },
  {
    path: '/resources',
    label: 'resources',
    realm: 'tenant',
    render: (ui) => <Resources {...ui} />,
  },
  {
    path: '/certificates',
    label: 'certificates',
    realm: 'tenant',
    render: (ui) => <Certificates {...ui} />,
  },
  {
    path: '/recovery-credentials',
    label: 'recoveryCredentials',
    realm: 'tenant',
    render: (ui) => <RecoveryDisclosure {...ui} />,
  },
  { path: '/software', label: 'software', realm: 'tenant', render: (ui) => <Software {...ui} /> },
  { path: '/audit', label: 'audit', realm: 'tenant', render: (ui) => <Audit {...ui} /> },
  { path: '/webhooks', label: 'webhooks', realm: 'tenant', render: (ui) => <Webhooks {...ui} /> },
  { path: '/policies', label: 'policies', realm: 'tenant', render: (ui) => <Policies {...ui} /> },
  { path: '/scopes', label: 'scopes', realm: 'tenant', render: (ui) => <Scopes {...ui} /> },
  { path: '/groups', label: 'groups', realm: 'tenant', render: (ui) => <GroupsPage {...ui} /> },
  {
    path: '/compliance',
    label: 'compliance',
    realm: 'tenant',
    render: (ui) => <Compliance {...ui} />,
  },
  {
    path: '/devices/:kind/:id',
    label: 'devices',
    realm: 'tenant',
    navigation: false,
    render: (ui) => <DeviceDetail {...ui} />,
  },
  { path: '/enroll', label: 'enrollment', realm: 'tenant', render: (ui) => <Enrollment {...ui} /> },
  {
    path: '/connections',
    label: 'connections',
    realm: 'tenant',
    render: (ui) => <Connections {...ui} />,
  },
  { path: '/authorization', label: 'authorization', render: (ui) => <Authorization {...ui} /> },
  {
    path: '/tenants',
    label: 'tenantAdministration',
    realm: 'management',
    render: (ui) => <Tenants {...ui} />,
  },
  {
    path: '/user-profiles',
    label: 'userProfiles',
    realm: 'tenant',
    render: (ui) => <UserProfiles {...ui} />,
  },
  {
    path: '/identity',
    label: 'identityAdministration',
    render: (ui) => <IdentityAdministration {...ui} />,
  },
  { path: '/security', label: 'security', render: (ui) => <SessionSecurity {...ui} /> },
]
function Workspace({ runtime, locale }: Ui) {
  const state = useSession(runtime),
    t = messages(locale)
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RSS MDM</p>
          <h1>{t.workspace}</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>{t.session}</h2>
        </div>
        <Descriptions
          column={1}
          colon={false}
          className="session-facts"
          items={[
            { key: 'tenant', label: t.tenant, children: runtime.tenant },
            { key: 'principal', label: t.principal, children: state.identity?.principalId },
            {
              key: 'expires',
              label: t.expires,
              children: state.session
                ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'medium',
                  }).format(
                    Math.min(state.session.idleExpiresAt, state.session.absoluteExpiresAt) * 1000,
                  )
                : '—',
            },
          ]}
        />
      </section>
    </>
  )
}
function SessionSecurity({ runtime, locale }: Ui) {
  const state = useSession(runtime),
    t = messages(locale),
    operation = useOperation(locale)
  const [reauthenticate, setReauthenticate] = useState(false)
  const [form] = Form.useForm<{ password: string }>()
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t.security}</h1>
          <p className="subtitle">{t.securityHint}</p>
        </div>
      </div>
      {!reauthenticate && operation.error && (
        <Alert type="error" title={operation.error} role="alert" showIcon />
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>{t.session}</h2>
        </div>
        <div className="panel-body">
          <Space wrap>
            <Button
              loading={operation.busy}
              onClick={() => void operation.run(runtime.owner.refresh)}
            >
              {t.refresh}
            </Button>
            {state.identity?.hasLocalPassword && (
              <Button
                disabled={operation.busy}
                onClick={() => {
                  operation.clear()
                  setReauthenticate(true)
                }}
              >
                {t.reauthenticate}
              </Button>
            )}
            <Button
              danger
              disabled={operation.busy}
              onClick={() => void operation.run(() => runtime.owner.logout(true))}
            >
              {t.logoutAll}
            </Button>
          </Space>
          {runtime.oidcEnabled && (
            <>
              <Divider />
              <Button
                loading={operation.busy}
                onClick={() => void operation.run(runtime.owner.loadSecurity)}
              >
                {t.noSecurity}
              </Button>
              {state.security && (
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: 'source',
                      label: t.source,
                      children: state.security.authentication.source,
                    },
                    {
                      key: 'strength',
                      label: t.strength,
                      children: state.security.authentication.acr,
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </section>
      <Passkeys runtime={runtime} locale={locale} busy={operation.busy} run={operation.run} />
      <Modal
        title={t.reauthenticate}
        getContainer={false}
        rootClassName={reauthenticate ? 'mdm-overlay-open' : ''}
        open={reauthenticate}
        footer={null}
        destroyOnHidden
        onCancel={() => {
          form.resetFields()
          operation.clear()
          setReauthenticate(false)
        }}
      >
        <p className="subtitle">{t.reauthenticateHint}</p>
        {operation.error && <Alert type="error" title={operation.error} role="alert" showIcon />}
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => {
            form.resetFields()
            void operation.run(async () => {
              await runtime.owner.reauthenticate(value.password)
              setReauthenticate(false)
            })
          }}
        >
          <Form.Item
            name="password"
            label={t.password}
            rules={[{ required: true, message: t.password }]}
          >
            <Input.Password autoComplete="current-password" autoFocus />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={operation.busy}>
              {t.reauthenticate}
            </Button>
            <Button
              onClick={() => {
                form.resetFields()
                operation.clear()
                setReauthenticate(false)
              }}
            >
              {t.cancel}
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  )
}
function Protected({ runtime, locale, children }: Ui & { children: ReactNode }) {
  const state = useSession(runtime),
    t = messages(locale),
    operation = useOperation(locale)
  if (state.status === 'checking')
    return (
      <div className="center-state" role="status">
        <Spin />
        <p>{t.checking}</p>
      </div>
    )
  if (state.status === 'unavailable')
    return (
      <Result
        status="warning"
        title={t.unavailable}
        subTitle={t.unavailableHint}
        extra={
          <Button
            loading={operation.busy}
            onClick={() => void operation.run(() => runtime.owner.check(runtime.tenant))}
          >
            {t.retry}
          </Button>
        }
      />
    )
  if (state.status !== 'authenticated') return <Navigate to={runtime.login} replace />
  return children
}
function Navigation({ runtime, locale, close }: Ui & { close: () => void }) {
  const t = messages(locale),
    location = useLocation()
  return (
    <>
      <Brand />
      <div className="organization">
        <span className="org-symbol" aria-hidden="true">
          ▦
        </span>
        <div>
          <strong>{runtime.management ? t.management : t.business}</strong>
          <small title={runtime.tenant}>{runtime.tenant.slice(0, 8)}</small>
        </div>
      </div>
      <nav aria-label={t.navigation}>
        {featureRoutes
          .filter(
            (route) =>
              route.navigation !== false &&
              (!route.realm || route.realm === (runtime.management ? 'management' : 'tenant')),
          )
          .map((route) => {
            const href =
              route.path === '/'
                ? runtime.home
                : `${runtime.management ? '/platform' : ''}${route.path}`
            const active =
              location.pathname === href ||
              (route.path === '/devices' && location.pathname.startsWith(`${href}/`))
            return (
              <Link
                key={route.path}
                className={`nav-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                to={href}
                onClick={close}
              >
                {t[route.label]}
              </Link>
            )
          })}
      </nav>
      <div className="sidebar-bottom">
        <span className="profile-icon" aria-hidden="true">
          R
        </span>
        <div>
          <strong>{t.product}</strong>
          <small>{runtime.management ? t.management : t.business}</small>
        </div>
      </div>
    </>
  )
}
function Shell({
  runtime,
  locale,
  dark,
  setDark,
  setLocale,
}: Ui & { dark: boolean; setDark: (value: boolean) => void; setLocale: (locale: Locale) => void }) {
  const [open, setOpen] = useState(false),
    [ready, setReady] = useState(false),
    [resumeError, setResumeError] = useState(false),
    [callbackReason, setCallbackReason] = useState<'cancelled' | 'failed' | 'unavailable' | null>(
      null,
    ),
    [stepUpReturned, setStepUpReturned] = useState(false)
  const t = messages(locale),
    state = useSession(runtime),
    location = useLocation(),
    operation = useOperation(locale)
  useEffect(() => {
    if (location.pathname === '/auth/error') {
      runtime.flows.clear()
      const reason = new URLSearchParams(location.search).get('reason')
      setCallbackReason(reason === 'cancelled' || reason === 'unavailable' ? reason : 'failed')
      setReady(true)
      return
    }
    const resume = location.pathname === '/auth/resume'
    const pending = resume ? runtime.flows.take() : null
    if (resume && (!pending || pending.tenant !== runtime.tenant)) {
      setResumeError(true)
      setReady(true)
      return
    }
    if (pending?.kind === 'step-up') setStepUpReturned(true)
    void runtime.owner
      .check(runtime.tenant)
      .catch(() => undefined)
      .finally(() => setReady(true))
    // Bootstrap runs once per composition. Resume never reads codes or exchanges protocol values.
  }, [runtime])
  useLayoutEffect(() => {
    runtime.owner.leavePage()
    operation.clear()
    setOpen(false)
  }, [location.key, runtime])
  useEffect(() => {
    const activity = (event: Event) => {
      if (event.isTrusted) void runtime.owner.activity().catch(() => undefined)
    }
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    return () => {
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
    }
  }, [runtime])
  const utility = (
    <Space>
      <Button aria-label={t.theme} onClick={() => setDark(!dark)}>
        {dark ? '☀' : '☾'}
      </Button>
      <Button
        aria-label={t.language}
        title={t.language}
        onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      >
        <span className="wide-label">{t.language}</span>
        <span className="compact-label" aria-hidden="true">
          {locale === 'zh' ? 'EN' : '中'}
        </span>
      </Button>
    </Space>
  )
  if (
    location.pathname === '/downloads/agent' ||
    location.pathname === '/enrollment/windows/entra/terms'
  )
    return (
      <>
        <a className="skip" href="#main">
          {t.skip}
        </a>
        <header className="public-utility">
          <Brand />
          {utility}
        </header>
        <main id="main" className="public-main" tabIndex={-1}>
          {location.pathname === '/downloads/agent' ? (
            <PublicDownloads runtime={runtime} locale={locale} />
          ) : (
            <EntraTerms runtime={runtime} locale={locale} />
          )}
        </main>
      </>
    )
  if (!ready)
    return (
      <div className="center-state" role="status">
        <Spin />
        <p>{t.checking}</p>
      </div>
    )
  if (callbackReason && location.pathname === '/auth/error')
    return (
      <Result
        status="warning"
        title={
          callbackReason === 'cancelled'
            ? t.callbackCancelled
            : callbackReason === 'unavailable'
              ? t.callbackUnavailable
              : t.callbackFailed
        }
        extra={<a href={runtime.login}>{t.login}</a>}
      />
    )
  if (resumeError && location.pathname === '/auth/resume')
    return (
      <Result
        status="warning"
        title={t.resumeFailed}
        extra={<a href={runtime.login}>{t.login}</a>}
      />
    )
  const authPath = location.pathname === '/login' || location.pathname === '/platform/login'
  if (authPath)
    return (
      <>
        <header className="login-utility">{utility}</header>
        <Login runtime={runtime} locale={locale} />
      </>
    )
  return (
    <Protected runtime={runtime} locale={locale}>
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <aside className="sidebar">
        <Navigation runtime={runtime} locale={locale} close={() => setOpen(false)} />
      </aside>
      <Drawer
        title={t.navigation}
        getContainer={false}
        rootClassName={`mdm-drawer ${open ? 'mdm-overlay-open' : ''}`}
        placement="left"
        width={218}
        open={open}
        onClose={() => setOpen(false)}
      >
        <Navigation runtime={runtime} locale={locale} close={() => setOpen(false)} />
      </Drawer>
      <div className="shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              className="menu-toggle"
              aria-label={t.openNavigation}
              onClick={() => setOpen(true)}
            >
              ☰
            </Button>
            <span>{runtime.management ? t.management : t.business}</span>
            <span aria-hidden="true">/</span>
            <strong>
              {
                t[
                  featureRoutes.find((route) =>
                    matchPath(
                      route.path === '/'
                        ? runtime.home
                        : `${runtime.management ? '/platform' : ''}${route.path}`,
                      location.pathname,
                    ),
                  )?.label ?? 'workspace'
                ]
              }
            </strong>
          </div>
          <Space>
            {utility}
            <Button
              aria-label={t.logout}
              title={t.logout}
              disabled={operation.busy}
              onClick={() => void operation.run(runtime.owner.logout)}
            >
              <span className="wide-label">{t.logout}</span>
              <svg
                className="compact-label"
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 4H4v16h5M14 8l4 4-4 4M9 12h10" />
              </svg>
            </Button>
          </Space>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {stepUpReturned && (
            <Alert
              type="info"
              title={t.stepUpReturned}
              closable
              onClose={() => setStepUpReturned(false)}
            />
          )}
          {operation.error && <Alert type="error" title={operation.error} showIcon role="alert" />}
          {state.navigation === 'unavailable' && (
            <Alert
              type="warning"
              title={t.navigationUnavailable}
              action={
                <Button onClick={() => void operation.run(runtime.owner.loadContext)}>
                  {t.retry}
                </Button>
              }
            />
          )}
          <Routes>
            {featureRoutes
              .filter(
                (route) =>
                  !route.realm || route.realm === (runtime.management ? 'management' : 'tenant'),
              )
              .map((route) => (
                <Route
                  key={route.path}
                  path={
                    route.path === '/'
                      ? runtime.home
                      : `${runtime.management ? '/platform' : ''}${route.path}`
                  }
                  element={
                    <div
                      key={`${runtime.tenant}/${state.identity?.principalId}/${state.session?.id}`}
                    >
                      {route.render({ runtime, locale })}
                    </div>
                  }
                />
              ))}
            <Route
              path="/auth/resume"
              element={
                <Navigate
                  to={
                    stepUpReturned
                      ? `${runtime.management ? '/platform' : ''}/security`
                      : runtime.home
                  }
                  replace
                />
              }
            />
            <Route
              path="*"
              element={
                <Result
                  status="404"
                  title={t.notFound}
                  extra={<Link to={runtime.home}>{t.back}</Link>}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </Protected>
  )
}
export function App({ runtime }: { runtime: Runtime }) {
  const [locale, setLocale] = useState<Locale>('zh'),
    [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [styleContainer] = useState(() => document.createElement('div'))
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
  }, [locale, dark])
  return (
    <StyleProvider container={styleContainer}>
      <ConfigProvider
        locale={locale === 'zh' ? zhCN : enUS}
        button={{ autoInsertSpace: false }}
        theme={mdmTheme(dark)}
      >
        <BrowserRouter>
          <Shell
            runtime={runtime}
            locale={locale}
            dark={dark}
            setDark={setDark}
            setLocale={setLocale}
          />
        </BrowserRouter>
      </ConfigProvider>
    </StyleProvider>
  )
}
