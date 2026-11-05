import { Button, Form, Select, Tag } from 'antd'
import type { SelfService, UserSelector } from '@rss/mdm-policies'
import type { Subject } from '@rss/mdm-authorization'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { BooleanField, TextField } from './AuthorFields'
import { SubjectEditor } from './Authorization'
import { labels } from './AdminUi'

export function PolicySelfService({
  value,
  onChange,
  runtime,
  locale,
  instance,
  software,
}: {
  value: SelfService | null
  onChange: (value: SelfService | null) => void
  runtime: Runtime
  locale: Locale
  instance: string
  software: boolean
}) {
  const l = labels(locale)
  function subject(selector: UserSelector): Subject {
    return selector.kind === 'user'
      ? {
          kind: 'user',
          user: {
            instanceId: selector.instanceId,
            tenantId: selector.tenantId,
            principalId: selector.principalId,
          },
        }
      : selector
  }
  function selector(subject: Subject): UserSelector {
    return subject.kind === 'user' ? { kind: 'user', ...subject.user } : subject
  }
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('自助访问与发布', 'Self-service access and publication')}</legend>
      <BooleanField
        label={l('配置自助访问', 'Configure self-service access')}
        value={value !== null}
        onChange={(enabled) =>
          onChange(
            enabled
              ? { access: null, published: false, presentation: {}, allowAi: true, riskLevel: 2 }
              : null,
          )
        }
      />
      {value && (
        <>
          <Form.Item label={l('访问主体', 'Access basis')}>
            <Select
              aria-label={l('访问主体', 'Access basis')}
              value={value.access?.kind ?? 'none'}
              options={[
                { value: 'none', label: l('未选择（不可发布）', 'Not selected (cannot publish)') },
                {
                  value: 'device',
                  label: l('当前范围内的受信设备', 'Trusted device in the current scope'),
                },
                {
                  value: 'authenticated_user',
                  label: l('已认证企业用户', 'Authenticated enterprise user'),
                },
                { value: 'users', label: l('指定用户与组织', 'Selected users and organization') },
              ]}
              onChange={(kind: 'none' | 'device' | 'authenticated_user' | 'users') =>
                onChange({
                  ...value,
                  access:
                    kind === 'none' ? null : kind === 'users' ? { kind, selectors: [] } : { kind },
                })
              }
            />
          </Form.Item>
          {value.access?.kind === 'users' && (
            <>
              <p className="subtitle">
                {l(
                  '以下引用按“任一匹配”处理，且仍受设备范围和当前授权限制。',
                  'Any selector may match; device scope and current authorization still apply.',
                )}
              </p>
              {value.access.selectors.map((item, index) => (
                <fieldset className="asset-editor-section" key={index}>
                  <Tag>{index + 1}</Tag>
                  <SubjectEditor
                    runtime={runtime}
                    locale={locale}
                    instance={instance}
                    value={subject(item)}
                    onChange={(next) => {
                      if (value.access?.kind === 'users')
                        onChange({
                          ...value,
                          access: {
                            kind: 'users',
                            selectors: value.access.selectors.map((item, i) =>
                              i === index ? selector(next) : item,
                            ),
                          },
                        })
                    }}
                  />
                  <Button
                    danger
                    onClick={() => {
                      if (value.access?.kind === 'users')
                        onChange({
                          ...value,
                          access: {
                            kind: 'users',
                            selectors: value.access.selectors.filter((_, i) => i !== index),
                          },
                        })
                    }}
                  >
                    {l('移除访问引用', 'Remove access selector')}
                  </Button>
                </fieldset>
              ))}
              <Button
                onClick={() => {
                  if (value.access?.kind === 'users')
                    onChange({
                      ...value,
                      access: {
                        kind: 'users',
                        selectors: [
                          ...value.access.selectors,
                          {
                            kind: 'user',
                            instanceId: instance,
                            tenantId: runtime.tenant,
                            principalId: '',
                          },
                        ],
                      },
                    })
                }}
              >
                {l('添加访问引用', 'Add access selector')}
              </Button>
            </>
          )}
          {(
            ['displayName', 'description', 'prerequisites', 'sideEffects', 'category'] as const
          ).map((key) => (
            <TextField
              key={key}
              label={
                {
                  displayName: l('目录名称', 'Directory name'),
                  description: l('用途说明', 'Description'),
                  prerequisites: l('使用前提', 'Prerequisites'),
                  sideEffects: l('可能影响', 'Side effects'),
                  category: l('分类', 'Category'),
                }[key]
              }
              value={
                typeof value.presentation[key] === 'string'
                  ? (value.presentation[key] as string)
                  : ''
              }
              onChange={(text) =>
                onChange({ ...value, presentation: { ...value.presentation, [key]: text } })
              }
            />
          ))}
          {!software && (
            <>
              <BooleanField
                label={l('允许 AI 调用', 'Allow AI invocation')}
                value={value.allowAi ?? true}
                onChange={(allowAi) => onChange({ ...value, allowAi })}
              />
              <Form.Item label={l('调用确认', 'Invocation confirmation')}>
                <Select
                  aria-label={l('调用确认', 'Invocation confirmation')}
                  value={value.riskLevel ?? 2}
                  options={[
                    { value: 1, label: l('低风险', 'Low risk') },
                    { value: 2, label: l('每次确认', 'Confirm each invocation') },
                  ]}
                  onChange={(riskLevel: 1 | 2) => onChange({ ...value, riskLevel })}
                />
              </Form.Item>
            </>
          )}
          <BooleanField
            label={l('发布到自助目录', 'Publish to the self-service directory')}
            value={value.published}
            onChange={(published) => onChange({ ...value, published })}
          />
          <p className="subtitle">
            {l(
              '发布目录、关闭 AI、停用策略分别保存其含义；发布目录不会创建运行。',
              'Directory publication, disabling AI and disabling the policy have separate meanings. Publishing does not create a run.',
            )}
          </p>
        </>
      )}
    </fieldset>
  )
}
