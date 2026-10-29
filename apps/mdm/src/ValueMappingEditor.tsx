import { useState } from 'react'
import { Button, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd'
import type { Conversion, NativeRead, ValueMapping } from '@rss/mdm-inventory'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

export const emptyMapping = (): ValueMapping => ({
  pointer: '',
  conversion: { kind: 'identity' },
  columns: {},
})
function conversion(kind: Conversion['kind']): Conversion {
  switch (kind) {
    case 'enum':
      return { kind, values: {} }
    case 'bitmask':
      return { kind, flags: {} }
    case 'array_member':
      return { kind, member: 0, present: '', absent: '' }
    case 'scale':
      return { kind, numerator: 1, denominator: 1 }
    default:
      return { kind }
  }
}
const conversions: Record<Conversion['kind'], readonly [string, string]> = {
  identity: ['原值', 'Identity'],
  cim_time: ['CIM 时间', 'CIM time'],
  integer: ['整数', 'Integer'],
  number: ['数值', 'Number'],
  enum: ['枚举转换', 'Enum conversion'],
  array_member: ['数组成员', 'Array member'],
  scale: ['比例换算', 'Scale'],
  bitmask: ['位标记', 'Bitmask'],
}
function EnumValue({
  value,
  onChange,
  locale,
}: {
  value: string | number | boolean
  onChange: (value: string | number | boolean) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Space wrap>
      <Select
        aria-label={l('枚举结果类型', 'Enum result type')}
        value={typeof value}
        options={[
          { value: 'string', label: l('文本', 'Text') },
          { value: 'number', label: l('数值', 'Number') },
          { value: 'boolean', label: l('布尔值', 'Boolean') },
        ]}
        onChange={(kind) => onChange(kind === 'boolean' ? false : kind === 'number' ? 0 : '')}
      />
      {typeof value === 'boolean' ? (
        <Checkbox checked={value} onChange={(e) => onChange(e.target.checked)}>
          {l('真', 'True')}
        </Checkbox>
      ) : typeof value === 'number' ? (
        <InputNumber
          aria-label={l('枚举数值', 'Enum number')}
          value={value}
          onChange={(n) => {
            if (n !== null) onChange(n)
          }}
        />
      ) : (
        <Input
          aria-label={l('枚举文本', 'Enum text')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Space>
  )
}
/** This edits the extraction AST. It never evaluates a mapping against sample observations. */
export function ValueMappingEditor({
  value,
  onChange,
  locale,
  depth = 0,
}: {
  value: ValueMapping
  onChange: (value: ValueMapping) => void
  locale: Locale
  depth?: number
}) {
  const l = labels(locale),
    [key, setKey] = useState(''),
    [column, setColumn] = useState(''),
    c = value.conversion
  const change = (next: Conversion) => onChange({ ...value, conversion: next })
  return (
    <div className="asset-mapping-editor">
      <Form.Item label={l('JSON 指针', 'JSON pointer')}>
        <Input
          aria-label={l('JSON 指针', 'JSON pointer')}
          value={value.pointer}
          placeholder="/items"
          onChange={(e) => onChange({ ...value, pointer: e.target.value })}
        />
      </Form.Item>
      <Form.Item label={l('值转换', 'Conversion')}>
        <Select
          aria-label={l('值转换', 'Conversion')}
          value={c.kind}
          options={Object.entries(conversions).map(([value, names]) => ({
            value,
            label: l(...names),
          }))}
          onChange={(kind: Conversion['kind']) => change(conversion(kind))}
        />
      </Form.Item>
      {c.kind === 'scale' && (
        <Space wrap>
          <Form.Item label={l('分子', 'Numerator')}>
            <InputNumber
              aria-label={l('分子', 'Numerator')}
              value={c.numerator}
              precision={0}
              onChange={(n) => {
                if (n !== null) change({ ...c, numerator: n })
              }}
            />
          </Form.Item>
          <Form.Item label={l('分母', 'Denominator')}>
            <InputNumber
              aria-label={l('分母', 'Denominator')}
              value={c.denominator}
              precision={0}
              onChange={(n) => {
                if (n !== null) change({ ...c, denominator: n })
              }}
            />
          </Form.Item>
        </Space>
      )}
      {c.kind === 'array_member' && (
        <>
          <Form.Item label={l('成员值', 'Member value')}>
            <InputNumber
              aria-label={l('成员值', 'Member value')}
              value={c.member}
              precision={0}
              onChange={(n) => {
                if (n !== null) change({ ...c, member: n })
              }}
            />
          </Form.Item>
          <Form.Item label={l('存在时的值', 'Present result')}>
            <Input
              aria-label={l('存在时的值', 'Present result')}
              value={c.present}
              onChange={(e) => change({ ...c, present: e.target.value })}
            />
          </Form.Item>
          <Form.Item label={l('不存在时的值', 'Absent result')}>
            <Input
              aria-label={l('不存在时的值', 'Absent result')}
              value={c.absent}
              onChange={(e) => change({ ...c, absent: e.target.value })}
            />
          </Form.Item>
        </>
      )}
      {(c.kind === 'enum' || c.kind === 'bitmask') && (
        <fieldset className="asset-editor-section">
          <legend>
            {c.kind === 'enum'
              ? l('输入与输出', 'Input and output')
              : l('位掩码与名称', 'Bitmasks and names')}
          </legend>
          {Object.entries(c.kind === 'enum' ? c.values : c.flags).map(([name, item]) => (
            <div className="asset-editor-row" key={name}>
              <code>{name}</code>
              {c.kind === 'enum' ? (
                <EnumValue
                  locale={locale}
                  value={item}
                  onChange={(next) => change({ ...c, values: { ...c.values, [name]: next } })}
                />
              ) : (
                <Input
                  aria-label={`${l('标记名称', 'Flag name')} ${name}`}
                  value={String(item)}
                  onChange={(e) => change({ ...c, flags: { ...c.flags, [name]: e.target.value } })}
                />
              )}
              <Button
                onClick={() => {
                  if (c.kind === 'enum') {
                    const next = { ...c.values }
                    delete next[name]
                    change({ ...c, values: next })
                  } else {
                    const next = { ...c.flags }
                    delete next[name]
                    change({ ...c, flags: next })
                  }
                }}
              >
                {l('移除', 'Remove')}
              </Button>
            </div>
          ))}
          <Space wrap>
            <Input
              aria-label={c.kind === 'enum' ? l('输入值', 'Input value') : l('位掩码', 'Bitmask')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button
              disabled={!key || Object.hasOwn(c.kind === 'enum' ? c.values : c.flags, key)}
              onClick={() => {
                change(
                  c.kind === 'enum'
                    ? { ...c, values: { ...c.values, [key]: '' } }
                    : { ...c, flags: { ...c.flags, [key]: '' } },
                )
                setKey('')
              }}
            >
              {l('添加转换', 'Add conversion')}
            </Button>
          </Space>
        </fieldset>
      )}
      <fieldset className="asset-editor-section">
        <legend>{l('集合列映射', 'Collection column mappings')}</legend>
        {Object.entries(value.columns).map(([name, child]) => (
          <details key={name} open>
            <summary>{name}</summary>
            <ValueMappingEditor
              locale={locale}
              value={child}
              depth={depth + 1}
              onChange={(next) =>
                onChange({ ...value, columns: { ...value.columns, [name]: next } })
              }
            />
            <Button
              onClick={() => {
                const columns = { ...value.columns }
                delete columns[name]
                onChange({ ...value, columns })
              }}
            >
              {l('移除此列', 'Remove column')}
            </Button>
          </details>
        ))}
        <Space wrap>
          <Input
            aria-label={l('新列名', 'New column name')}
            value={column}
            maxLength={256}
            onChange={(e) => setColumn(e.target.value)}
          />
          <Button
            disabled={!column || Object.hasOwn(value.columns, column) || depth >= 16}
            onClick={() => {
              onChange({ ...value, columns: { ...value.columns, [column]: emptyMapping() } })
              setColumn('')
            }}
          >
            {l('添加列映射', 'Add column mapping')}
          </Button>
        </Space>
      </fieldset>
    </div>
  )
}

export function NativeReadEditor({
  value,
  onChange,
  locale,
}: {
  value: NativeRead
  onChange: (value: NativeRead) => void
  locale: Locale
}) {
  const l = labels(locale),
    kind = typeof value === 'string' ? 'apple' : value.kind
  return (
    <>
      <Form.Item label={l('原生读取', 'Native read')}>
        <Select
          aria-label={l('原生读取', 'Native read')}
          value={kind}
          options={(
            ['apple', 'scalar', 'enrollment_id', 'enrollment_type', 'inventory'] as const
          ).map((value) => ({
            value,
            label: {
              apple: l('Apple 查询键', 'Apple query key'),
              scalar: 'Windows CSP URI',
              enrollment_id: l('注册标识', 'Enrollment ID'),
              enrollment_type: l('注册类型', 'Enrollment type'),
              inventory: l('Windows 资产集合', 'Windows inventory collection'),
            }[value],
          }))}
          onChange={(next: 'apple' | Exclude<NativeRead, string>['kind']) =>
            onChange(
              next === 'apple'
                ? ''
                : next === 'scalar'
                  ? { kind: 'scalar', uri: '' }
                  : next === 'inventory'
                    ? { kind: 'inventory', inventory: 'win32' }
                    : { kind: next },
            )
          }
        />
      </Form.Item>
      {typeof value === 'string' && (
        <Form.Item label={l('Apple 查询键', 'Apple query key')}>
          <Input
            aria-label={l('Apple 查询键', 'Apple query key')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </Form.Item>
      )}
      {typeof value !== 'string' && value.kind === 'scalar' && (
        <Form.Item label="CSP URI">
          <Input
            aria-label="CSP URI"
            value={value.uri}
            onChange={(e) => onChange({ ...value, uri: e.target.value })}
          />
        </Form.Item>
      )}
      {typeof value !== 'string' && value.kind === 'inventory' && (
        <Form.Item label={l('原生集合', 'Native collection')}>
          <Select
            aria-label={l('原生集合', 'Native collection')}
            value={value.inventory}
            options={[
              'win32',
              'store',
              'non_store',
              'system',
              'network',
              'installed_updates',
              'installable_updates',
              'failed_updates',
              'pending_reboot_updates',
            ].map((value) => ({ value, label: value }))}
            onChange={(inventory: typeof value.inventory) => onChange({ ...value, inventory })}
          />
        </Form.Item>
      )}
    </>
  )
}
