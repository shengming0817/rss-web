import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, Modal, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { ViewEndpoint } from '@rss/mdm-devices'
import type { ControlIntent } from '@rss/mdm-execution'
import type { Grant } from '@rss/mdm-authorization'
import { freeze } from '@rss/mdm-inventory'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { useAdministration } from './useAdministration'
import { devicePermission } from './DeviceSecurity'
import { deviceName } from './DevicePresentation'
import { executionPath } from './Executions'
import { useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
export function DeviceControl({
  runtime,
  locale,
  endpoint,
  grants,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  grants: readonly Grant[]
}) {
  const l = labels(locale),
    { execution, devices } = useAdministration(runtime),
    action = useAction(),
    [kind, setKind] = useState<'restart' | 'lock' | 'wipe'>('restart'),
    [pin, setPin] = useState(''),
    [approved, setApproved] = useState(false),
    [review, setReview] = useState<ControlIntent | null>(null),
    [pending, setPending] = useState<ControlIntent | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    allowed = devicePermission(grants, endpoint.id, 'device_control'),
    wipeAllowed = devicePermission(grants, endpoint.id, 'device_wipe'),
    delivery = useProtectedDelivery(() => {
      setPin('')
      setReview(null)
      setApproved(false)
    }, allowed)
  usePendingSelection(action.busy || outcome === 'unknown')
  async function current() {
    const value = await devices.view({ kind: 'endpoint', id: endpoint.id }),
      target = value.endpoints.find((e) => e.id === endpoint.id)
    if (!target?.primaryMdmRegistration) throw { cause: 'client', code: 'registration_changed' }
    return target.primaryMdmRegistration
  }
  async function prepare() {
    const epoch = delivery.capture(),
      result = await action.run(async () => {
        if (!allowed || (kind === 'wipe' && !wipeAllowed))
          throw { cause: 'client', code: 'forbidden' }
        const registration = await current()
        if (kind === 'lock' && registration.source !== 'mdm.apple')
          throw { cause: 'client', code: 'unsupported' }
        return freeze({
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
        } as ControlIntent)
      })
    if (result.ok && delivery.isCurrent(epoch)) {
      setApproved(false)
      setReview(result.value)
    }
  }
  async function submit() {
    const input = review,
      secret = pin,
      epoch = delivery.capture()
    setPin('')
    setApproved(false)
    if (!input || !approved) return
    const result = await action.run(async () => {
      const registration = await current()
      if (
        input.action.kind !== 'restart' &&
        (registration.registrationId !== input.action.expectedRegistrationId ||
          registration.generation !== input.action.expectedGeneration)
      )
        throw { cause: 'client', code: 'registration_changed' }
      if (!delivery.isCurrent(epoch)) throw { cause: 'client', code: 'authentication_cancelled' }
      setPending(input)
      setOutcome('unknown')
      setReview(null)
      return execution.create(input, input.action.kind === 'lock' ? secret : undefined)
    })
    if (!delivery.isCurrent(epoch)) return
    setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
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
          disabled={!allowed || action.busy || outcome === 'unknown'}
          onChange={(value) => {
            setKind(value)
            setReview(null)
            setPin('')
          }}
          options={[
            { value: 'restart', label: l('重启', 'Restart') },
            {
              value: 'lock',
              label: l('锁定（macOS）', 'Lock (macOS)'),
              disabled: endpoint.primaryMdmRegistration?.source !== 'mdm.apple',
            },
            { value: 'wipe', label: l('擦除设备', 'Wipe device'), disabled: !wipeAllowed },
          ]}
        />
        <Button
          disabled={!allowed || action.busy || outcome === 'unknown'}
          onClick={() => void prepare()}
        >
          {l('核对设备与动作', 'Review device and action')}
        </Button>
      </Space>
      <Failure locale={locale} error={action.error} />
      {pending && (
        <p>
          {l('原操作', 'Original operation')}:{' '}
          <Link to={executionPath('command', pending.operationId)}>{pending.operationId}</Link> ·{' '}
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
        open={review !== null}
        rootClassName="device-control-confirmation"
        scrollLock={false}
        title={l('确认设备动作', 'Confirm device action')}
        onCancel={() => {
          setReview(null)
          setPin('')
          setApproved(false)
        }}
        footer={null}
        destroyOnHidden
      >
        {review && (
          <>
            <p>
              {deviceName(endpoint.displayName, endpoint.id)} · {endpoint.id}
            </p>
            <p>
              {l('动作', 'Action')}: {review.action.kind} · MDM{' '}
              {review.action.kind !== 'restart'
                ? `${review.action.expectedRegistrationId} @${review.action.expectedGeneration}`
                : endpoint.primaryMdmRegistration?.registrationId}
            </p>
            <Alert
              type={review.action.kind === 'wipe' ? 'error' : 'warning'}
              showIcon
              title={
                review.action.kind === 'wipe'
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
            {review.action.kind === 'lock' && (
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
              danger={review.action.kind === 'wipe'}
              disabled={
                !approved ||
                action.busy ||
                (review.action.kind === 'lock' && !/^[0-9]{6}$/.test(pin))
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
