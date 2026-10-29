import { useId, useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space } from 'antd'
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
    [transitionForm] = Form.useForm<{ id: string; action: 'activate' | 'retire' }>(),
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
      transitionForm.resetFields()
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
            {l(
              '此接口没有原回执查询。结果未确认时，显式重提完全相同的 UUID、版本和公共材料；重新读取当前材料不能确认原操作。',
              'There is no original-receipt query for this endpoint. If the outcome is unknown, explicitly resubmit the same UUID, revision and public material. A current material read cannot acknowledge the original operation.',
            )}
          </p>
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
          <Card title={l('激活与退休', 'Activate and retire')}>
            <p>
              {l('当前写入基线', 'Current write revision')} · {read.value.revision}
            </p>
            <p className="subtitle">
              {l(
                '激活要求设备确认及轮换资格；退休要求旧证书已撤销。服务端未确认前不会切换。',
                'Activation requires device acknowledgements and rotation eligibility; retirement requires old certificates to be revoked. The server decides when a transition is allowed.',
              )}
            </p>
            <Form
              name={formPrefix + '-1'}
              form={transitionForm}
              layout="vertical"
              disabled={locked}
              initialValues={{ action: 'activate' }}
              onFinish={(value) =>
                start({
                  kind: 'transition',
                  input: {
                    id: value.id,
                    purpose,
                    expectedRevision: read.value!.revision,
                    action: value.action,
                  },
                })
              }
            >
              <Form.Item
                name="id"
                label={l('原轮换 UUID', 'Original rotation UUID')}
                rules={[{ required: true }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="action" label={l('轮换阶段', 'Rotation phase')}>
                <Select
                  options={[
                    { value: 'activate', label: l('激活新代次', 'Activate new generation') },
                    { value: 'retire', label: l('退休旧代次', 'Retire old generation') },
                  ]}
                />
              </Form.Item>
              <Button htmlType="submit" disabled={locked}>
                {l('提交阶段转换', 'Submit transition')}
              </Button>
            </Form>
          </Card>
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
