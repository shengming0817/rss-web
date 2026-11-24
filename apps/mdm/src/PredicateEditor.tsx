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
export function PredicateEditor({
  value,
  onChange,
  locale,
  descriptor,
  changeOperator,
  operands,
}: {
  descriptor?: { operations: readonly Predicate['op'][]; initial: NonNullable<Predicate['value']> }
  changeOperator?: (op: Predicate['op']) => void
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
          onChange={(op: Predicate['op']) => {
            if (changeOperator) return changeOperator(op)
            const base = { kind: 'predicate' as const, field: value.field, op }
            onChange(
              ['is_null', 'is_not_null'].includes(op)
                ? base
                : ['in', 'not_in', 'contains_any', 'contains_all'].includes(op)
                  ? { ...base, values: value.values ?? (value.value ? [value.value] : []) }
                  : {
                      ...base,
                      value: value.value ?? value.values?.[0] ?? { kind: 'string', value: '' },
                    },
            )
          }}
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
