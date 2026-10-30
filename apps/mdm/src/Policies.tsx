import { useState } from 'react'
import { Button, Space, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import type { Policy, PolicyRow } from '@rss/mdm-policies'
import type { Runtime } from './runtime'
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
  type Query,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SecretTabs } from './SecretTabs'
import { DataTable } from './DataTable'
import { PolicyEditor } from './PolicyEditor'
import { PolicyAssignments, PolicyRollout, PolicyRuns } from './PolicyProgress'
import { PolicyEvents } from './PolicyEvents'
import { policyActionLabel } from './PolicyActionEditor'

const fields = [
  'id',
  'revision',
  'version',
  'versionId',
  'state',
  'action',
  'scope',
  'alias',
  'customEvent',
  'toolName',
  'resource',
  'category',
] as const satisfies readonly (keyof PolicyRow)[]
export function Policies({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { policies, policyEvents, scopes, resources, devices, authorization, binding } =
      useAdministration(runtime),
    permissions = useRead(`${binding}/policies-entry`, authorization.effective),
    has = (name: string, allDevices = false) =>
      permissions.value?.grants.some(
        (grant) =>
          grant.operation === name &&
          (grant.scope.kind === 'tenant' || (allDevices && grant.scope.kind === 'all_devices')),
      ) ?? false,
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [params, setParams] = useSearchParams(),
    action = useAction(),
    guard = useSelectionGuard(),
    read = useRead(
      `${binding}/policy-directory/${JSON.stringify(query)}/${has('policy_read')}`,
      () =>
        has('policy_read') ? policies.list(directoryQuery(query, fields)) : Promise.resolve(null),
    ),
    [selected, setSelected] = useState<{
      id: string
      baseline: Policy | null
      generation: number
    } | null>(null),
    [generation, setGeneration] = useState(0)
  usePendingSelection(action.busy || guard.locked)
  async function open(id: string) {
    const result = await action.run(() => policies.read(id))
    if (result.ok) {
      setGeneration((value) => value + 1)
      setSelected({ id, baseline: result.value, generation: generation + 1 })
      setParams({ policy: id })
    }
  }
  function close() {
    setSelected(null)
    setParams({})
    setQuery(firstPage(query))
    read.reload()
  }
  const canRead = has('policy_read'),
    canInventory = has('inventory_read', true),
    canOperations = has('operation_read', true)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Heading
        title={l('策略与部署', 'Policies and deployments')}
        hint={l(
          '定义期望状态，选择精确资源与范围，分别跟踪分配、事件与执行事实。',
          'Define desired state and exact resource/scope bindings, then track assignment, event and execution facts separately.',
        )}
        actions={
          <Space>
            <Link to="/scopes">{l('管理策略范围', 'Manage policy scopes')}</Link>
            {has('policy_write') && (
              <Button
                type="primary"
                disabled={action.busy || guard.locked}
                onClick={() => {
                  setGeneration((value) => value + 1)
                  const id = crypto.randomUUID()
                  setSelected({ id, baseline: null, generation: generation + 1 })
                  setParams({
                    ...(params.get('scope') ? { scope: params.get('scope')! } : {}),
                    policy: id,
                  })
                }}
              >
                {l('新建部署', 'New deployment')}
              </Button>
            )}
          </Space>
        }
      />
      <Button onClick={permissions.reload}>
        {l('读取策略入口权限', 'Read policy entry permissions')}
      </Button>
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <Failure locale={locale} error={action.error} />
      <fieldset className="permission-panel" disabled={action.busy || guard.locked}>
        {canRead && (
          <>
            <DirectoryControls
              locale={locale}
              query={query}
              onChange={setQuery}
              fields={fields}
              sort={['id', 'revision', 'version', 'state', 'action', 'scope']}
            />
            <Button onClick={read.reload}>{l('读取策略目录', 'Read policy directory')}</Button>
            {params.get('policy') && !selected && (
              <Button onClick={() => void open(params.get('policy')!)}>
                {l('打开定位策略', 'Open linked policy')}
              </Button>
            )}
            <ReadState
              locale={locale}
              busy={read.busy}
              error={read.error}
              empty={read.value?.items.length === 0}
            />
            {read.value && (
              <>
                <DataTable
                  locale={locale}
                  rowKey="id"
                  dataSource={read.value.items}
                  columns={[
                    {
                      title: l('策略', 'Policy'),
                      render: (_, row) => (
                        <Button type="link" onClick={() => void open(row.id)}>
                          {row.alias ?? row.toolName ?? row.id}
                        </Button>
                      ),
                    },
                    {
                      title: l('类型', 'Action'),
                      render: (_, row) =>
                        row.action ? policyActionLabel(row.action, locale) : '—',
                    },
                    {
                      title: l('范围', 'Scope'),
                      render: (_, row) =>
                        row.scope ? (
                          <Link to={`/scopes?scope=${encodeURIComponent(row.scope)}`}>
                            {row.scope}
                          </Link>
                        ) : (
                          '—'
                        ),
                    },
                    {
                      title: l('状态', 'State'),
                      render: (_, row) => (
                        <Tag>
                          {row.state === 'enabled'
                            ? l('已启用', 'Enabled')
                            : row.state === 'disabled'
                              ? l('已停用', 'Disabled')
                              : row.state === 'archived'
                                ? l('已归档', 'Archived')
                                : '—'}
                        </Tag>
                      ),
                    },
                    {
                      title: l('配置 / 执行版本', 'Configuration / execution version'),
                      render: (_, row) => `${row.revision ?? '—'} / ${row.version ?? '—'}`,
                    },
                    { title: l('共享事件', 'Shared event'), dataIndex: 'customEvent' },
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
          </>
        )}
      </fieldset>
      {selected && (
        <SecretTabs
          key={selected.generation}
          uiLocale={locale}
          authorizedKeys={[
            ...(canRead || has('policy_write') ? ['definition'] : []),
            ...(canRead && canInventory && selected.baseline ? ['assignments'] : []),
            ...(canRead && canOperations && selected.baseline
              ? [
                  'runs',
                  ...(selected.baseline.definition.action.kind === 'software' ? ['rollout'] : []),
                ]
              : []),
            ...(canRead ? ['events'] : []),
          ]}
          items={[
            {
              key: 'definition',
              label: l('定义与发布', 'Definition and publication'),
              children: (
                <PolicyEditor
                  policies={policies}
                  scopes={scopes}
                  resources={resources}
                  {...selected}
                  initialScope={params.get('scope') ?? ''}
                  runtime={runtime}
                  instance={permissions.value?.instanceId ?? ''}
                  locale={locale}
                  canWrite={has('policy_write')}
                  canRerun={has('policy_write')}
                  done={close}
                />
              ),
            },
            ...(selected.baseline
              ? [
                  {
                    key: 'assignments',
                    label: l('设备分配', 'Device assignments'),
                    children: (
                      <PolicyAssignments
                        policies={policies}
                        policy={selected.baseline}
                        locale={locale}
                      />
                    ),
                  },
                  {
                    key: 'runs',
                    label: l('执行事实', 'Execution facts'),
                    children: (
                      <PolicyRuns policies={policies} policy={selected.baseline} locale={locale} />
                    ),
                  },
                  ...(selected.baseline.definition.action.kind === 'software'
                    ? [
                        {
                          key: 'rollout',
                          label: l('灰度进度', 'Rollout progress'),
                          children: (
                            <PolicyRollout
                              policies={policies}
                              policy={selected.baseline}
                              locale={locale}
                            />
                          ),
                        },
                      ]
                    : []),
                ]
              : []),
            {
              key: 'events',
              label: l('独立事件', 'Independent events'),
              children: (
                <PolicyEvents
                  events={policyEvents}
                  devices={devices}
                  event={selected.baseline?.definition.customEvent ?? null}
                  locale={locale}
                  canSubmit={canRead}
                />
              ),
            },
          ]}
        />
      )}
    </SelectionGuard.Provider>
  )
}
