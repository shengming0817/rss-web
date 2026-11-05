import { useState } from 'react'
import { Button, Input, Space } from 'antd'
import type { createDevices } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import {
  CursorControls,
  Failure,
  firstPage,
  labels,
  ReadState,
  useAction,
  useRead,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'

export type DevicesUseCases = ReturnType<typeof createDevices>
export function EndpointPicker({
  devices,
  locale,
  onChange,
}: {
  devices: DevicesUseCases
  locale: Locale
  onChange: (id: string) => void
}) {
  const l = labels(locale),
    action = useAction(),
    [filter, setFilter] = useState(''),
    [query, setQuery] = useState<Query>({ limit: 10 }),
    read = useRead(`endpoint-picker/${JSON.stringify(query)}`, () =>
      devices.endpoints({ ...query, fields: ['id', 'status', 'primaryMdmRegistration'] }),
    )
  usePendingSelection(action.busy)
  return (
    <fieldset className="asset-editor-section" disabled={action.busy}>
      <legend>{l('选择终端', 'Choose an endpoint')}</legend>
      <Space wrap>
        <Input
          aria-label={l('终端候选服务端筛选', 'Endpoint candidate server filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          onClick={() => setQuery({ limit: query.limit ?? 10, ...(filter ? { filter } : {}) })}
        >
          {l('查询终端候选', 'Find endpoint candidates')}
        </Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      <Failure locale={locale} error={action.error} kind="read" />
      {read.value && (
        <>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey="id"
            columns={[
              { title: l('终端', 'Endpoint'), dataIndex: 'id' },
              {
                title: l('状态', 'State'),
                render: (_, row) =>
                  row.status === undefined ? '—' : <Status locale={locale} value={row.status} />,
              },
              {
                title: l('选择', 'Choose'),
                render: (_, row) => (
                  <Button
                    disabled={action.busy}
                    onClick={() =>
                      void action
                        .run(() => devices.endpoint(row.id))
                        .then((result) => {
                          if (result.ok) onChange(result.value.id)
                        })
                    }
                  >
                    {l('使用此终端', 'Use this endpoint')}
                  </Button>
                ),
              },
            ]}
          />
          <CursorControls
            locale={locale}
            next={read.value.nextCursor}
            count={read.value.items.length}
            query={query}
            onChange={setQuery}
          />
        </>
      )}
      {!!read.error && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>
          {l('返回终端候选首页', 'First endpoint candidate page')}
        </Button>
      )}
    </fieldset>
  )
}
