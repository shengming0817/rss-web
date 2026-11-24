import { useId, useState } from 'react'
import { Button, Form, Input, Select } from 'antd'
import type { FieldRow, Predicate, ValueType } from '@rss/mdm-inventory'
import type { Locale } from './i18n'
import { labels, ReadState, useRead } from './AdminUi'
import { PredicateEditor, withOperator } from './PredicateEditor'
import { comparison } from '@rss/api/mdm-query'

import {
  currentFields as current,
  registrationFields as registered,
  type RuleCatalog,
} from './group-rule-catalog'
const projection = ['key', 'operations', 'valueType'] as const
function operand(type: ValueType): NonNullable<Predicate['value']> {
  switch (type.kind) {
    case 'array':
      return operand(type.items)
    case 'integer':
    case 'time':
    case 'number':
      return { kind: type.kind, value: 0 }
    case 'boolean':
      return { kind: 'boolean', value: false }
    case 'enum':
      return { kind: 'string', value: type.values[0] ?? '' }
    default:
      return { kind: 'string', value: '' }
  }
}
function enumChoices(type: ValueType): readonly string[] | undefined {
  return type.kind === 'enum'
    ? type.values
    : type.kind === 'array'
      ? enumChoices(type.items)
      : undefined
}
function LocalGroups({ catalog, locale, value, onChange }: Props) {
  const l = labels(locale)
  const [cursor, setCursor] = useState<string | null>(null)
  const page = useRead(`${catalog.scope}/local-user-groups/${cursor}`, (signal) =>
    catalog.userGroups(
      {
        fields: ['id', 'name'],
        filter: 'deleted==false;enabled==true',
        limit: 50,
        ...(cursor ? { cursor } : {}),
      },
      signal,
    ),
  )
  return (
    <>
      <ReadState locale={locale} busy={page.busy} error={page.error} onRetry={page.reload} />
      <Select
        aria-label={l('授权用户组', 'Authorization user groups')}
        mode="multiple"
        value={(value.values ?? []).flatMap((v) => (v.kind === 'string' ? [v.value] : []))}
        options={page.value?.items.map((g) => ({ value: g.id, label: g.name ?? g.id })) ?? []}
        onChange={(ids: string[]) =>
          onChange({ ...value, values: ids.map((id) => ({ kind: 'string', value: id })) })
        }
      />
      {cursor && (
        <Button onClick={() => setCursor(null)}>{l('用户组首页', 'First user groups')}</Button>
      )}
      {page.value?.nextCursor && (
        <Button onClick={() => setCursor(page.value!.nextCursor)}>
          {l('更多用户组', 'Next user groups')}
        </Button>
      )}
    </>
  )
}

