import { DiagnosticReference } from './DiagnosticReference'
import { useState } from 'react'
import { Alert, Button, Checkbox, Space } from 'antd'
import type { ControlRecovery } from '@rss/mdm-execution'
import { freeze } from '@rss/mdm-inventory'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { devicePermission } from './DeviceSecurity'
import { useAdministration } from './useAdministration'
import { useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'
export function ControlRecoveryPanel({
  runtime,
  locale,
  device,
  id,
  revision,
  canReauthorize,
  confirmationRequired,
  terminal,
  onRefresh,
}: {
  runtime: Runtime
  locale: Locale
  device: string
  id: string
  revision: number
  canReauthorize: boolean
  confirmationRequired: boolean
  terminal: boolean
  onRefresh(): void
}) {
  const l = labels(locale),
    { execution, authorization, binding } = useAdministration(runtime),
    permissions = useRead(
      `${binding}/control-recovery-permissions/${device}`,
      authorization.effective,
    ),
    grants = permissions.value?.grants ?? [],
    canCancel = devicePermission(grants, device, 'operation_cancel'),
    canRecover =
      devicePermission(grants, device, 'device_control') ||
      devicePermission(grants, device, 'device_wipe'),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{
      kind: 'cancel' | 'reauthorize'
      input: ControlRecovery
    } | null>(null),
    [outcome, setOutcome] = useState('none'),
    action = useAction(),
    delivery = useProtectedDelivery(() => setApproved(false), canCancel || canRecover)
  usePendingSelection(action.busy || outcome === 'unknown')
  async function submit(kind: 'cancel' | 'reauthorize', original?: NonNullable<typeof pending>) {
    if (!approved && !original) return
    const value =
      original ??
      freeze({
        kind,
        input: {
          requestId: crypto.randomUUID(),
          expectedRevision: revision,
          ...(kind === 'reauthorize'
            ? {
                confirmation: confirmationRequired
                  ? {
                      confirmed: true as const,
                    }
                  : null,
              }
            : {}),
        },
      })
    setApproved(false)
    setPending(value)
    setOutcome('unknown')
    const epoch = delivery.capture(),
      result = await action.run(() =>
        value.kind === 'cancel'
          ? execution.cancel(device, id, value.input)
          : execution.reauthorize(device, id, value.input),
      )
    if (!delivery.isCurrent(epoch)) return
    setOutcome(result.ok ? 'confirmed' : isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) onRefresh()
  }
  return (
    <section className="device-editor">
      <h3>{l('维护原设备动作', 'Maintain the original device action')}</h3>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <Alert
        type="warning"
        showIcon
        title={l(
          '取消是请求停止后续执行，不撤销已发生的设备效果。重新授权保留原动作、设备、PIN 与期限。',
          'Cancellation requests stopping subsequent execution; it does not undo device effects. Reauthorization keeps the original action, device, PIN and deadline.',
        )}
      />
      <Checkbox
        checked={approved}
        disabled={action.busy || !!pending || terminal}
        onChange={(e) => setApproved(e.target.checked)}
      >
        {l(
          '我已核对原操作及设备，并明确确认本次恢复',
          'I verified the original operation and device and explicitly confirm this recovery',
        )}
      </Checkbox>
      <Space wrap>
        <Button
          disabled={!canCancel || !approved || !!pending || action.busy || terminal}
          onClick={() => void submit('cancel')}
        >
          {l('请求取消原操作', 'Request cancellation')}
        </Button>
        <Button
          disabled={
            !canRecover || !approved || !!pending || action.busy || !canReauthorize || terminal
          }
          onClick={() => void submit('reauthorize')}
        >
          {l('重新授权原操作', 'Reauthorize original operation')}
        </Button>
        <Button onClick={onRefresh}>
          {l('查询原操作当前事实', 'Read current original operation')}
        </Button>
      </Space>
      {pending && ['confirmed', 'rejected'].includes(outcome) && (
        <Button
          disabled={action.busy}
          onClick={() => {
            setPending(null)
            setOutcome('none')
            setApproved(false)
            onRefresh()
          }}
        >
          {l('结束此恢复任务并重新读取', 'Finish this recovery task and read again')}
        </Button>
      )}
      <Failure locale={locale} error={action.error} />
      {pending && (
        <>
          <p>
            <DiagnosticReference
              locale={locale}
              selection={{
                mode: 'operation',
                address: {
                  owner: 'device_control_request',
                  operationId: pending.input.requestId,
                  device,
                },
              }}
            />
            {' · '}
            {outcome}
          </p>
          {outcome === 'unknown' && (
            <Button
              disabled={action.busy || (pending.kind === 'cancel' ? !canCancel : !canRecover)}
              onClick={() => void submit(pending.kind, pending)}
            >
              {l('显式重提同一恢复请求', 'Explicitly resubmit the same recovery request')}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
