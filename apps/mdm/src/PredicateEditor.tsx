import type { ReactNode } from 'react'
import { Button, Form, Input, Select } from 'antd'
import { operators, type Predicate } from '@rss/mdm-inventory'
import type { Scalar } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { ScalarEditor } from './ScalarEditor'

function primitive(value: Scalar): value is NonNullable<Predicate['value']> {
  return value.kind !== 'array' && value.kind !== 'object'
}
export function withOperator(
  field: string,
  op: Predicate['op'],
  initial: NonNullable<Predicate['value']>,
  previous?: Predicate,
): Predicate {
  const base = { kind: 'predicate' as const, field, op }
  if (['is_null', 'is_not_null'].includes(op)) return base
  if (['in', 'not_in', 'contains_any', 'contains_all'].includes(op))
    return { ...base, values: previous?.values ?? (previous?.value ? [previous.value] : []) }
  return { ...base, value: previous?.value ?? previous?.values?.[0] ?? initial }
}
export function PredicateEditor({
  value,
  onChange,
  locale,
  descriptor,
  operands,
}: {
  descriptor?: { operations: readonly Predicate['op'][]; initial: NonNullable<Predicate['value']> }
  operands?: ReactNode
  value: Predicate
  onChange: (value: Predicate) => void
  locale: Locale
}) {
  const l = labels(locale),
    multiple = ['in', 'not_in', 'contains_any', 'contains_all'].includes(value.op),
    unary = ['is_null', 'is_not_null'].includes(value.op)
  return (
    <>
      {!descriptor && (
        <Form.Item label={l('条件字段', 'Condition field')}>
          <Input
            aria-label={l('条件字段', 'Condition field')}
            value={value.field}
            onChange={(e) => onChange({ ...value, field: e.target.value })}
          />
        </Form.Item>
      )}
      <Form.Item label={l('比较操作', 'Comparison')}>
        <Select
          aria-label={l('比较操作', 'Comparison')}
          value={value.op}
          options={(descriptor?.operations ?? operators).map((value) => ({ value, label: value }))}
          onChange={(op: Predicate['op']) =>
            onChange(
              withOperator(
                value.field,
                op,
                descriptor?.initial ?? { kind: 'string', value: '' },
                value,
              ),
            )
          }
        />
      </Form.Item>
      {operands ??
        (!unary &&
          (multiple ? (
            <>
              {(value.values ?? []).map((item, index) => (
                <div key={index}>
                  <ScalarEditor
                    locale={locale}
                    compound={false}
                    fixedType={!!descriptor}
                    value={item}
                    onChange={(next) => {
                      if (primitive(next))
                        onChange({
                          ...value,
                          values: (value.values ?? []).map((v, i) => (i === index ? next : v)),
                        })
                    }}
                  />
                  <Button
                    onClick={() =>
                      onChange({
                        ...value,
                        values: value.values?.filter((_, i) => i !== index) ?? [],
                      })
                    }
                  >
                    {l('移除条件值', 'Remove condition value')}
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  onChange({
                    ...value,
                    values: [
                      ...(value.values ?? []),
                      descriptor?.initial ?? { kind: 'string', value: '' },
                    ],
                  })
                }
              >
                {l('添加条件值', 'Add condition value')}
              </Button>
            </>
          ) : (
            <ScalarEditor
              locale={locale}
              compound={false}
              fixedType={!!descriptor}
              value={value.value ?? { kind: 'string', value: '' }}
              onChange={(next) => {
                if (primitive(next)) onChange({ ...value, value: next })
              }}
            />
          )))}
    </>
  )
}
