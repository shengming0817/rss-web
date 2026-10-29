import { useState } from 'react'
import { Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import type { Scalar } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

export function newScalar(kind: Scalar['kind']): Scalar {
  if (kind === 'string') return { kind, value: '' }
  if (kind === 'boolean') return { kind, value: false }
  if (kind === 'array') return { kind, value: [] }
  if (kind === 'object') return { kind, value: {} }
  return { kind, value: 0 }
}
export function ScalarEditor({
  value,
  onChange,
  locale,
  compound = true,
  depth = 0,
}: {
  value: Scalar
  onChange: (value: Scalar) => void
  locale: Locale
  compound?: boolean
  depth?: number
}) {
  const l = labels(locale),
    [key, setKey] = useState('')
  return (
    <div className="asset-type-editor">
      <Form.Item label={l('输入值类型', 'Input value type')}>
        <Select
          aria-label={l('输入值类型', 'Input value type')}
          value={value.kind}
          options={(
            [
              'string',
              'integer',
              'number',
              'boolean',
              'time',
              ...(compound && depth < 5 ? (['array', 'object'] as const) : []),
            ] as const
          ).map((value) => ({ value, label: value }))}
          onChange={(kind: Scalar['kind']) => onChange(newScalar(kind))}
        />
      </Form.Item>
      {value.kind === 'string' ? (
        <Input.TextArea
          aria-label={l('文本值', 'Text value')}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      ) : value.kind === 'boolean' ? (
        <Checkbox
          checked={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.checked })}
        >
          {l('真', 'True')}
        </Checkbox>
      ) : value.kind === 'integer' || value.kind === 'number' || value.kind === 'time' ? (
        <Form.Item
          label={value.kind === 'time' ? l('Unix 秒', 'Unix seconds') : l('数值', 'Number')}
        >
          <InputNumber
            aria-label={value.kind === 'time' ? l('Unix 秒', 'Unix seconds') : l('数值', 'Number')}
            value={value.value}
            {...(value.kind !== 'number' ? { precision: 0 } : {})}
            onChange={(n) => {
              if (n !== null) onChange({ ...value, value: n })
            }}
          />
        </Form.Item>
      ) : value.kind === 'array' ? (
        <fieldset className="asset-editor-section">
          <legend>{l('数组条目', 'Array items')}</legend>
          {value.value.map((item, index) => (
            <div key={index}>
              <ScalarEditor
                locale={locale}
                value={item}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({ ...value, value: value.value.map((v, i) => (i === index ? next : v)) })
                }
              />
              <Button
                onClick={() =>
                  onChange({ ...value, value: value.value.filter((_, i) => i !== index) })
                }
              >
                {l('移除条目', 'Remove item')}
              </Button>
            </div>
          ))}
          <Button
            onClick={() => onChange({ ...value, value: [...value.value, newScalar('string')] })}
          >
            {l('添加条目', 'Add item')}
          </Button>
        </fieldset>
      ) : value.kind === 'object' ? (
        <fieldset className="asset-editor-section">
          <legend>{l('对象值', 'Object values')}</legend>
          {Object.entries(value.value).map(([name, item]) => (
            <details open key={name}>
              <summary>{name}</summary>
              <ScalarEditor
                locale={locale}
                value={item}
                depth={depth + 1}
                onChange={(next) => onChange({ ...value, value: { ...value.value, [name]: next } })}
              />
              <Button
                onClick={() => {
                  const next = { ...value.value }
                  delete next[name]
                  onChange({ ...value, value: next })
                }}
              >
                {l('移除属性', 'Remove property')}
              </Button>
            </details>
          ))}
          <Space wrap>
            <Input
              aria-label={l('新值属性名', 'New value property name')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button
              disabled={!key || Object.hasOwn(value.value, key)}
              onClick={() => {
                onChange({ ...value, value: { ...value.value, [key]: newScalar('string') } })
                setKey('')
              }}
            >
              {l('添加值属性', 'Add value property')}
            </Button>
          </Space>
        </fieldset>
      ) : null}
    </div>
  )
}
