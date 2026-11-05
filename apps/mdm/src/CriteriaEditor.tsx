import { Button, Form, Input, Select, Space } from 'antd'
import { operators, type AssetContext, type Criteria, type Predicate } from '@rss/mdm-inventory'
import type { GroupCriteria } from '@rss/mdm-groups'
import type { Scalar } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { ScalarEditor } from './ScalarEditor'
import { GroupPicker, type GroupsUseCases } from './GroupPicker'

export const emptyPredicate = (): Predicate => ({
  kind: 'predicate',
  field: '',
  op: 'eq',
  value: { kind: 'string', value: '' },
})
function primitive(value: Scalar): value is NonNullable<Predicate['value']> {
  return value.kind !== 'array' && value.kind !== 'object'
}
function PredicateEditor({
  value,
  onChange,
  locale,
}: {
  value: Predicate
  onChange: (value: Predicate) => void
  locale: Locale
}) {
  const l = labels(locale),
    multiple = ['in', 'not_in', 'contains_any', 'contains_all'].includes(value.op),
    unary = ['is_null', 'is_not_null'].includes(value.op)
  return (
    <>
      <Form.Item label={l('条件字段', 'Condition field')}>
        <Input
          aria-label={l('条件字段', 'Condition field')}
          value={value.field}
          onChange={(e) => onChange({ ...value, field: e.target.value })}
        />
      </Form.Item>
      <Form.Item label={l('比较操作', 'Comparison')}>
        <Select
          aria-label={l('比较操作', 'Comparison')}
          value={value.op}
          options={operators.map((value) => ({ value, label: value }))}
          onChange={(op: Predicate['op']) => {
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
      {!unary &&
        (multiple ? (
          <>
            {(value.values ?? []).map((item, index) => (
              <div key={index}>
                <ScalarEditor
                  locale={locale}
                  compound={false}
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
                  values: [...(value.values ?? []), { kind: 'string', value: '' }],
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
            value={value.value ?? { kind: 'string', value: '' }}
            onChange={(next) => {
              if (primitive(next)) onChange({ ...value, value: next })
            }}
          />
        ))}
    </>
  )
}
/** Fact-only authoring is shared with compliance. No condition evaluation runs in the browser. */
export function CriteriaEditor({
  value,
  onChange,
  locale,
  depth = 0,
}: {
  value: Criteria
  onChange: (value: Criteria) => void
  locale: Locale
  depth?: number
}) {
  const l = labels(locale)
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('事实条件', 'Fact condition')}</legend>
      <Select
        aria-label={l('条件组合', 'Condition combination')}
        value={value.kind}
        options={[
          { value: 'predicate', label: l('字段比较', 'Field comparison') },
          { value: 'and', label: l('全部满足', 'All conditions') },
          { value: 'or', label: l('任一满足', 'Any condition') },
        ]}
        onChange={(kind: Criteria['kind']) =>
          onChange(kind === 'predicate' ? emptyPredicate() : { kind, children: [] })
        }
      />
      {value.kind === 'predicate' ? (
        <PredicateEditor locale={locale} value={value} onChange={onChange} />
      ) : (
        <>
          {value.children.map((child, index) => (
            <div key={index}>
              <CriteriaEditor
                locale={locale}
                value={child}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({
                    ...value,
                    children: value.children.map((v, i) => (i === index ? next : v)),
                  })
                }
              />
              <Button
                onClick={() =>
                  onChange({ ...value, children: value.children.filter((_, i) => i !== index) })
                }
              >
                {l('移除条件', 'Remove condition')}
              </Button>
            </div>
          ))}
          <Button
            disabled={depth >= 16}
            onClick={() => onChange({ ...value, children: [...value.children, emptyPredicate()] })}
          >
            {l('添加子条件', 'Add child condition')}
          </Button>
        </>
      )}
    </fieldset>
  )
}
export function GroupCriteriaEditor({
  value,
  onChange,
  locale,
  groups,
  assetContext,
  referenceableFor,
  depth = 0,
}: {
  value: GroupCriteria
  onChange: (value: GroupCriteria) => void
  locale: Locale
  groups: GroupsUseCases
  assetContext: AssetContext
  referenceableFor?: string
  depth?: number
}) {
  const l = labels(locale)
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('组规则条件', 'Group rule condition')}</legend>
      <Select
        aria-label={l('组条件组合', 'Group condition combination')}
        value={value.kind}
        options={[
          { value: 'predicate', label: l('字段比较', 'Field comparison') },
          { value: 'and', label: l('全部满足', 'All conditions') },
          { value: 'or', label: l('任一满足', 'Any condition') },
          { value: 'group', label: l('嵌套设备组', 'Nested device group') },
        ]}
        onChange={(kind: GroupCriteria['kind']) =>
          onChange(
            kind === 'predicate'
              ? emptyPredicate()
              : kind === 'group'
                ? { kind, groupId: '', op: 'member_of' }
                : { kind, children: [] },
          )
        }
      />
      {value.kind === 'predicate' ? (
        <PredicateEditor locale={locale} value={value} onChange={onChange} />
      ) : value.kind === 'group' ? (
        <>
          <Form.Item label={l('组关系', 'Group relation')}>
            <Select
              aria-label={l('组关系', 'Group relation')}
              value={value.op}
              options={[
                { value: 'member_of', label: l('属于设备组', 'Member of group') },
                { value: 'not_member_of', label: l('不属于设备组', 'Not a member of group') },
              ]}
              onChange={(op: typeof value.op) => onChange({ ...value, op })}
            />
          </Form.Item>
          <GroupPicker
            groups={groups}
            locale={locale}
            assetContext={assetContext}
            {...(referenceableFor ? { referenceableFor } : {})}
            value={value.groupId || null}
            onChange={(groupId) => onChange({ ...value, groupId })}
          />
        </>
      ) : (
        <>
          {value.children.map((child, index) => (
            <div key={index}>
              <GroupCriteriaEditor
                locale={locale}
                groups={groups}
                assetContext={assetContext}
                {...(referenceableFor ? { referenceableFor } : {})}
                value={child}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({
                    ...value,
                    children: value.children.map((v, i) => (i === index ? next : v)),
                  })
                }
              />
              <Space wrap>
                <Button
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...value.children]
                    ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                    onChange({ ...value, children: next })
                  }}
                >
                  {l('条件上移', 'Move condition up')}
                </Button>
                <Button
                  onClick={() =>
                    onChange({ ...value, children: value.children.filter((_, i) => i !== index) })
                  }
                >
                  {l('移除条件', 'Remove condition')}
                </Button>
              </Space>
            </div>
          ))}
          <Button
            disabled={depth >= 16}
            onClick={() => onChange({ ...value, children: [...value.children, emptyPredicate()] })}
          >
            {l('添加子条件', 'Add child condition')}
          </Button>
        </>
      )}
    </fieldset>
  )
}
