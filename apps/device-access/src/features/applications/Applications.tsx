import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, Modal, Space, Switch } from 'antd'
import { QueryRows } from '@rss/core'
import { applicationColumns } from '@rss/device-access/client'
import type { Application, ApplicationInput } from '@rss/device-access/model'
import { identityKey, useDa } from '../../context'
import { useDirectory } from '../../services/directory'
import { useRead } from '../../services/read'
import { useMutation } from '../../services/mutation'
import { useRevisionReview } from '../../services/revision-review'
import { errorMessage } from '../../services/status'
import { DirectoryControls, Json, ReadState, Unavailable, WriteStatus } from '../../ui/common'
export function Applications() {
  const r = useDa(),
    [locator, setLocator] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const directory = useDirectory(applicationColumns, 100, (query, signal) =>
    r.client.applications(query, signal),
  )
  const detail = useRead(
    (signal) => r.client.readApplication(locator!, signal),
    locator ?? '',
    !!locator,
  )
  return (
    <>
      <div className="da-toolbar">
        <h1>企业应用</h1>
        <Button
          disabled={!r.client.capabilities.applicationWrite.available}
          onClick={() => {
            setLocator(null)
            setCreating(true)
          }}
        >
          添加企业 RP
        </Button>
      </div>
      <DirectoryControls directory={directory} />
      <ReadState {...directory} />
      <ReadState {...detail} />
      {directory.data && !directory.data.summaries && (
        <QueryRows
          items={directory.data.items}
          onOpen={(row) => {
            setCreating(false)
            setLocator(String(row['id']))
          }}
        />
      )}
      {directory.data?.summaries && (
        <table>
          <thead>
            <tr>
              <th>RP ID</th>
              <th>启用</th>
              <th>Callback</th>
              <th>能力</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {directory.data.summaries.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.enabled ? '是' : '否'}</td>
                <td>{a.callback}</td>
                <td>{a.capabilities.join(', ')}</td>
                <td>
                  <Button
                    onClick={() => {
                      setCreating(false)
                      setLocator(a.id)
                    }}
                  >
                    完整详情
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!r.client.capabilities.applicationWrite.available && (
        <Unavailable reason={r.client.capabilities.applicationWrite.reason} />
      )}
      {(creating || detail.data) && (
        <ApplicationEditor
          key={creating ? 'new' : detail.data!.id}
          existing={creating ? null : detail.data!}
          close={() => {
            setCreating(false)
            setLocator(null)
          }}
          saved={() => void directory.reload()}
        />
      )}
      <p>
        企业 RP 目录不创建任意 Identity Provider client。正式目录只读，候选编辑仅由显式 demo 提供。
      </p>
    </>
  )
}
function ApplicationEditor({
  existing,
  close,
  saved,
}: {
  existing: Application | null
  close: () => void
  saved: () => void
}) {
  const r = useDa(),
    [id, setId] = useState(existing?.id ?? ''),
    [callback, setCallback] = useState(existing?.callback ?? ''),
    [enabled, setEnabled] = useState(existing?.enabled ?? true),
    [capabilities, setCapabilities] = useState<Application['capabilities']>(
      existing?.capabilities ?? ['native_key'],
    ),
    [message, setMessage] = useState(''),
    [proofBusy, setProofBusy] = useState(false)
  const baseline = useRevisionReview(existing, (key, signal) =>
      r.client.readApplication(key, signal),
    ),
    op = useMutation(`application/${existing?.id ?? 'new'}`),
    identity = identityKey(r.session)
  const scope = `${identity}/${id}/${callback}/${enabled}/${capabilities.join(',')}/${baseline.revision}`,
    live = useRef(scope)
  live.current = scope
  const controller = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      controller.current?.abort()
      void r.security.cancel().catch(() => undefined)
    },
    [scope, r],
  )
  const writable = r.client.capabilities.applicationWrite.available
  const valid = () =>
    writable &&
    !!identity &&
    identityKey(r.session) === identity &&
    live.current === scope &&
    !!id.trim() &&
    !!callback.trim() &&
    !!capabilities.length
  const input = (operationId: string): ApplicationInput => ({
    id: id.trim(),
    callback: callback.trim(),
    enabled,
    capabilities: [...capabilities],
    operationId,
    expectedRevision: baseline.revision,
  })
  async function save() {
    if (!valid() || baseline.current || baseline.busy) return
    const result = await op.run((operationId, signal) => {
      if (!valid()) throw new DOMException('Scope changed', 'AbortError')
      return r.client.application(input(operationId), signal)
    })
    if (result && valid()) {
      saved()
      close()
    }
  }
  async function query() {
    const value = await op.query(
      (operationId, signal) => r.client.operation(null, operationId, signal),
      (o) => o.state === 'completed',
    )
    if (value && valid()) saved()
  }
  async function prove() {
    if (!valid() || !op.state.proof || proofBusy) return
    const control = new AbortController()
    controller.current = control
    setProofBusy(true)
    try {
      const challenge = await r.client.applicationChallenge(input(op.state.id), control.signal)
      if (!valid() || control.signal.aborted) return
      await r.security.prove(challenge, control.signal)
      if (valid()) setMessage('认证完成，请再次明确提交。')
    } catch (e) {
      if (valid()) setMessage(errorMessage(e))
    } finally {
      if (valid()) setProofBusy(false)
    }
  }
  return (
    <Modal
      open
      title={writable ? '核对企业 RP' : '企业 RP 完整详情（只读）'}
      onCancel={close}
      footer={
        <Space>
          <Button onClick={close}>关闭</Button>
          {writable && (
            <Button
              type="primary"
              disabled={
                !valid() || op.locked || op.state.review || baseline.busy || !!baseline.current
              }
              onClick={() => void save()}
            >
              确认保存
            </Button>
          )}
        </Space>
      }
      destroyOnHidden
    >
      <div className="da-editor">
        <label>
          RP ID
          <Input
            value={id}
            disabled={!writable || !!existing || op.locked || op.state.proof}
            maxLength={64}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label>
          Callback URL
          <Input
            value={callback}
            disabled={!writable || op.locked || op.state.proof}
            onChange={(e) => setCallback(e.target.value)}
          />
        </label>
        <label>
          启用
          <Switch
            checked={enabled}
            disabled={!writable || op.locked || op.state.proof}
            onChange={setEnabled}
          />
        </label>
        <Checkbox.Group
          options={[
            { value: 'native_key', label: '平台密钥' },
            { value: 'password', label: '密码' },
          ]}
          value={capabilities}
          disabled={!writable || op.locked || op.state.proof}
          onChange={(values) => setCapabilities(values as Application['capabilities'])}
        />
      </div>
      {existing && writable && (
        <>
          <Button disabled={op.locked || op.state.proof} onClick={() => void baseline.refresh()}>
            读取当前已保存版本（保留草稿）
          </Button>
          {baseline.error && <Alert type="error" title={baseline.error} />}
          {baseline.current && (
            <>
              <Json value={baseline.current} />
              <Button
                onClick={() => {
                  if (baseline.accept()) op.acceptRevision()
                }}
              >
                已核对，基于当前版本继续编辑
              </Button>
            </>
          )}
        </>
      )}
      <WriteStatus state={op.state} query={query} />
      {op.state.proof && (
        <Button loading={proofBusy} onClick={() => void prove()}>
          验证本次修改用途
        </Button>
      )}
      <p role="status">{message}</p>
    </Modal>
  )
}
