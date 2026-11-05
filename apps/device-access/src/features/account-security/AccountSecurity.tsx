import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd'
import type { Credential } from '@rss/device-access/model'
import { identityKey, useDa, useIdentity } from '../../context'
import { useRead } from '../../services/read'
import { useMutation } from '../../services/mutation'
import { errorMessage } from '../../services/status'
import { ReadState, WriteStatus } from '../../ui/common'
export function AccountSecurity({ oidc }: { oidc: boolean }) {
  const r = useDa(),
    snapshot = useIdentity(),
    identity = identityKey(r.session),
    scope = useRef(identity)
  scope.current = identity
  const reader = useRead((signal) => r.security.list(signal))
  const register = useMutation('security/register'),
    [name, setName] = useState(''),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Credential | null>(null),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [provider, setProvider] = useState<string>()
  const removal = useMutation(`security/remove/${selected?.id ?? ''}`),
    controller = useRef<AbortController | null>(null),
    active = useRef(true)
  const valid = () =>
    active.current &&
    identity !== null &&
    scope.current === identity &&
    identityKey(r.session) === identity &&
    !document.hidden
  function cancel() {
    setPassword('')
    setName('')
    setSelected(null)
    setOpen(false)
    controller.current?.abort()
    register.cancel()
    removal.cancel()
    void r.security.cancel().catch(() => undefined)
  }
  useEffect(() => {
    active.current = true
    const hidden = () => {
      if (document.hidden) cancel()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      active.current = false
      controller.current?.abort()
      void r.security.cancel().catch(() => undefined)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [r])
  async function add() {
    if (!valid() || !name.trim()) return
    const label = name.trim()
    setName('')
    const result = await register.run((_id, signal) => {
      if (!valid()) throw new DOMException('Scope changed', 'AbortError')
      return r.security.register(label, signal)
    })
    if (result && valid()) {
      setOpen(false)
      await reader.reload()
    }
  }
  async function remove() {
    const credential = selected
    if (!valid() || !credential) return
    let confirmed = false
    await removal.run(async (_id, signal) => {
      if (!valid()) throw new DOMException('Scope changed', 'AbortError')
      await r.security.remove(credential.id, signal)
      confirmed = true
    })
    if (confirmed && valid()) {
      setSelected(null)
      await reader.reload()
    }
  }
  async function prove() {
    if (!valid() || busy) return
    const control = new AbortController()
    controller.current = control
    setBusy(true)
    setMessage('')
    try {
      await r.security.reauthenticate(control.signal)
      if (valid()) setMessage('认证完成，请明确再次注册。')
    } catch (e) {
      if (valid()) setMessage(errorMessage(e))
    } finally {
      if (valid()) setBusy(false)
    }
  }
  async function reauthenticate() {
    if (!valid() || !password || busy) return
    const value = password
    setPassword('')
    setBusy(true)
    try {
      await r.session.reauthenticate(value)
      if (valid()) setMessage('近期认证完成，请重新打开任务并明确提交。')
    } catch (e) {
      if (valid()) setMessage(errorMessage(e))
    } finally {
      if (valid()) setBusy(false)
    }
  }
  async function stepUp() {
    if (!valid() || !provider || busy) return
    setBusy(true)
    try {
      const target = await r.session.stepUp(
        provider,
        selected ? { kind: 'remove', credential: selected.id } : { kind: 'register' },
      )
      if (!valid()) return
      r.flows.save('step-up', r.host.tenant)
      cancel()
      window.location.assign(target)
    } catch (e) {
      if (valid()) setMessage(errorMessage(e))
    } finally {
      if (valid()) setBusy(false)
    }
  }
  return (
    <>
      <div className="da-toolbar">
        <h1>账户安全</h1>
        <Button disabled={register.locked} onClick={() => setOpen(true)}>
          注册 WebAuthn 凭据
        </Button>
      </div>
      <ReadState {...reader} />
      <Button onClick={() => void reader.reload()}>刷新凭据目录</Button>
      {reader.data && (
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>用途范围</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {reader.data.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>当前账户 WebAuthn</td>
                <td>
                  <Button danger onClick={() => setSelected(c)}>
                    移除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <WriteStatus state={register.state} />
      <Alert
        type="info"
        title="注册和移除由浏览器 WebAuthn 完成；当前账户列表不证明凭据位于哪台计算机。"
      />
      <Modal
        open={open}
        title="注册账户 WebAuthn 凭据"
        onCancel={cancel}
        footer={
          <Space>
            <Button onClick={cancel}>取消</Button>
            <Button
              type="primary"
              disabled={!name.trim() || register.locked}
              onClick={() => void add()}
            >
              明确注册
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="凭据名称" htmlFor="da-credential-label">
            <Input
              id="da-credential-label"
              maxLength={128}
              value={name}
              disabled={register.locked}
              onChange={(e) => setName(e.target.value)}
            />
          </Form.Item>
        </Form>
        <WriteStatus state={register.state} />
        {register.state.proof && (
          <Button loading={busy} onClick={() => void prove()}>
            使用已有 WebAuthn 认证注册用途
          </Button>
        )}
      </Modal>
      <Modal
        open={!!selected}
        title={`移除 ${selected?.label ?? ''}`}
        onCancel={cancel}
        footer={
          <Space>
            <Button onClick={cancel}>取消</Button>
            <Button danger disabled={removal.locked} onClick={() => void remove()}>
              确认移除
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        <p>先验证绑定此凭据的移除用途，再提交；取消不会自动重发。</p>
        <WriteStatus state={removal.state} />
      </Modal>
      {snapshot.identity?.hasLocalPassword && (
        <section>
          <h2>近期认证</h2>
          <Form layout="inline" onFinish={() => void reauthenticate()}>
            <Form.Item label="当前密码" htmlFor="da-reauth-password">
              <Input.Password
                id="da-reauth-password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Item>
            <Button htmlType="submit" disabled={busy || !password}>
              重新认证
            </Button>
          </Form>
        </section>
      )}
      {oidc && (
        <section>
          <h2>联合身份用途认证</h2>
          <Button
            onClick={() => void r.session.loadSecurity().catch((e) => setMessage(errorMessage(e)))}
          >
            读取可用认证 Provider
          </Button>
          <Select
            aria-label="用途认证 Provider"
            value={provider}
            options={
              snapshot.security?.eligibleStepUpProviders.map((p) => ({
                value: p.id,
                label: p.label,
              })) ?? []
            }
            onChange={setProvider}
          />
          <Button disabled={!provider || busy} onClick={() => void stepUp()}>
            认证{selected ? '所选凭据移除' : '注册'}用途
          </Button>
          <p>返回后只读取会话；原任务需要再次明确提交。</p>
        </section>
      )}
      <p role="status">{message}</p>
    </>
  )
}
