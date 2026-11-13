import { useId, useEffect, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import {
  validatePrepare,
  validateTransition,
  validateCrlPublication,
  validateSigningRecovery,
} from '@rss/mdm-certificates/device-pki'
import {
  purposes,
  type CrlPublication,
  type Prepare,
  type Purpose,
  type Rotation,
  type SigningRecovery,
  type Transition,
} from '@rss/mdm-certificates/device-pki'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
import { SecretTabs } from './SecretTabs'
import { useProtectedDelivery } from './useProtectedDelivery'
import { certificateFingerprint, publicCertificateChain, publicDer } from './public-materials'
type Pending =
  | { kind: 'prepare'; input: Prepare }
  | { kind: 'transition'; input: Transition }
  | { kind: 'publish'; input: CrlPublication }
  | { kind: 'signing'; input: SigningRecovery }
interface IssuerInput {
  certificate: string
  root: string
  crl: string
  rootCrl: string
  provisioner: string
  kid: string
}
export function DevicePki({
  runtime,
  locale,
  canManage,
}: {
  runtime: Runtime
  locale: Locale
  canManage: boolean
}) {
  return (
    <SecretTabs
      className="device-pki"
      uiLocale={locale}
      items={purposes.map((purpose) => ({
        key: purpose,
        label: purpose === 'windows' ? 'Windows MDM' : purpose === 'apple' ? 'Apple MDM' : 'Agent',
        children: (
          <PurposePanel runtime={runtime} locale={locale} purpose={purpose} canManage={canManage} />
        ),
      }))}
    />
  )
}
function PurposePanel({
  runtime,
  locale,
  purpose,
  canManage,
}: {
  runtime: Runtime
  locale: Locale
  purpose: Purpose
  canManage: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    { devicePki, binding } = useAdministration(runtime),
    read = useRead(`${binding}/device-pki/${purpose}`, () =>
      canManage ? devicePki.trust(purpose) : Promise.resolve(null),
    ),
    action = useAction(),
    [issuerForm] = Form.useForm<IssuerInput>(),
    [crlForm] = Form.useForm<{
      publications: { issuer: string; crl: string; rootCrl: string }[]
    }>(),
    [signingForm] = Form.useForm<{ attempt: string; chain: string }>(),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipt, setReceipt] = useState<string | null>(null),
    [inspected, setInspected] = useState<string | null>(null),
    delivery = useProtectedDelivery(() => {
      issuerForm.resetFields()
      crlForm.resetFields()
      signingForm.resetFields()
    }, canManage)
  useEffect(() => {
    if (read.value && !pending)
      crlForm.setFieldsValue({
        publications: read.value.issuers.map((issuer) => ({
          issuer: issuer.digest,
          crl: issuer.crl,
          rootCrl: issuer.rootCrl,
        })),
      })
  }, [read.value, pending, crlForm])
  async function submit(change: Pending) {
    if (!canManage || !delivery.isCurrent(delivery.capture())) return
    const result = await action.run(async () => {
      switch (change.kind) {
        case 'prepare':
          return devicePki.prepare(change.input)
        case 'transition':
          return devicePki.transition(change.input)
        case 'publish':
          await devicePki.publish(change.input)
          return null
        case 'signing':
          return devicePki.recoverSigning(change.input)
      }
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setReceipt(
        change.kind === 'publish'
          ? l(
              '撤销列表已发布；设备接收尚未确认。',
              'Revocation lists published; device reception remains unconfirmed.',
            )
          : change.kind === 'signing'
            ? l(
                '原签名尝试已关联；不代表设备身份已激活。',
                'Original signing attempt linked; device identity activation is separate.',
              )
            : result.value && 'state' in result.value
              ? String(result.value.state)
              : '',
      )
      read.reload()
    }
  }
  function author(make: () => Pending | Promise<Pending>) {
    const epoch = delivery.capture()
    void action
      .run(async () => make())
      .then((result) => {
        if (result.ok && delivery.isCurrent(epoch)) start(result.value)
      })
  }
  function start(change: Pending) {
    if (action.busy || pending || !canManage) return
    const epoch = delivery.capture()
    void action
      .run(async () => {
        validateInput(() => {
          switch (change.kind) {
            case 'prepare':
              validatePrepare(change.input, runtime.tenant, runtime.host.serviceId)
              break
            case 'transition':
              validateTransition(change.input)
              break
            case 'publish':
              validateCrlPublication(change.input)
              break
            case 'signing':
              validateSigningRecovery(change.input)
              break
          }
        })
        return freeze(change)
      })
      .then((result) => {
        if (result.ok && delivery.isCurrent(epoch)) {
          setPending(result.value)
          setReceipt(null)
          setOutcome('none')
          void submit(result.value)
        }
      })
  }
  const locked = action.busy || !!pending || !canManage,
    selected = read.value?.issuers.find((issuer) => issuer.digest === inspected)
  return (
    <>
      <Alert
        type="info"
        showIcon
        title={l(
          '轮换受理、进程加载、撤销发布和设备确认分别记录。下方显示当前进程加载的公共材料。',
          'Rotation acceptance, process loading, revocation publication and device acknowledgement are separate facts. The material below is loaded by the current process.',
        )}
      />
      <Space wrap>
        <Button onClick={read.reload} disabled={action.busy}>
          {l('读取当前公共材料', 'Read loaded public material')}
        </Button>
      </Space>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <Card title={l('当前加载材料', 'Currently loaded material')}>
          <dl className="device-facts">
            <div>
              <dt>{l('用途 / 版本', 'Purpose / revision')}</dt>
              <dd>
                {purpose} · {read.value.revision}
              </dd>
            </div>
            <div>
              <dt>{l('服务实例', 'Service instance')}</dt>
              <dd>{read.value.serviceId}</dd>
            </div>
            <div>
              <dt>{l('租户', 'Tenant')}</dt>
              <dd>{read.value.tenant}</dd>
            </div>
            <div>
              <dt>{l('公共地址', 'Public origin')}</dt>
              <dd>{read.value.origin}</dd>
            </div>
          </dl>
          <DataTable
            locale={locale}
            dataSource={read.value.issuers}
            rowKey="digest"
            columns={[
              { title: l('CA 指纹', 'CA fingerprint'), dataIndex: 'digest' },
              {
                title: l('材料状态', 'Material state'),
                dataIndex: 'mode',
                render: (value) => <Status value={String(value)} locale={locale} />,
              },
              { title: l('签发 Provider', 'Issuer provider'), dataIndex: 'provisioner' },
              { title: l('公钥标识', 'Key ID'), dataIndex: 'kid' },
              {
                title: l('操作', 'Actions'),
                render: (_, issuer) => (
                  <Button onClick={() => setInspected(issuer.digest)}>
                    {l('查看公共材料', 'Inspect public material')}
                  </Button>
                ),
              },
            ]}
          />
          {selected && (
            <details open>
              <summary>{l('所选 CA 公共材料', 'Selected CA public material')}</summary>
              {(['certificate', 'root', 'crl', 'rootCrl'] as const).map((key) => (
                <div key={key}>
                  <label htmlFor={`${purpose}-${key}`}>
                    {key === 'certificate'
                      ? l('签发 CA 证书', 'Issuer CA certificate')
                      : key === 'root'
                        ? l('根 CA 证书', 'Root CA certificate')
                        : key === 'crl'
                          ? l('签发 CA 撤销列表', 'Issuer CRL')
                          : l('根 CA 撤销列表', 'Root CRL')}
                  </label>
                  <Input.TextArea
                    id={`${purpose}-${key}`}
                    readOnly
                    value={selected[key]}
                    rows={3}
                  />
                </div>
              ))}
            </details>
          )}
        </Card>
      )}
      {pending && (
        <Card title={l('原操作', 'Original operation')}>
          <p className="mono">
            {pending.kind === 'prepare' || pending.kind === 'transition'
              ? pending.input.id
              : pending.input.operation}
          </p>
          <p>
            {l('操作结果', 'Operation result')} · <Status value={outcome} locale={locale} />
            {receipt && ` · ${receipt}`}
          </p>
          <p className="subtitle">
            {pending.kind === 'prepare' || pending.kind === 'transition'
              ? l(
                  '可读取原轮换及其精确主体回执；当前信任或最新轮换不能替代原回执。',
                  'Read the original rotation and its exact actor receipt; current trust or the latest rotation is not the original receipt.',
                )
              : l(
                  '此项操作没有原回执读取；未知结果仅可显式重提同一请求。',
                  'This operation has no original receipt read; an unknown outcome requires explicit resubmission of the same request.',
                )}
          </p>
          {(pending.kind === 'prepare' || pending.kind === 'transition') && (
            <Button
              disabled={action.busy || !canManage}
              onClick={() => {
                const fixed = pending
                void action.run(async () => {
                  const value = await devicePki.rotation(purpose, fixed.input.id),
                    state = runtime.owner.getSnapshot()
                  const expectedState =
                    fixed.kind === 'prepare'
                      ? 'distributing'
                      : fixed.input.action === 'activate'
                        ? 'activated'
                        : 'retired'
                  const original = value.operations.find(
                    (op) =>
                      op.actor === state.identity?.principalId &&
                      op.instance === runtime.host.serviceId &&
                      op.receipt.revision === fixed.input.expectedRevision + 1 &&
                      op.receipt.state === expectedState,
                  )
                  if (!original)
                    throw new Error(
                      l(
                        '未找到匹配的原回执，不能判定写入失败。',
                        'No matching receipt; this does not prove failure.',
                      ),
                    )
                  setReceipt(
                    `${original.actor} / ${original.instance} · ${original.receipt.revision} · ${original.receipt.state}`,
                  )
                  setOutcome('confirmed')
                })
              }}
            >
              {l('查询原轮换回执', 'Read original rotation receipt')}
            </Button>
          )}
          <Space wrap>
            <Button disabled={action.busy || !canManage} onClick={() => void submit(pending)}>
              {l('显式重提原请求', 'Explicitly resubmit original request')}
            </Button>
            {outcome !== 'unknown' && (
              <Button
                disabled={action.busy}
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  setReceipt(null)
                  action.clear()
                  read.reload()
                }}
              >
                {l('结束本次操作并重新读取', 'Finish this operation and read again')}
              </Button>
            )}
          </Space>
        </Card>
      )}
      {read.value && (
        <div className="device-detail-grid">
          <Card title={l('准备新 CA 代次', 'Prepare a new CA generation')}>
            <p className="subtitle">
              {l(
                '沿用已加载的服务、用途、地址及现有 CA，新增一份 prepared 材料。Provider 配置与激活资格由服务端核验。',
                'Retain the loaded service, purpose, origin and existing CAs; add one prepared issuer. The server validates provider configuration and activation eligibility.',
              )}
            </p>
            <Form
              name={formPrefix + '-0'}
              form={issuerForm}
              layout="vertical"
              disabled={locked}
              onFinish={(value) =>
                author(async () => {
                  const loaded = read.value!
                  const certificate = publicDer(value.certificate, 'certificate'),
                    root = publicDer(value.root, 'certificate'),
                    crl = publicDer(value.crl, 'crl'),
                    rootCrl = publicDer(value.rootCrl, 'crl'),
                    digest = await certificateFingerprint(certificate)
                  return {
                    kind: 'prepare',
                    input: {
                      id: crypto.randomUUID(),
                      purpose,
                      expectedRevision: loaded.revision,
                      candidate: {
                        ...loaded,
                        revision: loaded.revision + 1,
                        issuers: [
                          ...loaded.issuers,
                          {
                            digest,
                            mode: 'prepared',
                            certificate,
                            root,
                            crl,
                            rootCrl,
                            provisioner: value.provisioner,
                            kid: value.kid ?? '',
                          },
                        ],
                      },
                    },
                  }
                })
              }
            >
              {(['certificate', 'root', 'crl', 'rootCrl'] as const).map((key) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={
                    key === 'certificate'
                      ? l('新 CA 证书（PEM / DER Base64）', 'New CA certificate (PEM / DER Base64)')
                      : key === 'root'
                        ? l('根 CA 证书', 'Root CA certificate')
                        : key === 'crl'
                          ? l('新 CA 撤销列表', 'New CA CRL')
                          : l('根 CA 撤销列表', 'Root CA CRL')
                  }
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
              ))}
              <Form.Item
                name="provisioner"
                label={l('已配置的签发 Provider', 'Configured issuer provider')}
                rules={[{ required: true }]}
              >
                <Input maxLength={1024} />
              </Form.Item>
              <Form.Item name="kid" label={l('Provider 公钥标识', 'Provider key ID')}>
                <Input maxLength={1024} />
              </Form.Item>
              <Button type="primary" htmlType="submit" disabled={locked}>
                {l('提交准备材料', 'Submit prepared material')}
              </Button>
            </Form>
          </Card>
          <RotationHistory
            runtime={runtime}
            locale={locale}
            purpose={purpose}
            enabled={canManage}
            canContinue={!locked}
            onContinue={(value) => {
              if (value.action)
                start({
                  kind: 'transition',
                  input: {
                    id: value.id,
                    purpose,
                    expectedRevision: value.trustRevision,
                    action: value.action,
                  },
                })
            }}
          />
          <Card title={l('发布撤销列表', 'Publish revocation lists')}>
            <Form
              name={formPrefix + '-2'}
              form={crlForm}
              layout="vertical"
              disabled={locked}
              onFinish={(value) =>
                author(() => ({
                  kind: 'publish',
                  input: {
                    operation: crypto.randomUUID(),
                    purpose,
                    publications: value.publications.map((item) => ({
                      issuer: item.issuer,
                      crl: publicDer(item.crl, 'crl'),
                      rootCrl: publicDer(item.rootCrl, 'crl'),
                    })),
                  },
                }))
              }
            >
              <Form.List name="publications">
                {(items) =>
                  items.map((item) => (
                    <fieldset key={item.key}>
                      <Form.Item
                        name={[item.name, 'issuer']}
                        label={l('CA 指纹', 'CA fingerprint')}
                      >
                        <Input readOnly />
                      </Form.Item>
                      <Form.Item
                        name={[item.name, 'crl']}
                        label={l('签发 CA 撤销列表', 'Issuer CRL')}
                        rules={[{ required: true }]}
                      >
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <Form.Item
                        name={[item.name, 'rootCrl']}
                        label={l('根 CA 撤销列表', 'Root CRL')}
                        rules={[{ required: true }]}
                      >
                        <Input.TextArea rows={3} />
                      </Form.Item>
                    </fieldset>
                  ))
                }
              </Form.List>
              <Button htmlType="submit" disabled={locked}>
                {l('发布这些撤销列表', 'Publish these revocation lists')}
              </Button>
            </Form>
          </Card>
          {purpose === 'windows' && (
            <Card title={l('恢复原 Windows 签名尝试', 'Recover original Windows signing attempt')}>
              <p className="subtitle">
                {l(
                  '仅关联原 CA 已签出的公共证书链，不重新签发，也不接收私钥。',
                  'Link the public certificate chain already signed by the original CA. This does not issue a new certificate and does not accept private keys.',
                )}
              </p>
              <Form
                name={formPrefix + '-3'}
                form={signingForm}
                layout="vertical"
                disabled={locked}
                onFinish={(value) =>
                  author(() => ({
                    kind: 'signing',
                    input: {
                      operation: crypto.randomUUID(),
                      attempt: value.attempt,
                      chain: publicCertificateChain(value.chain),
                    },
                  }))
                }
              >
                <Form.Item
                  name="attempt"
                  label={l('原签名尝试 UUID', 'Original signing attempt UUID')}
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="chain"
                  label={l(
                    '已签证书链（PEM 或每行 DER Base64）',
                    'Signed certificate chain (PEM or DER Base64 per line)',
                  )}
                  rules={[{ required: true }]}
                >
                  <Input.TextArea rows={6} />
                </Form.Item>
                <Button htmlType="submit" disabled={locked}>
                  {l('关联原签名结果', 'Link original signing result')}
                </Button>
              </Form>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function RotationHistory({
  runtime,
  locale,
  purpose,
  enabled,
  canContinue,
  onContinue,
}: {
  runtime: Runtime
  locale: Locale
  purpose: Purpose
  enabled: boolean
  canContinue: boolean
  onContinue: (rotation: Rotation) => void
}) {
  const l = labels(locale),
    { devicePki, binding } = useAdministration(runtime),
    [draft, setDraft] = useState(''),
    [id, setId] = useState(''),
    [cursor, setCursor] = useState<string | null>(null)
  const read = useRead(`${binding}/rotation/${purpose}/${id}/${enabled}`, (signal) =>
    enabled
      ? id
        ? devicePki.rotation(purpose, id, signal)
        : devicePki.latestRotation(purpose, signal)
      : Promise.resolve(null),
  )
  const blockers = useRead(
    `${binding}/rotation-blockers/${purpose}/${read.value?.id}/${cursor}`,
    (signal) =>
      read.value
        ? devicePki.rotationBlockers(purpose, read.value.id, cursor, signal)
        : Promise.resolve(null),
  )
  function select(nextId: string) {
    setCursor(null)
    if (id === nextId) {
      read.reload()
      blockers.reload()
    } else setId(nextId)
  }
  return (
    <Card title={l('原轮换与阻断', 'Original rotation and blockers')}>
      <Space wrap>
        <Input
          aria-label={l('原轮换 UUID', 'Original rotation UUID')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button disabled={!draft || !enabled} onClick={() => select(draft)}>
          {l('读取原轮换', 'Read original rotation')}
        </Button>
        <Button disabled={!enabled} onClick={() => select('')}>
          {l('读取最新轮换', 'Read latest rotation')}
        </Button>
      </Space>
      <ReadState
        locale={locale}
        busy={read.busy}
        error={read.error}
        empty={read.value === null}
        onRetry={read.reload}
      />
      {read.value && (
        <>
          <Descriptions
            layout="vertical"
            column={1}
            items={[
              { key: 'id', label: l('原轮换', 'Original rotation'), children: read.value.id },
              { key: 'state', label: l('轮换阶段', 'Rotation phase'), children: read.value.state },
              {
                key: 'revision',
                label: l('分发 / 信任修订', 'Distribution / trust revision'),
                children: `${read.value.distributionRevision} / ${read.value.trustRevision}`,
              },
              {
                key: 'issuer',
                label: l('旧 / 候选 / 当前签发者', 'Previous / candidate / active issuer'),
                children: `${read.value.previous.digest} (${read.value.previous.state}) / ${read.value.candidate.digest} (${read.value.candidate.state}) / ${read.value.activeIssuer}`,
              },
              {
                key: 'gate',
                label: l(
                  '阻断 / 前置 / 提供方核验',
                  'Blockers / preconditions / provider verification',
                ),
                children: `${read.value.blockers.join(', ') || '—'} / ${read.value.preconditions.join(', ') || '—'} / ${read.value.providerVerification}`,
              },
              {
                key: 'at',
                label: l('评估时间', 'Evaluated at'),
                children: String(read.value.evaluatedAt),
              },
            ]}
          />
          <DataTable
            locale={locale}
            rowKey={(row) => `${row.actor}/${row.instance}/${row.receipt.revision}`}
            dataSource={read.value.operations}
            columns={[
              { title: l('原主体', 'Original actor'), dataIndex: 'actor' },
              { title: 'Instance', dataIndex: 'instance' },
              {
                title: l('某次回执', 'Operation receipt'),
                render: (_, row) =>
                  `${row.receipt.operation} · ${row.receipt.revision} · ${row.receipt.state}`,
              },
            ]}
          />
          <Button
            disabled={
              !canContinue ||
              read.value.action === null ||
              read.value.blockers.length > 0 ||
              read.value.preconditions.length > 0
            }
            onClick={() => onContinue(read.value!)}
          >
            {l('按后端当前阶段显式继续', 'Explicitly continue the current server action')} ·{' '}
            {read.value.action ?? '—'}
          </Button>
          <ReadState
            locale={locale}
            busy={blockers.busy}
            error={blockers.error}
            onRetry={blockers.reload}
          />
          {blockers.value && (
            <>
              <DataTable
                locale={locale}
                rowKey={(row) => `${row.kind}/${row.id}`}
                dataSource={blockers.value.items}
                columns={[
                  { title: l('原因', 'Reason'), dataIndex: 'kind' },
                  { title: l('原对象', 'Original object'), dataIndex: 'id' },
                  { title: l('设备', 'Device'), dataIndex: 'device' },
                  { title: l('状态', 'State'), dataIndex: 'state' },
                  { title: l('期限', 'Deadline'), dataIndex: 'deadline' },
                  { title: l('撤销状态', 'Revocation state'), dataIndex: 'revocationState' },
                ]}
              />
              {blockers.value.nextCursor && (
                <Button onClick={() => setCursor(blockers.value!.nextCursor)}>
                  {l('下一页阻断', 'Next blockers')}
                </Button>
              )}
              {cursor && (
                <Button onClick={() => setCursor(null)}>{l('阻断首页', 'First blockers')}</Button>
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}
