import { useState } from 'react'
import { Alert, Button, Card, Form, Input } from 'antd'
import type { createCompliance } from '@rss/mdm-compliance'
import type { Locale } from './i18n'
import { labels, ReadState, useRead } from './AdminUi'
import { Status } from './DevicePresentation'

export type ComplianceUseCases = ReturnType<typeof createCompliance>
export function ComplianceTask({
  compliance,
  locale,
  rule,
  initialTask = '',
}: {
  compliance: ComplianceUseCases
  locale: Locale
  rule: string
  initialTask?: string
}) {
  const l = labels(locale),
    [draft, setDraft] = useState(initialTask),
    [task, setTask] = useState(initialTask),
    read = useRead(`compliance-task/${rule}/${task}`, () =>
      task ? compliance.task(rule, task) : Promise.resolve(null),
    )
  return (
    <Card title={l('合规评估任务', 'Compliance evaluation task')}>
      <Form
        layout="inline"
        onFinish={() => {
          setTask(draft)
          read.reload()
        }}
      >
        <Form.Item label={l('合规任务标识', 'Compliance task ID')}>
          <Input
            aria-label={l('合规任务标识', 'Compliance task ID')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Form.Item>
        <Button htmlType="submit">{l('读取合规进度', 'Read compliance progress')}</Button>
      </Form>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <p>
            <Status locale={locale} value={read.value.phase} /> ·{' '}
            {read.value.failure ?? read.value.diagnostic?.reason ?? '—'}
          </p>
          <dl className="device-facts">
            <div>
              <dt>{l('规则版本', 'Rule revision')}</dt>
              <dd>{read.value.ruleVersion}</dd>
            </div>
            <div>
              <dt>{l('输入快照世代', 'Input snapshot epoch')}</dt>
              <dd>{read.value.assetCut.epoch}</dd>
            </div>
            <div>
              <dt>{l('已处理设备', 'Processed devices')}</dt>
              <dd>{read.value.processed}</dd>
            </div>
            <div>
              <dt>{l('任务结束', 'Task completed')}</dt>
              <dd>{String(read.value.completed)}</dd>
            </div>
          </dl>
          {read.value.phase === 'superseded' && (
            <Alert
              type="info"
              title={l(
                '本轮评估已被替代；设备当前结论需单独读取。',
                'This evaluation was superseded. Read current device assessments separately.',
              )}
            />
          )}
        </>
      )}
    </Card>
  )
}
