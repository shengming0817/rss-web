import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import type { AssignUser, User, ViewEndpoint } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { useAdministration } from './useAdministration'
import { UserPicker } from './UserPicker'
import { Status, timestamp } from './DevicePresentation'

export function DevicePersonnel({
  runtime,
  locale,
  endpoint,
  onChanged,
}: {
  runtime: Runtime
  locale: Locale
  endpoint: ViewEndpoint
  onChanged(): void
}) {
  const l = labels(locale),
    { devices, binding } = useAdministration(runtime),
    action = useAction(),
    read = useRead(`${binding}/personnel/${endpoint.id}`, () =>
      devices.registrationUser(endpoint.id),
    )
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<User | null>(null),
    [selectionPending, setSelectionPending] = useState(false),
    [pending, setPending] = useState<AssignUser | null>(null),
    [outcome, setOutcome] = useState<'none' | 'unknown' | 'rejected' | 'confirmed'>('none')
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: AssignUser) {
    const result = await action.run(() => devices.assign(endpoint.id, change))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) {
      setEditing(false)
      onChanged()
    }
  }
  const original = endpoint.registrationUser,
    current = endpoint.currentUser
  return (
    <Card title={l('设备人员', 'Device people')}>
      <p className="subtitle">
        {l(
          '注册归属与当前用户为独立事实；仅修改此终端的注册归属。',
          'Assigned person and current user are separate facts. Only this endpoint assignment is edited.',
        )}
      </p>
      <dl className="device-facts">
        <div>
          <dt>{l('注册归属', 'Assigned person')}</dt>
          <dd>
            {original?.display?.login ?? original?.user?.principalId ?? l('未分配', 'Unassigned')}
          </dd>
        </div>
        <div>
          <dt>{l('当前用户', 'Current user')}</dt>
          <dd>
            {current?.display?.login ?? current?.user?.principalId ?? '—'}{' '}
            {current && <Status locale={locale} value={current.state} />}
          </dd>
        </div>
        <div>
          <dt>{l('绑定确认时间', 'Binding confirmed')}</dt>
          <dd>{timestamp(locale, current?.confirmedAt)}</dd>
        </div>
      </dl>
      {[original?.display, current?.display].map(
        (display, index) =>
          display && (
            <div key={index} className="subtitle">
              {display.profiles.map((profile, i) => (
                <span key={i}>
                  {profile.source.kind === 'identity_local'
                    ? l('本地资料', 'Local profile')
                    : `IdP · ${profile.source.provider}`}{' '}
                  · <Status value={profile.status} locale={locale} />{' '}
                  {profile.displayName ?? profile.username ?? ''}{' '}
                </span>
              ))}
            </div>
          ),
      )}
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {outcome === 'confirmed' && (
        <Alert
          type="success"
          title={l('原人员归属操作已确认。', 'The original assignment is confirmed.')}
        />
      )}
      {outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '原请求结果未知。重新读取仅供比较，不确认原操作；可显式重提相同请求。',
            'Original outcome unknown. Read only to compare; it does not confirm the operation. You may explicitly resubmit the same request.',
          )}
        />
      )}
      <Space wrap>
        <Button
          disabled={action.busy || (pending !== null && outcome !== 'confirmed')}
          onClick={() => {
            setEditing(false)
            setPending(null)
            setOutcome('none')
            action.clear()
            read.reload()
            onChanged()
          }}
        >
          {l('读取人员归属', 'Read assigned person')}
        </Button>
        <Button
          disabled={action.busy || !!read.error || !read.value || pending !== null}
          onClick={() => {
            setSelected(read.value?.user ?? null)
            setEditing(true)
          }}
        >
          {l('更改注册归属', 'Change assigned person')}
        </Button>
      </Space>
      {editing && read.value && (
        <div className="device-editor">
          <p className="subtitle">
            {l('已读取版本', 'Loaded revision')} · {read.value.revision}
          </p>
          <UserPicker
            runtime={runtime}
            locale={locale}
            value={selected}
            onChange={setSelected}
            onPendingChange={setSelectionPending}
            disabled={action.busy || pending !== null}
          />
          <Button
            type="primary"
            disabled={action.busy || pending !== null || selectionPending}
            onClick={() => {
              if (selectionPending) return
              void action
                .run(async () =>
                  devices.prepareAssignment(crypto.randomUUID(), read.value!, selected),
                )
                .then((result) => {
                  if (result.ok) {
                    setPending(result.value)
                    void submit(result.value)
                  }
                })
            }}
          >
            {l('保存人员归属', 'Save assigned person')}
          </Button>
        </div>
      )}
      {pending && outcome !== 'confirmed' && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'rejected' ? (
            <Button
              disabled={action.busy}
              onClick={() => {
                setPending(null)
                setOutcome('none')
                setEditing(false)
                action.clear()
                read.reload()
                onChanged()
              }}
            >
              {l('放弃已拒绝请求并重新读取', 'Discard rejected request and read again')}
            </Button>
          ) : (
            <Space wrap>
              <Button disabled={action.busy} onClick={read.reload}>
                {l('读取当前归属以比较', 'Read current assignment to compare')}
              </Button>
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原归属请求', 'Resubmit original assignment')}
              </Button>
            </Space>
          )}
        </div>
      )}
      {outcome === 'unknown' && read.value && (
        <p>
          {l('当前读取的归属', 'Current assignment read')} ·{' '}
          {read.value.user?.principalId ?? l('未分配', 'Unassigned')} · {l('版本', 'Revision')}{' '}
          {read.value.revision}
        </p>
      )}
    </Card>
  )
}
