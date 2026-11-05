import { useState } from 'react'
import { Button, Space } from 'antd'
import type { ScopesUseCases } from './ScopeResults'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { DataTable } from './DataTable'

export function ScopePicker({
  scopes,
  value,
  locale,
  onChange,
}: {
  scopes: ScopesUseCases
  value: string
  locale: Locale
  onChange: (id: string) => void
}) {
  const l = labels(locale),
    action = useAction(),
    [query, setQuery] = useState<Query>({ limit: 10 }),
    [open, setOpen] = useState(false),
    read = useRead(`scope-picker/${open}/${JSON.stringify(query)}`, () =>
      open
        ? scopes.list({
            ...query,
            fields: ['id', 'revision', 'resolutionRevision', 'resolution'],
            filter: 'deleted==false',
          })
        : Promise.resolve(null),
    )
  usePendingSelection(action.busy)
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('策略范围', 'Policy scope')}</legend>
      <Space wrap>
        <code>{value || l('尚未选择', 'Not selected')}</code>
        <Button onClick={() => setOpen(!open)}>
          {open ? l('收起范围候选', 'Close scope candidates') : l('选择范围', 'Choose scope')}
        </Button>
      </Space>
      {open && (
        <>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          <Failure locale={locale} error={action.error} kind="read" />
          {read.value && (
            <>
              <DataTable
                locale={locale}
                rowKey="id"
                dataSource={read.value.items}
                columns={[
                  { title: l('范围', 'Scope'), dataIndex: 'id' },
                  { title: l('定义修订', 'Definition revision'), dataIndex: 'revision' },
                  {
                    title: l('选择', 'Choose'),
                    render: (_, row) => (
                      <Button
                        disabled={action.busy}
                        onClick={() =>
                          void action
                            .run(() => scopes.read(row.id))
                            .then((result) => {
                              if (result.ok) {
                                onChange(result.value.id)
                                setOpen(false)
                              }
                            })
                        }
                      >
                        {l('使用此范围', 'Use this scope')}
                      </Button>
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
  )
}
