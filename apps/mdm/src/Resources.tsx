import { useState } from 'react'
import { Button, Card, Empty, Form, Input, Select, Space, Tag } from 'antd'
import {
  resourceKinds,
  type Resource,
  type ResourceKind,
  type ResourceRow,
} from '@rss/mdm-resources'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
  validateInput,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { ResourceDetail } from './ResourceDetail'
import { resourceKindName, resourceName } from './ResourcePresentation'
import type { ContentUseCases } from './ContentUpload'
import { ResourceCommandState, useResourceCommand, type ResourcesUseCases } from './ResourceCommand'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SecretTabs } from './SecretTabs'
import { useAdministration } from './useAdministration'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { ResourceContentRecovery } from './ResourceContent'
import { ResourceBlueprints } from './ResourceBlueprints'

const fields = [
  'id',
  'kind',
  'revision',
  'activeVersion',
  'presentation',
] as const satisfies readonly (keyof ResourceRow)[]
function ResourceCreate({
  resources,
  locale,
  canWrite,
}: {
  resources: ResourcesUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    command = useResourceCommand(resources),
    [id, setId] = useState(''),
    [kind, setKind] = useState<ResourceKind>('script')
  return (
    <Card title={l('新建资源', 'New resource')}>
      <Form
        layout="vertical"
        disabled={!canWrite || command.pending !== null || command.action.busy}
        onFinish={() => void command.submit(id, 0, { action: 'create', kind })}
      >
        <div className="admin-form-grid">
          <Form.Item label={l('资源标识', 'Resource ID')}>
            <Input
              aria-label={l('资源标识', 'Resource ID')}
              value={id}
              onChange={(event) => setId(event.target.value)}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item label={l('资源类型', 'Resource kind')}>
            <Select
              aria-label={l('资源类型', 'Resource kind')}
              value={kind}
              options={resourceKinds.map((value) => ({
                value,
                label: resourceKindName(value, locale),
              }))}
              onChange={setKind}
            />
          </Form.Item>
        </div>
        <Button
          htmlType="submit"
          type="primary"
          disabled={!id || !canWrite || command.pending !== null || command.action.busy}
        >
          {l('创建资源', 'Create resource')}
        </Button>
      </Form>
      <ResourceCommandState command={command} canWrite={canWrite} locale={locale} />
    </Card>
  )
}
/** The software view uses this same kind-filtered Resource catalog; details are read only when opened. */
export function ResourceDirectory({
  resources,
  content,
  locale,
  canWrite,
  fixedKind,
  canReadSoftware,
}: {
  resources: ResourcesUseCases
  content: ContentUseCases
  locale: Locale
  canWrite: boolean
  fixedKind?: ResourceKind
  canReadSoftware: boolean
}) {
  const l = labels(locale),
    guard = useSelectionGuard(),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [kind, setKind] = useState<ResourceKind | undefined>(fixedKind),
    [lookup, setLookup] = useState(''),
    [localFilter, setLocalFilter] = useState(''),
    [selected, setSelected] = useState<Resource | null>(null),
    read = useRead(`resources/${kind ?? 'all'}/${JSON.stringify(query)}`, () =>
      resources.list(directoryQuery(query, fields), fixedKind ?? kind),
    )
  const softwareRows = (read.value?.items ?? []).filter((row) =>
      `${resourceName(row)} ${typeof row.presentation?.category === 'string' ? row.presentation.category : ''} ${row.id}`
        .toLocaleLowerCase(locale)
        .includes(localFilter.toLocaleLowerCase(locale)),
    ),
    controls = (
      <DirectoryControls
        disabled={guard.locked || action.busy}
        locale={locale}
        query={query}
        onChange={setQuery}
        fields={fields}
        sort={['id', 'kind', 'revision']}
      />
    )
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string) {
    const response = await action.run(async () => {
      const resource = await resources.read(id)
      validateInput(() => {
        if (fixedKind !== undefined && resource.kind !== fixedKind)
          throw new Error('Wrong resource kind')
      })
      return resource
    })
    if (response.ok) setSelected(response.value)
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card
        title={
          fixedKind === 'software'
            ? l('组织软件', 'Organization software')
            : l('资源目录', 'Resource catalog')
        }
      >
        <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
          <div className="resource-toolbar">
            {!fixedKind && (
              <label>
                {l('资源类型', 'Resource kind')}
                <Select
                  aria-label={l('目录资源类型', 'Catalog resource kind')}
                  disabled={guard.locked || action.busy}
                  allowClear
                  value={kind}
                  options={resourceKinds.map((value) => ({
                    value,
                    label: resourceKindName(value, locale),
                  }))}
                  onChange={(value) => {
                    setKind(value)
                    setQuery({ limit: query.limit ?? 20 })
                  }}
                />
              </label>
            )}
            {fixedKind === 'software' ? (
              <>
                <label className="software-page-filter">
                  {l('本页软件筛选', 'Filter software on this page')}
                  <Input
                    aria-label={l('本页软件筛选', 'Filter software on this page')}
                    placeholder={l('名称、分类或资源标识', 'Name, category or Resource ID')}
                    value={localFilter}
                    allowClear
                    disabled={guard.locked || action.busy}
                    onChange={(event) => setLocalFilter(event.target.value)}
                  />
                </label>
                <details>
                  <summary>{l('高级目录筛选', 'Advanced catalog filters')}</summary>
                  {controls}
                </details>
              </>
            ) : (
              controls
            )}
            <Button onClick={read.reload}>{l('读取资源目录', 'Read resource catalog')}</Button>
          </div>
          <ReadState
            locale={locale}
            busy={read.busy}
            error={read.error}
            empty={read.value?.items.length === 0}
          />
          {read.value && (
            <>
              {fixedKind === 'software' && localFilter && (
                <p className="subtitle">
                  {l('本页匹配', 'Matches on this page')} {softwareRows.length} /{' '}
                  {read.value.items.length}
                </p>
              )}
              {fixedKind === 'software' &&
                read.value.items.length > 0 &&
                softwareRows.length === 0 && (
                  <Empty
                    description={l('本页没有匹配的软件', 'No matching software on this page')}
                  />
                )}
              {fixedKind === 'software' ? (
                <div className="software-grid">
                  {softwareRows.map((row) => (
                    <article className="software-card" key={row.id}>
                      <div className="resource-card-top">
                        <span className="software-icon" aria-hidden="true">
                          {resourceName(row).slice(0, 1).toUpperCase()}
                        </span>
                        <Tag>{l('软件资源', 'Software resource')}</Tag>
                      </div>
                      <h3>{resourceName(row)}</h3>
                      <p className="software-description">
                        {typeof row.presentation?.category === 'string'
                          ? row.presentation.category
                          : row.id}
                      </p>
                      <div className="software-facts">
                        <span>{l('资源激活版本', 'Active resource version')}</span>
                        <strong>{row.activeVersion ?? '—'}</strong>
                      </div>
                      <Button block onClick={() => void open(row.id)}>
                        {l('查看版本与材料', 'View versions and materials')}
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <DataTable
                  locale={locale}
                  rowKey="id"
                  dataSource={read.value.items}
                  columns={[
                    {
                      title: l('资源', 'Resource'),
                      render: (_, row) => (
                        <Button type="link" onClick={() => void open(row.id)}>
                          {resourceName(row)}
                        </Button>
                      ),
                    },
                    {
                      title: l('类型', 'Kind'),
                      render: (_, row) => (row.kind ? resourceKindName(row.kind, locale) : '—'),
                    },
                    {
                      title: l('资源激活版本', 'Active resource version'),
                      dataIndex: 'activeVersion',
                    },
                    { title: l('存储版本', 'Storage revision'), dataIndex: 'revision' },
                  ]}
                />
              )}
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={setQuery}
              />
            </>
          )}
          <Form
            layout="inline"
            disabled={guard.locked || action.busy}
            onFinish={() => void open(lookup)}
          >
            <Form.Item label={l('精确资源标识', 'Exact resource ID')}>
              <Input
                aria-label={l('精确资源标识', 'Exact resource ID')}
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
              />
            </Form.Item>
            <Button htmlType="submit" disabled={!lookup}>
              {l('读取精确资源', 'Read exact resource')}
            </Button>
          </Form>
        </fieldset>
        <Failure error={action.error} locale={locale} kind="read" />
      </Card>
      {selected && (
        <>
          <Space wrap>
            <Button disabled={guard.locked || action.busy} onClick={() => void open(selected.id)}>
              {l('重新读取选定资源', 'Read selected resource again')}
            </Button>
            <Button disabled={guard.locked || action.busy} onClick={() => setSelected(null)}>
              {l('关闭资源详情', 'Close resource detail')}
            </Button>
          </Space>
          <ResourceDetail
            key={`${selected.id}/${selected.revision}`}
            resources={resources}
            content={content}
            canReadSoftware={canReadSoftware}
            resource={selected}
            locale={locale}
            canWrite={canWrite}
            blocked={guard.locked}
          />
        </>
      )}
    </SelectionGuard.Provider>
  )
}
export function Resources({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { resources, content, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/resources-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    canRead = has('resource_read'),
    canWrite = has('resource_write')
  return (
    <>
      <Heading
        title={l('资源库', 'Resources')}
        hint={l(
          '管理精确版本、平台变体和内容材料。',
          'Manage exact versions, platform variants and content materials.',
        )}
      />
      <Button onClick={permissions.reload}>
        {l('读取资源入口权限', 'Read resource entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          ...(canRead ? ['catalog', 'blueprints', 'content'] : []),
          ...(canWrite ? ['create'] : []),
        ]}
        items={[
          {
            key: 'catalog',
            label: l('资源目录', 'Resource catalog'),
            children: (
              <ResourceDirectory
                resources={resources}
                content={content}
                canReadSoftware={has('software_read')}
                locale={locale}
                canWrite={canWrite}
              />
            ),
          },
          {
            key: 'blueprints',
            label: 'Blueprints',
            children: (
              <ResourceBlueprints resources={resources} locale={locale} canWrite={canWrite} />
            ),
          },
          {
            key: 'content',
            label: l('材料恢复', 'Material recovery'),
            children: (
              <ResourceContentRecovery
                resources={resources}
                content={content}
                locale={locale}
                canWrite={canWrite}
              />
            ),
          },
          {
            key: 'create',
            label: l('新建资源', 'New resource'),
            children: <ResourceCreate resources={resources} locale={locale} canWrite={canWrite} />,
          },
        ]}
      />
    </>
  )
}
