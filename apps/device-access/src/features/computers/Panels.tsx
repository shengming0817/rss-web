import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Select, Space } from 'antd'
import { QueryRows } from '@rss/core'
import { bindingColumns, type BindingInput } from '@rss/device-access/client'
import type { Assignment, Binding, Computer, PasskeyRecord, Person } from '@rss/device-access/model'
import {
  AccountBindingSummary,
  AssetAssignmentSummary,
  DeviceAccessSummary,
  EnterprisePasskeySummary,
} from '@rss/device-access/components'
import { identityKey, useDa } from '../../context'
import { useRead } from '../../services/read'
import { useDirectory } from '../../services/directory'
import { useMutation } from '../../services/mutation'
import { useRevisionReview } from '../../services/revision-review'
import { errorMessage } from '../../services/status'
import { DirectoryControls, Json, ReadState, Unavailable, WriteStatus } from '../../ui/common'
export function StatusPanel({ device }: { device: Computer }) {
  const r = useDa(),
    reader = useRead((signal) => r.client.bindings(device.id, {}, signal), device.id)
  return (
    <>
      <ReadState {...reader} />
      {reader.data && (
        <DeviceAccessSummary computer={device} bindings={reader.data.summaries ?? []} />
      )}
      {reader.data?.nextCursor && <p>以上仅为当前目录页，请到账号与绑定继续查询。</p>}
      <Button onClick={() => void reader.reload()}>刷新当前观察</Button>
    </>
  )
}
export function AssetsPanel({ device }: { device: Computer }) {
  const r = useDa()
  return r.client.capabilities.assignment.available ? (
    <AssetEditor device={device} />
  ) : (
    <Unavailable reason={r.client.capabilities.assignment.reason} />
  )
}
function AssetEditor({ device }: { device: Computer }) {
  const r = useDa(),
    reader = useRead(
      async (signal) => ({
        assignment: await r.client.assignment(device.id, signal),
        people: await r.client.people(signal),
      }),
      device.id,
    )
  const [assignee, setAssignee] = useState<string | null>(null),
    [owner, setOwner] = useState<string | null>(null)
  const op = useMutation(`${device.id}/assignment`),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState<Assignment>()
  useEffect(() => {
    if (op.state.review) return
    setAssignee(reader.data?.assignment.assignee?.id ?? null)
    setOwner(reader.data?.assignment.owner?.id ?? null)
    setRevision(reader.data?.assignment.revision ?? 0)
  }, [reader.data, op.state.review])
  const people = [
    ...new Map(
      [
        ...(reader.data?.people ?? []),
        reader.data?.assignment.assignee,
        reader.data?.assignment.owner,
      ]
        .filter((v): v is Person => !!v)
        .map((v) => [v.id, v]),
    ).values(),
  ]
  async function save() {
    if (!reader.data) return
    const result = await op.run((operationId, signal) =>
      r.client.assign(
        device.id,
        {
          operationId,
          expectedRevision: revision,
          assignee: people.find((v) => v.id === assignee) ?? null,
          owner: people.find((v) => v.id === owner) ?? null,
        },
        signal,
      ),
    )
    if (result) await reader.reload()
  }
  async function query() {
    const result = await op.query(
      (id, signal) => r.client.operation(device.id, id, signal),
      (v) => v.state === 'completed',
    )
    if (result) await reader.reload()
  }
  return (
    <>
      <h2>资产归属</h2>
      <ReadState {...reader} />
      {reader.data && (
        <div className="da-editor">
          <label>
            资产使用人
            <Select
              allowClear
              value={assignee}
              options={people.map((v) => ({ value: v.id, label: v.label }))}
              disabled={op.locked}
              onChange={(v) => setAssignee(v ?? null)}
            />
          </label>
          <label>
            资产所有人
            <Select
              allowClear
              value={owner}
              options={people.map((v) => ({ value: v.id, label: v.label }))}
              disabled={op.locked}
              onChange={(v) => setOwner(v ?? null)}
            />
          </label>
          <Button disabled={op.locked || op.state.review} onClick={() => void save()}>
            保存资产归属
          </Button>
          <AssetAssignmentSummary assignment={reader.data.assignment} />
        </div>
      )}
      <WriteStatus state={op.state} query={query} />
      {op.state.review && (
        <>
          <Button
            onClick={() => void reader.reload().then((value) => setReview(value?.assignment))}
          >
            读取当前归属版本（保留草稿）
          </Button>
          {review && (
            <>
              <AssetAssignmentSummary assignment={review} />
              <Button
                onClick={() => {
                  setRevision(review.revision)
                  setReview(undefined)
                  op.acceptRevision()
                }}
              >
                已核对，基于当前版本继续编辑
              </Button>
            </>
          )}
        </>
      )}
    </>
  )
}
export function PasskeysPanel({ device }: { device: Computer }) {
  const r = useDa(),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<PasskeyRecord | null>(null)
  const reader = useRead(
    (signal) => r.client.passkeys(device.id, cursor, signal),
    `${device.id}/${cursor}`,
    r.client.capabilities.passkeys.available,
  )
  if (!r.client.capabilities.passkeys.available)
    return <Unavailable reason={r.client.capabilities.passkeys.reason} />
  return (
    <>
      <h2>企业 Passkey</h2>
      <ReadState {...reader} />
      {reader.data && (
        <EnterprisePasskeySummary
          deviceId={device.id}
          records={reader.data.items}
          onDetail={setSelected}
        />
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
      <Modal
        title="企业 Passkey 记录"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        destroyOnHidden
      >
        {selected && <Json value={selected} />}
      </Modal>
      <p>仅显示企业记录；账户 WebAuthn 列表不能证明凭据位于此设备。</p>
    </>
  )
}
export function AccountsPanel({ device }: { device: Computer }) {
  const r = useDa(),
    [locator, setLocator] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const directory = useDirectory(
    bindingColumns,
    100,
    (q, signal) => r.client.bindings(device.id, q, signal),
    device.id,
  )
  const detail = useRead(
    (signal) => r.client.binding(device.id, locator!, signal),
    `${device.id}/${locator}`,
    !!locator,
  )
  return (
    <>
      <div className="da-toolbar">
        <h2>账号与绑定</h2>
        <Button
          onClick={() => {
            setLocator(null)
            setCreating(true)
          }}
        >
          创建绑定
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
      {directory.data?.summaries?.map((b) => (
        <section key={b.id}>
          <AccountBindingSummary binding={b} />
          <Button
            onClick={() => {
              setCreating(false)
              setLocator(b.id)
            }}
          >
            读取完整绑定
          </Button>
        </section>
      ))}
      {(creating || detail.data) && (
        <BindingEditor
          key={creating ? 'new' : detail.data!.id}
          device={device}
          existing={creating ? null : detail.data!}
          close={() => {
            setCreating(false)
            setLocator(null)
          }}
          saved={() => void directory.reload()}
        />
      )}
      <p>目标修订、服务端关联和实际应用各自观察。未知写入只能查询原操作。</p>
    </>
  )
}
function BindingEditor({
  device,
  existing,
  close,
  saved,
}: {
  device: Computer
  existing: Binding | null
  close: () => void
  saved: () => void
}) {
  const r = useDa(),
    id = existing?.id ?? 'new',
    [principal, setPrincipal] = useState(existing?.principal ?? ''),
    [instance, setInstance] = useState(existing?.instance ?? ''),
    [policy, setPolicy] = useState(''),
    [account, setAccount] = useState(existing?.account ?? ''),
    [action, setAction] = useState<'put' | 'reset_factors' | 'unbind'>('put'),
    [disposition, setDisposition] = useState<'keep' | 'disable' | 'standard'>('keep'),
    [message, setMessage] = useState(''),
    [proofBusy, setProofBusy] = useState(false),
    [result, setResult] = useState<Binding>(),
    [accountKind, setAccountKind] = useState<'create' | 'existing'>('create'),
    [accountId, setAccountId] = useState(''),
    [authority, setAuthority] = useState<'local' | 'active_directory' | 'entra'>('local'),
    [domainSid, setDomainSid] = useState(''),
    [tenantId, setTenantId] = useState(''),
    [objectId, setObjectId] = useState('')
  const baseline = useRevisionReview(existing, (key, signal) =>
      r.client.binding(device.id, key, signal),
    ),
    op = useMutation(`${device.id}/binding/${existing?.id ?? 'new'}`)
  const identity = identityKey(r.session)
  const scope = `${identity}/${device.id}/${id}/${action}/${principal}/${instance}/${policy}/${account}/${accountKind}/${accountId}/${authority}/${domainSid}/${tenantId}/${objectId}/${disposition}/${baseline.revision}`
  const live = useRef(scope)
  live.current = scope
  const proof = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      proof.current?.abort()
      void r.security.cancel().catch(() => undefined)
    },
    [scope, r],
  )
  function input(operationId: string): BindingInput {
    return {
      operationId,
      expectedRevision: baseline.revision,
      action:
        action === 'put'
          ? {
              kind: 'put',
              instance,
              principal,
              policy,
              account:
                accountKind === 'create'
                  ? {
                      kind: 'create',
                      platform: device.platform === 'windows' ? 'windows' : 'macos',
                      name: account,
                    }
                  : {
                      kind: 'existing',
                      account:
                        device.platform === 'macos'
                          ? { platform: 'macos', generatedUid: accountId }
                          : {
                              platform: 'windows',
                              sid: accountId,
                              authority:
                                authority === 'entra'
                                  ? { kind: 'entra', tenantId, objectId }
                                  : authority === 'active_directory'
                                    ? { kind: 'active_directory', domainSid }
                                    : { kind: 'local' },
                            },
                    },
            }
          : action === 'unbind'
            ? { kind: 'unbind', disposition }
            : { kind: 'reset_factors' },
    }
  }
  const valid =
    action !== 'put' ||
    (!!principal &&
      !!instance &&
      !!policy &&
      (accountKind === 'create'
        ? !!account
        : !!accountId &&
          (authority === 'local' ||
            device.platform === 'macos' ||
            (authority === 'active_directory' ? !!domainSid : !!tenantId && !!objectId))) &&
      device.platform !== 'unknown')
  async function submit() {
    if (
      !valid ||
      live.current !== scope ||
      identityKey(r.session) !== identity ||
      baseline.current ||
      baseline.busy
    )
      return
    const value = await op.run(
      (operationId, signal) =>
        r.client.changeBinding(device.id, existing?.id ?? operationId, input(operationId), signal),
      true,
    )
    if (value && live.current === scope) {
      setResult(value)
      saved()
    }
  }
  async function query() {
    const value = await op.query((operationId, signal) =>
      r.client.bindingOperation(device.id, operationId, signal),
    )
    if (value && live.current === scope) setResult(value)
  }
  async function prove() {
    if (
      !valid ||
      !op.state.proof ||
      live.current !== scope ||
      proofBusy ||
      identityKey(r.session) !== identity
    )
      return
    const bound = scope,
      control = new AbortController()
    proof.current = control
    setProofBusy(true)
    setMessage('')
    try {
      const challenge = await r.client.bindingChallenge(
        device.id,
        existing?.id ?? op.state.id,
        input(op.state.id),
        control.signal,
      )
      if (live.current !== bound || control.signal.aborted) return
      await r.security.prove(challenge, control.signal)
      if (live.current === bound && identityKey(r.session) === identity)
        setMessage('认证完成，请再次明确提交相同操作。')
    } catch (e) {
      if (live.current === bound) setMessage(errorMessage(e))
    } finally {
      if (live.current === bound) setProofBusy(false)
    }
  }
  return (
    <Modal
      open
      title={existing ? '核对账号绑定操作' : '创建账号绑定'}
      onCancel={close}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>关闭</Button>
          <Button
            danger={action === 'unbind'}
            type="primary"
            disabled={!valid || op.locked || op.state.review || baseline.busy || !!baseline.current}
            onClick={() => void submit()}
          >
            确认提交
          </Button>
        </Space>
      }
    >
      <p>
        Endpoint {device.id} · 绑定 {existing?.id ?? (op.state.id || '提交时生成')} · 修订{' '}
        {baseline.revision}
      </p>
      <div className="da-editor">
        <label>
          操作
          <Select
            value={action}
            disabled={op.locked || op.state.proof}
            onChange={setAction}
            options={[
              { value: 'put', label: '创建 / 修改绑定' },
              ...(existing
                ? [
                    { value: 'reset_factors', label: '重置因子' },
                    { value: 'unbind', label: '解除绑定 / 撤销因子' },
                  ]
                : []),
            ]}
          />
        </label>
        {action === 'put' && (
          <>
            <label>
              Principal UUID
              <Input
                value={principal}
                disabled={op.locked || op.state.proof}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </label>
            <label>
              Instance UUID
              <Input
                value={instance}
                disabled={op.locked || op.state.proof}
                onChange={(e) => setInstance(e.target.value)}
              />
            </label>
            <label>
              Policy UUID
              <Input
                value={policy}
                disabled={op.locked || op.state.proof}
                onChange={(e) => setPolicy(e.target.value)}
              />
            </label>
            <label>
              本地账户意图
              <Select
                value={accountKind}
                disabled={op.locked || op.state.proof}
                onChange={setAccountKind}
                options={[
                  { value: 'create', label: '创建账户' },
                  { value: 'existing', label: '关联已存在账户' },
                ]}
              />
            </label>
            {accountKind === 'create' ? (
              <label>
                创建本地账号名称
                <Input
                  value={account}
                  disabled={op.locked || op.state.proof}
                  onChange={(e) => setAccount(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  {device.platform === 'macos' ? '账户 Generated UID' : '账户 SID'}
                  <Input
                    value={accountId}
                    disabled={op.locked || op.state.proof}
                    onChange={(e) => setAccountId(e.target.value)}
                  />
                </label>
                {device.platform === 'windows' && (
                  <>
                    <label>
                      账户来源
                      <Select
                        value={authority}
                        disabled={op.locked || op.state.proof}
                        onChange={setAuthority}
                        options={[
                          { value: 'local', label: '本地' },
                          { value: 'active_directory', label: 'Active Directory' },
                          { value: 'entra', label: 'Entra' },
                        ]}
                      />
                    </label>
                    {authority === 'active_directory' && (
                      <label>
                        域 SID
                        <Input
                          value={domainSid}
                          disabled={op.locked || op.state.proof}
                          onChange={(e) => setDomainSid(e.target.value)}
                        />
                      </label>
                    )}
                    {authority === 'entra' && (
                      <>
                        <label>
                          Entra 租户 UUID
                          <Input
                            value={tenantId}
                            disabled={op.locked || op.state.proof}
                            onChange={(e) => setTenantId(e.target.value)}
                          />
                        </label>
                        <label>
                          Entra 对象 UUID
                          <Input
                            value={objectId}
                            disabled={op.locked || op.state.proof}
                            onChange={(e) => setObjectId(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {action === 'unbind' && (
          <label>
            解绑后账户处置
            <Select
              value={disposition}
              disabled={op.locked || op.state.proof}
              onChange={setDisposition}
              options={[
                { value: 'keep', label: '保留账户' },
                { value: 'disable', label: '禁用账户' },
                { value: 'standard', label: '降为普通用户' },
              ]}
            />
          </label>
        )}
      </div>
      {existing && (
        <>
          <Button disabled={op.locked || op.state.proof} onClick={() => void baseline.refresh()}>
            读取当前版本（保留草稿）
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
      {result && (
        <>
          <AccountBindingSummary binding={result} />
          <Json value={result.observations} />
        </>
      )}
      <WriteStatus state={op.state} query={query} />
      {op.state.proof && (
        <Button loading={proofBusy} onClick={() => void prove()}>
          验证本次操作用途
        </Button>
      )}
      <p role="status">{message}</p>
    </Modal>
  )
}
