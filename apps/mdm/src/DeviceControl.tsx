import { CapabilityPermission, CapabilityState } from './DeviceCapability'
import { DiagnosticReference } from './DiagnosticReference'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Descriptions, Input, Modal, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import {
  controlApplicability,
  type DeviceControlAction,
  type EndpointDetail,
  type ViewEndpoint,
} from '@rss/mdm-devices'
import type { ControlIntent } from '@rss/mdm-execution'
import { freeze } from '@rss/mdm-inventory'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { useAdministration } from './useAdministration'
import { deviceName } from './DevicePresentation'
import { executionPath } from './Executions'
import { useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
type Registration = NonNullable<EndpointDetail['primaryMdmRegistration']>

function sameRegistration(a: Registration, b: Registration | null | undefined): boolean {
  return (
    a.registrationId === b?.registrationId && a.generation === b.generation && a.source === b.source
  )
}

export function DeviceControl({
  runtime,
  locale,
  endpoint,
  snapshot,
  onReload,
  onStale,
  canReadOriginal,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  snapshot: EndpointDetail | undefined
  onReload(): void
  onStale(): void
  canReadOriginal: boolean
}) {
  const l = labels(locale)
  const { execution, devices } = useAdministration(runtime)
  const action = useAction()
  const [kind, setKind] = useState<DeviceControlAction>('restart')
  const [pin, setPin] = useState('')
  const [approved, setApproved] = useState(false)
  const [review, setReview] = useState<{
    intent: ControlIntent
    registration: Registration
  } | null>(null)
  const [pending, setPending] = useState<ControlIntent | null>(null)
  const [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  const [stale, setStale] = useState(false)
  const { fact, ready } = controlApplicability(snapshot, kind)
  const validReview =
    review && ready && sameRegistration(review.registration, snapshot?.primaryMdmRegistration)
      ? review
      : null
  function clearReview() {
    setPin('')
    setApproved(false)
    setReview(null)
  }
  const delivery = useProtectedDelivery(clearReview, ready)
  usePendingSelection(action.busy || outcome === 'unknown')
  useEffect(() => {
    if (!validReview) clearReview()
  }, [validReview])
  function prepare() {
    const registration = snapshot?.primaryMdmRegistration
    if (!ready || !registration || action.busy || outcome === 'unknown') return
    action.clear()
    setStale(false)
    setApproved(false)
    setReview({
      registration,
      intent: freeze({
        device: endpoint.id,
        operationId: crypto.randomUUID(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        action:
          kind === 'restart'
            ? { kind }
            : {
                kind,
                confirmed: true,
                expectedRegistrationId: registration.registrationId,
                expectedGeneration: registration.generation,
              },
      } as ControlIntent),
    })
  }
  async function submit() {
    const secret = pin
    const epoch = delivery.capture()
    if (!validReview || !approved) return
    const { intent, registration } = validReview
    if (intent.action.kind === 'lock' && !/^[0-9]{6}$/.test(secret)) return
    clearReview()
    let issued = false
    const result = await action.run(async () => {
      let current: EndpointDetail
      try {
        current = await devices.endpoint(intent.device)
      } catch (error) {
        if (delivery.isCurrent(epoch)) {
          setStale(true)
          onStale()
        }
        throw error
      }
      if (!delivery.isCurrent(epoch)) throw { cause: 'client', code: 'authentication_cancelled' }
      if (
        !sameRegistration(registration, current.primaryMdmRegistration) ||
        !controlApplicability(current, intent.action.kind).ready
      ) {
        setStale(true)
        onStale()
        throw { cause: 'client', code: 'registration_changed' }
      }
      issued = true
      setPending(intent)
      setOutcome('unknown')
      return execution.create(intent, intent.action.kind === 'lock' ? secret : undefined)
    })
    if (issued && delivery.isCurrent(epoch)) {
      setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    }
  }
  return (
    <Card title={l('设备动作', 'Device actions')}>
      <p>
        {deviceName(endpoint.displayName, endpoint.id)} · {endpoint.id}
      </p>
      <Space wrap>
        <Select
          aria-label={l('设备动作', 'Device action')}
          value={kind}
          disabled={action.busy || outcome === 'unknown'}
          onChange={(value) => {
            setKind(value)
            clearReview()
          }}
          options={[
            { value: 'restart', label: l('重启', 'Restart') },
            {
              value: 'lock',
              label: l('锁定', 'Lock'),
            },
            { value: 'wipe', label: l('擦除设备', 'Wipe device') },
          ]}
        />
        <Button disabled={!ready || action.busy || outcome === 'unknown'} onClick={prepare}>
          {l('核对设备与动作', 'Review device and action')}
        </Button>
      </Space>
      {fact ? (
        <Descriptions column={1} size="small">
          <Descriptions.Item label={l('产品支持', 'Product support')}>
            <CapabilityState locale={locale} value={fact.productSupport} />
          </Descriptions.Item>
          <Descriptions.Item label={l('设备前提', 'Device prerequisite')}>
            <CapabilityState locale={locale} value={fact.devicePrerequisite} />
          </Descriptions.Item>
          <Descriptions.Item label={l('当前权限', 'Current permission')}>
            <CapabilityPermission locale={locale} value={fact.permission} />
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <p>
          {l(
            '适用性未知，需读取当前设备能力。',
            'Applicability is unknown. Read the current device capabilities.',
          )}
        </p>
      )}
      {stale && (
        <Alert
          type="warning"
          showIcon
          title={l(
            '注册、权限或能力已变化，或无法重新核对。请刷新设备事实。',
            'Registration, permission or capability changed or could not be verified. Refresh device facts.',
          )}
        />
      )}
      {(!ready || stale) && (
        <Button
          onClick={() => {
            setStale(false)
            action.clear()
            onReload()
          }}
        >
          {l('刷新设备能力', 'Refresh device capabilities')}
        </Button>
      )}
      <Failure locale={locale} error={action.error} />
      {pending && (
        <p>
          <DiagnosticReference
            locale={locale}
            canNavigate={canReadOriginal}
            selection={{
              mode: 'operation',
              address: {
                owner: 'device_control',
                operationId: pending.operationId,
                device: pending.device,
              },
            }}
          />
          {' · '}
          {canReadOriginal && (
            <>
              <Link to={executionPath('command', pending.operationId)}>
                {l('查看设备执行', 'View device execution')}
              </Link>
              {' · '}
            </>
          )}
          {outcome === 'unknown'
            ? l(
                '提交结果未知，请查询原操作，勿重新创建',
                'Submission unknown. Query the original operation; do not create another.',
              )
            : outcome === 'confirmed'
              ? l('已受理，设备效果另行核实', 'Accepted; device effect is separate')
              : l('未确认受理', 'Acceptance unconfirmed')}
        </p>
      )}
      <Modal
        open={!!validReview}
        rootClassName={
          validReview
            ? 'device-control-confirmation mdm-overlay-open'
            : 'device-control-confirmation'
        }
        getContainer={false}
        scrollLock={false}
        title={l('确认设备动作', 'Confirm device action')}
        onCancel={clearReview}
        footer={null}
        destroyOnHidden
      >
        {validReview && (
          <>
            <p>
              {deviceName(endpoint.displayName, endpoint.id)} · {endpoint.id}
            </p>
            <p>
              {l('动作', 'Action')}: {validReview.intent.action.kind} · MDM{' '}
              {validReview.intent.action.kind !== 'restart'
                ? `${validReview.intent.action.expectedRegistrationId} @${validReview.intent.action.expectedGeneration}`
                : validReview.registration.registrationId}
            </p>
            <Alert
              type={validReview.intent.action.kind === 'wipe' ? 'error' : 'warning'}
              showIcon
              title={
                validReview.intent.action.kind === 'wipe'
                  ? l(
                      '擦除可能永久删除设备上的数据。确认已核对目标和恢复安排。',
                      'Wiping can permanently delete device data. Verify the target and recovery arrangements.',
                    )
                  : l(
                      '动作将中断设备使用；平台与通道适用性由服务端最终核验。',
                      'The action interrupts device use. The server verifies platform and channel support at submission.',
                    )
              }
            />
            {validReview.intent.action.kind === 'lock' && (
              <Input.Password
                aria-label={l('六位锁定 PIN', 'Six-digit lock PIN')}
                value={pin}
                maxLength={6}
                autoComplete="off"
                onChange={(e) => setPin(e.target.value)}
              />
            )}
            <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
              {l(
                '我已核对设备、动作与影响，并明确确认',
                'I verified this device, action and impact and explicitly confirm',
              )}
            </Checkbox>
            <Button
              type="primary"
              danger={validReview.intent.action.kind === 'wipe'}
              disabled={
                !ready ||
                !approved ||
                action.busy ||
                (validReview.intent.action.kind === 'lock' && !/^[0-9]{6}$/.test(pin))
              }
              onClick={() => void submit()}
            >
              {l('确认提交此动作', 'Submit this confirmed action')}
            </Button>
          </>
        )}
      </Modal>
    </Card>
  )
}
