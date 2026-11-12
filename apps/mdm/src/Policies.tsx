import { useEffect, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatFilter } from '@rss/api/mdm-filter'
import { allOf } from '@rss/api/mdm-query'
import { variantKey } from '@rss/mdm-resources'
import type { Policy, PolicyDefinition, PolicyRow } from '@rss/mdm-policies'
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
import { PolicyEditor } from './PolicyEditor'
import { resultReturnPath } from './execution-context'
import { PolicyEvents } from './PolicyEvents'
import { newPolicyAction, policyActionLabel } from './PolicyActionEditor'

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
  'definition',
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
    softwareResource = params.get('softwareResource'),
    softwareVersion = params.get('softwareVersion'),
    softwareVariant = params.get('softwareVariant'),
    fixedSoftware = softwareResource && softwareVersion,
    softwareFilter = fixedSoftware
      ? (() => {
          try {
            return formatFilter({
              kind: 'and',
              children: [
                { kind: 'compare', field: 'action', operator: '==', values: ['software'] },
                { kind: 'compare', field: 'resource', operator: '==', values: [softwareResource] },
                {
                  kind: 'compare',
                  field: 'definition.action.resource.version',
                  operator: '==',
                  values: [softwareVersion],
                },
              ],
            })
          } catch {
            return null
          }
        })()
      : null,
    listFilter = (() => {
      if ((softwareResource || softwareVersion) && !softwareFilter) return null
      try {
        return allOf(softwareFilter ?? undefined, query.filter) ?? ''
      } catch {
        return null
      }
    })(),
    guard = useSelectionGuard(),
    read = usePageRead(
      `${binding}/policy-directory/${listFilter}/${JSON.stringify(query)}/${has('policy_read')}`,
      (signal) => {
        if (!has('policy_read')) return Promise.resolve(null)
        if (listFilter === null) throw { cause: 'client', code: 'invalid_input' }
        const scoped =
          fixedSoftware && query.fields && !query.fields.includes('definition')
            ? { ...query, fields: [...query.fields, 'definition'] }
            : query
        return policies.list(
          directoryQuery({ ...scoped, ...(listFilter ? { filter: listFilter } : {}) }, fields),
          signal,
        )
      },
    ),
    [selected, setSelected] = useState<{
      id: string
      baseline: Policy | null
      initialAction?: PolicyDefinition['action']
      source?: string
    } | null>(null),
    draftResource =
      fixedSoftware && softwareVariant && has('policy_write') && has('resource_read')
        ? softwareResource
        : null,
    draftSource = JSON.stringify([draftResource, softwareVersion, softwareVariant]),
    draft = usePageRead(`${binding}/software-draft/${draftSource}`, async (signal) => {
      if (!draftResource) return null
      const resource = await resources.read(draftResource, signal)
      const version = resource.versions.find(
        (row) => row.id === softwareVersion && row.state !== 'archived',
      )
      const variant = version?.variants.find((row) => variantKey(row) === softwareVariant)
      if (
        resource.kind !== 'software' ||
        !version ||
        !variant ||
        variant.declaration.kind !== 'software'
      )
        throw { cause: 'client', code: 'invalid_input' }
      return { resource, version, variant }
    })
  usePendingSelection(guard.locked)
  const linkedPolicy = params.get('policy'),
    canRead = has('policy_read'),
    canInventory = has('inventory_read', true),
    canOperations = has('operation_read', true),
    returnSource = resultReturnPath(params.get('returnTo')),
    currentSelection = selected?.source
      ? draftResource && selected.source === draftSource
      : selected?.id === linkedPolicy,
    policyTarget =
      !softwareVariant && canRead && !guard.locked && selected?.id !== linkedPolicy
        ? linkedPolicy
        : null,
    detail = usePageRead(
      `${binding}/policy-detail/${policyTarget ?? ''}`,
      async (signal) => {
        if (!policyTarget) return null
        const value = await policies.read(policyTarget, signal)
        const action = value.definition.action
        if (
          fixedSoftware &&
          (action.kind !== 'software' ||
            action.resource.id !== softwareResource ||
            action.resource.version !== softwareVersion)
        )
          throw { cause: 'client', status: 409, code: 'configuration_changed' }
        return value
      },
      { retryReadConflict: true },
    ),
    dialogOpen = Boolean(selected && (guard.locked || currentSelection)) || policyTarget !== null
  useEffect(() => {
    if (!linkedPolicy && !softwareVariant && !guard.locked) setSelected(null)
  }, [linkedPolicy, softwareVariant, guard.locked])
  useEffect(() => {
    if (!draft.value || selected?.source === draftSource || guard.locked) return
    const { resource, version, variant } = draft.value
    const action = newPolicyAction('software')
    if (action.kind !== 'software') return
    setSelected({
      id: crypto.randomUUID(),
      baseline: null,
      source: draftSource,
      initialAction: {
        ...action,
        resource: {
          kind: 'software',
          id: resource.id,
          version: version.id,
          variants: { [`${variant.platform}_${variant.architecture}`]: variant.key },
        },
      },
    })
  }, [draft.value, draftSource, selected?.source, guard.locked, params])
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
    setParams(value)
  }
  function open(id: string) {
    const next = new URLSearchParams(params)
    next.set('policy', id)
    next.set('tab', 'configuration')
    next.delete('softwareVariant')
    next.delete('assignmentCursor')
    next.delete('runCursor')
    setParams(next)
  }
  function close() {
    setSelected(null)
    if (returnSource && (!fixedSoftware || selected?.baseline === null)) {
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
      'softwareVariant',
    ])
      next.delete(key)
    setParams(next)
    read.reload()
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <div className="policies-page">
        <Heading
          title={l('策略与部署', 'Policies and deployments')}
          hint={l(
            '配置与范围作为一个草稿保存，再分别观察分配、事件与执行事实。',
            'Save configuration and scope as one draft, then observe assignments, events and execution separately.',
          )}
          actions={
            !dialogOpen && has('policy_write') ? (
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
            ) : undefined
          }
        />
        <ReadState
          locale={locale}
          busy={permissions.busy}
          error={permissions.error}
          onRetry={permissions.reload}
        />
        {permissions.value && !canRead && (
          <Alert
            type="info"
            title={l('当前账户没有策略读取权限。', 'Your account cannot read policies.')}
          />
        )}
        {fixedSoftware && (
          <p>
            {l('固定软件资源版本', 'Fixed software resource version')} ·{' '}
            <code>
              {softwareResource} @ {softwareVersion}
            </code>
          </p>
        )}
        {fixedSoftware && !softwareFilter && (
          <Alert type="error" title={l('软件版本定位无效', 'Invalid software version locator')} />
        )}
        {draftResource && (
          <ReadState locale={locale} busy={draft.busy} error={draft.error} onRetry={draft.reload} />
        )}
        {returnSource && !dialogOpen && (
          <Link to={returnSource}>{l('返回来源', 'Return to source')}</Link>
        )}
        {selected && (guard.locked || currentSelection) ? (
          <PolicyEditor
            key={selected.id}
            policies={policies}
            scopes={scopes}
            resources={resources}
            {...selected}
            runtime={runtime}
            instance={permissions.value?.instanceId ?? ''}
            locale={locale}
            canWrite={has('policy_write')}
            canRerun={has('policy_write')}
            canInventory={canInventory}
            canOperations={canOperations}
            done={close}
          />
        ) : policyTarget ? (
          <ReadState
            locale={locale}
            busy={detail.busy}
            error={detail.error}
            onRetry={detail.reload}
          />
        ) : (
          canRead && (
            <fieldset className="permission-panel" disabled={guard.locked}>
              <DirectoryControls
                catalog="policies"
                locale={locale}
                query={query}
                onChange={setQuery}
                fields={fields}
                sort={[]}
              />
              <Button onClick={read.reload}>{l('刷新', 'Refresh')}</Button>
              <ReadState
                locale={locale}
                busy={read.busy}
                error={read.error}
                empty={read.value?.items.length === 0}
                onRetry={read.reload}
              />
              {read.value && (
                <>
                  <div className="policy-list">
                    {read.value.items.map((row) => (
                      <article className="policy-card" key={row.id}>
                        <div className="policy-card-main">
                          <Button type="link" className="policy-title" onClick={() => open(row.id)}>
                            {row.alias ?? row.toolName ?? row.id}
                          </Button>
                          <div className="policy-meta">
                            <span>{row.action ? policyActionLabel(row.action, locale) : '—'}</span>
                            {row.scope && (
                              <Button
                                type="link"
                                onClick={() => {
                                  const next = new URLSearchParams(params)
                                  next.set('policy', row.id)
                                  next.set('tab', 'scope')
                                  setParams(next)
                                }}
                              >
                                {l('查看范围', 'View scope')}
                              </Button>
                            )}
                            {row.customEvent && (
                              <span>
                                {l('事件', 'Event')} · {row.customEvent}
                              </span>
                            )}
                          </div>
                          <details>
                            <summary>{l('策略标识', 'Policy identifier')}</summary>
                            {row.id}
                          </details>
                        </div>
                        <span>
                          r{row.revision ?? '—'} / v{row.version ?? '—'}
                        </span>
                        <Tag>{row.state ?? '—'}</Tag>
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
            </fieldset>
          )
        )}
        {!selected &&
          !linkedPolicy &&
          params.get('tab') === 'events' &&
          params.get('eventDevice') && (
            <PolicyEvents
              events={policyEvents}
              devices={devices}
              runtime={runtime}
              event={null}
              locale={locale}
              canSubmit={canRead}
            />
          )}
      </div>
    </SelectionGuard.Provider>
  )
}
