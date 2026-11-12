import { useDirectoryQuery } from './directory-location'
import { useId, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import type { WindowQuery } from '@rss/mdm-devices'
import {
  actions,
  validity,
  type CertificateArchive as Archive,
  type Entry,
  type OriginalOperation,
  type Reference,
  type Vault,
} from '@rss/mdm-certificates/archive'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  DirectoryControls,
  directoryQuery,
  Failure,
  labels,
  ReadState,
  useAction,
  useRead,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { Status, timestamp } from './DevicePresentation'
import { ArchiveVault } from './ArchiveVault'
import { ArchiveExport } from './ArchiveExport'
import { ArchiveMaterialAuthor } from './ArchiveMaterialAuthor'
import { ArchiveMetadata } from './ArchiveMetadata'
import { ArchiveCommandState, useArchiveCommand } from './ArchiveCommand'
import { SecretPanel } from './SecretTabs'
import { SelectionGuard, useSelectionGuard } from './SelectionGuard'
type ArchiveTask = 'browse' | 'material' | 'edit' | 'export' | 'settings' | 'recovery'
export function CertificateArchive({
  runtime,
  locale,
  canRead,
  canWrite,
  canUnlock,
  canExport,
}: {
  runtime: Runtime
  locale: Locale
  canRead: boolean
  canWrite: boolean
  canUnlock: boolean
  canExport: boolean
}) {
  const l = labels(locale),
    { certificateArchive: archive, binding } = useAdministration(runtime),
    guard = useSelectionGuard(),
    [query, setQuery] = useDirectoryQuery('certificates.'),
    [task, setTask] = useState<ArchiveTask>('browse'),
    [visited, setVisited] = useState<Partial<Record<ArchiveTask, boolean>>>({}),
    previousTask = useRef<ArchiveTask>('browse'),
    taskHeading = useRef<HTMLHeadingElement>(null),
    taskPanels = useRef<Partial<Record<ArchiveTask, HTMLFieldSetElement>>>({}),
    [selected, setSelected] = useState<string | null>(null),
    [newId, setNewId] = useState(() => crypto.randomUUID()),
    [mounted, setMounted] = useState<Entry | null>(null),
    [target, setTarget] = useState<Reference | null>(null),
    [historyQuery, setHistoryQuery] = useState<WindowQuery>({ limit: 10 }),
    [vault, setVault] = useState<Vault | null>(null),
    list = useRead(`${binding}/certificate-archive/${canRead}/${JSON.stringify(query)}`, () =>
      canRead
        ? archive.list(
            directoryQuery(query, [
              'id',
              'revision',
              'retired',
              'recommendedVersion',
              'latest',
            ] as const),
          )
        : Promise.resolve(null),
    ),
    detail = useRead(`${binding}/certificate-detail/${selected ?? ''}/${canRead}`, () =>
      selected && canRead ? archive.entry(selected) : Promise.resolve(null),
    ),
    history = useRead(
      `${binding}/certificate-history/${selected ?? ''}/${JSON.stringify(historyQuery)}/${canRead}`,
      () => (selected && canRead ? archive.history(selected, historyQuery) : Promise.resolve(null)),
    ),
    vaultRead = useRead(`${binding}/archive-vault/${canRead}`, () =>
      canRead ? archive.vault() : Promise.resolve(null),
    ),
    settings = useRead(`${binding}/archive-settings/${canRead}`, () =>
      canRead ? archive.settings() : Promise.resolve(null),
    )
  useEffect(() => {
    setVault(vaultRead.value ?? null)
  }, [vaultRead.value])
  useEffect(() => {
    if (!guard.locked) setMounted(detail.value ?? null)
  }, [detail.value, guard.locked])
  useEffect(() => {
    if (!vault?.unlockedUntil) return
    const timer = setTimeout(
      () => setVault((current) => (current ? { ...current, unlockedUntil: null } : null)),
      Math.max(0, Math.min(2147483647, vault.unlockedUntil * 1000 - Date.now())),
    )
    return () => clearTimeout(timer)
  }, [vault?.unlockedUntil])
  const unlocked =
      canUnlock &&
      vault?.unlockedUntil !== null &&
      vault?.unlockedUntil !== undefined &&
      vault.unlockedUntil * 1000 > Date.now(),
    current = mounted?.id === selected ? mounted : null,
    exportTarget =
      target?.entryId === selected
        ? target
        : current
          ? { entryId: current.id, version: current.latest.version }
          : null
  useEffect(() => {
    if (task === 'browse') return
    const panel = taskPanels.current[task],
      field =
        panel?.querySelector<HTMLElement>('input:not([disabled])') ??
        panel?.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]')
    ;(field ?? taskHeading.current)?.focus()
  }, [task])
  function openTask(next: ArchiveTask) {
    previousTask.current = next
    setVisited((before) => ({ ...before, [next]: true }))
    setTask(next)
  }
  function refresh() {
    list.reload()
    detail.reload()
    history.reload()
    vaultRead.reload()
    settings.reload()
  }
  function select(id: string | null) {
    if (guard.locked) return
    setTask('browse')
    setSelected(id)
    setMounted(null)
    setTarget(null)
    setHistoryQuery({ limit: 10 })
    if (id === null) setNewId(crypto.randomUUID())
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <ArchiveVault
        archive={archive}
        vault={vault}
        locale={locale}
        canRead={canRead}
        canWrite={canWrite}
        canUnlock={canUnlock}
        onVault={setVault}
        onRefresh={() => vaultRead.reload()}
      />
      <ReadState busy={vaultRead.busy} error={vaultRead.error} locale={locale} />
      <Space wrap>
        {canWrite && (
          <Button
            type="primary"
            disabled={guard.locked}
            onClick={() => {
              select(null)
              openTask('material')
            }}
          >
            {l('新建档案材料', 'New archive material')}
          </Button>
        )}
        {canExport && (
          <Button disabled={guard.locked} onClick={() => openTask('export')}>
            {l('按精确版本导出', 'Export an exact version')}
          </Button>
        )}
        {(canRead || canWrite) && (
          <Button disabled={guard.locked} onClick={() => openTask('settings')}>
            {l('档案设置', 'Archive settings')}
          </Button>
        )}
        {canRead && (
          <Button disabled={guard.locked} onClick={() => openTask('recovery')}>
            {l('查询原档案操作', 'Look up an original archive operation')}
          </Button>
        )}
        {task === 'browse' && guard.locked && (
          <Button onClick={() => setTask(previousTask.current)}>
            {l('继续未决档案操作', 'Continue pending archive operation')}
          </Button>
        )}
      </Space>
      {task !== 'browse' && (
        <section aria-label={l('当前档案任务', 'Current archive task')}>
          <h2 ref={taskHeading} tabIndex={-1}>
            {
              {
                material: l('生成或导入档案材料', 'Generate or import archive material'),
                edit: l('编辑档案信息', 'Edit archive information'),
                export: l('导出精确版本', 'Export exact version'),
                settings: l('档案设置', 'Archive settings'),
                recovery: l('查询原档案操作', 'Look up original archive operation'),
              }[task]
            }
          </h2>
          <Button onClick={() => setTask('browse')}>
            {l('返回档案目录', 'Return to archive directory')}
          </Button>
        </section>
      )}

      {canRead && (
        <Card
          className="certificate-directory"
          title={l('证书档案目录', 'Certificate archive directory')}
          extra={
            <Space wrap>
              <Button onClick={list.reload}>{l('读取目录', 'Read directory')}</Button>
            </Space>
          }
        >
          <DirectoryControls
            catalog="certificates"
            locale={locale}
            query={query}
            onChange={({ fields, ...next }) =>
              setQuery({
                ...next,
                ...(fields ? { fields: fields as readonly (keyof Entry)[] } : {}),
              })
            }
            fields={['id', 'revision', 'retired', 'recommendedVersion', 'latest']}
            sort={['id', 'revision', 'retired', 'recommendedVersion']}
            maximum={200}
          />
          <ReadState
            busy={list.busy}
            error={list.error}
            empty={list.value?.items.length === 0}
            locale={locale}
          />
          {list.value && (
            <>
              <p className="subtitle">
                {l('目录观察时间', 'Directory observed at')} · {timestamp(locale, list.value.asOf)}{' '}
                · {l('已过期 / 即将到期 / 尚未生效', 'Expired / expiring / not yet valid')}{' '}
                {list.value.alerts.expired} / {list.value.alerts.expiring} /{' '}
                {list.value.alerts.notYetValid}
              </p>
              <DataTable
                locale={locale}
                dataSource={list.value.items}
                rowKey="id"
                columns={[
                  {
                    title: l('名称', 'Name'),
                    render: (_, row) => (
                      <Button type="link" disabled={guard.locked} onClick={() => select(row.id)}>
                        {row.latest?.metadata.name ?? row.id}
                      </Button>
                    ),
                  },
                  {
                    title: l('分类', 'Category'),
                    render: (_, row) => row.latest?.metadata.category ?? '—',
                  },
                  {
                    title: l('条目 / 最近材料版本', 'Entry / latest material revision'),
                    render: (_, row) => `${row.revision ?? '—'} / ${row.latest?.version ?? '—'}`,
                  },
                  {
                    title: l('档案状态', 'Archive state'),
                    render: (_, row) =>
                      row.retired === undefined
                        ? '—'
                        : row.retired
                          ? l('已退休', 'Retired')
                          : l('可用', 'Available'),
                  },
                  {
                    title: l('证书有效性', 'Certificate validity'),
                    render: (_, row) =>
                      row.latest ? (
                        <Status
                          locale={locale}
                          value={validity(
                            row.latest.facts,
                            list.value!.asOf,
                            list.value!.reminderDays,
                          )}
                        />
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
              {list.value.nextCursor && (
                <Button onClick={() => setQuery({ ...query, cursor: list.value!.nextCursor! })}>
                  {l('下一页档案', 'Next archive page')}
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
                  {l('返回第一页', 'Return to first page')}
                </Button>
              )}
            </>
          )}
        </Card>
      )}
      {!canRead && (
        <Alert
          type="info"
          title={l(
            '当前没有档案目录读取权限。已授权的解锁、写入或精确版本导出仍由各自权限检查。',
            'Archive directory read permission is unavailable. Unlock, write and exact-version export use their own permissions.',
          )}
        />
      )}
      {selected && (
        <>
          <ReadState busy={detail.busy} error={detail.error} locale={locale} />
          {current && (
            <SecretPanel active={canRead && !detail.error && !detail.busy}>
              <fieldset
                className="permission-panel"
                hidden={!canRead || !!detail.error || detail.busy}
                disabled={!canRead || !!detail.error || detail.busy}
              >
                <Card title={current.latest.metadata.name}>
                  <dl className="device-facts">
                    <div>
                      <dt>{l('条目 UUID', 'Entry UUID')}</dt>
                      <dd>{current.id}</dd>
                    </div>
                    <div>
                      <dt>{l('详情写入基线', 'Detail write revision')}</dt>
                      <dd>{current.revision}</dd>
                    </div>
                    <div>
                      <dt>{l('最近 / 推荐材料版本', 'Latest / recommended material version')}</dt>
                      <dd>
                        {current.latest.version} / {current.recommendedVersion ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>{l('当前档案状态', 'Current archive state')}</dt>
                      <dd>{current.retired ? l('已退休', 'Retired') : l('可用', 'Available')}</dd>
                    </div>
                    <div>
                      <dt>{l('材料创建主体', 'Material author')}</dt>
                      <dd>{current.latest.actor}</dd>
                    </div>
                    <div>
                      <dt>{l('创建时间', 'Created')}</dt>
                      <dd>{timestamp(locale, current.latest.createdAt)}</dd>
                    </div>
                  </dl>
                  <Space wrap>
                    <Button onClick={detail.reload}>
                      {l('重新读取详情版本', 'Read detail revision again')}
                    </Button>
                    {canWrite && (
                      <Button disabled={guard.locked} onClick={() => openTask('edit')}>
                        {l('编辑档案信息', 'Edit archive information')}
                      </Button>
                    )}
                    {canWrite && (
                      <Button disabled={guard.locked} onClick={() => openTask('material')}>
                        {l('新增材料版本', 'Add material version')}
                      </Button>
                    )}
                  </Space>
                  <DataTable
                    locale={locale}
                    dataSource={current.latest.facts}
                    rowKey="name"
                    columns={[
                      { title: l('材料', 'Material'), dataIndex: 'name' },
                      { title: l('格式', 'Format'), dataIndex: 'format' },
                      {
                        title: l('含私钥', 'Contains private key'),
                        render: (_, row) =>
                          row.containsPrivateKey ? l('是', 'Yes') : l('否', 'No'),
                      },
                      {
                        title: l('证书事实', 'Certificate facts'),
                        render: (_, row) =>
                          row.certificates.map((certificate) => (
                            <dl key={certificate.fingerprint} className="device-facts">
                              <div>
                                <dt>Subject</dt>
                                <dd>{certificate.subject}</dd>
                              </div>
                              <div>
                                <dt>Issuer</dt>
                                <dd>{certificate.issuer}</dd>
                              </div>
                              <div>
                                <dt>{l('指纹', 'Fingerprint')}</dt>
                                <dd>{certificate.fingerprint}</dd>
                              </div>
                              <div>
                                <dt>{l('有效期', 'Validity')}</dt>
                                <dd>
                                  {timestamp(locale, certificate.notBefore)} —{' '}
                                  {timestamp(locale, certificate.notAfter)}
                                </dd>
                              </div>
                              <div>
                                <dt>SAN</dt>
                                <dd>{certificate.sans.join(', ')}</dd>
                              </div>
                            </dl>
                          )),
                      },
                    ]}
                  />
                </Card>
                {visited.edit && (
                  <SecretPanel active={task === 'edit' && canWrite}>
                    <fieldset
                      className="permission-panel"
                      ref={(node) => {
                        if (node) taskPanels.current.edit = node
                      }}
                      hidden={task !== 'edit' || !canWrite}
                      disabled={task !== 'edit' || !canWrite}
                    >
                      <ArchiveEntryEdit
                        key={`${current.id}/${current.revision}`}
                        archive={archive}
                        entry={current}
                        locale={locale}
                        canRead={canRead}
                        canWrite={canWrite}
                        unlocked={unlocked}
                        categories={settings.value?.value.categories ?? []}
                        onRefresh={refresh}
                      />
                    </fieldset>
                  </SecretPanel>
                )}
                <Card title={l('精确版本历史', 'Exact version history')}>
                  <ReadState busy={history.busy} error={history.error} locale={locale} />
                  {history.value && (
                    <>
                      <DataTable
                        locale={locale}
                        dataSource={history.value.items}
                        rowKey={(row) => `${row.entryId}/${row.version}`}
                        columns={[
                          { title: l('材料版本', 'Material version'), dataIndex: 'version' },
                          { title: l('名称', 'Name'), render: (_, row) => row.metadata.name },
                          {
                            title: l('来源 / 主体', 'Source / actor'),
                            render: (_, row) => `${row.source} · ${row.actor}`,
                          },
                          {
                            title: l('创建时间', 'Created'),
                            render: (_, row) => timestamp(locale, row.createdAt),
                          },
                          {
                            title: l('操作', 'Actions'),
                            render: (_, row) => (
                              <Button
                                disabled={guard.locked}
                                onClick={() => {
                                  setTarget({ entryId: row.entryId, version: row.version })
                                  openTask('export')
                                }}
                              >
                                {l('选择此精确版本导出', 'Select this exact version for export')}
                              </Button>
                            ),
                          },
                        ]}
                      />
                      {history.value.nextCursor && (
                        <Button
                          onClick={() =>
                            setHistoryQuery({ ...historyQuery, cursor: history.value!.nextCursor! })
                          }
                        >
                          {l('更早版本', 'Earlier versions')}
                        </Button>
                      )}
                      {historyQuery.cursor && (
                        <Button onClick={() => setHistoryQuery({ limit: 10 })}>
                          {l('最新版本页', 'Newest version page')}
                        </Button>
                      )}
                    </>
                  )}
                </Card>
              </fieldset>
            </SecretPanel>
          )}
        </>
      )}
      {visited.material && (!selected || current) && (
        <SecretPanel
          active={
            canWrite &&
            task === 'material' &&
            (!selected || (canRead && !detail.error && !detail.busy))
          }
        >
          <fieldset
            className="permission-panel"
            ref={(node) => {
              if (node) taskPanels.current.material = node
            }}
            hidden={
              !canWrite ||
              task !== 'material' ||
              (!!selected && (!canRead || !!detail.error || detail.busy))
            }
            disabled={
              !canWrite ||
              task !== 'material' ||
              (!!selected && (!canRead || !!detail.error || detail.busy))
            }
          >
            <ArchiveMaterialAuthor
              key={current ? `${current.id}/${current.revision}` : newId}
              archive={archive}
              entry={current}
              entryId={current?.id ?? newId}
              locale={locale}
              canRead={canRead}
              canWrite={canWrite}
              unlocked={unlocked}
              categories={settings.value?.value.categories ?? []}
              onRefresh={refresh}
            />
          </fieldset>
        </SecretPanel>
      )}
      {visited.export && (
        <SecretPanel active={task === 'export' && canExport}>
          <fieldset
            className="permission-panel"
            ref={(node) => {
              if (node) taskPanels.current.export = node
            }}
            hidden={task !== 'export' || !canExport}
            disabled={task !== 'export' || !canExport}
          >
            <ArchiveExport
              archive={archive}
              target={exportTarget}
              locale={locale}
              canRead={canRead}
              canExport={canExport && canUnlock}
              unlocked={unlocked}
            />
          </fieldset>
        </SecretPanel>
      )}
      {visited.settings && (
        <SecretPanel active={task === 'settings'}>
          <fieldset
            className="permission-panel"
            ref={(node) => {
              if (node) taskPanels.current.settings = node
            }}
            hidden={task !== 'settings'}
            disabled={task !== 'settings'}
          >
            <ArchiveSettings
              archive={archive}
              locale={locale}
              canRead={canRead}
              canWrite={canWrite}
            />
          </fieldset>
        </SecretPanel>
      )}
      {visited.recovery && canRead && (
        <fieldset
          className="permission-panel"
          hidden={task !== 'recovery'}
          disabled={task !== 'recovery'}
        >
          <ArchiveLookup archive={archive} locale={locale} />
        </fieldset>
      )}
    </SelectionGuard.Provider>
  )
}
function ArchiveEntryEdit({
  archive,
  entry,
  locale,
  canRead,
  canWrite,
  unlocked,
  categories,
  onRefresh,
}: {
  archive: Archive
  entry: Entry
  locale: Locale
  canRead: boolean
  canWrite: boolean
  unlocked: boolean
  categories: readonly string[]
  onRefresh: () => void
}) {
  const formPrefix = useId()

  const l = labels(locale),
    metadataCommand = useArchiveCommand(archive),
    manageCommand = useArchiveCommand(archive),
    [metadata, setMetadata] = useState(() => structuredClone(entry.latest.metadata)),
    [form] = Form.useForm<{ retired: boolean; recommendedVersion: number | null }>()
  return (
    <div className="device-detail-grid">
      <Card title={l('编辑证书元数据', 'Edit certificate metadata')}>
        <Form
          name={formPrefix + '-0'}
          layout="vertical"
          disabled={!canWrite || !unlocked || metadataCommand.busy || !!metadataCommand.pending}
          onFinish={() =>
            void metadataCommand.submit({
              kind: 'metadata',
              input: {
                operationId: crypto.randomUUID(),
                entryId: entry.id,
                expectedRevision: entry.revision,
                metadata,
              },
            })
          }
        >
          <ArchiveMetadata
            value={metadata}
            onChange={setMetadata}
            locale={locale}
            categories={categories}
          />
          <Button
            type="primary"
            htmlType="submit"
            disabled={!canWrite || !unlocked || metadataCommand.busy || !!metadataCommand.pending}
          >
            {l('保存为新材料版本', 'Save as a new material version')}
          </Button>
        </Form>
        <ArchiveCommandState
          command={metadataCommand}
          locale={locale}
          canRead={canRead}
          canWrite={canWrite && unlocked}
          onResolved={onRefresh}
        />
      </Card>
      <Card title={l('条目生命周期与推荐版本', 'Entry lifecycle and recommendation')}>
        <Form
          name={formPrefix + '-1'}
          form={form}
          layout="vertical"
          initialValues={{ retired: entry.retired, recommendedVersion: entry.recommendedVersion }}
          disabled={!canWrite || manageCommand.busy || !!manageCommand.pending}
          onFinish={(value) =>
            void manageCommand.submit({
              kind: 'manage',
              input: {
                operationId: crypto.randomUUID(),
                entryId: entry.id,
                expectedRevision: entry.revision,
                retired: value.retired,
                recommendedVersion: value.recommendedVersion ?? null,
              },
            })
          }
        >
          <Form.Item
            name="retired"
            valuePropName="checked"
            label={l('退休此条目', 'Retire this entry')}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="recommendedVersion"
            label={l(
              '推荐的精确材料版本（可清空）',
              'Recommended exact material version (optional)',
            )}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <p className="subtitle">
            {l(
              '仅改变档案条目，不生成材料版本，不撤销证书，也不从设备移除。',
              'Changes the archive entry only. It does not create material, revoke certificates or remove them from devices.',
            )}
          </p>
          <Button
            htmlType="submit"
            disabled={!canWrite || manageCommand.busy || !!manageCommand.pending}
          >
            {l('保存生命周期与推荐版本', 'Save lifecycle and recommendation')}
          </Button>
        </Form>
        <ArchiveCommandState
          command={manageCommand}
          locale={locale}
          canRead={canRead}
          canWrite={canWrite}
          onResolved={onRefresh}
        />
      </Card>
    </div>
  )
}
function ArchiveSettings({
  archive,
  locale,
  canRead,
  canWrite,
}: {
  archive: Archive
  locale: Locale
  canRead: boolean
  canWrite: boolean
}) {
  const formPrefix = useId()

  const l = labels(locale),
    read = useRead(`archive-settings-editor/${canRead}`, () =>
      canRead ? archive.settings() : Promise.resolve(null),
    ),
    command = useArchiveCommand(archive),
    [form] = Form.useForm<{ reminderDays: number; categories: string[] }>()
  useEffect(() => {
    if (read.value && !command.pending)
      form.setFieldsValue({
        reminderDays: read.value.value.reminderDays,
        categories: [...read.value.value.categories],
      })
  }, [read.value, command.pending, form])
  return (
    <Card title={l('档案设置', 'Archive settings')}>
      <ReadState busy={read.busy} error={read.error} locale={locale} />
      {read.value && (
        <Form
          name={formPrefix + '-0'}
          form={form}
          layout="vertical"
          disabled={!canWrite || command.busy || !!command.pending}
          onFinish={(value) =>
            void command.submit({
              kind: 'settings',
              input: {
                operationId: crypto.randomUUID(),
                expectedRevision: read.value!.revision,
                value: { reminderDays: value.reminderDays, categories: value.categories },
              },
            })
          }
        >
          <Form.Item
            name="reminderDays"
            label={l('到期提醒天数', 'Expiry reminder days')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={3650} precision={0} />
          </Form.Item>
          <Form.Item name="categories" label={l('分类建议', 'Suggested categories')}>
            <Select mode="tags" />
          </Form.Item>
          <Button htmlType="submit" disabled={!canWrite || command.busy || !!command.pending}>
            {l('保存档案设置', 'Save archive settings')}
          </Button>
        </Form>
      )}
      <Button onClick={read.reload} disabled={!canRead}>
        {l('读取设置版本', 'Read settings revision')}
      </Button>
      <ArchiveCommandState
        command={command}
        locale={locale}
        canRead={canRead}
        canWrite={canWrite}
        onResolved={read.reload}
      />
    </Card>
  )
}
function ArchiveLookup({ archive, locale }: { archive: Archive; locale: Locale }) {
  const formPrefix = useId()

  const l = labels(locale),
    action = useAction(),
    [form] = Form.useForm<OriginalOperation>(),
    [result, setResult] = useState<string | null>(null)
  return (
    <Card title={l('读取已有档案操作', 'Read an existing archive operation')}>
      <p className="subtitle">
        {l(
          '输入原操作的精确动作、资源和版本。服务端还会核对原租户、主体与实例；回执不会包含秘密文件。',
          'Supply the original action, resource and version. The server also verifies tenant, principal and instance; receipts never contain secret files.',
        )}
      </p>
      <Form
        name={formPrefix + '-0'}
        form={form}
        layout="vertical"
        initialValues={{ action: 'export' }}
        onFinish={(value) =>
          void action.run(async () => {
            const entryAction = ['generate', 'import', 'metadata', 'manage', 'export'].includes(
                value.action,
              ),
              writeRevision = ['generate', 'import', 'metadata', 'manage', 'settings'].includes(
                value.action,
              ),
              versionAction = ['generate', 'import', 'metadata', 'export'].includes(value.action),
              receipt = await archive.operation({
                operationId: value.operationId,
                action: value.action,
                entryId: entryAction ? value.entryId : null,
                version: versionAction ? value.version : null,
                expectedRevision: writeRevision ? value.expectedRevision : null,
              })
            setResult(
              `${receipt.operationId} · ${receipt.action} · ${receipt.entryId ?? '—'} · ${receipt.version ?? '—'} / ${receipt.revision}`,
            )
          })
        }
      >
        <div className="admin-form-grid">
          <Form.Item
            name="operationId"
            label={l('原操作 UUID', 'Original operation UUID')}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="action" label={l('原动作', 'Original action')}>
            <Select options={actions.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item
            name="entryId"
            label={l('原条目 UUID（适用时）', 'Original entry UUID (when applicable)')}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="version"
            label={l('原材料版本（适用时）', 'Original material version (when applicable)')}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="expectedRevision"
            label={l(
              '原请求 expected revision（适用时）',
              'Original expected revision (when applicable)',
            )}
          >
            <InputNumber min={0} precision={0} />
          </Form.Item>
        </div>
        <Button htmlType="submit" disabled={action.busy}>
          {l('核对原操作回执', 'Verify original operation receipt')}
        </Button>
      </Form>
      <Failure error={action.error} locale={locale} kind="read" />
      {result && <p className="mono">{result}</p>}
    </Card>
  )
}
