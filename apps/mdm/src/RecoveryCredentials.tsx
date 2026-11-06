import { useEffect, useState } from 'react'
import { Alert, Button, Card, Space } from 'antd'
import type { ViewEndpoint } from '@rss/mdm-devices'
import { freeze } from '@rss/mdm-inventory'
import {
  readable,
  reference,
  revokePermission,
  type Material,
  type MaterialRef,
  type RecoveryCredentials as Credentials,
  type Subject,
} from '@rss/mdm-recovery-credentials'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  firstPage,
  type Query,
  DirectoryControls,
  Failure,
  isUnknown,
  labels,
  ReadState,
  readFailure,
  useAction,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { SecretPanel } from './SecretTabs'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { MaterialDisclosure } from './MaterialDisclosure'
import { ExactMaterialDisclosure } from './RecoveryDisclosure'
import { FileVaultCredentials } from './FileVaultCredentials'
import { NativeCredentialOperation } from './NativeCredentialOperation'
export function RecoveryCredentials({
  runtime,
  endpoint,
  locale,
  has,
}: {
  runtime: Runtime
  endpoint: ViewEndpoint
  locale: Locale
  has: (operation: string) => boolean
}) {
  const l = labels(locale),
    { recoveryCredentials: credentials, binding } = useAdministration(runtime),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Omit<Query, 'fields'> & { fields?: readonly (keyof Material)[] }>({
      limit: 20,
    }),
    [selected, setSelected] = useState<MaterialRef | null>(null),
    [held, setHeld] = useState<Material | null>(null),
    canRead = has('inventory_read'),
    canDisclose = has('credentials'),
    canOperate = has('security_operate'),
    list = useRead(
      `${binding}/recovery-materials/${endpoint.id}/${canRead}/${JSON.stringify(query)}`,
      (signal) => (canRead ? credentials.list(endpoint.id, query, signal) : Promise.resolve(null)),
      { retryReadConflict: !query.cursor },
    ),
    detail = useRead(
      `${binding}/recovery-material/${selected?.id ?? ''}/${selected?.version ?? ''}/${canRead}`,
      (signal) =>
        canRead && selected ? credentials.material(selected, signal) : Promise.resolve(null),
      { retryReadConflict: true },
    )
  usePendingSelection(guard.locked)
  useEffect(() => {
    if (!guard.locked)
      setHeld(readFailure(list.error) === 'denied' || !canRead ? null : (detail.value ?? null))
  }, [detail.value, guard.locked, list.error, detail.error, canRead])
  const visible = canRead && !!list.value && !!detail.value
  const current =
    selected && held && held.id === selected.id && held.version === selected.version ? held : null
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Alert
        type="info"
        title={l(
          '材料身份由设备、注册、代次、Subject 和精确版本组成。托管成功不等于已验证；RSS Login 材料是离线附加因子，不是 Windows 账户密码。',
          'Material identity includes device, registration, generation, subject and exact version. Escrow does not establish verification; RSS Login material is an offline additional factor, not a Windows account password.',
        )}
      />
      <SecretPanel active={canRead}>
        <fieldset className="permission-panel" hidden={!canRead} disabled={!canRead}>
          <Card
            title={l('恢复凭据材料目录', 'Recovery credential material directory')}
            extra={
              <Button onClick={list.reload}>{l('读取材料目录', 'Read material directory')}</Button>
            }
          >
            <DirectoryControls
              locale={locale}
              query={query}
              required={['id', 'version']}
              fields={[
                'id',
                'version',
                'binding',
                'current',
                'validity',
                'escrowed',
                'operation',
                'createdAt',
                'invalidatedAt',
              ]}
              sort={[
                'id',
                'version',
                'current',
                'validity',
                'escrowed',
                'operation',
                'createdAt',
                'invalidatedAt',
              ]}
              maximum={100}
              onChange={({ fields, ...next }) =>
                setQuery({
                  ...next,
                  ...(fields ? { fields: fields as readonly (keyof Material)[] } : {}),
                })
              }
            />
            <ReadState
              busy={list.busy}
              error={list.error}
              empty={list.value?.items.length === 0}
              locale={locale}
              onRetry={list.reload}
              onRestart={() => (query.cursor ? setQuery(firstPage(query)) : list.reload())}
            />
            {list.value && (
              <>
                <DataTable
                  locale={locale}
                  dataSource={list.value.items}
                  rowKey={(row) => `${row.id}/${row.version}`}
                  columns={[
                    {
                      title: l('材料 / 精确版本', 'Material / exact version'),
                      render: (_, row) => (
                        <Button
                          type="link"
                          disabled={guard.locked}
                          onClick={() => {
                            setSelected({ device: endpoint.id, id: row.id, version: row.version })
                          }}
                        >
                          {row.id} · {row.version}
                        </Button>
                      ),
                    },
                    {
                      title: l('材料来源', 'Material subject'),
                      render: (_, row) =>
                        row.binding ? subjectName(row.binding.subject, locale) : '—',
                    },
                    {
                      title: l('注册 / 代次', 'Registration / generation'),
                      render: (_, row) =>
                        row.binding
                          ? `${row.binding.registration} / ${row.binding.generation}`
                          : '—',
                    },
                    {
                      title: l('有效性', 'Validity'),
                      render: (_, row) =>
                        row.validity ? <Status value={row.validity} locale={locale} /> : '—',
                    },
                    {
                      title: l('当前 / 已托管', 'Current / escrowed'),
                      render: (_, row) =>
                        `${row.current === undefined ? '—' : row.current ? l('是', 'Yes') : l('否', 'No')} / ${row.escrowed === undefined ? '—' : row.escrowed ? l('是', 'Yes') : l('否', 'No')}`,
                    },
                  ]}
                />
                {list.value.nextCursor && (
                  <Button onClick={() => setQuery({ ...query, cursor: list.value!.nextCursor! })}>
                    {l('下一页材料', 'Next material page')}
                  </Button>
                )}
                {query.cursor && (
                  <Button
                    onClick={() => {
                      const { cursor, ...rest } = query
                      void cursor
                      setQuery(rest)
                    }}
                  >
                    {l('返回材料第一页', 'Return to first material page')}
                  </Button>
                )}
              </>
            )}
          </Card>
        </fieldset>
      </SecretPanel>
      {selected && (
        <ReadState
          busy={detail.busy}
          error={detail.error}
          locale={locale}
          onRetry={detail.reload}
        />
      )}
      {current && (
        <SecretPanel active={visible}>
          <fieldset className="permission-panel" hidden={!visible} disabled={!visible}>
            <MaterialDetail
              key={`${current.binding.device}/${current.id}/${current.version}`}
              runtime={runtime}
              credentials={credentials}
              value={current}
              locale={locale}
              canDisclose={visible && canDisclose}
              canRead={visible}
              canRevoke={visible && has(revokePermission(current.binding.subject))}
              onRefresh={() => {
                detail.reload()
                list.reload()
              }}
            />
          </fieldset>
        </SecretPanel>
      )}
      <ExactMaterialDisclosure
        runtime={runtime}
        credentials={credentials}
        device={endpoint.id}
        permitted={canDisclose}
        locale={locale}
      />
      <SecretPanel active={canOperate}>
        <fieldset className="permission-panel" hidden={!canOperate} disabled={!canOperate}>
          <FileVaultCredentials
            credentials={credentials}
            endpoint={endpoint}
            locale={locale}
            permitted={canOperate}
          />
        </fieldset>
      </SecretPanel>
      <SecretPanel active={canOperate || has('operation_read')}>
        <fieldset
          className="permission-panel"
          hidden={!canOperate && !has('operation_read')}
          disabled={!canOperate && !has('operation_read')}
        >
          <NativeCredentialOperation
            credentials={credentials}
            endpoint={endpoint}
            selected={visible ? current : null}
            locale={locale}
            canOperate={canOperate}
            canConfigure={has('configuration_write')}
            canReadOperation={has('operation_read')}
          />
        </fieldset>
      </SecretPanel>
    </SelectionGuard.Provider>
  )
}
function MaterialDetail({
  runtime,
  credentials,
  value,
  locale,
  canDisclose,
  canRead,
  canRevoke,
  onRefresh,
}: {
  runtime: Runtime
  credentials: Credentials
  value: Material
  locale: Locale
  canDisclose: boolean
  canRead: boolean
  canRevoke: boolean
  onRefresh: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [pending, setPending] = useState<MaterialRef | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [currentValidity, setCurrentValidity] = useState<string | null>(null)
  usePendingSelection(!!pending || action.busy)
  async function revoke() {
    if (!canRevoke) return
    const original = pending ?? freeze(reference(value))
    setPending(original)
    const result = await action.run(() => credentials.revoke(original))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) setCurrentValidity(result.value.validity)
  }
  return (
    <>
      <Card title={subjectName(value.binding.subject, locale)}>
        <dl className="device-facts">
          <div>
            <dt>{l('材料 / 精确版本', 'Material / exact version')}</dt>
            <dd>
              {value.id} / {value.version}
            </dd>
          </div>
          <div>
            <dt>{l('注册 / 代次', 'Registration / generation')}</dt>
            <dd>
              {value.binding.registration} / {value.binding.generation}
            </dd>
          </div>
          <div>
            <dt>{l('Subject 身份', 'Subject identity')}</dt>
            <dd>{subjectCoordinates(value.binding.subject)}</dd>
          </div>
          <div>
            <dt>{l('有效性 / 托管', 'Validity / escrow')}</dt>
            <dd>
              <Status value={value.validity} locale={locale} /> ·{' '}
              {value.escrowed ? l('已托管', 'Escrowed') : l('未托管', 'Not escrowed')}
            </dd>
          </div>
          <div>
            <dt>{l('原材料操作', 'Original material operation')}</dt>
            <dd>{value.operation}</dd>
          </div>
          <div>
            <dt>{l('创建 / 失效时间', 'Created / invalidated')}</dt>
            <dd>
              {timestamp(locale, value.createdAt)} / {timestamp(locale, value.invalidatedAt)}
            </dd>
          </div>
        </dl>
        <Button
          danger
          disabled={!canRevoke || action.busy || value.validity === 'revoked'}
          onClick={() => void revoke()}
        >
          {pending
            ? l('显式重提原版本撤销', 'Explicitly resubmit revocation of original version')
            : l('撤销此版本的材料访问', 'Revoke access to this material version')}
        </Button>
        <p className="subtitle">
          {l(
            '撤销只改变托管材料的访问，不会删除设备上的密码或密钥。',
            'Revocation changes access to escrowed material; it does not delete a password or key on the device.',
          )}
        </p>
        <Failure error={action.error} locale={locale} />
        {pending && (
          <>
            <p>
              <Status value={outcome} locale={locale} /> ·{' '}
              {l('当前读取到的有效性', 'Currently observed validity')} {currentValidity ?? '—'}
            </p>
            <Space wrap>
              <Button
                disabled={!canRead || action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const actual = await credentials.material(pending)
                    setCurrentValidity(actual.validity)
                    if (actual.validity === 'revoked') setOutcome('confirmed')
                  })
                }
              >
                {l('读取此精确版本状态', 'Read this exact version state')}
              </Button>
              {outcome !== 'unknown' && (
                <Button
                  disabled={action.busy}
                  onClick={() => {
                    setPending(null)
                    setOutcome('none')
                    setCurrentValidity(null)
                    action.clear()
                    onRefresh()
                  }}
                >
                  {l('结束本次材料撤销', 'Finish this material revocation')}
                </Button>
              )}
            </Space>
          </>
        )}
      </Card>
      <MaterialDisclosure
        runtime={runtime}
        credentials={credentials}
        target={reference(value)}
        rssLogin={value.binding.subject.kind === 'rss_login'}
        permitted={canDisclose && readable(value) && !pending}
        locale={locale}
      />
    </>
  )
}
function subjectName(value: Subject, locale: Locale) {
  const l = labels(locale)
  return value.kind === 'rss_login'
    ? l('RSS Login 离线附加因子', 'RSS Login offline additional factor')
    : value.kind === 'bitlocker'
      ? 'BitLocker'
      : value.kind === 'local_administrator'
        ? l('本地管理员凭据', 'Local administrator credential')
        : value.kind === 'filevault'
          ? 'FileVault'
          : value.kind === 'recovery_lock'
            ? l('设备恢复锁', 'Device recovery lock')
            : l('设备锁定 PIN', 'Device lock PIN')
}
function subjectCoordinates(value: Subject): string {
  switch (value.kind) {
    case 'rss_login':
      return `${value.binding} / ${value.bindingGeneration} · ${value.sid}`
    case 'bitlocker':
      return `${value.volume} · ${value.protector}`
    case 'local_administrator':
      return value.sid
    case 'filevault':
      return `${value.custody} / ${value.epoch}`
    case 'lock_pin':
      return value.operation
    case 'recovery_lock':
      return 'recovery_lock'
  }
}
