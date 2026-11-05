import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd'
import {
  configurationIntent,
  type ConfigurationIntent,
  type ConfigurationRow,
  type Target,
} from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  isUnknown,
  labels,
  ReadState,
  directoryQuery,
  type Query,
  useAction,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { generateEnrollmentSecret, useProtectedDelivery } from './useProtectedDelivery'
import { EnrollmentFailure } from './NativeEnrollment'
const fields = [
  'configurationId',
  'state',
  'createdAt',
  'expiresAt',
  'createdBy',
  'targets',
  'quantity',
  'reserved',
  'consumed',
  'remaining',
] as const
const availableTargets: readonly Target[] = [
  { platform: 'windows', architecture: 'x86_64' },
  { platform: 'windows', architecture: 'aarch64' },
  { platform: 'macos', architecture: 'x86_64' },
  { platform: 'macos', architecture: 'aarch64' },
]
export function AgentConfigurations({
  runtime,
  locale,
  canWrite,
}: {
  runtime: Runtime
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<string>(),
    [open, setOpen] = useState(false),
    [quantity, setQuantity] = useState<'finite' | 'unlimited'>('finite'),
    [count, setCount] = useState(1),
    [lifetime, setLifetime] = useState<number | null>(null),
    [targets, setTargets] = useState<string[]>(['windows/x86_64']),
    [approved, setApproved] = useState(false),
    [revokeApproved, setRevokeApproved] = useState(false),
    [pending, setPending] = useState<ConfigurationIntent | null>(null),
    [outcome, setOutcome] = useState<
      'none' | 'unknown' | 'rejected' | 'delivered' | 'found' | 'revoked'
    >('none'),
    [revoke, setRevoke] = useState<{ configurationId: string; operationId: string } | null>(null),
    [revokeOutcome, setRevokeOutcome] = useState<'none' | 'unknown' | 'rejected'>('none'),
    [queriedMissing, setQueriedMissing] = useState(false),
    [lookup, setLookup] = useState('')
  const delivery = useProtectedDelivery(),
    read = useRead(`${binding}/configurations/${JSON.stringify(query)}`, () =>
      enrollment.configurations(directoryQuery(query, fields)),
    ),
    detail = useRead(`${binding}/configuration/${selected ?? ''}`, () =>
      selected ? enrollment.configuration(selected) : Promise.resolve(null),
    )
  useEffect(() => {
    if (!canWrite || read.error || detail.error) delivery.clear()
  }, [canWrite, read.error, detail.error])
  const locked =
    revoke !== null ||
    (pending !== null && outcome !== 'rejected' && outcome !== 'delivered' && outcome !== 'revoked')
  function close() {
    if (!locked && !action.busy) {
      delivery.clear()
      setPending(null)
      setOutcome('none')
      setOpen(false)
      setApproved(false)
      action.clear()
    }
  }
  async function issue() {
    delivery.clear()
    const ticket = delivery.capture()
    const prepared = await action.run(async () =>
      configurationIntent({
        operationId: crypto.randomUUID(),
        lifetimeSeconds: lifetime,
        quantity: quantity === 'finite' ? { kind: 'finite', count } : { kind: 'unlimited' },
        targets: availableTargets.filter((target) =>
          targets.includes(`${target.platform}/${target.architecture}`),
        ),
      }),
    )
    if (!prepared.ok) return
    const intent = prepared.value
    setPending(intent)
    const result = await action.run(async () => {
      const issued = await enrollment.issueConfiguration(intent, generateEnrollmentSecret()),
        disclosed = delivery.deliver(issued.file, ticket)
      return { configuration: issued.configuration, disclosed }
    })
    if (result.ok) {
      setOutcome(result.value.disclosed ? 'delivered' : 'found')
      setSelected(result.value.configuration.configurationId)
      read.reload()
    } else setOutcome(isUnknown(result.error) ? 'unknown' : 'rejected')
  }
  async function revokeConfiguration(change: { configurationId: string; operationId: string }) {
    delivery.clear()
    const result = await action.run(() =>
      enrollment.revokeConfiguration(change.configurationId, change.operationId),
    )
    if (result.ok) {
      setOutcome('revoked')
      setRevoke(null)
      setRevokeOutcome('none')
      setRevokeApproved(false)
      read.reload()
      detail.reload()
    } else
      setRevokeOutcome((previous) =>
        previous === 'unknown' || isUnknown(result.error) ? 'unknown' : 'rejected',
      )
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '管理员交付一个签名 JSON 和固定安装包。这里不提供 Agent 网页授权注册，也不产生第三份秘密文件。',
          'Administrators deliver one signed JSON file and a fixed installer. There is no Agent web authorization enrollment or third secret file.',
        )}
      />
      {canWrite && (
        <Button type="primary" onClick={() => setOpen(true)}>
          {l('生成管理员安装配置', 'Issue administrator enrollment JSON')}
        </Button>
      )}
      {!open && <EnrollmentFailure error={action.error} locale={locale} />}
      <Form
        className="admin-toolbar"
        layout="inline"
        onFinish={() =>
          void action
            .run(() => enrollment.configurationOperation(lookup))
            .then((result) => {
              if (result.ok) {
                setQueriedMissing(result.value === null)
                if (result.value) {
                  setSelected(result.value.configuration.configurationId)
                  setRevokeApproved(false)
                }
              }
            })
        }
      >
        <Form.Item label={l('原签发操作标识', 'Original issuance operation ID')}>
          <Input
            aria-label={l('原签发操作标识', 'Original issuance operation ID')}
            value={lookup}
            placeholder="UUID"
            disabled={action.busy || revoke !== null}
            onChange={(event) => setLookup(event.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit" disabled={action.busy || !lookup || revoke !== null}>
          {l('读取原签发配置元数据', 'Read original issuance metadata')}
        </Button>
      </Form>
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        sort={['configurationId', 'state', 'createdAt', 'expiresAt', 'createdBy']}
        required="configurationId"
        maximum={1000}
      />
      <Button onClick={read.reload}>{l('读取安装配置目录', 'Read configuration directory')}</Button>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <>
          <DataTable<ConfigurationRow>
            locale={locale}
            dataSource={read.value.items}
            rowKey="configurationId"
            columns={[
              {
                title: l('安装配置', 'Enrollment configuration'),
                dataIndex: 'configurationId',
                render: (_, row) => (
                  <Button
                    type="link"
                    disabled={revoke !== null || action.busy}
                    onClick={() => {
                      setSelected(row.configurationId)
                      setRevokeApproved(false)
                    }}
                  >
                    {row.configurationId}
                  </Button>
                ),
              },
              ...((query.fields ?? fields).includes('state')
                ? [
                    {
                      title: l('状态', 'State'),
                      dataIndex: 'state' as const,
                      render: (_: unknown, row: ConfigurationRow) =>
                        row.state && <Status value={row.state} locale={locale} />,
                    },
                  ]
                : []),
              ...((query.fields ?? fields).includes('targets')
                ? [
                    {
                      title: l('安装目标', 'Targets'),
                      dataIndex: 'targets' as const,
                      render: (_: unknown, row: ConfigurationRow) =>
                        row.targets?.map((t) => `${t.platform}/${t.architecture}`).join(', '),
                    },
                  ]
                : []),
              ...((query.fields ?? fields).includes('quantity')
                ? [
                    {
                      title: l('授权总数量', 'Authorized quantity'),
                      dataIndex: 'quantity' as const,
                      render: (_: unknown, row: ConfigurationRow) =>
                        row.quantity?.kind === 'finite'
                          ? row.quantity.count
                          : row.quantity?.kind === 'unlimited'
                            ? l('不限', 'Unlimited')
                            : '—',
                    },
                  ]
                : []),
              ...(['reserved', 'consumed', 'remaining'] as const)
                .filter((field) => (query.fields ?? fields).includes(field))
                .map((field) => ({
                  title:
                    field === 'reserved'
                      ? l('预留', 'Reserved')
                      : field === 'consumed'
                        ? l('已消费', 'Consumed')
                        : l('剩余', 'Remaining'),
                  dataIndex: field,
                  render: (_: unknown, row: ConfigurationRow) =>
                    row[field] === null ? l('不限', 'Unlimited') : (row[field] ?? '—'),
                })),
              ...((query.fields ?? fields).includes('expiresAt')
                ? [
                    {
                      title: l('到期', 'Expires'),
                      dataIndex: 'expiresAt' as const,
                      render: (_: unknown, row: ConfigurationRow) =>
                        timestamp(locale, row.expiresAt),
                    },
                  ]
                : []),
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            onChange={setQuery}
            next={read.value.nextCursor}
            count={read.value.items.length}
          />
        </>
      )}
      {selected && (
        <section className="device-editor">
          <ReadState busy={detail.busy} error={detail.error} locale={locale} />
          {detail.value && (
            <>
              <h2>
                {l('配置详情', 'Configuration detail')} · {selected}
              </h2>
              <Status value={detail.value.state} locale={locale} />
              <dl className="device-facts">
                <div>
                  <dt>{l('授权总数量', 'Authorized quantity')}</dt>
                  <dd>
                    {detail.value.configuration.quantity.kind === 'finite'
                      ? detail.value.configuration.quantity.count
                      : l('不限', 'Unlimited')}
                  </dd>
                </div>
                <div>
                  <dt>{l('已预留 / 已消费 / 剩余', 'Reserved / consumed / remaining')}</dt>
                  <dd>
                    {detail.value.reserved} / {detail.value.consumed} /{' '}
                    {detail.value.remaining ?? l('不限', 'Unlimited')}
                  </dd>
                </div>
                <div>
                  <dt>{l('到期', 'Expires')}</dt>
                  <dd>{timestamp(locale, detail.value.configuration.expiresAt)}</dd>
                </div>
                <div>
                  <dt>{l('连接版本', 'Connection revision')}</dt>
                  <dd>{detail.value.configuration.connectionRevision}</dd>
                </div>
                <div>
                  <dt>{l('安装目标', 'Targets')}</dt>
                  <dd>
                    {detail.value.configuration.targets
                      .map((t) => `${t.platform}/${t.architecture}`)
                      .join(', ')}
                  </dd>
                </div>
              </dl>
              {canWrite && detail.value.state !== 'revoked' && (
                <>
                  <Checkbox
                    checked={revokeApproved}
                    disabled={action.busy}
                    onChange={(event) => setRevokeApproved(event.target.checked)}
                  >
                    {l(
                      '确认撤销此配置的新注册能力；不撤销已有设备',
                      'Revoke new enrollment with this configuration; existing devices are unchanged',
                    )}
                  </Checkbox>
                  <Button
                    danger
                    disabled={!revokeApproved || action.busy}
                    onClick={() => {
                      const change = revoke ?? {
                        configurationId: selected,
                        operationId: crypto.randomUUID(),
                      }
                      setRevoke(change)
                      void revokeConfiguration(change)
                    }}
                  >
                    {revoke
                      ? l('显式重提原撤销请求', 'Resubmit original revocation')
                      : l('撤销安装配置', 'Revoke configuration')}
                  </Button>
                </>
              )}
              <Button onClick={detail.reload}>
                {l('重新读取配置详情', 'Read configuration detail again')}
              </Button>
            </>
          )}
        </section>
      )}
      {revoke && (
        <div className="admin-recovery">
          <code>{revoke.operationId}</code>
          <p>
            {l('原撤销目标', 'Original revocation target')} · {revoke.configurationId}
          </p>
          {revokeOutcome === 'rejected' && (
            <Button
              disabled={action.busy}
              onClick={() => {
                setRevoke(null)
                setRevokeOutcome('none')
                action.clear()
                detail.reload()
              }}
            >
              {l('放弃已拒绝撤销并重读', 'Discard rejected revocation and read again')}
            </Button>
          )}
          {revokeOutcome === 'unknown' && (
            <Button disabled={action.busy} onClick={() => void revokeConfiguration(revoke)}>
              {l('显式重提原撤销请求', 'Resubmit original revocation')}
            </Button>
          )}
        </div>
      )}
      <Modal
        open={open}
        getContainer={false}
        title={l('交付管理员安装配置', 'Deliver administrator enrollment configuration')}
        width={680}
        footer={null}
        onCancel={close}
        closable={!locked && !action.busy}
        maskClosable={!locked && !action.busy}
      >
        <EnrollmentFailure error={action.error} locale={locale} />
        <a href="/security" target="_blank" rel="noopener noreferrer">
          {l(
            '在新窗口完成重认证；返回后显式查询原操作',
            'Reauthenticate in a new window, then explicitly query the original operation',
          )}
        </a>
        {revoke && (
          <div className="admin-recovery">
            <code>{revoke.operationId}</code>
            <p>{revoke.configurationId}</p>
            {revokeOutcome === 'rejected' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setRevoke(null)
                  setRevokeOutcome('none')
                  action.clear()
                  detail.reload()
                }}
              >
                {l('放弃已拒绝撤销并重读', 'Discard rejected revocation and read again')}
              </Button>
            )}
            <Button disabled={action.busy} onClick={() => void revokeConfiguration(revoke)}>
              {l('显式重提原撤销请求', 'Resubmit original revocation')}
            </Button>
          </div>
        )}
        <Form layout="vertical" disabled={pending !== null || action.busy || !canWrite}>
          <Form.Item label={l('安装目标', 'Installation targets')}>
            <Select
              aria-label={l('安装目标', 'Installation targets')}
              mode="multiple"
              value={targets}
              options={availableTargets.map((t) => ({
                value: `${t.platform}/${t.architecture}`,
                label: `${t.platform}/${t.architecture}`,
              }))}
              onChange={setTargets}
            />
          </Form.Item>
          <Form.Item label={l('安装数量', 'Installation quantity')}>
            <Select
              aria-label={l('安装数量', 'Installation quantity')}
              value={quantity}
              options={[
                { value: 'finite', label: l('有限数量', 'Finite') },
                { value: 'unlimited', label: l('不限数量', 'Unlimited') },
              ]}
              onChange={setQuantity}
            />
          </Form.Item>
          {quantity === 'finite' && (
            <Form.Item label={l('允许数量', 'Allowed count')}>
              <InputNumber
                aria-label={l('允许数量', 'Allowed count')}
                value={count}
                min={1}
                max={4294967295}
                onChange={(value) => setCount(Number(value ?? 1))}
              />
            </Form.Item>
          )}
          <Form.Item
            label={l(
              '有效期（秒，留空使用后台默认）',
              'Lifetime (seconds; empty uses server default)',
            )}
          >
            <InputNumber
              aria-label={l('配置有效期（秒）', 'Configuration lifetime in seconds')}
              value={lifetime}
              min={1}
              max={31536000}
              onChange={(value) => setLifetime(value === null ? null : Number(value))}
            />
          </Form.Item>
          <Checkbox checked={approved} onChange={(event) => setApproved(event.target.checked)}>
            {l(
              '通过受保护渠道交付此秘密 JSON',
              'Deliver this secret JSON through a protected channel',
            )}
          </Checkbox>
          <Button
            type="primary"
            disabled={!approved || !targets.length || pending !== null || action.busy || !canWrite}
            onClick={() => void issue()}
          >
            {l('签发并准备下载 JSON', 'Issue and prepare JSON download')}
          </Button>
        </Form>
        {pending && (
          <div className="admin-recovery">
            <code>{pending.operationId}</code>
            {outcome === 'unknown' && (
              <>
                <Alert
                  type="warning"
                  title={l(
                    '签发结果未知。这里只查询原操作，不重放签发或生成新秘密。',
                    'Issuance outcome unknown. Query the original operation; do not replay issuance or generate another secret.',
                  )}
                />
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(() => enrollment.configurationOperation(pending.operationId))
                      .then((result) => {
                        if (result.ok) {
                          setQueriedMissing(result.value === null)
                          if (result.value) {
                            setSelected(result.value.configuration.configurationId)
                            setOutcome(result.value.state === 'revoked' ? 'revoked' : 'found')
                          }
                        }
                      })
                  }
                >
                  {l('查询原签发操作', 'Read original issuance operation')}
                </Button>
              </>
            )}
            {outcome === 'rejected' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  action.clear()
                  read.reload()
                }}
              >
                {l('放弃已拒绝签发并重读', 'Discard rejected issuance and read again')}
              </Button>
            )}
            {queriedMissing && outcome === 'unknown' && (
              <Alert
                type="info"
                title={l(
                  '尚未查到原签发，继续保持待确认；可稍后显式查询。',
                  'The original issuance is not yet found. It remains unconfirmed; query again explicitly.',
                )}
              />
            )}
            {outcome === 'found' && (
              <Alert
                type="warning"
                title={l(
                  '原配置已找到，秘密文件不能恢复。请在详情确认撤销后，再显式开始新签发。',
                  'The configuration was found, but its secret file cannot be recovered. Confirm revocation in its detail before explicitly starting a new issuance.',
                )}
              />
            )}
            {outcome === 'found' && selected && (
              <Button
                disabled={action.busy}
                danger
                onClick={() => {
                  const change = revoke ?? {
                    configurationId: selected,
                    operationId: crypto.randomUUID(),
                  }
                  setRevoke(change)
                  void revokeConfiguration(change)
                }}
              >
                {l('确认撤销原安装配置', 'Confirm revocation of original configuration')}
              </Button>
            )}
            {(outcome === 'revoked' || outcome === 'delivered') && (
              <Button
                disabled={action.busy || revoke !== null}
                onClick={() => {
                  delivery.clear()
                  setPending(null)
                  setOutcome('none')
                  setApproved(false)
                  action.clear()
                }}
              >
                {outcome === 'revoked'
                  ? l('配置已撤销，准备新签发', 'Configuration revoked; prepare new issuance')
                  : l(
                      '关闭本次交付，准备另一签发',
                      'Close this delivery and prepare another issuance',
                    )}
              </Button>
            )}
          </div>
        )}
        {delivery.download && (
          <Alert
            type="warning"
            title={l(
              '秘密仅本次交付，关闭、隐藏或离开会清除下载。',
              'Secret delivery is available only now. Closing, hiding or leaving clears the download.',
            )}
          />
        )}
        {delivery.download && (
          <a
            className="button-link"
            href={delivery.download.url}
            download={delivery.download.filename}
          >
            {l('下载 rss-agent-enrollment.json', 'Download rss-agent-enrollment.json')}
          </a>
        )}
        {delivery.download && (
          <Button onClick={delivery.clear}>
            {l('立即清除秘密下载', 'Clear secret download now')}
          </Button>
        )}
      </Modal>
    </>
  )
}
