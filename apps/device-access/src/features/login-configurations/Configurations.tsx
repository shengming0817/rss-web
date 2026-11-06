import { useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Select, Space, Steps, Switch } from 'antd'
import { comparison } from '@rss/api/mdm-query'
import { computerColumns } from '@rss/device-access/client'
import type { Configuration, ConfigurationInput, Person } from '@rss/device-access/model'
import { identityKey, useDa } from '../../context'
import { useRead } from '../../services/read'
import { useDirectory } from '../../services/directory'
import { useRevisionReview } from '../../services/revision-review'
import { useMutation } from '../../services/mutation'
import { DirectoryControls, Json, ReadState, Unavailable, WriteStatus } from '../../ui/common'
export function Configurations() {
  const r = useDa(),
    [cursor, setCursor] = useState<string | null>(null),
    [locator, setLocator] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const available = r.client.capabilities.configuration.available
  const reader = useRead(
    (signal) => r.client.configurations(cursor, signal),
    cursor ?? '',
    available,
  )
  const detail = useRead(
    (signal) => r.client.readConfiguration(locator!, signal),
    locator ?? '',
    !!locator && available,
  )
  if (!available)
    return (
      <>
        <h1>登录配置</h1>
        <Unavailable reason={r.client.capabilities.configuration.reason} />
        <p>正式 Policy device_access 动作已存在，此编排模型的完整投影与 Scope/排除映射尚未接线。</p>
      </>
    )
  return (
    <>
      <div className="da-toolbar">
        <h1>登录配置</h1>
        <Button
          onClick={() => {
            setLocator(null)
            setCreating(true)
          }}
        >
          新建登录配置
        </Button>
      </div>
      <ReadState {...reader} />
      <ReadState {...detail} />
      {reader.data && (
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>平台 / 登录</th>
              <th>范围</th>
              <th>状态</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {reader.data.items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  {c.platform} / {c.mode}
                </td>
                <td>{c.scope.label}</td>
                <td>{c.state}</td>
                <td>
                  <Button
                    onClick={() => {
                      setCreating(false)
                      setLocator(c.id)
                    }}
                  >
                    读取配置
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Space>
        <Button onClick={() => setCursor(null)}>首页</Button>
        <Button
          disabled={!reader.data?.nextCursor}
          onClick={() => setCursor(reader.data!.nextCursor)}
        >
          下一页
        </Button>
      </Space>
      {(creating || detail.data) && (
        <ConfigurationEditor
          key={creating ? 'new' : detail.data!.id}
          existing={creating ? null : detail.data!}
          close={() => {
            setCreating(false)
            setLocator(null)
          }}
          saved={() => void reader.reload()}
        />
      )}
    </>
  )
}
function ConfigurationEditor({
  existing,
  close,
  saved,
}: {
  existing: Configuration | null
  close: () => void
  saved: () => void
}) {
  const r = useDa(),
    [id] = useState(existing?.id ?? crypto.randomUUID()),
    [step, setStep] = useState(0),
    [name, setName] = useState(existing?.name ?? ''),
    [platform, setPlatform] = useState<'windows' | 'macos'>(
      existing?.platform === 'windows' ? 'windows' : 'macos',
    ),
    [role, setRole] = useState<Configuration['role']>(existing?.role ?? 'preserve'),
    [mode, setMode] = useState(existing?.mode ?? 'platform_sso'),
    [selfEnrollment, setSelfEnrollment] = useState(existing?.selfEnrollment ?? true),
    [scopeId, setScopeId] = useState(existing?.scope.id ?? ''),
    [exclusions, setExclusions] = useState<Person[]>(existing?.exclusions ?? [])
  const scopes = useRead((signal) => r.client.scopes(signal))
  const directory = useDirectory(
    computerColumns,
    100,
    (query, signal) => r.client.computers(query, signal),
    platform,
    undefined,
    { filter: comparison('platform', '==', platform) },
  )
  const baseline = useRevisionReview(existing, (key, signal) =>
      r.client.readConfiguration(key, signal),
    ),
    op = useMutation(`configuration/${existing?.id ?? 'new'}`)
  const identity = identityKey(r.session),
    scope = `${identity}/${id}/${name}/${platform}/${role}/${mode}/${selfEnrollment}/${scopeId}/${JSON.stringify(exclusions)}/${baseline.revision}`,
    live = useRef(scope)
  live.current = scope
  const selectedScope = scopes.data?.find((s) => s.id === scopeId),
    targets = [
      ...new Map(
        [
          ...exclusions,
          ...(directory.data?.summaries ?? []).map((c) => ({ id: c.id, label: c.name })),
        ].map((p) => [p.id, p]),
      ).values(),
    ]
  const valid = !!name.trim() && !!selectedScope && directory.projectionComplete
  const current = () =>
    identity !== null && identityKey(r.session) === identity && live.current === scope
  function change() {
    if (step === 2) setStep(1)
  }
  function input(operationId: string): ConfigurationInput {
    return {
      operationId,
      id,
      expectedRevision: baseline.revision,
      name: name.trim(),
      platform,
      role,
      mode,
      selfEnrollment,
      scope: selectedScope!,
      exclusions: [...exclusions],
    }
  }
  async function save() {
    if (!current() || !valid || step !== 2 || baseline.busy || baseline.current) return
    const result = await op.run((operationId, signal) => {
      if (!current()) throw new DOMException('Scope changed', 'AbortError')
      return r.client.configuration(input(operationId), signal)
    })
    if (result && current()) {
      setStep(3)
      saved()
    }
  }
  async function query() {
    if (!current()) return
    const result = await op.query(
      (operationId, signal) => r.client.operation(null, operationId, signal),
      (value) => value.state === 'completed',
    )
    if (result && current()) {
      setStep(3)
      saved()
    }
  }
  return (
    <Modal
      open
      width={840}
      title="登录配置编排"
      onCancel={close}
      destroyOnHidden
      footer={
        <Space>
          {step > 0 && step < 3 && (
            <Button disabled={op.locked} onClick={() => setStep((v) => v - 1)}>
              上一步
            </Button>
          )}
          {step < 2 && (
            <Button
              disabled={
                op.locked ||
                !name.trim() ||
                (step === 1 && (!valid || directory.busy || !!directory.error))
              }
              onClick={() => setStep((v) => v + 1)}
            >
              {step === 1 ? '核对影响' : '下一步'}
            </Button>
          )}
          {step === 2 && (
            <Button
              type="primary"
              disabled={
                !valid || op.locked || op.state.review || baseline.busy || !!baseline.current
              }
              onClick={() => void save()}
            >
              确认保存配置
            </Button>
          )}
          <Button onClick={close}>关闭</Button>
        </Space>
      }
    >
      <Steps
        current={step}
        items={['登录方式', '分配范围', '核对影响', '提交结果'].map((title) => ({ title }))}
      />
      <ReadState {...scopes} />
      {step === 0 && (
        <div className="da-editor">
          <label>
            名称
            <Input
              maxLength={128}
              value={name}
              disabled={op.locked}
              onChange={(e) => {
                setName(e.target.value)
                change()
              }}
            />
          </label>
          <label>
            平台
            <Select
              value={platform}
              disabled={op.locked}
              options={[
                { value: 'macos', label: 'macOS' },
                { value: 'windows', label: 'Windows' },
              ]}
              onChange={(v) => {
                setPlatform(v)
                setMode(v === 'macos' ? 'platform_sso' : 'rss_factor')
                setExclusions([])
                change()
              }}
            />
          </label>
          <label>
            登录方式
            <Select
              value={mode}
              disabled={op.locked}
              options={(platform === 'macos'
                ? [
                    ['platform_sso', '平台 SSO'],
                    ['password', 'PSSO 密码模式'],
                  ]
                : [
                    ['rss_factor', 'RSS 附加因子'],
                    ['native', 'Windows 原生强认证'],
                  ]
              ).map(([value, label]) => ({ value: value!, label: label! }))}
              onChange={(v) => {
                setMode(v)
                change()
              }}
            />
          </label>
          <label>
            本地权限
            <Select
              value={role}
              disabled={op.locked}
              options={[
                { value: 'preserve', label: '保持已有权限' },
                { value: 'standard', label: '普通用户' },
                { value: 'administrator', label: '管理员' },
              ]}
              onChange={(v) => {
                setRole(v)
                change()
              }}
            />
          </label>
          <label>
            允许首次开通
            <Switch
              checked={selfEnrollment}
              disabled={op.locked}
              onChange={(v) => {
                setSelfEnrollment(v)
                change()
              }}
            />
          </label>
        </div>
      )}
      {step === 1 && (
        <div className="da-editor">
          <label>
            分配范围
            <Select
              value={scopeId}
              options={scopes.data?.map((s) => ({ value: s.id, label: s.label })) ?? []}
              disabled={op.locked}
              onChange={(v) => {
                setScopeId(v)
                change()
              }}
            />
          </label>
          <label>
            排除计算机
            <Select
              mode="multiple"
              value={exclusions.map((e) => e.id)}
              options={targets.map((t) => ({ value: t.id, label: t.label }))}
              disabled={op.locked}
              onChange={(values) => {
                setExclusions(targets.filter((t) => values.includes(t.id)))
                change()
              }}
            />
          </label>
          <DirectoryControls directory={directory} disabled={op.locked} />
          <ReadState {...directory} />
          <p>候选设备来自当前查询页；已选择的排除项跨页保留。</p>
        </div>
      )}
      {step === 2 && (
        <>
          <h3>核对影响</h3>
          <Json
            value={{ name, platform, mode, role, selfEnrollment, scope: selectedScope, exclusions }}
          />
          <Alert type="info" title="保存的是配置意图；范围、服务端受理与设备实际应用分别观察。" />
        </>
      )}
      {step === 3 && (
        <>
          <h3>配置请求已提交</h3>
          <p>请求受理不证明设备效果，请显式读取当前状态。</p>
        </>
      )}
      {existing && (
        <>
          <Button disabled={op.locked} onClick={() => void baseline.refresh()}>
            读取当前已保存版本（保留草稿）
          </Button>
          {baseline.error && <Alert type="error" title={baseline.error} />}
          {baseline.current && (
            <>
              <Json value={baseline.current} />
              <Button
                onClick={() => {
                  if (baseline.accept()) {
                    op.acceptRevision()
                    setStep(1)
                  }
                }}
              >
                已核对，基于当前版本继续编辑
              </Button>
            </>
          )}
        </>
      )}
      <WriteStatus state={op.state} query={query} />
    </Modal>
  )
}
