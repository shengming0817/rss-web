import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

export function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  return (
    <Form.Item label={label}>
      {multiline ? (
        <Input.TextArea
          aria-label={label}
          value={value}
          rows={5}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Form.Item>
  )
}
export function NumberField({
  label,
  value,
  onChange,
  minimum = 0,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  minimum?: number
}) {
  return (
    <Form.Item label={label}>
      <InputNumber
        aria-label={label}
        value={value}
        min={minimum}
        precision={0}
        onChange={(next) => {
          if (next !== null) onChange(next)
        }}
      />
    </Form.Item>
  )
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <Form.Item label={label}>
      <Select
        aria-label={label}
        value={value}
        options={options.map((value) => ({ value, label: value }))}
        onChange={onChange}
      />
    </Form.Item>
  )
}
export function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Form.Item label={label}>
      <Switch aria-label={label} checked={value} onChange={onChange} />
    </Form.Item>
  )
}
export function StringListField({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: readonly string[]
  onChange: (value: readonly string[]) => void
  locale: Locale
}) {
  return (
    <ItemList label={label} value={value} onChange={onChange} create={() => ''} locale={locale}>
      {(item, update, index) => (
        <TextField label={`${label} ${index + 1}`} value={item} onChange={update} />
      )}
    </ItemList>
  )
}
export function DigestField({
  label,
  value,
  onChange,
}: {
  label: string
  value: readonly number[]
  onChange: (value: readonly number[]) => void
}) {
  const digest = value.map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    [text, setText] = useState(digest)
  useEffect(() => {
    if (/^[a-f0-9]{64}$/.test(digest)) setText(digest)
  }, [digest])
  return (
    <Form.Item label={label}>
      <Input
        aria-label={label}
        value={text}
        status={/^[a-fA-F0-9]{64}$/.test(text) ? '' : 'error'}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          onChange(
            /^[a-fA-F0-9]{64}$/.test(next)
              ? next.match(/../g)!.map((pair) => Number.parseInt(pair, 16))
              : [],
          )
        }}
      />
    </Form.Item>
  )
}
export function NamedRecord<T>({
  label,
  value,
  onChange,
  create,
  children,
  locale,
}: {
  label: string
  value: Readonly<Record<string, T>>
  onChange: (value: Readonly<Record<string, T>>) => void
  create: () => T
  children: (item: T, update: (item: T) => void, key: string) => ReactNode
  locale: Locale
}) {
  const l = labels(locale),
    [key, setKey] = useState('')
  return (
    <Card size="small" title={label}>
      {Object.entries(value).map(([key, item]) => (
        <fieldset className="author-record" key={key}>
          <legend>{key}</legend>
          <div className="resource-card-top">
            <strong>{key}</strong>
            <Button
              danger
              onClick={() => {
                const next = { ...value }
                delete next[key]
                onChange(next)
              }}
            >
              {l('移除', 'Remove')} {key}
            </Button>
          </div>
          {children(item, (next) => onChange({ ...value, [key]: next }), key)}
        </fieldset>
      ))}
      <Space wrap>
        <Input
          aria-label={`${label} ${l('新键', 'new key')}`}
          value={key}
          maxLength={256}
          onChange={(event) => setKey(event.target.value)}
        />
        <Button
          disabled={!key || Object.hasOwn(value, key)}
          onClick={() => {
            if (!key || Object.hasOwn(value, key)) return
            onChange({ ...value, [key]: create() })
            setKey('')
          }}
        >
          {l('添加', 'Add')}
        </Button>
      </Space>
    </Card>
  )
}
export function ItemList<T>({
  label,
  value,
  onChange,
  create,
  children,
  locale,
}: {
  label: string
  value: readonly T[]
  onChange: (value: readonly T[]) => void
  create: () => T
  children: (item: T, update: (item: T) => void, index: number) => ReactNode
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <Card size="small" title={label}>
      {value.map((item, index) => (
        <fieldset className="author-record" key={index}>
          <legend>
            {label} {index + 1}
          </legend>
          <div className="resource-card-top">
            <strong>
              {label} {index + 1}
            </strong>
            <Button danger onClick={() => onChange(value.filter((_, item) => item !== index))}>
              {l('移除', 'Remove')} {index + 1}
            </Button>
          </div>
          {children(
            item,
            (next) => onChange(value.map((item, current) => (current === index ? next : item))),
            index,
          )}
        </fieldset>
      ))}
      <Button onClick={() => onChange([...value, create()])}>
        {l('添加', 'Add')} {label}
      </Button>
    </Card>
  )
}
/** Only literal arguments and JSON Schema documents use this open-value editor. Closed domain definitions use typed fields. */
export function JsonLiteral({
  label,
  value,
  onChange,
  locale,
  depth = 0,
}: {
  label: string
  value: unknown
  onChange: (value: unknown) => void
  locale: Locale
  depth?: number
}) {
  const l = labels(locale),
    kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    initial = (kind: string): unknown =>
      kind === 'null'
        ? null
        : kind === 'object'
          ? {}
          : kind === 'array'
            ? []
            : kind === 'boolean'
              ? false
              : kind === 'number'
                ? 0
                : ''
  return (
    <div className="author-literal">
      <Choice
        label={`${label} ${l('值类型', 'value type')}`}
        value={kind}
        options={['null', 'string', 'number', 'boolean', 'object', 'array']}
        onChange={(next) => onChange(initial(next))}
      />
      {typeof value === 'string' && <TextField label={label} value={value} onChange={onChange} />}
      {typeof value === 'number' && (
        <Form.Item label={label}>
          <InputNumber
            aria-label={label}
            value={value}
            onChange={(next) => {
              if (next !== null) onChange(next)
            }}
          />
        </Form.Item>
      )}
      {typeof value === 'boolean' && (
        <BooleanField label={label} value={value} onChange={onChange} />
      )}
      {depth < 32 && Array.isArray(value) && (
        <ItemList
          label={label}
          value={value}
          onChange={onChange}
          create={() => null}
          locale={locale}
        >
          {(item, update, index) => (
            <JsonLiteral
              label={`${label}[${index}]`}
              value={item}
              onChange={update}
              locale={locale}
              depth={depth + 1}
            />
          )}
        </ItemList>
      )}
      {depth < 32 && value !== null && typeof value === 'object' && !Array.isArray(value) && (
        <NamedRecord
          label={label}
          value={value as Readonly<Record<string, unknown>>}
          onChange={onChange}
          create={() => null}
          locale={locale}
        >
          {(item, update, key) => (
            <JsonLiteral
              label={`${label}.${key}`}
              value={item}
              onChange={update}
              locale={locale}
              depth={depth + 1}
            />
          )}
        </NamedRecord>
      )}
    </div>
  )
}
export function JsonDocument({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: Readonly<Record<string, unknown>>
  onChange: (value: Readonly<Record<string, unknown>>) => void
  locale: Locale
}) {
  return (
    <NamedRecord
      label={label}
      value={value}
      onChange={onChange}
      create={() => null}
      locale={locale}
    >
      {(item, update, key) => (
        <JsonLiteral
          label={`${label}.${key}`}
          value={item}
          onChange={update}
          locale={locale}
          depth={1}
        />
      )}
    </NamedRecord>
  )
}
export function StringRecord({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: Readonly<Record<string, string>>
  onChange: (value: Readonly<Record<string, string>>) => void
  locale: Locale
}) {
  return (
    <NamedRecord label={label} value={value} onChange={onChange} create={() => ''} locale={locale}>
      {(item, update, key) => (
        <TextField label={`${label}.${key}`} value={item} onChange={update} />
      )}
    </NamedRecord>
  )
}

export function NumberListField({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: readonly number[]
  onChange: (value: readonly number[]) => void
  locale: Locale
}) {
  return (
    <ItemList label={label} value={value} onChange={onChange} create={() => 0} locale={locale}>
      {(item, update, index) => (
        <NumberField
          label={`${label} ${index + 1}`}
          value={item}
          onChange={update}
          minimum={-2147483648}
        />
      )}
    </ItemList>
  )
}
