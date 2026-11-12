import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Space } from 'antd'
import { QueryRows } from '@rss/core'
import { materialColumns } from '@rss/device-access/client'
import type { Computer, Material, OriginalOperation } from '@rss/device-access/model'
import { AccessAutomationStatus, RecoveryMetadataSummary } from '@rss/device-access/components'
import { identityKey, useDa } from '../../context'
import { useDirectory } from '../../services/directory'
import { useRead } from '../../services/read'
import { useMutation } from '../../services/mutation'
import { errorMessage } from '../../services/status'
import { DirectoryControls, Json, ReadState, Unavailable, WriteStatus } from '../../ui/common'
export function RecoveryPanel({ device }: { device: Computer }) {
  const r = useDa(),
    [locator, setLocator] = useState<{ id: string; version: number } | null>(null)
  const directory = useDirectory(
    materialColumns,
    100,
    (query, signal) => r.client.materials(device.id, query, signal),
    device.id,
  )
  const detail = useRead(
    async (signal) => {
      const value = await r.client.material(device.id, locator!.id, locator!.version, signal)
      if (
        value.id !== locator!.id ||
        value.version !== locator!.version ||
        value.device !== device.id
      )
        throw new Error('Wrong material version')
      return value
    },
    `${device.id}/${locator?.id}/${locator?.version}`,
    !!locator,
  )
  return (
    <>
      <h2>恢复与轮换</h2>
      <p>按精确材料 id / version 读取元数据。材料仅用于经过用途验证的当前设备、注册与绑定。</p>
      <DirectoryControls directory={directory} />
      <ReadState {...directory} />
      <ReadState {...detail} />
      {directory.data && !directory.data.summaries && (
        <QueryRows
          items={directory.data.items}
          required={['id', 'version']}
          onOpen={(row) => setLocator({ id: String(row['id']), version: Number(row['version']) })}
        />
      )}
      {directory.data?.summaries && (
        <>
          <RecoveryMetadataSummary materials={directory.data.summaries} />
          {directory.data.summaries.map((m) => (
            <Button
              key={`${m.id}:${m.version}`}
              onClick={() => setLocator({ id: m.id, version: m.version })}
            >
              完整材料详情 · {m.subject.kind} · v{m.version}
            </Button>
          ))}
        </>
      )}
      {detail.data && (
        <MaterialDialog
          key={`${detail.data.id}:${detail.data.version}`}
          device={device}
          material={detail.data}
          close={() => setLocator(null)}
        />
      )}
      {!r.client.capabilities.rotation.available && (
        <Unavailable reason={r.client.capabilities.rotation.reason} />
      )}
      <p>目录不返回恢复明文；本机实际轮换效果须独立核对。</p>
    </>
  )
}
function MaterialDialog({
  device,
  material: m,
  close,
}: {
  device: Computer
  material: Material
  close: () => void
}) {
  const r = useDa(),
    identity = identityKey(r.session),
    scope = `${identity}/${device.id}/${m.id}/${m.version}/${m.subject.binding}/${m.subject.bindingGeneration}`
  const live = useRef(scope)
  live.current = scope
  const [mode, setMode] = useState<'inspect' | 'reveal' | 'rotate'>('inspect'),
    [secret, setSecret] = useState(''),
    [result, setResult] = useState<OriginalOperation>(),
    [message, setMessage] = useState(''),
    [proofBusy, setProofBusy] = useState(false)
  const disclosure = useMutation(`${device.id}/disclosure/${m.id}/${m.version}`),
    rotation = useMutation(`${device.id}/rotation/${m.id}/${m.version}`)
  const controller = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    epoch = useRef(0),
    open = useRef(true)
  function valid() {
    return (
      open.current &&
      live.current === scope &&
      identity !== null &&
      identityKey(r.session) === identity &&
      !document.hidden
    )
  }
  function clear() {
    epoch.current++
    setSecret('')
    clearTimeout(timer.current)
    controller.current?.abort()
    disclosure.cancel()
    rotation.cancel()
    setMessage('')
    setProofBusy(false)
    void r.security.cancel().catch(() => undefined)
  }
  function leave() {
    open.current = false
    clear()
    close()
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) leave()
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      open.current = false
      epoch.current++
      clearTimeout(timer.current)
      controller.current?.abort()
      void r.security.cancel().catch(() => undefined)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [scope, r])
  async function reveal() {
    if (!valid() || mode !== 'reveal' || m.subject.kind !== 'rss_login' || !m.current) return
    const version = epoch.current
    setSecret('')
    const value = await disclosure.run((id, signal) => {
      if (!valid()) throw new DOMException('Scope changed', 'AbortError')
      return r.client.reveal(device.id, m, id, signal)
    })
    if (value && valid() && epoch.current === version) {
      setSecret(value)
      timer.current = setTimeout(clear, 30_000)
    }
  }
  async function prove() {
    if (!valid() || proofBusy || !disclosure.state.proof) return
    const version = epoch.current,
      control = new AbortController()
    controller.current = control
    setProofBusy(true)
    setMessage('')
    try {
      const challenge = await r.client.materialChallenge(
        device.id,
        m,
        disclosure.state.id,
        control.signal,
      )
      if (!valid() || epoch.current !== version || control.signal.aborted) return
      await r.security.prove(challenge, control.signal)
      if (valid() && epoch.current === version)
        setMessage('用途认证完成，请再次明确查阅同一精确版本。')
    } catch (e) {
      if (valid() && epoch.current === version) setMessage(errorMessage(e))
    } finally {
      if (valid() && epoch.current === version) setProofBusy(false)
    }
  }
  async function rotate() {
    if (
      !valid() ||
      mode !== 'rotate' ||
      !r.client.capabilities.rotation.available ||
      !m.current ||
      m.subject.kind !== 'rss_login'
    )
      return
    const value = await rotation.run((id, signal) => {
      if (!valid()) throw new DOMException('Scope changed', 'AbortError')
      return r.client.rotate(device.id, m, id, signal)
    }, true)
    if (value && valid()) setResult(value)
  }
  async function query() {
    if (!valid()) return
    const value = await rotation.query((id, signal) => r.client.operation(device.id, id, signal))
    if (value && valid()) setResult(value)
  }
  return (
    <Modal
      open
      title={`精确材料 · ${device.name} · v${m.version}`}
      onCancel={leave}
      footer={<Button onClick={leave}>关闭并清除</Button>}
      destroyOnHidden
    >
      <RecoveryMetadataSummary materials={[m]} />
      <Json value={m} />
      <Space wrap>
        <Button
          disabled={!m.current || m.subject.kind !== 'rss_login'}
          onClick={() => {
            clear()
            setMode('reveal')
          }}
        >
          受控查阅
        </Button>
        <Button
          disabled={
            !m.current ||
            m.subject.kind !== 'rss_login' ||
            !r.client.capabilities.rotation.available
          }
          onClick={() => {
            clear()
            setMode('rotate')
          }}
        >
          核对本机材料轮换
        </Button>
      </Space>
      {mode === 'reveal' && (
        <>
          <Alert type="warning" title="恢复明文只短暂显示，30 秒、隐藏、关闭或离开即清除。" />
          {secret ? (
            <>
              <div className="da-secret" role="status">
                {secret}
              </div>
              <Button onClick={clear}>立即清除</Button>
            </>
          ) : (
            <Button type="primary" disabled={disclosure.locked} onClick={() => void reveal()}>
              明确查阅此版本
            </Button>
          )}
          <WriteStatus state={disclosure.state} />
          {disclosure.state.proof && (
            <Button loading={proofBusy} onClick={() => void prove()}>
              验证本次查阅用途
            </Button>
          )}
          <p role="status">{message}</p>
        </>
      )}
      {mode === 'rotate' && (
        <>
          <p>本操作不证明设备已经应用，请查询原操作观察。</p>
          <Button disabled={rotation.locked} onClick={() => void rotate()}>
            确认提交轮换
          </Button>
          <WriteStatus state={rotation.state} query={query} />
          {result && <AccessAutomationStatus operation={result} />}
        </>
      )}
    </Modal>
  )
}
