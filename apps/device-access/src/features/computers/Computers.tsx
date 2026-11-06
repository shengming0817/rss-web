import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Drawer, Space, Tabs, Tag } from 'antd'
import { QueryRows } from '@rss/core'
import { computerColumns } from '@rss/device-access/client'
import { useDa } from '../../context'
import { useDirectory } from '../../services/directory'
import { useRead } from '../../services/read'
import { label, utc } from '../../services/status'
import { DirectoryControls, ReadState } from '../../ui/common'
import { readSearchLocation, listLocation } from './list-location'
import { AccountsPanel, AssetsPanel, PasskeysPanel, StatusPanel } from './Panels'
import { RecoveryPanel } from './Recovery'
export function ComputerList() {
  const r = useDa(),
    location = useLocation(),
    navigate = useNavigate(),
    [quick, setQuick] = useState<string | null>(null)
  const [reference, setReference] = useState<{ kind: 'endpoint' | 'association'; id: string }>()
  const initial = useRef(readSearchLocation(location.search))
  const directory = useDirectory(
    computerColumns,
    100,
    (query, signal) => r.client.computers(query, signal),
    '',
    initial.current,
  )
  const view = useRead(
    (signal) => r.client.viewComputers(reference!, signal),
    JSON.stringify(reference),
    !!reference,
  )
  const acceptedQuery = directory.applied
    ? new URLSearchParams(listLocation(directory.applied, directory.trail)).toString()
    : location.search.slice(1)
  useEffect(() => {
    if (directory.data && directory.applied && location.search.slice(1) !== acceptedQuery)
      navigate({ pathname: '/computers', search: acceptedQuery }, { replace: true })
  }, [directory.data, directory.applied, acceptedQuery, navigate])
  const observedSearch = useRef(location.search)
  useEffect(() => {
    if (observedSearch.current === location.search) return
    observedSearch.current = location.search
    if (location.search.slice(1) !== acceptedQuery)
      void directory.restore(readSearchLocation(location.search))
  }, [location.search, acceptedQuery, directory])
  function open(id: string, tab = 'status') {
    navigate(`/computers/${encodeURIComponent(id)}/${tab}?${acceptedQuery}`)
  }
  function inspect(row: Record<string, unknown>) {
    const v = row['reference']
    if (!v || typeof v !== 'object') return
    const ref = v as { kind: string; id: string }
    if ((ref.kind !== 'endpoint' && ref.kind !== 'association') || typeof ref.id !== 'string')
      return
    setReference({ kind: ref.kind, id: ref.id })
  }
  return (
    <>
      <div className="da-toolbar">
        <div>
          <h1>计算机</h1>
          <p>服务端目录与真实 endpoint；关联、MDM 与 Agent 标识分别保留。</p>
        </div>
        <Button onClick={() => void directory.reload()}>刷新目录</Button>
      </div>
      <section className="da-panel">
        <DirectoryControls directory={directory} />
        <ReadState {...directory} />
        <p>筛选 key、status、assetState、channel、source、platform、search；按 key 排序。</p>
        {directory.data && !directory.data.summaries && (
          <QueryRows items={directory.data.items} required={['reference']} onOpen={inspect} />
        )}
        <ReadState {...view} />
        {view.data?.map((c) => (
          <Space key={c.id}>
            <Button onClick={() => open(c.id)}>
              {c.name} · {c.id}
            </Button>
            <Button onClick={() => setQuick(c.id)}>快速查看</Button>
          </Space>
        ))}
        {directory.data?.summaries && (
          <table>
            <thead>
              <tr>
                <th>计算机</th>
                <th>平台</th>
                <th>状态</th>
                <th>最近观察</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {directory.data.summaries.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Button type="link" onClick={() => open(c.id)}>
                      {c.name}
                    </Button>
                  </td>
                  <td>{label(c.platform)}</td>
                  <td>
                    <Tag>{label(c.status)}</Tag>
                  </td>
                  <td>{utc(c.lastObservedAt)}</td>
                  <td>
                    <Space>
                      <Button onClick={() => open(c.id)}>完整详情</Button>
                      <Button onClick={() => setQuick(c.id)}>快速查看</Button>
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!directory.busy && !directory.error && directory.data?.items.length === 0 && (
          <p className="empty">当前查询没有计算机。</p>
        )}
        <p>当前页 {directory.data?.items.length ?? 0} 条，不代表组织总量</p>
      </section>
      <Drawer
        title="计算机快速查看"
        open={!!quick}
        size={760}
        onClose={() => setQuick(null)}
        destroyOnHidden
      >
        {quick && (
          <ComputerWorkspace
            key={quick}
            deviceId={quick}
            compact
            onExpand={(tab) => {
              setQuick(null)
              open(quick, tab)
            }}
          />
        )}
      </Drawer>
    </>
  )
}
export function ComputerDetail() {
  const { deviceId = '', tab = 'status' } = useParams()
  return <ComputerWorkspace key={deviceId} deviceId={deviceId} tab={tab} />
}
export function ComputerWorkspace({
  deviceId,
  tab = 'status',
  compact = false,
  onExpand,
}: {
  deviceId: string
  tab?: string
  compact?: boolean
  onExpand?: (tab: string) => void
}) {
  const r = useDa(),
    location = useLocation(),
    navigate = useNavigate(),
    [previewTab, setPreviewTab] = useState('status')
  const reader = useRead((signal) => r.client.computer(deviceId, signal), deviceId)
  const names = [
    ['status', '访问状态'],
    ['assets', '资产归属'],
    ['accounts', '账号与绑定'],
    ['passkeys', 'Passkey'],
    ['recovery', '恢复与轮换'],
    ['diagnostics', '诊断与修复'],
  ]
  const active = compact ? previewTab : names.some(([id]) => id === tab) ? tab : 'status'
  const computer = reader.data
  return (
    <section>
      <ReadState {...reader} />
      {computer && (
        <>
          {!compact && <Link to={`/computers${location.search}`}>返回计算机目录</Link>}
          <div className="da-toolbar">
            <div>
              <h1>{computer.name}</h1>
              <p>
                {label(computer.platform)} · 最近设备观察 {utc(computer.lastObservedAt)}
              </p>
              <p>
                Endpoint {computer.id} · 注册 {computer.registration ?? '未观察'}
              </p>
            </div>
            {compact && <Button onClick={() => onExpand?.(active)}>打开完整页面</Button>}
          </div>
          <div className="da-panel">
            <Tabs
              activeKey={active}
              onChange={(next) =>
                compact
                  ? setPreviewTab(next)
                  : navigate(
                      `/computers/${encodeURIComponent(deviceId)}/${next}${location.search}`,
                      { replace: true },
                    )
              }
              destroyOnHidden
              items={names.map(([key, title]) => ({
                key: key!,
                label: title!,
                children:
                  key === 'status' ? (
                    <StatusPanel device={computer} />
                  ) : key === 'assets' ? (
                    <AssetsPanel device={computer} />
                  ) : key === 'accounts' ? (
                    <AccountsPanel device={computer} />
                  ) : key === 'passkeys' ? (
                    <PasskeysPanel device={computer} />
                  ) : key === 'recovery' ? (
                    <RecoveryPanel device={computer} />
                  ) : (
                    <>
                      <h2>诊断与修复</h2>
                      <p>
                        {computer.name} · {computer.platform} · {utc(computer.lastObservedAt)}
                      </p>
                      <p>服务端受理与设备观察分别核对；此页不推断设备效果。</p>
                      <Link to={`/audit?device=${encodeURIComponent(deviceId)}`}>
                        查看此计算机时间线
                      </Link>
                    </>
                  ),
              }))}
            />
          </div>
        </>
      )}
    </section>
  )
}
