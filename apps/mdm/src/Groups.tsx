import { useDirectoryQuery } from './directory-location'
import { useState } from 'react'
import { Button, Card, Tag } from 'antd'
import type { Group, GroupRead } from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { DevicesUseCases } from './EndpointPicker'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  firstPage,
  Heading,
  labels,
  ReadState,
  useAction,
  useRead,
} from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { GroupEditor } from './GroupEditor'
import { SecretTabs } from './SecretTabs'
import { useAdministration } from './useAdministration'
import type { Runtime } from './runtime'

const fields = [
  'id',
  'kind',
  'systemSelector',
  'assetContext',
  'presentation',
  'revision',
  'calculationRevision',
  'memberVersion',
  'memberCount',
  'ruleVersion',
  'deleted',
] as const satisfies readonly (keyof Group)[]
export function Groups({
  groups,
  devices,
  locale,
  canWrite,
  canPreview,
  canRecompute,
}: {
  groups: GroupsUseCases
  devices: DevicesUseCases
  locale: Locale
  canWrite: boolean
  canPreview: boolean
  canRecompute: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useDirectoryQuery('groups.'),
    read = useRead(`groups/${JSON.stringify(query)}`, () =>
      groups.list(directoryQuery(query, fields)),
    ),
    [selected, setSelected] = useState<{
      id: string
      baseline: GroupRead | null
      key: number
    } | null>(null),
    [generation, setGeneration] = useState(0)
  usePendingSelection(guard.locked || action.busy)
  async function open(id: string) {
    const result = await action.run(() => groups.read(id))
    if (result.ok) {
      setGeneration((v) => v + 1)
      setSelected({ id, baseline: result.value, key: generation + 1 })
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Heading
        title={l('设备组', 'Device groups')}
        hint={l(
          '按设备属性与嵌套关系组织管理范围，查看服务端成员与来源事实。',
          'Organize management scope using device properties and nested groups; inspect server membership and source facts.',
        )}
        actions={
          canWrite && (
            <Button
              type="primary"
              disabled={guard.locked || action.busy}
              onClick={() => {
                setGeneration((v) => v + 1)
                setSelected({ id: crypto.randomUUID(), baseline: null, key: generation + 1 })
              }}
            >
              {l('新建设备组', 'New device group')}
            </Button>
          )
        }
      />
      <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
        <DirectoryControls
          catalog="groups"
          locale={locale}
          query={query}
          onChange={setQuery}
          fields={fields}
          sort={[
            'id',
            'kind',
            'assetContext',
            'revision',
            'memberCount',
            'memberVersion',
            'calculationRevision',
          ]}
        />
        <Button onClick={read.reload}>{l('读取设备组目录', 'Read group directory')}</Button>
        <ReadState
          locale={locale}
          busy={read.busy}
          error={read.error}
          empty={read.value?.items.length === 0}
        />
        {read.value && (
          <>
            <div className="asset-group-grid">
              {read.value.items.map((group) => (
                <Card
                  key={group.id}
                  className="asset-group-card"
                  title={
                    typeof group.presentation?.['name'] === 'string'
                      ? group.presentation['name']
                      : group.id
                  }
                  extra={
                    group.kind && (
                      <Tag>
                        {group.kind === 'static'
                          ? l('静态设备组', 'Static group')
                          : group.kind === 'dynamic'
                            ? l('动态设备组', 'Dynamic group')
                            : l('系统设备组', 'System group')}
                      </Tag>
                    )
                  }
                >
                  <p className="asset-group-count">
                    {group.memberCount ?? '—'} <span>{l('个成员', 'members')}</span>
                  </p>
                  <p className="asset-group-description">
                    {typeof group.presentation?.['description'] === 'string'
                      ? group.presentation['description']
                      : '—'}
                  </p>
                  <p className="subtitle">
                    {group.assetContext === 'associated_device'
                      ? l('关联设备', 'Associated device')
                      : group.assetContext === 'endpoint'
                        ? l('独立终端', 'Endpoint')
                        : '—'}{' '}
                    · {l('成员版本', 'Member version')} {group.memberVersion ?? '—'}
                  </p>
                  <Button type="link" onClick={() => void open(group.id)}>
                    {l('查看定义与成员 →', 'View definition and members →')}
                  </Button>
                </Card>
              ))}
            </div>
            <CursorControls
              locale={locale}
              query={query}
              onChange={setQuery}
              next={read.value.nextCursor}
              count={read.value.items.length}
            />
          </>
        )}
        {!!read.error && query.cursor && (
          <Button onClick={() => setQuery(firstPage(query))}>
            {l('设备组游标失效，返回首页', 'Group cursor expired; first page')}
          </Button>
        )}
      </fieldset>
      <Failure locale={locale} error={action.error} />
      {selected && (
        <div className="admin-subsection">
          <div className="admin-table-footer">
            <Button disabled={guard.locked || action.busy} onClick={() => setSelected(null)}>
              {l('关闭设备组详情', 'Close group detail')}
            </Button>
          </div>
          <GroupEditor
            key={selected.key}
            groups={groups}
            devices={devices}
            locale={locale}
            id={selected.id}
            baseline={selected.baseline}
            canWrite={canWrite}
            canPreview={canPreview}
            canRecompute={canRecompute}
            done={() => {
              setSelected(null)
              read.reload()
            }}
          />
        </div>
      )}
    </SelectionGuard.Provider>
  )
}
export function GroupsPage({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { groups, devices, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/groups-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    read = has('group_read')
  return (
    <>
      <Button onClick={permissions.reload}>
        {l('读取设备组入口权限', 'Read device group entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={read || has('group_write') || has('group_recompute') ? ['directory'] : []}
        items={[
          {
            key: 'directory',
            label: l('设备组', 'Device groups'),
            children: (
              <Groups
                groups={groups}
                devices={devices}
                locale={locale}
                canWrite={has('group_write')}
                canPreview={read}
                canRecompute={has('group_recompute')}
              />
            ),
          },
        ]}
      />
    </>
  )
}