interface Props {
  catalog: RuleCatalog
  locale: Locale
  value: Predicate
  onChange: (next: Predicate) => void
}
function CatalogField({ prefix, ...props }: Props & { prefix: string }) {
  const { catalog, locale, value, onChange } = props
  const l = labels(locale)
  const [cursor, setCursor] = useState<string | null>(null)
  const optionsId = useId()
  const [committed, setCommitted] = useState(value.field)
  const page = useRead(`${catalog.scope}/group-fields/${prefix}/${cursor}`, (signal) =>
    catalog.fields(
      {
        ...(prefix ? { filter: comparison('key', '=icontains=', prefix) } : {}),
        fields: projection,
        limit: 50,
        ...(cursor ? { cursor } : {}),
      },
      signal,
    ),
  )
  const rows =
    page.value?.items.filter(
      (r): r is FieldRow & Required<Pick<FieldRow, 'operations' | 'valueType'>> =>
        (prefix
          ? r.key.startsWith(prefix)
          : ![registered, current].some((p) => r.key.startsWith(p))) &&
        !!r.operations?.length &&
        !!r.valueType,
    ) ?? []
  const listed = rows.find((r) => r.key === value.field)
  const missing =
    page.value && !listed && value.field !== prefix && (prefix || committed === value.field)
      ? value.field
      : ''
  const selected = useRead(`${catalog.scope}/selected-group-field/${missing}`, (signal) =>
    missing
      ? catalog.fields(
          { filter: comparison('key', '==', missing), fields: projection, limit: 1 },
          signal,
        )
      : Promise.resolve(null),
  )
  const row = listed ?? selected.value?.items.find((r) => r.key === value.field)
  const title = prefix ? l('人员属性', 'User attribute') : l('条件字段', 'Condition field')
  const options = rows.map((r) => ({ value: r.key, label: r.key.slice(prefix.length) }))
  function changeField(key: string) {
    const next = rows.find((r) => r.key === key)
    onChange(
      next
        ? withOperator(
            key,
            next.operations.includes('contains_any') ? 'contains_any' : next.operations[0]!,
            operand(next.valueType),
          )
        : { ...value, field: key },
    )
  }
  return (
    <>
      <Form.Item label={title}>
        {prefix ? (
          <Select
            aria-label={title}
            value={value.field === prefix ? null : value.field}
            options={options}
            onChange={changeField}
          />
        ) : (
          <>
            <Input
              aria-label={title}
              list={optionsId}
              value={value.field}
              onChange={(event) => changeField(event.target.value)}
              onBlur={(event) => setCommitted(event.target.value)}
            />
            <datalist id={optionsId}>
              {options.map((item) => (
                <option key={item.value} value={item.value} />
              ))}
            </datalist>
          </>
        )}
      </Form.Item>
      <ReadState locale={locale} busy={page.busy} error={page.error} onRetry={page.reload} />
      {cursor && (
        <Button onClick={() => setCursor(null)}>{l('属性首页', 'First attributes')}</Button>
      )}
      {page.value?.nextCursor && (
        <Button onClick={() => setCursor(page.value!.nextCursor)}>
          {l('更多属性', 'Next attributes')}
        </Button>
      )}
      <ReadState
        locale={locale}
        busy={selected.busy}
        error={selected.error}
        onRetry={selected.reload}
      />
      {prefix && selected.value && !row && (
        <p>
          {l(
            '此属性已不可用，请重新选择。',
            'This attribute is unavailable. Select another attribute.',
          )}
        </p>
      )}
      {(!prefix || (row?.valueType && row.operations?.length)) && (
        <PredicateEditor
          {...props}
          showField={false}
          {...(row?.valueType && row.operations?.length
            ? {
                descriptor: {
                  operations: row.operations,
                  initial: operand(row.valueType),
                  choices: enumChoices(row.valueType),
                },
              }
            : {})}
          {...(prefix &&
          row?.key === prefix + 'local_group_ids' &&
          ['contains_all', 'contains_any'].includes(value.op)
            ? { operands: <LocalGroups {...props} /> }
            : {})}
        />
      )}
    </>
  )
}

export function GroupPredicate(props: Props) {
  const { locale, value, onChange } = props
  const l = labels(locale)
  const prefix = [registered, current].find((p) => value.field.startsWith(p)) ?? ''
  const label = l('条件来源', 'Condition source')
  return (
    <>
      <Form.Item label={label}>
        <Select
          aria-label={label}
          value={prefix}
          options={[
            { value: '', label: l('设备属性', 'Device property') },
            {
              value: registered,
              disabled: !props.catalog.registration,
              label: l('注册用户', 'Registration user'),
            },
            { value: current, label: l('当前使用人', 'Current user') },
          ]}
          onChange={(field: string) =>
            onChange({ kind: 'predicate', field, op: 'eq', value: { kind: 'string', value: '' } })
          }
        />
      </Form.Item>
      {prefix === registered && !props.catalog.registration ? (
        <p>
          {l(
            '此条件需要全部设备的注册读取权限。',
            'This condition requires enrollment access to all devices.',
          )}
        </p>
      ) : (
        <CatalogField key={prefix} prefix={prefix} {...props} />
      )}
    </>
  )
}
