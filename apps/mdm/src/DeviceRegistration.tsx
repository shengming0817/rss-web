import { usePendingSelection } from './SelectionGuard'
import { useState } from 'react'
import { Alert, Button, Checkbox, Space } from 'antd'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  Failure,
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
import { Status } from './DevicePresentation'
import { NativeEnrollment } from './NativeEnrollment'
export function DeviceRegistration({
  runtime,
  locale,
  device,
}: {
  runtime: Runtime
  locale: Locale
  device: string
}) {
  const l = labels(locale),
    { enrollment, binding } = useAdministration(runtime),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [selected, setSelected] = useState<string>(),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<{ registration: string; operationId: string } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    read = useRead(`${binding}/device-registrations/${device}/${JSON.stringify(query)}`, () =>
      enrollment.registrations(
        device,
        directoryQuery(query, [
          'registrationId',
          'enrollmentId',
          'certificateGrantId',
          'userContextId',
          'source',
          'generation',
          'status',
        ] as const),
      ),
    )
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() =>
      enrollment.revokeRegistration(device, change.registration, change.operationId),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) read.reload()
  }
  return (
    <>
      <Alert
        type="info"
        title={l(
          '每条注册独立于终端和关联身份。撤销注册不证明设备已完成原生退管。',
          'Each registration is separate from endpoint and association identity. Revocation does not prove native unenrollment completed.',
        )}
      />
      <DirectoryControls
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={[
          'registrationId',
          'enrollmentId',
          'certificateGrantId',
          'userContextId',
          'source',
          'generation',
          'status',
        ]}
        sort={['registrationId', 'source', 'generation', 'status']}
        required="registrationId"
        maximum={1000}
      />
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      <Failure error={action.error} locale={locale} />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="registrationId"
            columns={[
              {
                title: l('注册标识', 'Registration ID'),
                dataIndex: 'registrationId',
                render: (_, row) => (
                  <Button
                    type="link"
                    disabled={pending !== null || action.busy}
                    onClick={() => {
                      setSelected(row.registrationId)
                      setApproved(false)
                    }}
                  >
                    {row.registrationId}
                  </Button>
                ),
              },
              { title: l('来源', 'Source'), dataIndex: 'source' },
              { title: l('代次', 'Generation'), dataIndex: 'generation' },
              {
                title: l('状态', 'State'),
                dataIndex: 'status',
                render: (_, row) => row.status && <Status value={row.status} locale={locale} />,
              },
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
        <div className="device-editor">
          <code>{selected}</code>
          <Checkbox
            checked={approved}
            disabled={pending !== null || action.busy}
            onChange={(event) => setApproved(event.target.checked)}
          >
            {l('确认撤销此注册身份', 'Confirm revocation of this registration')}
          </Checkbox>
          <Button
            danger
            disabled={!approved || pending !== null || action.busy}
            onClick={() => {
              const change = Object.freeze({
                registration: selected,
                operationId: crypto.randomUUID(),
              })
              setPending(change)
              void submit(change)
            }}
          >
            {l('撤销此注册', 'Revoke registration')}
          </Button>
        </div>
      )}
      <Button onClick={read.reload}>{l('读取注册记录', 'Read registration records')}</Button>
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          <Space wrap>
            {outcome === 'confirmed' || outcome === 'rejected' ? (
              <Button
                onClick={() => {
                  setPending(null)
                  setOutcome('none')
                  setApproved(false)
                  action.clear()
                  read.reload()
                }}
              >
                {outcome === 'confirmed'
                  ? l('原撤销已确认，读取最新记录', 'Original revocation confirmed; read latest')
                  : l('放弃已拒绝撤销并重读', 'Discard rejected revocation and read again')}
              </Button>
            ) : (
              <Button disabled={action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原注册撤销', 'Resubmit original registration revocation')}
              </Button>
            )}
          </Space>
        </div>
      )}
      <NativeEnrollment runtime={runtime} locale={locale} deviceId={device} />
    </>
  )
}
