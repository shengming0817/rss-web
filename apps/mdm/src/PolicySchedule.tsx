import { Checkbox, Form, Input, InputNumber, Select } from 'antd'
import type { Schedule, Trigger } from '@rss/mdm-policies'
import type { Locale } from './i18n'
import { labels } from './AdminUi'

export function PolicySchedule({
  value,
  onChange,
  locale,
  intervalOnly = false,
}: {
  value: Schedule
  onChange: (value: Schedule) => void
  locale: Locale
  intervalOnly?: boolean
}) {
  const l = labels(locale),
    trigger = value.trigger
  function choose(kind: Trigger['kind']) {
    const trigger: Trigger =
      kind === 'once'
        ? { kind, at: Math.floor(Date.now() / 1000) + 3600 }
        : kind === 'interval'
          ? { kind, anchor: 0, seconds: 3600 }
          : kind === 'weekly'
            ? { kind, zone: 'UTC', weekday: 1, minute: 540 }
            : kind === 'check_in'
              ? { kind, minimumSeconds: 60 }
              : { kind }
    onChange({ ...value, trigger })
  }
  const numbers = (
    label: string,
    n: number,
    change: (n: number) => void,
    min = 0,
    max = 253402300799,
  ) => (
    <Form.Item label={label}>
      <InputNumber
        aria-label={label}
        value={n}
        min={min}
        max={max}
        precision={0}
        onChange={(n) => {
          if (n !== null) change(n)
        }}
      />
    </Form.Item>
  )
  return (
    <fieldset className="asset-editor-section">
      <legend>{l('调度与执行窗口', 'Schedule and maintenance window')}</legend>
      <div className="admin-form-grid">
        <Form.Item label={l('触发方式', 'Trigger')}>
          <Select
            aria-label={l('触发方式', 'Trigger')}
            value={trigger.kind}
            onChange={choose}
            options={(intervalOnly
              ? (['interval'] as const)
              : (['manual', 'check_in', 'registration', 'once', 'interval', 'weekly'] as const)
            ).map((kind) => ({
              value: kind,
              label: {
                manual: l('手动', 'Manual'),
                check_in: l('设备签入', 'Device check-in'),
                registration: l('设备注册', 'Registration'),
                once: l('指定时间', 'Once'),
                interval: l('固定间隔', 'Fixed interval'),
                weekly: l('每周', 'Weekly'),
              }[kind],
            }))}
          />
        </Form.Item>
        {trigger.kind === 'once' &&
          numbers(l('执行时间（UTC Unix 秒）', 'Run at (UTC Unix seconds)'), trigger.at, (at) =>
            onChange({ ...value, trigger: { ...trigger, at } }),
          )}
        {trigger.kind === 'interval' && (
          <>
            {numbers(
              l('间隔（秒）', 'Interval (seconds)'),
              trigger.seconds,
              (seconds) => onChange({ ...value, trigger: { ...trigger, seconds } }),
              60,
              31536000,
            )}
            {numbers(
              l('间隔起点（UTC Unix 秒）', 'Interval anchor (UTC Unix seconds)'),
              trigger.anchor,
              (anchor) => onChange({ ...value, trigger: { ...trigger, anchor } }),
            )}
          </>
        )}
        {trigger.kind === 'check_in' &&
          numbers(
            l('最短签入间隔（秒）', 'Minimum check-in interval (seconds)'),
            trigger.minimumSeconds,
            (minimumSeconds) => onChange({ ...value, trigger: { ...trigger, minimumSeconds } }),
            60,
            31536000,
          )}
        {trigger.kind === 'weekly' && (
          <>
            <Form.Item label={l('时区', 'Timezone')}>
              <Input
                aria-label={l('时区', 'Timezone')}
                value={trigger.zone}
                onChange={(e) =>
                  onChange({ ...value, trigger: { ...trigger, zone: e.target.value } })
                }
              />
            </Form.Item>
            {numbers(
              l('星期（周一为 1）', 'Weekday (Monday = 1)'),
              trigger.weekday,
              (weekday) => onChange({ ...value, trigger: { ...trigger, weekday } }),
              1,
              7,
            )}
            {numbers(
              l('当天分钟（0–1439）', 'Minute of day (0–1439)'),
              trigger.minute,
              (minute) => onChange({ ...value, trigger: { ...trigger, minute } }),
              0,
              1439,
            )}
          </>
        )}
        {numbers(
          l('生效起点（UTC Unix 秒）', 'Not before (UTC Unix seconds)'),
          value.notBefore,
          (notBefore) => onChange({ ...value, notBefore }),
        )}
        {numbers(
          l('最大抖动（秒）', 'Maximum jitter (seconds)'),
          value.jitterSeconds,
          (jitterSeconds) => onChange({ ...value, jitterSeconds }),
          0,
          3600,
        )}
        <Form.Item label={l('错过调度', 'Missed occurrence')}>
          <Select
            aria-label={l('错过调度', 'Missed occurrence')}
            value={value.misfire.kind}
            options={[
              {
                value: 'coalesce_one',
                label: l('恢复后合并最近一次', 'Coalesce the latest occurrence'),
              },
              { value: 'skip', label: l('超出宽限则跳过', 'Skip beyond tolerance') },
            ]}
            onChange={(kind: 'skip' | 'coalesce_one') =>
              onChange({
                ...value,
                misfire: kind === 'skip' ? { kind, maxLatenessSeconds: 3600 } : { kind },
              })
            }
          />
        </Form.Item>
        {value.misfire.kind === 'skip' &&
          numbers(
            l('允许迟到（秒）', 'Lateness tolerance (seconds)'),
            value.misfire.maxLatenessSeconds,
            (maxLatenessSeconds) =>
              onChange({ ...value, misfire: { kind: 'skip', maxLatenessSeconds } }),
            0,
            4294967295,
          )}
      </div>
      <Checkbox
        checked={value.until !== null}
        onChange={(e) =>
          onChange({
            ...value,
            until: e.target.checked
              ? Math.max(value.notBefore + 86400, Math.floor(Date.now() / 1000) + 86400)
              : null,
          })
        }
      >
        {l('设置结束时间', 'Set end time')}
      </Checkbox>
      {value.until !== null &&
        numbers(
          l('结束时间（UTC Unix 秒，不包含）', 'Until (exclusive UTC Unix seconds)'),
          value.until,
          (until) => onChange({ ...value, until }),
        )}
      <Checkbox
        checked={value.window !== null}
        onChange={(e) =>
          onChange({
            ...value,
            window: e.target.checked
              ? { zone: 'UTC', weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1080 }
              : null,
          })
        }
      >
        {l('限制维护窗口', 'Restrict maintenance window')}
      </Checkbox>
      {value.window && (
        <div className="admin-form-grid">
          <Form.Item label={l('窗口时区', 'Window timezone')}>
            <Input
              aria-label={l('窗口时区', 'Window timezone')}
              value={value.window.zone}
              onChange={(e) => {
                if (value.window)
                  onChange({ ...value, window: { ...value.window, zone: e.target.value } })
              }}
            />
          </Form.Item>
          <Form.Item label={l('窗口星期', 'Window weekdays')}>
            <Select
              mode="multiple"
              aria-label={l('窗口星期', 'Window weekdays')}
              value={[...value.window.weekdays]}
              options={[1, 2, 3, 4, 5, 6, 7].map((day) => ({ value: day, label: String(day) }))}
              onChange={(weekdays: number[]) => {
                if (value.window) onChange({ ...value, window: { ...value.window, weekdays } })
              }}
            />
          </Form.Item>
          {numbers(
            l('窗口开始分钟', 'Window start minute'),
            value.window.startMinute,
            (startMinute) => {
              if (value.window) onChange({ ...value, window: { ...value.window, startMinute } })
            },
            0,
            1439,
          )}
          {numbers(
            l('窗口结束分钟', 'Window end minute'),
            value.window.endMinute,
            (endMinute) => {
              if (value.window) onChange({ ...value, window: { ...value.window, endMinute } })
            },
            0,
            1440,
          )}
        </div>
      )}
      <p className="subtitle">
        {l(
          '调度由服务端判断；刷新页面不触发执行，也不推算下一次设备执行时间。',
          'The server evaluates scheduling. Refreshing does not trigger execution or predict a device run time.',
        )}
      </p>
    </fieldset>
  )
}
