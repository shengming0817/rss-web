import { Card } from 'antd'
import type { ScriptDefinition } from '@rss/mdm-resources'
import {
  BudgetEditor,
  ScopeEditor,
  ApplicabilityEditor,
  emptyApplicability,
} from './CollectionAuthor'
import { Choice, JsonDocument, NamedRecord, NumberField, TextField } from './AuthorFields'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export function ScriptAuthor({
  value,
  onChange,
  locale,
}: {
  value: ScriptDefinition
  onChange: (value: ScriptDefinition) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <div className="admin-form-grid">
        <Choice
          label={l('脚本运行时', 'Script runtime')}
          value={value.profile}
          options={['power_shell7', 'posix_sh', 'bash', 'osquery']}
          onChange={(profile) => onChange({ ...value, profile })}
        />
        <Choice
          label={l('脚本执行身份', 'Script execution identity')}
          value={value.runAs}
          options={['system', 'logged_in_user']}
          onChange={(runAs) => onChange({ ...value, runAs })}
        />
        <Choice
          label={l('脚本编码', 'Script encoding')}
          value={value.encoding}
          options={['utf8']}
          onChange={(encoding) => onChange({ ...value, encoding })}
        />
      </div>
      <TextField
        label={l('SQL（适用时）', 'SQL (where applicable)')}
        multiline
        value={value.sql ?? ''}
        onChange={(sql) => onChange({ ...value, sql: sql || null })}
      />
      <BudgetEditor
        value={value}
        onChange={(budget) => onChange({ ...value, ...budget })}
        locale={locale}
      />
      <JsonDocument
        label={l('参数 JSON Schema', 'Parameter JSON Schema')}
        value={value.parameters}
        onChange={(parameters) => onChange({ ...value, parameters })}
        locale={locale}
      />
      <p className="subtitle">
        {l(
          '参数对象的 properties 必须全部列入 required，并将 additionalProperties 设为 false。除 osquery 外，每个参数需有一个绑定。',
          'Include every parameter property in required and set additionalProperties to false. Each parameter needs one binding except for osquery.',
        )}
      </p>
      <JsonDocument
        label={l('输出 JSON Schema', 'Output JSON Schema')}
        value={value.output}
        onChange={(output) => onChange({ ...value, output })}
        locale={locale}
      />
      <NamedRecord<ScriptDefinition['bindings'][string]>
        label={l('参数绑定', 'Parameter bindings')}
        value={value.bindings}
        onChange={(bindings) => onChange({ ...value, bindings })}
        create={() => ({ kind: 'named', name: '' })}
        locale={locale}
      >
        {(binding, update, key) => (
          <>
            <Choice
              label={`${key} ${l('绑定方式', 'binding kind')}`}
              value={binding.kind}
              options={['named', 'environment', 'positional']}
              onChange={(kind) =>
                update(kind === 'positional' ? { kind, index: 1 } : { kind, name: '' })
              }
            />
            {binding.kind === 'positional' ? (
              <NumberField
                label={`${key} ${l('参数位置', 'argument position')}`}
                value={binding.index}
                onChange={(index) => update({ ...binding, index })}
              />
            ) : (
              <TextField
                label={`${key} ${l('参数名称', 'argument name')}`}
                value={binding.name}
                onChange={(name) => update({ ...binding, name })}
              />
            )}
          </>
        )}
      </NamedRecord>
      <Card size="small" title={l('脚本用途', 'Script purpose')}>
        <Choice
          label={l('脚本用途', 'Script purpose')}
          value={value.purpose.kind}
          options={['action', 'collection']}
          onChange={(kind) =>
            onChange({
              ...value,
              purpose:
                kind === 'action'
                  ? { kind }
                  : {
                      kind,
                      scope: { kind: 'device' },
                      applicability: emptyApplicability(),
                      mappings: {},
                    },
            })
          }
        />
        {value.purpose.kind === 'collection' && (
          <>
            <ScopeEditor
              value={value.purpose.scope}
              onChange={(scope) => {
                if (value.purpose.kind === 'collection')
                  onChange({ ...value, purpose: { ...value.purpose, scope } })
              }}
              locale={locale}
            />
            <ApplicabilityEditor
              value={value.purpose.applicability}
              onChange={(applicability) => {
                if (value.purpose.kind === 'collection')
                  onChange({ ...value, purpose: { ...value.purpose, applicability } })
              }}
              locale={locale}
            />
          </>
        )}
      </Card>
    </>
  )
}
