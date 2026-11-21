import { useDirectoryQuery } from './directory-location'
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Group } from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { DevicesUseCases } from './EndpointPicker'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  firstPage,
  Heading,
  labels,
  ReadState,
  useRead,
} from './AdminUi'
import { SelectionGuard, useSelectionGuard } from './SelectionGuard'
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
export function groupDetailPath(id: string, params?: URLSearchParams): string {
  const query = new URLSearchParams(params)
  query.set('group', id)
  return `/groups?${query}`
}
export function groupKindLabel(locale: Locale, kind: Group['kind']): string {
  const l = labels(locale)
  switch (kind) {
    case 'static':
      return l('静态设备组', 'Static group')
    case 'dynamic':
      return l('动态设备组', 'Dynamic group')
    case 'system':
      return l('系统设备组', 'System group')
  }
}
type GroupAccess = {
  groups: GroupsUseCases
  devices: DevicesUseCases
  locale: Locale
  canWrite: boolean
  canPreview: boolean
  canRecompute: boolean
}
function GroupDirectory({ locked, ...editor }: GroupAccess & { locked: boolean }) {
  const { locale, groups, canWrite } = editor
  const l = labels(locale),
    [params] = useSearchParams(),
    [query, setQuery] = useDirectoryQuery('groups.'),
    read = useRead(`groups/${JSON.stringify(query)}`, (signal) =>
      groups.list(directoryQuery(query, fields), signal),
    ),
    [draftId, setDraftId] = useState<string | null>(null)
  function closeDraft() {
    setDraftId(null)
    read.reload()
  }
  return (
    <>
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
              disabled={locked}
              onClick={() => setDraftId(crypto.randomUUID())}
            >
              {l('新建设备组', 'New device group')}
            </Button>
          )
        }
      />
      <fieldset className="permission-panel" disabled={locked}>
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
                  extra={group.kind && <Tag>{groupKindLabel(locale, group.kind)}</Tag>}
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
                  {locked ? (
                    <span aria-disabled="true">
                      {l('查看定义与成员 →', 'View definition and members →')}
                    </span>
                  ) : (
                    <Link to={groupDetailPath(group.id, params)}>
                      {l('查看定义与成员 →', 'View definition and members →')}
                    </Link>
                  )}
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
      {draftId && (
        <div className="admin-subsection">
          <div className="admin-table-footer">
            <Button disabled={locked} onClick={closeDraft}>
              {l('关闭设备组详情', 'Close group detail')}
            </Button>
          </div>
          <GroupEditor {...editor} key={draftId} id={draftId} baseline={null} done={closeDraft} />
        </div>
      )}
    </>
  )
}
function GroupDetail({
  binding,
  id,
  close,
  ...editor
}: GroupAccess & { binding: string; id: string; close: () => void }) {
  const read = useRead(`${binding}/group-detail/${id}`, (signal) => editor.groups.read(id, signal))
  return (
    <>
      <ReadState locale={editor.locale} busy={read.busy} error={read.error} onRetry={read.reload} />
      {read.value && <GroupEditor {...editor} id={id} baseline={read.value} done={close} />}
    </>
  )
}
export function GroupsPage({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    [params, setParams] = useSearchParams(),
    requested = params.get('group'),
    guard = useSelectionGuard(),
    [heldGroup, setHeldGroup] = useState(requested),
    id = guard.locked ? heldGroup : requested,
    { groups, devices, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/groups-presentation`, authorization.effective),
    has = (operation: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === operation,
      ) ?? false,
    access = {
      groups,
      devices,
      locale,
      canWrite: has('group_write'),
      canPreview: has('group_read'),
      canRecompute: has('group_recompute'),
    }
  useEffect(() => {
    if (!guard.locked) {
      setHeldGroup(requested)
    } else if (requested !== heldGroup) {
      // Keep the original write owner through history changes within the group workspace.
      const restored = new URLSearchParams(params)
      if (heldGroup === null) restored.delete('group')
      else restored.set('group', heldGroup)
      setParams(restored, { replace: true })
    }
  }, [guard.locked, requested, heldGroup, params, setParams])
  function close() {
    const next = new URLSearchParams(params)
    next.delete('group')
    setParams(next, { replace: true })
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Button disabled={guard.locked} onClick={permissions.reload}>
        {l('读取设备组入口权限', 'Read device group entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      {id !== null ? (
        <div className="admin-subsection">
          <div className="admin-table-footer">
            <Button disabled={guard.locked} onClick={close}>
              {l('关闭设备组详情', 'Close group detail')}
            </Button>
          </div>
          {access.canPreview ? (
            <GroupDetail {...access} key={id} binding={binding} id={id} close={close} />
          ) : (
            permissions.value && (
              <Alert
                type="error"
                role="alert"
                title={l('当前账户没有设备组读取权限。', 'Your account cannot read device groups.')}
              />
            )
          )}
        </div>
      ) : (
        <SecretTabs
          uiLocale={locale}
          authorizedKeys={
            access.canPreview || access.canWrite || access.canRecompute ? ['directory'] : []
          }
          items={[
            {
              key: 'directory',
              label: l('设备组', 'Device groups'),
              children: <GroupDirectory {...access} locked={guard.locked} />,
            },
          ]}
        />
      )}
    </SelectionGuard.Provider>
  )
}
