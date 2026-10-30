import { Button, Checkbox, Form, InputNumber } from 'antd'
import type { RolloutStage } from '@rss/mdm-policies'
import type { ScopesUseCases } from './ScopeResults'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
import { ScopePicker } from './ScopePicker'

export function PolicyRolloutEditor({
  value,
  scope,
  scopes,
  onChange,
  locale,
}: {
  value: readonly RolloutStage[]
  scope: string
  scopes: ScopesUseCases
  onChange: (value: readonly RolloutStage[]) => void
  locale: Locale
}) {
  const l = labels(locale),
    staged =
      value.length > 1 ||
      value.some(
        (stage) =>
          stage.scope !== scope || stage.opensAt !== 0 || stage.minimumVerifiedPercent !== null,
      )
  function change(index: number, stage: RolloutStage) {
    onChange(value.map((item, i) => (i === index ? stage : item)))
  }
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('部署批次', 'Rollout stages')}</legend>
      <Checkbox
        checked={staged}
        onChange={(e) =>
          onChange(
            e.target.checked
              ? [
                  value[0] ?? { scope, opensAt: 0, minimumVerifiedPercent: null },
                  {
                    scope: '',
                    opensAt: Math.max(
                      (value[0]?.opensAt ?? 0) + 1,
                      Math.floor(Date.now() / 1000) + 3600,
                    ),
                    minimumVerifiedPercent: null,
                  },
                ]
              : [{ scope, opensAt: 0, minimumVerifiedPercent: null }],
          )
        }
      >
        {l('自定义批次与时间', 'Customize stages and timing')}
      </Checkbox>
      <p className="subtitle">
        {l(
          '成员受策略总范围限制；重叠设备归最早批次。未知与等待重启不计为核实成功。',
          'Stage members are constrained by the overall policy scope. Overlap belongs to the earliest stage; unknown and waiting-for-reboot do not count as verified success.',
        )}
      </p>
      {staged &&
        value.map((stage, index) => (
          <fieldset className="asset-editor-section" key={index}>
            <legend>
              {l('批次', 'Stage')} {index + 1}
            </legend>
            <ScopePicker
              scopes={scopes}
              value={stage.scope}
              locale={locale}
              onChange={(scope) => change(index, { ...stage, scope })}
            />
            <Form.Item label={l('开放时间（UTC Unix 秒）', 'Opens at (UTC Unix seconds)')}>
              <InputNumber
                aria-label={`${l('批次开放时间', 'Stage opens at')} ${index + 1}`}
                min={0}
                precision={0}
                value={stage.opensAt}
                onChange={(opensAt) => {
                  if (opensAt !== null) change(index, { ...stage, opensAt })
                }}
              />
            </Form.Item>
            {index > 0 && (
              <>
                <Checkbox
                  checked={stage.minimumVerifiedPercent !== null}
                  onChange={(e) =>
                    change(index, {
                      ...stage,
                      minimumVerifiedPercent: e.target.checked ? 90 : null,
                    })
                  }
                >
                  {l('要求上一批核实成功率', 'Require preceding stage verified success')}
                </Checkbox>
                {stage.minimumVerifiedPercent !== null && (
                  <InputNumber
                    aria-label={l('最低核实成功率（%）', 'Minimum verified success (%)')}
                    min={0}
                    max={100}
                    precision={0}
                    value={stage.minimumVerifiedPercent}
                    onChange={(minimumVerifiedPercent) => {
                      if (minimumVerifiedPercent !== null)
                        change(index, { ...stage, minimumVerifiedPercent })
                    }}
                  />
                )}
              </>
            )}
            <Button
              danger
              disabled={value.length <= 1}
              onClick={() => {
                const remaining = value.filter((_, i) => i !== index)
                onChange(
                  remaining.map((stage, i) =>
                    i === 0 ? { ...stage, minimumVerifiedPercent: null } : stage,
                  ),
                )
              }}
            >
              {l('移除此批次', 'Remove stage')}
            </Button>
          </fieldset>
        ))}
      {staged && (
        <Button
          disabled={value.length >= 32}
          onClick={() =>
            onChange([
              ...value,
              {
                scope: '',
                opensAt: (value.at(-1)?.opensAt ?? 0) + 3600,
                minimumVerifiedPercent: null,
              },
            ])
          }
        >
          {l('添加批次', 'Add stage')}
        </Button>
      )}
    </fieldset>
  )
}
