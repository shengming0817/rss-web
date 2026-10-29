import { Card } from 'antd'
import type { TelemetryDefinition } from '@rss/mdm-resources'
import {
  BooleanField,
  Choice,
  ItemList,
  JsonDocument,
  NumberField,
  TextField,
} from './AuthorFields'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

export function TelemetryAuthor({
  value,
  onChange,
  locale,
}: {
  value: TelemetryDefinition
  onChange: (value: TelemetryDefinition) => void
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Card size="small" title={l('精确采集模板', 'Exact collection template')}>
        <div className="admin-form-grid">
          <TextField
            label={l('模板资源', 'Template resource')}
            value={value.template.resource}
            onChange={(resource) =>
              onChange({ ...value, template: { ...value.template, resource } })
            }
          />
          <TextField
            label={l('模板固定版本', 'Fixed template version')}
            value={value.template.version}
            onChange={(version) => onChange({ ...value, template: { ...value.template, version } })}
          />
          <TextField
            label={l('模板变体', 'Template variant')}
            value={value.template.variant}
            onChange={(variant) => onChange({ ...value, template: { ...value.template, variant } })}
          />
          <Choice
            label={l('模板平台', 'Template platform')}
            value={value.template.platform}
            options={['windows', 'macos']}
            onChange={(platform) =>
              onChange({ ...value, template: { ...value.template, platform } })
            }
          />
          <Choice
            label={l('模板架构', 'Template architecture')}
            value={value.template.architecture}
            options={['x86_64', 'aarch64']}
            onChange={(architecture) =>
              onChange({ ...value, template: { ...value.template, architecture } })
            }
          />
        </div>
      </Card>
      <JsonDocument
        label={l('模板字面量参数', 'Template literal arguments')}
        value={value.parameters}
        onChange={(parameters) => onChange({ ...value, parameters })}
        locale={locale}
      />
      <ItemList
        label={l('精确字段引用', 'Exact field references')}
        value={value.fields}
        onChange={(fields) => onChange({ ...value, fields })}
        create={() => ({ key: '', version: 1 })}
        locale={locale}
      >
        {(field, update) => (
          <div className="admin-form-grid">
            <TextField
              label={l('字段键', 'Field key')}
              value={field.key}
              onChange={(key) => update({ ...field, key })}
            />
            <NumberField
              label={l('字段定义版本', 'Field definition version')}
              minimum={1}
              value={field.version}
              onChange={(version) => update({ ...field, version })}
            />
          </div>
        )}
      </ItemList>
      <Choice
        label={l('投影位置', 'Projection destination')}
        value={value.projection}
        options={['current', 'history', 'both']}
        onChange={(projection) => onChange({ ...value, projection })}
      />
      <div className="admin-form-grid">
        <NumberField
          label={l('采样间隔（毫秒）', 'Sample interval (milliseconds)')}
          minimum={1}
          value={value.sampleMillis}
          onChange={(sampleMillis) => onChange({ ...value, sampleMillis })}
        />
        <NumberField
          label={l('上传间隔（毫秒）', 'Upload interval (milliseconds)')}
          minimum={1}
          value={value.uploadMillis}
          onChange={(uploadMillis) => onChange({ ...value, uploadMillis })}
        />
        <NumberField
          label={l('回填期限（秒）', 'Backfill age (seconds)')}
          minimum={1}
          value={value.backfillSeconds}
          onChange={(backfillSeconds) => onChange({ ...value, backfillSeconds })}
        />
      </div>
      <Card size="small" title={l('遥测预算', 'Telemetry budget')}>
        <div className="admin-form-grid">
          <NumberField
            label={l('最大点数', 'Maximum points')}
            minimum={1}
            value={value.budget.points}
            onChange={(points) => onChange({ ...value, budget: { ...value.budget, points } })}
          />
          <NumberField
            label={l('批次字节', 'Batch bytes')}
            minimum={1}
            value={value.budget.bytes}
            onChange={(bytes) => onChange({ ...value, budget: { ...value.budget, bytes } })}
          />
          <NumberField
            label={l('最大资源数', 'Maximum resources')}
            minimum={1}
            value={value.budget.resources}
            onChange={(resources) => onChange({ ...value, budget: { ...value.budget, resources } })}
          />
          <NumberField
            label={l('执行预算（毫秒）', 'Execution budget (milliseconds)')}
            minimum={1}
            value={value.budget.executionMillis}
            onChange={(executionMillis) =>
              onChange({ ...value, budget: { ...value.budget, executionMillis } })
            }
          />
          <NumberField
            label={l('遥测输出字节', 'Telemetry output bytes')}
            minimum={1}
            value={value.budget.outputBytes}
            onChange={(outputBytes) =>
              onChange({ ...value, budget: { ...value.budget, outputBytes } })
            }
          />
        </div>
      </Card>
      <BooleanField
        label={l('临时加速采样', 'Temporary sampling boost')}
        value={value.boost !== null}
        onChange={(enabled) =>
          onChange({
            ...value,
            boost: enabled
              ? {
                  sampleMillis: value.sampleMillis,
                  expiresAt: Math.floor(Date.now() / 1000) + 3600,
                }
              : null,
          })
        }
      />
      {value.boost && (
        <div className="admin-form-grid">
          <NumberField
            label={l('加速间隔（毫秒）', 'Boost interval (milliseconds)')}
            minimum={1}
            value={value.boost.sampleMillis}
            onChange={(sampleMillis) => {
              if (value.boost) onChange({ ...value, boost: { ...value.boost, sampleMillis } })
            }}
          />
          <NumberField
            label={l('加速到期时间（Unix 秒）', 'Boost expiry (Unix seconds)')}
            minimum={1}
            value={value.boost.expiresAt}
            onChange={(expiresAt) => {
              if (value.boost) onChange({ ...value, boost: { ...value.boost, expiresAt } })
            }}
          />
        </div>
      )}
    </>
  )
}
