import { PredicateEditor } from './PredicateEditor'
import { GroupPredicate, type RuleCatalog } from './GroupPredicate'
import { Button, Form, Select, Space } from 'antd'
import { type AssetContext, type Criteria, type Predicate } from '@rss/mdm-inventory'
import type { GroupCriteria } from '@rss/mdm-groups'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { GroupPicker, type GroupsUseCases } from './GroupPicker'

export const emptyPredicate = (): Predicate => ({
  kind: 'predicate',
  field: '',
  op: 'eq',
  value: { kind: 'string', value: '' },
})
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
  catalog,
  assetContext,
  referenceableFor,
  depth = 0,
}: {
  value: GroupCriteria
  onChange: (value: GroupCriteria) => void
  locale: Locale
  groups: GroupsUseCases
  catalog: RuleCatalog
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
        <GroupPredicate catalog={catalog} locale={locale} value={value} onChange={onChange} />
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
                catalog={catalog}
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
