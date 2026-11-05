import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Checkbox, Input, Space } from 'antd'
import { secret256 } from '@rss/mdm-enrollment'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { useAdministration } from './useAdministration'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
export function NativeMaintenance({
  runtime,
  locale,
  id,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  id: string
  onChanged(): void
}) {
  const l = labels(locale),
    { enrollment } = useAdministration(runtime),
    action = useAction(),
    [password, setPassword] = useState(''),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{
      kind: 'resume' | 'cancel'
      operationId: string
      id: string
      fingerprint: string | null
    } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  useProtectedDelivery(() => {
    setPassword('')
    setApproved(false)
  })
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>, secret = '') {
    const result = await action.run(async () => {
      if (change.kind === 'resume' && (await inputFingerprint(secret)) !== change.fingerprint)
        throw { cause: 'client', code: 'input_changed' }
      return change.kind === 'cancel'
        ? enrollment.cancel(change.id, change.operationId)
        : enrollment.resume(change.id, change.operationId, secret)
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) onChanged()
  }
  return (
    <div className="device-editor">
      <h2>{l('维护原注册申请', 'Maintain this enrollment')}</h2>
      <Failure error={action.error} locale={locale} />
      <Input.Password
        aria-label={l('继续原申请的注册密码', 'Enrollment password for resume')}
        value={password}
        disabled={action.busy}
        autoComplete="off"
        onChange={(event) => setPassword(event.target.value)}
      />
      <Checkbox
        checked={approved}
        disabled={action.busy || pending !== null}
        onChange={(event) => setApproved(event.target.checked)}
      >
        {l('明确继续或取消此注册申请', 'Explicitly resume or cancel this enrollment')}
      </Checkbox>
      <Space wrap>
        <Button
          disabled={!approved || !password || pending !== null || action.busy}
          onClick={() => {
            const secret = password
            setPassword('')
            void action
              .run(async () => {
                secret256(secret)
                return {
                  kind: 'resume' as const,
                  operationId: crypto.randomUUID(),
                  id,
                  fingerprint: await inputFingerprint(secret),
                }
              })
              .then((result) => {
                if (result.ok) {
                  setPending(result.value)
                  void submit(result.value, secret)
                }
              })
          }}
        >
          {l('继续原注册申请', 'Resume enrollment')}
        </Button>
        <Button
          danger
          disabled={!approved || pending !== null || action.busy}
          onClick={() => {
            setPassword('')
            const change = Object.freeze({
              kind: 'cancel' as const,
              operationId: crypto.randomUUID(),
              id,
              fingerprint: null,
            })
            setPending(change)
            void submit(change)
          }}
        >
          {l('取消原注册申请', 'Cancel enrollment')}
        </Button>
      </Space>
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' || outcome === 'rejected' ? (
            <Button
              onClick={() => {
                setPending(null)
                setOutcome('none')
                setApproved(false)
                action.clear()
                onChanged()
              }}
            >
              {outcome === 'confirmed'
                ? l('原维护操作已确认，读取最新状态', 'Original maintenance confirmed; read latest')
                : l('放弃已拒绝维护并重读', 'Discard rejected maintenance and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '保留原申请、操作与输入；当前状态读取不确认原维护操作。',
                  'The original enrollment, operation and input remain fixed. Current-state reads do not confirm this operation.',
                )}
              />
              <Button
                disabled={action.busy || (pending.kind === 'resume' && !password)}
                onClick={() => {
                  const secret = password
                  setPassword('')
                  void submit(pending, secret)
                }}
              >
                {l('显式重提原维护请求', 'Resubmit original maintenance request')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
