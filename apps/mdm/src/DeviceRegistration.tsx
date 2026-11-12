import { useState } from 'react'
import { Alert, Button, Checkbox, Descriptions, Space } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { usePendingSelection } from './SelectionGuard'
import { Status } from './DevicePresentation'
import { DiagnosticReference } from './DiagnosticReference'

export function DeviceRegistration({ runtime, locale, device }: { runtime: Runtime; locale: Locale; device: string }) {
  const l = labels(locale), { enrollment, binding } = useAdministration(runtime), action = useAction(),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    read = useRead(`${binding}/device-registration/${device}`, signal => enrollment.registration(device, signal), { retryReadConflict: true })
  usePendingSelection(action.busy || outcome === 'unknown')
  async function submit(operationId: string) {
    const result = await action.run(() => enrollment.revokeRegistration(device, operationId))
    setOutcome(previous => result.ok ? 'confirmed' : previous === 'unknown' || isUnknown(result.error) ? 'unknown' : 'rejected')
    if (result.ok) read.reload()
  }
  return <Space orientation="vertical" className="device-editor">
    <Alert type="info" title={l('此设备标识对应一次通道注册。新注册会创建新设备；撤销与原生退管分别观察。', 'This device identifies one channel enrollment. New enrollment creates a new device; observe revocation and native unenrollment separately.')} />
    <ReadState locale={locale} busy={read.busy} error={read.error} onRetry={read.reload} />
    <Failure locale={locale} error={action.error} />
    {read.value && <Descriptions column={1} items={[
      { key: 'device', label: l('设备', 'Device'), children: read.value.deviceId },
      { key: 'source', label: l('来源', 'Source'), children: read.value.source ?? '—' },
      { key: 'status', label: l('状态', 'State'), children: <Status locale={locale} value={read.value.status} /> },
      { key: 'enrollment', label: l('注册申请', 'Enrollment request'), children: read.value.enrollmentId ?? '—' },
      { key: 'grant', label: l('凭据请求', 'Credential grant'), children: read.value.certificateGrantId ?? '—' },
      { key: 'user', label: l('用户范围已登记', 'User scope declared'), children: read.value.enrolledUser ? l('是', 'Yes') : l('否', 'No') },
      { key: 'context', label: 'WinDC', children: read.value.windowsDeclared ? `${read.value.windowsDeclared.requestId} · ${read.value.windowsDeclared.ready ? l('就绪', 'Ready') : l('未就绪', 'Not ready')}` : l('无协议上下文', 'No protocol context') },
    ]} />}
    <Checkbox checked={approved} disabled={pending !== null || action.busy} onChange={e => setApproved(e.target.checked)}>{l('确认撤销此设备注册', 'Confirm revocation of this device enrollment')}</Checkbox>
    <Button danger disabled={!approved || pending !== null || action.busy || read.value?.status !== 'active'} onClick={() => {
      const operationId = crypto.randomUUID(); setPending(operationId); void submit(operationId)
    }}>{l('撤销此设备注册', 'Revoke device enrollment')}</Button>
    <Button onClick={read.reload}>{l('读取注册状态', 'Read enrollment state')}</Button>
    {pending && <>
      <DiagnosticReference locale={locale} context="mdm" selection={{ mode: 'operation', address: { owner: 'registration', operationId: pending, device } }} />
      <Alert type={outcome === 'confirmed' ? 'success' : 'warning'} title={outcome === 'confirmed' ? l('原撤销已确认', 'Original revocation confirmed') : l('当前状态不能确认原操作。保持原设备和原操作标识恢复。', 'Current state cannot confirm the original operation. Recover with the original device and operation identity.')} />
      {outcome === 'confirmed' || outcome === 'rejected'
        ? <Button onClick={() => { setPending(null); setOutcome('none'); setApproved(false); action.clear(); read.reload() }}>{l('读取最新记录', 'Read latest record')}</Button>
        : <Button disabled={action.busy} onClick={() => void submit(pending)}>{l('显式重提原撤销', 'Resubmit original revocation')}</Button>}
    </>}
  </Space>
}
