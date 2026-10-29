import { useState } from 'react'
import { Button, Card, Form, Input, Space } from 'antd'
import type { FieldDescriptor, FieldDetail } from '@rss/mdm-inventory'
import { fieldKey } from '@rss/mdm-inventory'
import {
  CursorControls,
  DirectoryControls,
  directoryQuery,
  Failure,
  firstPage,
  labels,
  ReadState,
  useAction,
  useRead,
  validateInput,
  type Query,
} from './AdminUi'
import { DataTable } from './DataTable'
import { FieldEditor, newField, type InventoryUseCases } from './FieldEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import type { Locale } from './i18n'

const columns = [
  'key',
  'version',
  'valueType',
  'nullable',
  'manual',
  'sources',
  'platforms',
  'sensitivity',
  'unit',
  'searchable',
  'itemKey',
  'timeSeries',
  'operations',
] as const satisfies readonly (keyof FieldDescriptor)[]
const defaultColumns = ['key', 'version', 'valueType', 'platforms', 'sensitivity']
export function FieldReferences({
  inventory,
  field,
  locale,
}: {
  inventory: InventoryUseCases
  field: string
  locale: Locale
}) {
  const l = labels(locale),
    [query, setQuery] = useState<Query>({ limit: 20 }),
    read = useRead(`field-references/${field}/${JSON.stringify(query)}`, () =>
      inventory.references(field, query),
    )
  return (
    <Card title={l('引用影响', 'Reference impact')}>
      <Button onClick={read.reload}>{l('读取影响', 'Read impact')}</Button>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <dl className="device-facts">
            {Object.entries(read.value.impact).map(([name, count]) => (
              <div key={name}>
                <dt>
                  {
                    (
                      {
                        archivedResourceVersions: l('归档资源版本', 'Archived resource versions'),
                        compliance: l('合规规则', 'Compliance rules'),
                        groups: l('设备组', 'Device groups'),
                        savedQueries: l('保存查询', 'Saved queries'),
                        telemetryProfiles: l('指标配置', 'Telemetry profiles'),
                        templates: l('采集模板', 'Collection templates'),
                      } as Record<string, string>
                    )[name]
                  }
                </dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p className="subtitle">
            {l(
              '映射引用列表受当前授权范围过滤；空列表不代表允许删除。',
              'Mapping references are filtered by current authority. An empty list does not grant deletion.',
            )}
          </p>
          <DataTable
            locale={locale}
            dataSource={read.value.items}
            rowKey={(row) => JSON.stringify([row.resource, row.version])}
            columns={[
              { title: l('资源', 'Resource'), dataIndex: 'resource' },
              { title: l('固定版本', 'Fixed version'), dataIndex: 'version' },
              { title: l('状态', 'State'), dataIndex: 'state' },
              { title: l('指标引用', 'Telemetry reference'), dataIndex: 'telemetry' },
            ]}
          />
          <CursorControls
            locale={locale}
            query={query}
            next={read.value.nextCursor}
            count={read.value.items.length}
            onChange={setQuery}
          />
        </>
      )}
      {!read.value && query.cursor && (
        <Button onClick={() => setQuery(firstPage(query))}>{l('返回首页', 'First page')}</Button>
      )}
    </Card>
  )
}
export function FieldCatalog({
  inventory,
  locale,
  canWrite,
  canReadReferences,
}: {
  inventory: InventoryUseCases
  locale: Locale
  canWrite: boolean
  canReadReferences: boolean
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [query, setQuery] = useState<Query>({ fields: defaultColumns, limit: 20 }),
    [key, setKey] = useState('custom.'),
    [detail, setDetail] = useState<FieldDetail | null>(null),
    [editor, setEditor] = useState(0),
    read = useRead(`fields/${JSON.stringify(query)}`, () =>
      inventory.fields(directoryQuery(query, columns)),
    )
  usePendingSelection(guard.locked || action.busy)
  async function open(field: string) {
    const result = await action.run(() => inventory.field(field))
    if (result.ok) {
      setDetail(result.value)
      setEditor((v) => v + 1)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('资产字段', 'Asset fields')}>
        <fieldset className="permission-panel" disabled={guard.locked || action.busy}>
          <DirectoryControls
            locale={locale}
            query={query}
            onChange={setQuery}
            fields={columns}
            sort={['key', 'version']}
            required="key"
          />
          <Space wrap>
            <Button onClick={read.reload}>{l('读取字段目录', 'Read field catalog')}</Button>
            {canWrite && (
              <Form
                layout="inline"
                onFinish={() => {
                  void action.run(async () => {
                    validateInput(() => {
                      fieldKey(key)
                      if (!key.startsWith('custom.')) throw new Error('Custom fields only')
                    })
                    setDetail(newField(key))
                    setEditor((v) => v + 1)
                  })
                }}
              >
                <Form.Item label={l('新字段键', 'New field key')}>
                  <Input
                    aria-label={l('新字段键', 'New field key')}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </Form.Item>
                <Button htmlType="submit">{l('新建字段', 'New field')}</Button>
              </Form>
            )}
          </Space>
          <ReadState locale={locale} busy={read.busy} error={read.error} />
          {read.value && (
            <>
              <p className="subtitle">
                {l('字典版本', 'Dictionary revision')} · {read.value.dictionary}
              </p>
              <DataTable
                locale={locale}
                dataSource={read.value.items}
                rowKey="key"
                columns={[
                  {
                    title: l('字段', 'Field'),
                    dataIndex: 'key',
                    render: (_, row) => (
                      <Button type="link" onClick={() => void open(row.key)}>
                        {row.key}
                      </Button>
                    ),
                  },
                  ...(query.fields ?? defaultColumns)
                    .filter((key) => key !== 'key')
                    .map((key) => ({
                      title: key,
                      render: (
                        _: unknown,
                        row: NonNullable<typeof read.value>['items'][number],
                      ) => {
                        const value = row[key as keyof typeof row]
                        if (value === null || value === undefined) return '—'
                        if (typeof value !== 'object') return String(value)
                        if ('kind' in value) return String(value.kind)
                        if (Array.isArray(value)) return value.join(' · ')
                        return (
                          <dl className="device-values">
                            {Object.entries(value).map(([name, item]) => (
                              <div key={name}>
                                <dt>{name}</dt>
                                <dd>
                                  {typeof item === 'object'
                                    ? l('已配置，读取详情', 'Configured; read detail')
                                    : String(item)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )
                      },
                    })),
                ]}
              />
              <CursorControls
                locale={locale}
                query={query}
                next={read.value.nextCursor}
                count={read.value.items.length}
                onChange={setQuery}
              />
            </>
          )}
          {!read.value && query.cursor && (
            <Button onClick={() => setQuery(firstPage(query))}>
              {l('返回首页', 'First page')}
            </Button>
          )}
        </fieldset>
        <Failure locale={locale} error={action.error} />
      </Card>
      {detail && (
        <div className="admin-subsection">
          <Card
            title={detail.field}
            extra={
              <Button disabled={guard.locked || action.busy} onClick={() => setDetail(null)}>
                {l('关闭详情', 'Close detail')}
              </Button>
            }
          >
            <FieldEditor
              key={editor}
              locale={locale}
              inventory={inventory}
              canWrite={canWrite}
              detail={detail}
              done={() => {
                setDetail(null)
                read.reload()
              }}
            />
          </Card>
          {canReadReferences && (
            <FieldReferences
              key={detail.field}
              locale={locale}
              inventory={inventory}
              field={detail.field}
            />
          )}
        </div>
      )}
    </SelectionGuard.Provider>
  )
}
