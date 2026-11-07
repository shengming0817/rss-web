import { useEffect, useState } from 'react'
import { Alert, Button, Collapse, Modal, Segmented, Space, Tag } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Policy, PolicyRow } from '@rss/mdm-policies'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Heading,
  labels,
  ReadState,
  useRead,
  usePageRead,
  type Query,
} from './AdminUi'
import { useAdministration } from './useAdministration'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { SecretTabs } from './SecretTabs'
import { PolicyEditor } from './PolicyEditor'
import { PolicyAssignments, PolicyRollout, PolicyRuns } from './PolicyProgress'
import { resultReturnPath } from './execution-context'
import { PolicyNames } from './PolicyNames'
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
    [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    pageLimit = Number(params.get('limit') ?? 20),
    query: Query = {
      limit:
        Number.isSafeInteger(pageLimit) && pageLimit >= 1 && pageLimit <= 1000 ? pageLimit : 20,
      ...(params.get('filter') ? { filter: params.get('filter')! } : {}),
      ...(params.get('cursor') ? { cursor: params.get('cursor')! } : {}),
      ...(params.has('sort') ? { sort: params.getAll('sort') } : {}),
      ...(params.has('field') ? { fields: params.getAll('field') } : {}),
    },
    state = ['enabled', 'disabled', 'archived'].includes(params.get('state') ?? '')
      ? params.get('state')!
      : 'all',
    listFilter = [state === 'all' ? '' : `state=='${state}'`, query.filter]
      .filter(Boolean)
      .map((part) => `(${part})`)
      .join(';'),
    guard = useSelectionGuard(),
    read = usePageRead(
      `${binding}/policy-directory/${state}/${JSON.stringify(query)}/${has('policy_read')}`,
      () =>
        has('policy_read')
          ? policies.list(
              directoryQuery(
                {
                  ...query,
                  ...(listFilter ? { filter: listFilter } : {}),
                },
                fields,
              ),
            )
          : Promise.resolve(null),
    ),
    [selected, setSelected] = useState<{ id: string; baseline: Policy | null } | null>(null)
  usePendingSelection(guard.locked)
  const linkedPolicy = params.get('policy'),
    canRead = has('policy_read'),
    canInventory = has('inventory_read', true),
    canOperations = has('operation_read', true),
    returnSource = resultReturnPath(params.get('returnTo')),
    policyTarget =
      params.has('tab') && canRead && !guard.locked && selected?.id !== linkedPolicy
        ? linkedPolicy
        : null,
    detail = usePageRead(
      `${binding}/policy-detail/${policyTarget ?? ''}`,
      (signal) => (policyTarget ? policies.read(policyTarget, signal) : Promise.resolve(null)),
      { retryReadConflict: true },
    ),
    dialogOpen = selected !== null || policyTarget !== null
  useEffect(() => {
    if (!linkedPolicy && !guard.locked) setSelected(null)
  }, [linkedPolicy, guard.locked])
  useEffect(() => {
    if (detail.value && detail.value.id === policyTarget)
      setSelected({ id: policyTarget, baseline: detail.value })
  }, [detail.value, policyTarget])
  function setQuery(next: Query) {
    const value = new URLSearchParams(params)
    for (const key of ['limit', 'filter', 'cursor', 'sort', 'field']) value.delete(key)
    if (next.limit) value.set('limit', String(next.limit))
    if (next.filter) value.set('filter', next.filter)
    if (next.cursor) value.set('cursor', next.cursor)
    next.sort?.forEach((item) => value.append('sort', item))
    next.fields?.forEach((item) => value.append('field', item))
    setParams(value, { replace: true })
  }
  function open(id: string) {
    const next = new URLSearchParams(params)
    next.set('policy', id)
    next.set('tab', 'definition')
    next.delete('assignmentCursor')
    next.delete('runCursor')
    setParams(next, { replace: true })
  }
  function close() {
    if (returnSource) {
      if (new URLSearchParams(returnSource.split('?')[1]).get('policy') === selected?.id)
        setSelected(null)
      navigate(returnSource)
      return
    }
    const next = new URLSearchParams(params)
    for (const key of [
      'policy',
      'tab',
      'assignmentCursor',
      'runCursor',
      'eventDevice',
      'batch',
      'member',
      'batchCursor',
      'memberCursor',
    ])
      next.delete(key)
    setParams(next, { replace: true })
    read.reload()
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <div className="policies-page">
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
                  disabled={guard.locked}
                  onClick={() => {
                    const id = crypto.randomUUID()
                    setSelected({ id, baseline: null })
                    open(id)
                  }}
                >
                  {l('新建部署', 'New deployment')}
                </Button>
              )}
            </Space>
          }
        />
        {Boolean(permissions.error) && (
          <Button onClick={permissions.reload}>{l('重试', 'Retry')}</Button>
        )}
        {permissions.value && !canRead && (
          <Alert
            type="info"
            title={l('当前账户没有策略读取权限。', 'Your account cannot read policies.')}
          />
        )}
        <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
        {!selected &&
          ((!linkedPolicy && params.get('tab') === 'events' && params.get('eventDevice')) ||
            guard.locked) && (
            <PolicyEvents
              events={policyEvents}
              devices={devices}
              runtime={runtime}
              event={null}
              locale={locale}
              canSubmit={canRead}
            />
          )}
        <fieldset className="permission-panel" disabled={guard.locked}>
          {canRead && (
            <>
              <div className="policy-toolbar">
                <Segmented
                  aria-label={l('策略状态', 'Policy state')}
                  value={state}
                  options={[
                    { value: 'all', label: l('全部策略', 'All policies') },
                    { value: 'enabled', label: l('已启用', 'Enabled') },
                    { value: 'disabled', label: l('已停用', 'Disabled') },
                    { value: 'archived', label: l('已归档', 'Archived') },
                  ]}
                  onChange={(value) => {
                    const next = new URLSearchParams(params)
                    next.set('state', value)
                    next.delete('cursor')
                    setParams(next, { replace: true })
                  }}
                />
                <Button onClick={read.reload}>{l('刷新', 'Refresh')}</Button>
              </div>
              <Collapse
                className="policy-query"
                items={[
                  {
                    key: 'query',
                    label: l('筛选与排序', 'Filter and sort'),
                    children: (
                      <DirectoryControls
                        locale={locale}
                        query={query}
                        onChange={setQuery}
                        fields={fields}
                        sort={['id', 'revision', 'version', 'state', 'action', 'scope']}
                      />
                    ),
                  },
                ]}
              />
              {linkedPolicy && !dialogOpen && (
                <Button onClick={() => open(linkedPolicy)}>
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
                  <div className="policy-list">
                    {read.value.items.map((row) => (
                      <article className="policy-card" key={row.id}>
                        <span className="policy-icon" aria-hidden="true">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          >
                            <path d="m12 3 9 5-9 5-9-5 9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5" />
                          </svg>
                        </span>
                        <div className="policy-card-main">
                          <Button type="link" className="policy-title" onClick={() => open(row.id)}>
                            {row.toolName ?? row.id}
                          </Button>
                          <div className="policy-meta">
                            <span>{row.action ? policyActionLabel(row.action, locale) : '—'}</span>
                            {row.scope && (
                              <Link to={`/scopes?scope=${encodeURIComponent(row.scope)}`}>
                                {l('范围', 'Scope')} · {row.scope}
                              </Link>
                            )}
                            {row.alias && (
                              <Tag>
                                {l('唯一别名', 'Unique alias')} · <code>{row.alias}</code>
                              </Tag>
                            )}
                            {row.customEvent && (
                              <span>
                                {l('事件', 'Event')} · {row.customEvent}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="policy-versions">
                          <span>{l('配置 / 执行版本', 'Configuration / execution version')}</span>
                          <strong>
                            {row.revision ?? '—'} / {row.version ?? '—'}
                          </strong>
                        </div>
                        <Tag color={row.state === 'enabled' ? 'success' : 'default'}>
                          {row.state === 'enabled'
                            ? l('已启用', 'Enabled')
                            : row.state === 'disabled'
                              ? l('已停用', 'Disabled')
                              : row.state === 'archived'
                                ? l('已归档', 'Archived')
                                : '—'}
                        </Tag>
                        <Button
                          aria-label={l('查看策略', 'View policy') + ' ' + (row.alias ?? row.id)}
                          onClick={() => open(row.id)}
                        >
                          →
                        </Button>
                      </article>
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
            </>
          )}
        </fieldset>
        <Modal
          rootClassName={`policy-dialog ${dialogOpen ? 'mdm-overlay-open' : ''}`}
          getContainer={false}
          destroyOnHidden
          open={dialogOpen}
          title={
            selected?.baseline === null && selected.id === linkedPolicy
              ? l('新建部署', 'New deployment')
              : l('部署详情', 'Deployment details')
          }
          width={880}
          footer={null}
          closable={!guard.locked}
          keyboard={!guard.locked}
          maskClosable={!guard.locked}
          onCancel={() => {
            if (!guard.locked) close()
          }}
        >
          {returnSource && (
            <Button disabled={guard.locked} onClick={close}>
              {l('返回来源', 'Return to source')}
            </Button>
          )}
          {selected && (guard.locked || selected.id === linkedPolicy) ? (
            <SecretTabs
              key={selected.id}
              uiLocale={locale}
              activeKey={params.get('tab') ?? 'definition'}
              onChange={(tab) => {
                const next = new URLSearchParams(params)
                next.set('tab', tab)
                setParams(next, { replace: true })
              }}
              authorizedKeys={[
                ...(canRead || has('policy_write') ? ['definition'] : []),
                ...(canRead && canInventory && selected.baseline ? ['assignments'] : []),
                ...(canRead && canOperations && selected.baseline
                  ? [
                      'runs',
                      ...(selected.baseline.definition.action.kind === 'software'
                        ? ['rollout']
                        : []),
                    ]
                  : []),
                ...(canRead ? ['events'] : []),
                ...(canRead && selected.baseline ? ['names'] : []),
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
                        key: 'names',
                        label: l('名称与入口', 'Names and entry points'),
                        children: (
                          <PolicyNames
                            key={selected.id}
                            policies={policies}
                            policy={selected.baseline}
                            locale={locale}
                            runtime={runtime}
                          />
                        ),
                      },
                      {
                        key: 'assignments',
                        label: l('设备分配', 'Device assignments'),
                        children: (
                          <PolicyAssignments
                            policies={policies}
                            devices={devices}
                            policy={selected.baseline}
                            locale={locale}
                          />
                        ),
                      },
                      {
                        key: 'runs',
                        label: l('执行事实', 'Execution facts'),
                        children: (
                          <PolicyRuns
                            policies={policies}
                            devices={devices}
                            policy={selected.baseline}
                            locale={locale}
                          />
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
                      runtime={runtime}
                      ownerPolicy={selected.id}
                      event={selected.baseline?.definition.customEvent ?? null}
                      locale={locale}
                      canSubmit={canRead}
                    />
                  ),
                },
              ]}
            />
          ) : (
            policyTarget && (
              <ReadState
                locale={locale}
                busy={detail.busy}
                error={detail.error}
                onRetry={detail.reload}
              />
            )
          )}
        </Modal>
      </div>
    </SelectionGuard.Provider>
  )
}
