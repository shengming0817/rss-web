import { useState } from 'react'
import { Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import type { TimeSeriesBinding, ValueType } from '@rss/mdm-inventory'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

/** Ordered paths and enum values retain their exact strings, including zero-like strings. */
export function StringItems({
  value,
  onChange,
  locale,
  label,
}: {
  value: readonly string[]
  onChange: (value: readonly string[]) => void
  locale: Locale
  label: string
}) {
  const l = labels(locale)
  return (
    <fieldset className="asset-editor-section">
      <legend>{label}</legend>
      {value.map((item, index) => (
        <div className="asset-editor-row" key={index}>
          <Input
            aria-label={`${label} ${index + 1}`}
            value={item}
            onChange={(e) => onChange(value.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <Button
            disabled={index === 0}
            onClick={() => {
              const next = [...value]
              ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
              onChange(next)
            }}
          >
            {l('上移', 'Move up')}
          </Button>
          <Button onClick={() => onChange(value.filter((_, i) => i !== index))}>
            {l('移除', 'Remove')}
          </Button>
        </div>
      ))}
      <Button onClick={() => onChange([...value, ''])}>{l('添加', 'Add')}</Button>
    </fieldset>
  )
}
function defaultType(kind: ValueType['kind']): ValueType {
  switch (kind) {
    case 'string':
      return { kind, allowEmpty: false, maxLength: 1024 }
    case 'enum':
      return { kind, values: [''] }
    case 'array':
      return { kind, maxItems: 100, items: defaultType('string') }
    case 'object':
      return { kind, properties: {} }
    case 'record':
      return { kind, properties: {} }
    default:
      return { kind }
  }
}
export function ValueTypeEditor({
  value,
  onChange,
  locale,
  depth = 0,
}: {
  value: ValueType
  onChange: (value: ValueType) => void
  locale: Locale
  depth?: number
}) {
  const l = labels(locale),
    [property, setProperty] = useState('')
  return (
    <div className="asset-type-editor">
      <Form.Item label={l('值类型', 'Value type')}>
        <Select
          aria-label={l('值类型', 'Value type')}
          value={value.kind}
          options={[
            ['string', l('文本', 'Text')],
            ['enum', l('枚举', 'Enum')],
            ['integer', l('整数', 'Integer')],
            ['number', l('数值', 'Number')],
            ['boolean', l('布尔值', 'Boolean')],
            ['time', l('时间', 'Time')],
            ['array', l('数组', 'Array')],
            ['object', l('对象', 'Object')],
            ['record', l('结构记录', 'Record')],
          ].map(([value, label]) => ({ value, label }))}
          onChange={(kind: ValueType['kind']) => onChange(defaultType(kind))}
        />
      </Form.Item>
      {value.kind === 'string' && (
        <Space wrap>
          <Checkbox
            checked={value.allowEmpty}
            onChange={(e) => onChange({ ...value, allowEmpty: e.target.checked })}
          >
            {l('允许空文本', 'Allow empty text')}
          </Checkbox>
          <Form.Item label={l('最大文本长度', 'Maximum text length')}>
            <InputNumber
              aria-label={l('最大文本长度', 'Maximum text length')}
              value={value.maxLength}
              min={1}
              precision={0}
              onChange={(n) => {
                if (n !== null) onChange({ ...value, maxLength: n })
              }}
            />
          </Form.Item>
        </Space>
      )}
      {value.kind === 'enum' && (
        <StringItems
          locale={locale}
          label={l('枚举选项', 'Enum values')}
          value={value.values}
          onChange={(values) => onChange({ ...value, values })}
        />
      )}
      {value.kind === 'array' && (
        <>
          <Form.Item label={l('最大条目数', 'Maximum items')}>
            <InputNumber
              aria-label={l('最大条目数', 'Maximum items')}
              value={value.maxItems}
              min={1}
              precision={0}
              onChange={(n) => {
                if (n !== null) onChange({ ...value, maxItems: n })
              }}
            />
          </Form.Item>
          <fieldset className="asset-editor-section">
            <legend>{l('条目类型', 'Item type')}</legend>
            <ValueTypeEditor
              locale={locale}
              value={value.items}
              depth={depth + 1}
              onChange={(items) => onChange({ ...value, items })}
            />
          </fieldset>
        </>
      )}
      {(value.kind === 'object' || value.kind === 'record') && (
        <fieldset className="asset-editor-section">
          <legend>{l('对象属性', 'Object properties')}</legend>
          {Object.entries(value.properties).map(([name, child]) => (
            <details open key={name}>
              <summary>{name}</summary>
              {value.kind === 'record' && 'required' in child && (
                <Checkbox
                  checked={child.required}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      properties: {
                        ...value.properties,
                        [name]: { ...child, required: e.target.checked },
                      },
                    })
                  }
                >
                  {l('必填属性', 'Required property')}
                </Checkbox>
              )}
              <ValueTypeEditor
                locale={locale}
                value={'required' in child ? child.valueType : child}
                depth={depth + 1}
                onChange={(next) => {
                  if (value.kind === 'record') {
                    const original = value.properties[name]!
                    onChange({
                      ...value,
                      properties: { ...value.properties, [name]: { ...original, valueType: next } },
                    })
                  } else onChange({ ...value, properties: { ...value.properties, [name]: next } })
                }}
              />
              <Button
                onClick={() => {
                  const properties = { ...value.properties }
                  delete properties[name]
                  onChange(
                    value.kind === 'record'
                      ? { ...value, properties: properties as typeof value.properties }
                      : { ...value, properties: properties as typeof value.properties },
                  )
                }}
              >
                {l('移除属性', 'Remove property')}
              </Button>
            </details>
          ))}
          <Space wrap>
            <Input
              aria-label={l('新属性名', 'New property name')}
              value={property}
              maxLength={256}
              onChange={(e) => setProperty(e.target.value)}
            />
            <Button
              disabled={!property || Object.hasOwn(value.properties, property) || depth >= 5}
              onClick={() => {
                if (value.kind === 'record')
                  onChange({
                    ...value,
                    properties: {
                      ...value.properties,
                      [property]: { required: false, valueType: defaultType('string') },
                    },
                  })
                else
                  onChange({
                    ...value,
                    properties: { ...value.properties, [property]: defaultType('string') },
                  })
                setProperty('')
              }}
            >
              {l('添加属性', 'Add property')}
            </Button>
          </Space>
        </fieldset>
      )}
    </div>
  )
}
export const emptyTimeSeries = (): TimeSeriesBinding => ({
  kind: 'gauge',
  valuePath: [],
  intervalStartPath: null,
  dimensions: {},
  aggregations: [],
  retention: { key: '', revision: 1 },
  maxResources: 1,
})
export function TimeSeriesEditor({
  value,
  onChange,
  locale,
}: {
  value: TimeSeriesBinding
  onChange: (value: TimeSeriesBinding) => void
  locale: Locale
}) {
  const l = labels(locale),
    [dimension, setDimension] = useState('')
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('时序绑定', 'Time series binding')}</legend>
      <Form.Item label={l('序列类型', 'Series kind')}>
        <Select
          aria-label={l('序列类型', 'Series kind')}
          value={value.kind}
          options={['gauge', 'cumulative_counter', 'delta_counter', 'state'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(kind: TimeSeriesBinding['kind']) => onChange({ ...value, kind })}
        />
      </Form.Item>
      <StringItems
        locale={locale}
        label={l('值路径', 'Value path')}
        value={value.valuePath}
        onChange={(valuePath) => onChange({ ...value, valuePath })}
      />
      <Checkbox
        checked={value.intervalStartPath !== null}
        onChange={(e) => onChange({ ...value, intervalStartPath: e.target.checked ? [] : null })}
      >
        {l('绑定区间起点路径', 'Bind interval start path')}
      </Checkbox>
      {value.intervalStartPath !== null && (
        <StringItems
          locale={locale}
          label={l('区间起点路径', 'Interval start path')}
          value={value.intervalStartPath}
          onChange={(intervalStartPath) => onChange({ ...value, intervalStartPath })}
        />
      )}
      {Object.entries(value.dimensions).map(([key, item]) => (
        <details open key={key}>
          <summary>{key}</summary>
          <StringItems
            locale={locale}
            label={l('维度路径', 'Dimension path')}
            value={item.path}
            onChange={(path) =>
              onChange({ ...value, dimensions: { ...value.dimensions, [key]: { ...item, path } } })
            }
          />
          <StringItems
            locale={locale}
            label={l('允许的维度值', 'Allowed dimension values')}
            value={item.values}
            onChange={(values) =>
              onChange({
                ...value,
                dimensions: { ...value.dimensions, [key]: { ...item, values } },
              })
            }
          />
          <Button
            onClick={() => {
              const dimensions = { ...value.dimensions }
              delete dimensions[key]
              onChange({ ...value, dimensions })
            }}
          >
            {l('移除维度', 'Remove dimension')}
          </Button>
        </details>
      ))}
      <Space wrap>
        <Input
          aria-label={l('新维度名', 'New dimension name')}
          value={dimension}
          onChange={(e) => setDimension(e.target.value)}
        />
        <Button
          disabled={!dimension || Object.hasOwn(value.dimensions, dimension)}
          onClick={() => {
            onChange({
              ...value,
              dimensions: { ...value.dimensions, [dimension]: { path: [], values: [] } },
            })
            setDimension('')
          }}
        >
          {l('添加维度', 'Add dimension')}
        </Button>
      </Space>
      <Form.Item label={l('聚合方式', 'Aggregations')}>
        <Select
          mode="multiple"
          aria-label={l('聚合方式', 'Aggregations')}
          value={[...value.aggregations]}
          options={[
            'min',
            'max',
            'sum',
            'count',
            'mean',
            'increase',
            'rate',
            'timeline',
            'transitions',
            'coverage',
          ].map((value) => ({ value, label: value }))}
          onChange={(aggregations: TimeSeriesBinding['aggregations']) =>
            onChange({ ...value, aggregations })
          }
        />
      </Form.Item>
      <Form.Item label={l('保留策略键', 'Retention policy key')}>
        <Input
          aria-label={l('保留策略键', 'Retention policy key')}
          value={value.retention.key}
          onChange={(e) =>
            onChange({ ...value, retention: { ...value.retention, key: e.target.value } })
          }
        />
      </Form.Item>
      <Form.Item label={l('保留策略版本', 'Retention policy revision')}>
        <InputNumber
          aria-label={l('保留策略版本', 'Retention policy revision')}
          value={value.retention.revision}
          min={1}
          precision={0}
          onChange={(n) => {
            if (n !== null) onChange({ ...value, retention: { ...value.retention, revision: n } })
          }}
        />
      </Form.Item>
      <Form.Item label={l('最大资源数', 'Maximum resources')}>
        <InputNumber
          aria-label={l('最大资源数', 'Maximum resources')}
          value={value.maxResources}
          min={1}
          precision={0}
          onChange={(n) => {
            if (n !== null) onChange({ ...value, maxResources: n })
          }}
        />
      </Form.Item>
    </fieldset>
  )
}
