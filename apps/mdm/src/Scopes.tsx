import { useState } from 'react'
import { Alert, Button, Collapse, Modal } from 'antd'
import { useSearchParams } from 'react-router-dom'
import type { ScopeRead, ScopeRow } from '@rss/mdm-scopes'
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
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { useAdministration } from './useAdministration'
import { DataTable } from './DataTable'
import { ScopeEditor } from './ScopeEditor'

const fields = [
  'id',
  'revision',
  'deleted',
  'calculationRevision',
  'resolutionRevision',
  'resolution',
] as const satisfies readonly (keyof ScopeRow)[]
export function Scopes({ runtime, locale }: { runtime: Runtime; locale: Locale }) {
  const l = labels(locale),
    { scopes, groups, devices, authorization, binding } = useAdministration(runtime),
    permissions = useRead(`${binding}/scopes-entry`, authorization.effective),
    has = (name: string) =>
      permissions.value?.grants.some(
        (grant) => grant.scope.kind === 'tenant' && grant.operation === name,
      ) ?? false,
    [query, setQuery] = useState<Query>({ limit: 20 }),
    [params, setParams] = useSearchParams(),
    read = useRead(`${binding}/scopes/${JSON.stringify(query)}/${has('scope_read')}`, () =>
      has('scope_read') ? scopes.list(directoryQuery(query, fields)) : Promise.resolve(null),
    ),
    action = useAction(),
    guard = useSelectionGuard(),
    [selected, setSelected] = useState<{
      id: string
      baseline: ScopeRead | null
      generation: number
    } | null>(null),
    [generation, setGeneration] = useState(0)
  usePendingSelection(action.busy || guard.locked)
  async function open(id: string) {
    const result = await action.run(() => scopes.read(id))
    if (result.ok) {
      setGeneration((value) => value + 1)
      setSelected({ id, baseline: result.value, generation: generation + 1 })
      setParams({ scope: id })
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Heading
        title={l('策略范围', 'Policy scopes')}
        hint={l(
          '选择目标、限制与排除，查看服务端计算结果，再将范围绑定到策略。',
          'Choose targets, limitations and exclusions; inspect server results before binding a scope to a policy.',
        )}
        actions={
          has('scope_write') && (
            <Button
              type="primary"
              disabled={guard.locked || action.busy}
              onClick={() => {
                const id = crypto.randomUUID()
                setGeneration((value) => value + 1)
                setSelected({ id, baseline: null, generation: generation + 1 })
                setParams({ scope: id })
              }}
            >
              {l('新建范围', 'New scope')}
            </Button>
          )
        }
      />
      {Boolean(permissions.error) && (
        <Button onClick={permissions.reload}>{l('重试', 'Retry')}</Button>
      )}
      {permissions.value && !has('scope_read') && (
        <Alert
          type="info"
          title={l('当前账户没有范围读取权限。', 'Your account cannot read scopes.')}
        />
      )}
      <ReadState locale={locale} busy={permissions.busy} error={permissions.error} />
      <Failure locale={locale} error={action.error} />
      <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
        {has('scope_read') && (
          <>
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
                      sort={['id', 'revision', 'calculationRevision', 'resolutionRevision']}
                    />
                  ),
                },
              ]}
            />
            <Button onClick={read.reload}>{l('读取范围目录', 'Read scope directory')}</Button>
            {params.get('scope') && !selected && (
              <Button onClick={() => void open(params.get('scope')!)}>
                {l('打开定位范围', 'Open linked scope')}
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
                      title: l('范围', 'Scope'),
                      render: (_, row) => (
                        <Button type="link" onClick={() => void open(row.id)}>
                          {row.id}
                        </Button>
                      ),
                    },
                    { title: l('定义修订', 'Definition revision'), dataIndex: 'revision' },
                    { title: l('结果修订', 'Result revision'), dataIndex: 'resolutionRevision' },
                    {
                      title: l('计算状态', 'Computation state'),
                      render: (_, row) =>
                        row.deleted
                          ? l('已删除', 'Deleted')
                          : row.resolution == null
                            ? l('尚无结果', 'No result yet')
                            : row.resolutionRevision === row.revision
                              ? l('已有计算结果', 'Result available')
                              : l(
                                  '定义待计算 / 已有历史结果',
                                  'Definition pending / historical result available',
                                ),
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
          </>
        )}
      </fieldset>
      <Modal
        rootClassName="policy-dialog"
        open={selected !== null}
        title={selected?.baseline ? l('范围详情', 'Scope details') : l('新建范围', 'New scope')}
        width={880}
        footer={null}
        closable={!guard.locked && !action.busy}
        keyboard={!guard.locked && !action.busy}
        maskClosable={!guard.locked && !action.busy}
        onCancel={() => {
          if (!guard.locked && !action.busy) {
            setSelected(null)
            setParams({})
          }
        }}
      >
        {selected && (
          <ScopeEditor
            key={selected.generation}
            {...selected}
            scopes={scopes}
            groups={groups}
            devices={devices}
            locale={locale}
            canWrite={has('scope_write')}
            done={() => {
              setSelected(null)
              setParams({})
              setQuery(firstPage(query))
              read.reload()
            }}
          />
        )}
      </Modal>
    </SelectionGuard.Provider>
  )
}
