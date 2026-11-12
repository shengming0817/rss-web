import {
  validateRegistrationRecovery,
  validateIssuanceRecovery,
} from '@rss/mdm-certificates/device-pki'
import { useId, useState } from 'react'
import { Alert, Button, Card, Form, Input, Select, Space } from 'antd'
import type { ViewEndpoint } from '@rss/mdm-devices'
import { freeze } from '@rss/mdm-inventory'
import type {
  GrantReceipt,
  IssuanceCandidate,
  IssuanceRecovery,
  RegistrationRecovery,
} from '@rss/mdm-certificates/device-pki'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead, validateInput } from './AdminUi'
import { useAdministration } from './useAdministration'
import { Status, timestamp } from './DevicePresentation'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
import { publicCertificateChain, publicDer } from './public-materials'
import { usePendingSelection } from './SelectionGuard'
export function DevicePkiObservation({
  runtime,
  locale,
  endpoint,
  canRead,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  canRead: boolean
}) {
  const l = labels(locale),
    { devicePki, binding } = useAdministration(runtime),
    registration = endpoint.channel === 'agent' && endpoint.status === 'active',
    read = useRead(
      `${binding}/device-pki-observation/${endpoint.id}/${endpoint.status}/${canRead}`,
      () => (canRead && registration ? devicePki.observation(endpoint.id) : Promise.resolve(null)),
    ),
    current =
      read.value &&
      read.value.device === endpoint.id && registration
  return (
    <Card title={l('设备公共信任材料观察', 'Device public trust material observation')}>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <p className="subtitle">
        {l(
          '设备报告的安装状态与轮换 ACK 分开。applied 不证明全部设备切换，也不证明当前在线。',
          'Reported installation state is separate from rotation ACKs. Applied does not establish fleet transition or current connectivity.',
        )}
      </p>
      {!read.busy && !read.error && !read.value && (
        <p>
          {l(
            '当前注册尚无公共信任材料观察。',
            'No public trust observation for the current registration.',
          )}
        </p>
      )}
      {read.value && (
        <>
          <Alert
            type={current ? 'info' : 'warning'}
            title={
              current
                ? l(
                    '当前 Agent 设备的报告',
                    'Report for the current Agent device',
                  )
                : l(
                    '报告不属于当前设备，请重新读取；当前安装未知。',
                    'Report is from another device. Read again; current installation is unknown.',
                  )
            }
          />
          <dl className="device-facts">
            <div>
              <dt>{l('原设备', 'Original device')}</dt>
              <dd>
                {read.value.device}
              </dd>
            </div>
            <div>
              <dt>{l('报告序号', 'Report sequence')}</dt>
              <dd>{read.value.sequence}</dd>
            </div>
            <div>
              <dt>{l('目标 / 实际版本', 'Target / actual revision')}</dt>
              <dd>
                {read.value.target?.revision ?? '—'} / {read.value.actual?.revision ?? '—'}
              </dd>
            </div>
            <div>
              <dt>{l('报告状态', 'Reported state')}</dt>
              <dd>
                <Status value={read.value.state} locale={locale} />
              </dd>
            </div>
            <div>
              <dt>{l('报告原因', 'Report reason')}</dt>
              <dd>{read.value.reason ?? '—'}</dd>
            </div>
            <div>
              <dt>{l('设备观察 / 服务端接收', 'Device observation / server receipt')}</dt>
              <dd>
                {timestamp(locale, read.value.observedAt)} /{' '}
                {timestamp(locale, read.value.receivedAt)}
              </dd>
            </div>
          </dl>
        </>
      )}
      <Button onClick={read.reload} disabled={!canRead}>
        {l('重新读取材料观察', 'Read trust observation again')}
      </Button>
    </Card>
  )
}
export function DevicePkiRecovery({
  runtime,
  locale,
  endpoint,
  canRecover,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  canRecover: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    { devicePki } = useAdministration(runtime),
    action = useAction(),
    [grantForm] = Form.useForm<{
      platform: 'windows' | 'macos'
      csr: string
      secret: string
    }>(),
    [issuanceForm] = Form.useForm<{ issuance: string; chain: string }>(),
    [lookupForm] = Form.useForm<{ issuance: string; operation: string }>(),
    [grant, setGrant] = useState<{ intent: RegistrationRecovery; fingerprint: string } | null>(
      null,
    ),
    [issuance, setIssuance] = useState<IssuanceRecovery | null>(null),
    [grantReceipt, setGrantReceipt] = useState<GrantReceipt | null>(null),
    [candidate, setCandidate] = useState<IssuanceCandidate | null>(null),
    [grantOutcome, setGrantOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>(
      'none',
    ),
    [issuanceOutcome, setIssuanceOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>(
      'none',
    ),
    delivery = useProtectedDelivery(() => {
      grantForm.resetFields(['secret'])
      issuanceForm.resetFields()
      lookupForm.resetFields()
    }, canRecover)
  usePendingSelection(!!grant || !!issuance)
  function recoverGrant(value: {
    platform: 'windows' | 'macos'
    csr: string
    secret: string
  }) {
    let secret = value.secret
    value.secret = ''
    grantForm.setFieldValue('secret', '')
    const epoch = delivery.capture()
    void action.run(async () => {
      try {
        const fingerprint = await inputFingerprint(secret)
        if (!delivery.isCurrent(epoch)) return
        const original = grant ?? {
          intent: freeze({
            device: endpoint.id,
            platform: value.platform,
            operationId: crypto.randomUUID(),
            csr: publicDer(value.csr, 'csr'),
          }),
          fingerprint,
        }
        if (original.fingerprint !== fingerprint) throw { cause: 'client', code: 'invalid_input' }
        validateInput(() => validateRegistrationRecovery(original.intent, secret))
        setGrant(original)
        try {
          const result = await devicePki.recoverRegistration(original.intent, secret)
          setGrantReceipt(result)
          setGrantOutcome('confirmed')
        } catch (error) {
          setGrantOutcome((previous) =>
            previous === 'unknown' || isUnknown(error) ? 'unknown' : 'rejected',
          )
          throw error
        }
      } finally {
        secret = ''
      }
    })
  }
  function recoverIssuance(value?: { issuance: string; chain: string }) {
    const epoch = delivery.capture()
    void action.run(async () => {
      if (!delivery.isCurrent(epoch)) return
      const original =
        issuance ??
        (value &&
          freeze({
            issuance: value.issuance,
            operationId: crypto.randomUUID(),
            certificateChain: publicCertificateChain(value.chain),
          }))
      if (!original) return
      validateInput(() => validateIssuanceRecovery(original))
      setIssuance(original)
      try {
        setCandidate(await devicePki.recoverIssuance(original))
        setIssuanceOutcome('confirmed')
      } catch (error) {
        setIssuanceOutcome((previous) =>
          previous === 'unknown' || isUnknown(error) ? 'unknown' : 'rejected',
        )
        throw error
      }
    })
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '仅恢复既有 Agent 注册及原签发尝试。批准、候选证书与设备激活分别确认；协议状态仍在设备注册入口。',
          'Recover existing Agent registrations and original signing attempts only. Grant, candidate certificate and device activation are separate facts; protocol state remains in Enrollment.',
        )}
      />
      <Failure error={action.error} locale={locale} />
      <div className="device-detail-grid">
        <Card title={l('恢复既有注册', 'Recover existing registration')}>
          <Form
            name={formPrefix + '-0'}
            form={grantForm}
            layout="vertical"
            disabled={!canRecover || action.busy}
            initialValues={{
              platform: endpoint.platform.state === 'known' ? endpoint.platform.values[0] : 'windows',
            }}
            onFinish={recoverGrant}
          >
            <Form.Item
              name="platform"
              label={l('原请求平台', 'Original request platform')}
              rules={[{ required: true }]}
            >
              <Select
                disabled={!!grant}
                options={[
                  { value: 'windows', label: 'Windows' },
                  { value: 'macos', label: 'macOS' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="csr"
              label={l(
                '原设备公钥 CSR（PEM / DER Base64）',
                'Original device public-key CSR (PEM / DER Base64)',
              )}
              rules={[{ required: !grant }]}
            >
              <Input.TextArea rows={4} disabled={!!grant} />
            </Form.Item>
            <Form.Item
              name="secret"
              label={
                grant
                  ? l('重新输入同一恢复秘密', 'Re-enter the same recovery secret')
                  : l('恢复秘密', 'Recovery secret')
              }
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="off" visibilityToggle={false} />
            </Form.Item>
            <Button type="primary" htmlType="submit" disabled={!canRecover || action.busy}>
              {grant
                ? l('显式重提原注册恢复', 'Explicitly resubmit original registration recovery')
                : l('提交注册恢复', 'Submit registration recovery')}
            </Button>
          </Form>
          <Button
            onClick={() => {
              delivery.clear()
              grantForm.resetFields(['secret'])
            }}
          >
            {l('清除本地输入', 'Clear local input')}
          </Button>
          {grant && (
            <>
              <p className="mono">{grant.intent.operationId}</p>
              <p>
                <Status value={grantOutcome} locale={locale} />
              </p>
              {grantReceipt && (
                <p>
                  {grantReceipt.grantId} · <Status value={grantReceipt.state} locale={locale} /> ·{' '}
                  {timestamp(locale, grantReceipt.expiresAt)}
                </p>
              )}
              {grantOutcome !== 'unknown' && (
                <Button
                  disabled={action.busy}
                  onClick={() => {
                    setGrant(null)
                    setGrantReceipt(null)
                    setGrantOutcome('none')
                    grantForm.resetFields()
                    delivery.clear()
                  }}
                >
                  {l('结束本次注册恢复', 'Finish this registration recovery')}
                </Button>
              )}
              <Button disabled={!canRecover || action.busy} onClick={() => void action.run(async () => {
                const receipt = await devicePki.registrationRecovery(grant.intent.device, grant.intent.operationId)
                setGrantReceipt(receipt)
                if (receipt) setGrantOutcome('confirmed')
              })}>{l('读取原设备恢复回执', 'Read original device recovery receipt')}</Button>
              <p className="subtitle">{l('结果未知时读取原回执；显式重提须保持原设备、原操作和 CSR，并重新输入同一秘密。', 'Read the original receipt when unknown. Explicit resubmission keeps the original device, operation and CSR and requires the same secret.')}</p>
            </>
          )}
        </Card>
        <Card title={l('恢复原签发候选', 'Recover original signing candidate')}>
          <Form
            name={formPrefix + '-1'}
            form={issuanceForm}
            layout="vertical"
            disabled={!canRecover || action.busy || !!issuance}
            onFinish={recoverIssuance}
          >
            <Form.Item
              name="issuance"
              label={l('原签发 UUID', 'Original issuance UUID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="chain"
              label={l('原 CA 已签证书链', 'Certificate chain signed by the original CA')}
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={6} />
            </Form.Item>
            <Button htmlType="submit" disabled={!canRecover || action.busy || !!issuance}>
              {l('关联原签发结果', 'Link original signing result')}
            </Button>
          </Form>
          {issuance && (
            <>
              <p className="mono">
                {l('管理员恢复操作', 'Administrator recovery operation')} · {issuance.operationId}
              </p>
              <Status value={issuanceOutcome} locale={locale} />
              <Space wrap>
                <Button disabled={!canRecover || action.busy} onClick={() => recoverIssuance()}>
                  {l('显式重提原候选恢复', 'Explicitly resubmit original candidate recovery')}
                </Button>
                <Button
                  disabled={!canRecover || action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      const result = await devicePki.issuanceRecovery(
                        issuance.issuance,
                        issuance.operationId,
                      )
                      setCandidate(result)
                      if (result) setIssuanceOutcome('confirmed')
                    })
                  }
                >
                  {l('读取原恢复回执', 'Read original recovery receipt')}
                </Button>
                {issuanceOutcome !== 'unknown' && (
                  <Button
                    disabled={action.busy}
                    onClick={() => {
                      setIssuance(null)
                      setCandidate(null)
                      setIssuanceOutcome('none')
                      issuanceForm.resetFields()
                    }}
                  >
                    {l('结束本次候选恢复', 'Finish this candidate recovery')}
                  </Button>
                )}
              </Space>
            </>
          )}
          {candidate && (
            <dl className="device-facts">
              <div>
                <dt>{l('签发标识', 'Issuance')}</dt>
                <dd>{candidate.issuanceId}</dd>
              </div>
              <div>
                <dt>{l('原客户端签发操作', 'Original client signing operation')}</dt>
                <dd>{candidate.originalSigningOperationId}</dd>
              </div>
              <div>
                <dt>{l('候选激活截止', 'Candidate activation deadline')}</dt>
                <dd>{timestamp(locale, candidate.activateBefore)}</dd>
              </div>
            </dl>
          )}
          <details>
            <summary>{l('按已有恢复标识读取', 'Read using existing recovery coordinates')}</summary>
            <Form
              name={formPrefix + '-2'}
              form={lookupForm}
              layout="vertical"
              disabled={!canRecover || action.busy || !!issuance}
              onFinish={(value) =>
                void action.run(async () => {
                  const result = await devicePki.issuanceRecovery(value.issuance, value.operation)
                  setCandidate(result)
                })
              }
            >
              <Form.Item
                name="issuance"
                label={l('原签发 UUID', 'Original issuance UUID')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="operation"
                label={l('管理员恢复操作 UUID', 'Administrator recovery operation UUID')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Button htmlType="submit" disabled={!canRecover || action.busy || !!issuance}>
                {l('读取原候选', 'Read original candidate')}
              </Button>
            </Form>
          </details>
        </Card>
      </div>
    </>
  )
}
