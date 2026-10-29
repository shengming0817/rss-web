import { useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import {
  freeze,
  validateField,
  type createInventory,
  type FieldChange,
  type FieldDefinition,
  type FieldDetail,
  type Operation,
} from '@rss/mdm-inventory'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { emptyTimeSeries, TimeSeriesEditor, ValueTypeEditor } from './ValueTypeEditor'
import type { Locale } from './i18n'

export type InventoryUseCases = ReturnType<typeof createInventory>
export const newField = (key: string): FieldDetail => ({ field: key, version: 0, definition: null })
function defaultField(detail: FieldDetail): FieldDefinition {
  return detail.definition
    ? { ...structuredClone(detail.definition), version: detail.version + 1 }
    : {
        key: detail.field,
        version: detail.version + 1,
        valueType: { kind: 'string', allowEmpty: false, maxLength: 1024 },
        nullable: true,
        manual: false,
        sources: {},
        platforms: ['windows', 'macos'],
        sensitivity: 'standard',
        unit: null,
        searchable: true,
        itemKey: null,
        timeSeries: null,
      }
}
/** The parent passes a complete, explicitly read baseline. Directory projections never enter here. */
export function FieldEditor({
  inventory,
  detail,
  locale,
  canWrite,
  done,
}: {
  inventory: InventoryUseCases
  detail: FieldDetail
  locale: Locale
  canWrite: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [value, setValue] = useState(() => defaultField(detail)),
    [source, setSource] = useState(''),
    [invalid, setInvalid] = useState(false),
    [approved, setApproved] = useState(false),
    [pending, setPending] = useState<Operation<FieldChange> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    editable = detail.field.startsWith('custom.')
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: Operation<FieldChange>) {
    const result = await action.run(() => inventory.putField(detail.field, change))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  function start(input: FieldChange) {
    try {
      if (input.action === 'put') validateField(input.definition, detail.version)
      const change = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: detail.version,
        input,
      })
      setInvalid(false)
      setPending(change)
      void submit(change)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <>
      <p className="subtitle">
        <code>{detail.field}</code> · {l('已读取版本', 'Observed revision')} {detail.version}
      </p>
      {!editable && (
        <Alert
          type="info"
          title={l('内置字段由服务端维护。', 'Built-in fields are managed by the server.')}
        />
      )}
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查字段类型、来源优先级和版本约束。',
            'Check field types, source priorities and revision constraints.',
          )}
        />
      )}
      <Form
        layout="vertical"
        disabled={!canWrite || !editable || action.busy || pending !== null}
        onFinish={() => start({ action: 'put', definition: value })}
      >
        <ValueTypeEditor
          locale={locale}
          value={value.valueType}
          onChange={(valueType) => setValue({ ...value, valueType })}
        />
        <Space wrap>
          <Checkbox
            checked={value.nullable}
            onChange={(e) => setValue({ ...value, nullable: e.target.checked })}
          >
            {l('允许空值', 'Allow null')}
          </Checkbox>
          <Checkbox
            checked={value.manual}
            onChange={(e) => setValue({ ...value, manual: e.target.checked })}
          >
            {l('允许手工录入', 'Allow manual assignment')}
          </Checkbox>
          <Checkbox
            checked={value.searchable}
            onChange={(e) => setValue({ ...value, searchable: e.target.checked })}
          >
            {l('允许查询', 'Searchable')}
          </Checkbox>
        </Space>
        <div className="admin-form-grid">
          <Form.Item label={l('适用平台', 'Platforms')}>
            <Select
              mode="multiple"
              aria-label={l('适用平台', 'Platforms')}
              value={[...value.platforms]}
              options={[
                { value: 'windows', label: 'Windows' },
                { value: 'macos', label: 'macOS' },
              ]}
              onChange={(platforms: FieldDefinition['platforms']) =>
                setValue({ ...value, platforms })
              }
            />
          </Form.Item>
          <Form.Item label={l('敏感等级', 'Sensitivity')}>
            <Select
              aria-label={l('敏感等级', 'Sensitivity')}
              value={value.sensitivity}
              options={[
                { value: 'standard', label: l('普通', 'Standard') },
                { value: 'sensitive', label: l('敏感', 'Sensitive') },
                { value: 'secret', label: l('秘密', 'Secret') },
              ]}
              onChange={(sensitivity: FieldDefinition['sensitivity']) =>
                setValue({ ...value, sensitivity })
              }
            />
          </Form.Item>
          <Form.Item label={l('单位', 'Unit')}>
            <Checkbox
              checked={value.unit !== null}
              onChange={(e) => setValue({ ...value, unit: e.target.checked ? '' : null })}
            >
              {l('设置单位', 'Set unit')}
            </Checkbox>
            <Input
              aria-label={l('单位', 'Unit')}
              disabled={
                value.unit === null || !canWrite || !editable || action.busy || pending !== null
              }
              value={value.unit ?? ''}
              onChange={(e) => setValue({ ...value, unit: e.target.value })}
            />
          </Form.Item>
          <Form.Item label={l('集合条目标识路径', 'Item identity path')}>
            <Checkbox
              checked={value.itemKey !== null}
              onChange={(e) => setValue({ ...value, itemKey: e.target.checked ? '' : null })}
            >
              {l('设置条目标识', 'Set item identity')}
            </Checkbox>
            <Input
              aria-label={l('集合条目标识路径', 'Item identity path')}
              disabled={
                value.itemKey === null || !canWrite || !editable || action.busy || pending !== null
              }
              value={value.itemKey ?? ''}
              onChange={(e) => setValue({ ...value, itemKey: e.target.value })}
            />
          </Form.Item>
        </div>
        <fieldset className="asset-editor-section">
          <legend>{l('来源优先级', 'Source priorities')}</legend>
          {Object.entries(value.sources).map(([name, priority]) => (
            <div className="asset-editor-row" key={name}>
              <code>{name}</code>
              <InputNumber
                aria-label={`${l('优先级', 'Priority')} ${name}`}
                value={priority}
                min={0}
                precision={0}
                onChange={(n) => {
                  if (n !== null) setValue({ ...value, sources: { ...value.sources, [name]: n } })
                }}
              />
              <Button
                onClick={() => {
                  const sources = { ...value.sources }
                  delete sources[name]
                  setValue({ ...value, sources })
                }}
              >
                {l('移除来源', 'Remove source')}
              </Button>
            </div>
          ))}
          <Space wrap>
            <Select
              aria-label={l('添加字段来源', 'Add field source')}
              className="admin-select"
              value={source || null}
              options={[
                'manual',
                'mdm.windows',
                'mdm.apple',
                'agent.builtin',
                'agent.script',
                'agent.native',
                'agent.osquery',
              ].map((value) => ({ value, label: value }))}
              onChange={(next: string) => setSource(next)}
            />
            <Button
              disabled={!source || Object.hasOwn(value.sources, source)}
              onClick={() => {
                setValue({ ...value, sources: { ...value.sources, [source]: 0 } })
                setSource('')
              }}
            >
              {l('添加来源', 'Add source')}
            </Button>
          </Space>
        </fieldset>
        <Checkbox
          checked={value.timeSeries !== null}
          onChange={(e) =>
            setValue({ ...value, timeSeries: e.target.checked ? emptyTimeSeries() : null })
          }
        >
          {l('启用时序绑定', 'Enable time series binding')}
        </Checkbox>
        {value.timeSeries && (
          <TimeSeriesEditor
            locale={locale}
            value={value.timeSeries}
            onChange={(timeSeries) => setValue({ ...value, timeSeries })}
          />
        )}
        {canWrite && editable && (
          <Button type="primary" htmlType="submit">
            {l('保存字段新版本', 'Save field revision')}
          </Button>
        )}
      </Form>
      {canWrite && editable && detail.definition && !pending && (
        <div className="admin-subsection">
          <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
            {l(
              '已核对引用影响，请求服务端删除字段',
              'I reviewed references and request server-side field deletion',
            )}
          </Checkbox>
          <Button
            danger
            disabled={!approved || action.busy}
            onClick={() => start({ action: 'delete' })}
          >
            {l('删除字段', 'Delete field')}
          </Button>
        </div>
      )}
      {pending && (
        <div className="admin-recovery">
          <p>
            <code>{pending.operationId}</code> · {l('原版本', 'Original revision')}{' '}
            {pending.expectedRevision}
          </p>
          {outcome === 'confirmed' ? (
            <Button onClick={done}>
              {l('字段变更已确认，重新读取', 'Field change confirmed; read again')}
            </Button>
          ) : outcome === 'rejected' ? (
            <Button onClick={done}>
              {l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '读取当前字段不能确认原变更。请保留并显式重提原请求。',
                  'Reading the current field does not confirm this change. Retain and explicitly resubmit the original request.',
                )}
              />
              <Button disabled={!canWrite || action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原字段变更', 'Resubmit original field change')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
