import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Layout, Menu, Select, Space, Switch } from 'antd'
import { usePresentation } from '@rss/core'
import type { AuthenticationFlows, Provider, SessionOwner } from '@rss/auth-core'
import type { DaHost } from './config'
import { errorMessage } from './services/status'
import { ComputerList, ComputerDetail } from './features/computers/Computers'
import { Applications } from './features/applications/Applications'
import { Configurations } from './features/login-configurations/Configurations'
import { AccountSecurity } from './features/account-security/AccountSecurity'
import { Audit } from './features/audit/Audit'
function Login({
  session,
  host,
  oidc,
  flows,
}: {
  session: SessionOwner
  host: DaHost
  oidc: boolean
  flows: AuthenticationFlows
}) {
  const [login, setLogin] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [providers, setProviders] = useState<readonly Provider[]>([])
  const navigate = useNavigate(),
    location = useLocation(),
    live = useRef(true),
    epoch = useRef(0),
    page = useRef(location.key)
  page.current = location.key
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        epoch.current++
        setPassword('')
        setBusy(false)
      }
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      live.current = false
      epoch.current++
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  useEffect(() => {
    let active = true
    void session
      .providers(host.tenant)
      .then((value) => {
        if (active) setProviders(value)
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
      setPassword('')
    }
  }, [host.tenant, session])
  async function submit() {
    if (busy || document.hidden || !live.current) return
    const secret = password,
      version = epoch.current,
      key = page.current
    const valid = () =>
      live.current && !document.hidden && version === epoch.current && key === page.current
    setPassword('')
    setBusy(true)
    setError('')
    try {
      await session.login(host.tenant, login, secret)
      if (valid()) navigate('/', { replace: true })
    } catch (e) {
      if (valid()) setError(errorMessage(e))
    } finally {
      if (valid()) setBusy(false)
    }
  }
  async function sso(provider: string) {
    if (busy || document.hidden || !live.current) return
    const version = epoch.current,
      key = page.current
    const valid = () =>
      live.current && !document.hidden && version === epoch.current && key === page.current
    setPassword('')
    setBusy(true)
    try {
      const target = await session.beginSso(host.tenant, provider)
      if (!valid()) return
      flows.save('sso', host.tenant)
      window.location.assign(target)
    } catch (e) {
      if (valid()) {
        setError(errorMessage(e))
        setBusy(false)
      }
    }
  }
  return (
    <Card className="da-login" title="登录 RSS Device Access">
      {error && <Alert role="alert" type="error" title={error} />}
      <Form layout="vertical" onFinish={() => void submit()}>
        <Form.Item label="账号" htmlFor="da-login">
          <Input
            id="da-login"
            autoComplete="username"
            value={login}
            disabled={busy}
            onChange={(e) => setLogin(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="密码" htmlFor="da-password">
          <Input.Password
            id="da-password"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={busy} disabled={!login || !password}>
          登录
        </Button>
      </Form>
      {oidc &&
        providers.map((p) => (
          <Button key={p.id} disabled={busy} onClick={() => void sso(p.id)}>
            {p.label}
          </Button>
        ))}
    </Card>
  )
}
function Resume({
  session,
  host,
  flows,
}: {
  session: SessionOwner
  host: DaHost
  flows: AuthenticationFlows
}) {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    const flow = flows.take()
    if (!flow || flow.tenant !== host.tenant) {
      setError('认证流程已过期，请重新开始。')
      return
    }
    void session
      .check(host.tenant)
      .then(() => {
        if (!active) return
        if (session.getSnapshot().status !== 'authenticated') {
          setError('未确认登录会话。')
          return
        }
        navigate(flow.kind === 'sso' ? '/' : '/security', { replace: true })
      })
      .catch((e) => {
        if (active) setError(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [session, host.tenant, navigate])
  return (
    <Card title="恢复认证会话">
      {error || '正在确认同源会话…'}
      <Link to="/login">返回登录</Link>
    </Card>
  )
}
function Overview() {
  return (
    <>
      <h1>Device Access</h1>
      <p>计算机访问、账户绑定、企业 Passkey 与恢复材料管理。</p>
      <Alert
        type="info"
        title="跨计算机汇总尚未接入"
        description="当前目录结果不代表全组织数量或成功率。服务端受理、设备接收与实际效果分别核对。"
      />
      <Space wrap>
        <Link to="/computers">计算机目录</Link>
        <Link to="/applications">企业应用</Link>
        <Link to="/security">账户安全</Link>
      </Space>
    </>
  )
}
export function App({
  session,
  host,
  oidc,
  controls: Controls,
  flows,
  status,
}: {
  session: SessionOwner
  host: DaHost
  oidc: boolean
  controls: ComponentType | null
  flows: AuthenticationFlows
  status?: string
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot),
    location = useLocation(),
    presentation = usePresentation()
  const [error, setError] = useState('')
  useEffect(() => {
    const activity = (event: Event) => {
      if (event.isTrusted && !document.hidden && session.getSnapshot().status === 'authenticated')
        void session.activity().catch(() => undefined)
    }
    const visibility = () => {
      if (document.hidden) session.leavePage()
      else void session.check(host.tenant).catch(() => undefined)
    }
    const depart = () => session.suspend()
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void session.check(host.tenant).catch(() => undefined)
    }
    window.addEventListener('pointerdown', activity, true)
    window.addEventListener('keydown', activity, true)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', depart)
    window.addEventListener('pageshow', restore)
    return () => {
      window.removeEventListener('pointerdown', activity, true)
      window.removeEventListener('keydown', activity, true)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', depart)
      window.removeEventListener('pageshow', restore)
    }
  }, [session, host.tenant])
  useEffect(() => {
    if (location.pathname === '/auth/error') flows.clear()
    return () => session.leavePage()
  }, [session, location.pathname])
  const authenticated = state.status === 'authenticated' && !status
  if (location.pathname === '/auth/resume')
    return <Resume flows={flows} session={session} host={host} />
  if (location.pathname === '/auth/error')
    return (
      <Card title="认证未完成">
        <p>认证已取消、失败或过期，请明确重新发起。</p>
        <Link to="/login">返回登录</Link>
      </Card>
    )
  if (!authenticated)
    return (
      <main className="da-surface">
        {Controls && <Controls />}
        {state.status === 'checking' && <p role="status">正在检查会话…</p>}
        <>
          {state.logoutOutcome === 'unconfirmed' && (
            <Alert type="warning" title="退出尚未确认；请检查服务状态。" />
          )}
          {state.status === 'unavailable' && (
            <Alert
              type="error"
              title="会话服务暂不可用"
              action={
                <Button onClick={() => void session.check(host.tenant).catch(() => undefined)}>
                  重新检查
                </Button>
              }
            />
          )}
          <Login flows={flows} session={session} host={host} oidc={oidc} />
        </>
      </main>
    )
  const links = [
    ['/', '概览'],
    ['/computers', '计算机'],
    ['/configurations', '登录配置'],
    ['/applications', '企业应用'],
    ['/security', '账户安全'],
    ['/audit', '审计'],
  ]
  return (
    <Layout className="da-surface">
      {Controls && <Controls />}
      <Layout.Header>
        <Link to="/">RSS Device Access</Link>
        <Space>
          <Select
            aria-label="语言"
            value={presentation.locale}
            options={[
              { value: 'zh-CN', label: '中文' },
              { value: 'en-US', label: 'English' },
            ]}
            onChange={presentation.setLocale}
          />
          <Switch
            aria-label="深色主题"
            checked={presentation.theme === 'dark'}
            onChange={(v) => presentation.setTheme(v ? 'dark' : 'light')}
          />
          <Button onClick={() => void session.refresh().catch((e) => setError(errorMessage(e)))}>
            刷新会话
          </Button>
          <Button onClick={() => void session.logout().catch((e) => setError(errorMessage(e)))}>
            退出
          </Button>
        </Space>
      </Layout.Header>
      <Menu
        mode="horizontal"
        selectedKeys={[location.pathname.split('/').slice(0, 2).join('/') || '/']}
        items={links.map(([path, title]) => ({
          key: path!,
          label: <Link to={path!}>{title}</Link>,
        }))}
      />
      <Layout.Content>
        <p className="da-tenant">租户 {host.tenant}</p>
        {error && <Alert type="error" title={error} />}
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/computers" element={<ComputerList />} />
          <Route path="/computers/:deviceId/:tab?" element={<ComputerDetail />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/configurations" element={<Configurations />} />
          <Route
            path="/security"
            element={<AccountSecurity key={state.session?.id} oidc={oidc} />}
          />
          <Route path="/audit" element={<Audit />} />
          <Route
            path="*"
            element={
              <Card title="页面不存在">
                <Link to="/">返回概览</Link>
              </Card>
            }
          />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
