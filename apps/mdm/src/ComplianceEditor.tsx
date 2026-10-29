import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space } from 'antd'
import { freeze, type Operation } from '@rss/mdm-inventory'
import { validateDefinition, type Definition, type Rule } from '@rss/mdm-compliance'
import type { GroupsUseCases } from './GroupPicker'
import { GroupPicker } from './GroupPicker'
import { ComplianceTask, type ComplianceUseCases } from './ComplianceTask'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { ConditionContextEditor } from './InventoryScopeEditor'
import { CriteriaEditor, emptyPredicate } from './CriteriaEditor'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'

type Pending =
  | { readonly kind: 'put'; readonly change: Operation<Definition> }
  | { readonly kind: 'delete' | 'recompute'; readonly change: Operation<Record<string, never>> }
const newDefinition = (): Definition => ({
  presentation: { name: '', description: '' },
  severity: 'medium',
  enabled: false,
  platform: 'all',
  target: { kind: 'all' },
  criteria: { selector: { kind: 'device' }, quantifier: 'one', criteria: emptyPredicate() },
})
export function ComplianceEditor({
  compliance,
  groups,
  locale,
  id,
  baseline,
  canWrite,
  canRecompute,
  canChooseGroups,
  done,
}: {
  compliance: ComplianceUseCases
  groups: GroupsUseCases
  locale: Locale
  id: string
  baseline: Rule | null
  canWrite: boolean
  canRecompute: boolean
  canChooseGroups: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    [value, setValue] = useState(() => structuredClone(baseline?.definition ?? newDefinition())),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [task, setTask] = useState<string | null>(null),
    [invalid, setInvalid] = useState(false),
    [approved, setApproved] = useState(false)
  usePendingSelection(
    guard.locked ||
      action.busy ||
      (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(intent: Pending) {
    const result = await action.run(async () =>
      intent.kind === 'put'
        ? compliance.put(id, intent.change)
        : intent.kind === 'delete'
          ? compliance.remove(id, intent.change)
          : compliance.recompute(id, intent.change),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok && 'task' in result.value) setTask(result.value.task)
  }
  function start(kind: Pending['kind']) {
    try {
      if (kind === 'put') validateDefinition(value)
      const base = { operationId: crypto.randomUUID(), expectedRevision: baseline?.revision ?? 0 }
      const intent: Pending =
        kind === 'put'
          ? { kind, change: freeze({ ...base, input: value }) }
          : { kind, change: freeze({ ...base, input: {} }) }
      setInvalid(false)
      setPending(intent)
      void submit(intent)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card
        title={
          baseline
            ? l('合规规则详情', 'Compliance rule detail')
            : l('新建合规规则', 'New compliance rule')
        }
      >
        <p>
          <code>{id}</code> · {l('已读取版本', 'Observed revision')} {baseline?.revision ?? 0}
        </p>
        <Failure locale={locale} error={action.error} />
        {invalid && (
          <Alert
            type="error"
            title={l(
              '请检查名称、目标组和事实条件。',
              'Check the name, target groups and fact conditions.',
            )}
          />
        )}
        <Form
          layout="vertical"
          disabled={!canWrite || guard.locked || action.busy || pending !== null}
          onFinish={() => start('put')}
        >
          <Form.Item label={l('规则名称', 'Rule name')}>
            <Input
              aria-label={l('规则名称', 'Rule name')}
              value={
                typeof value.presentation['name'] === 'string' ? value.presentation['name'] : ''
              }
              onChange={(e) =>
                setValue({
                  ...value,
                  presentation: { ...value.presentation, name: e.target.value },
                })
              }
            />
          </Form.Item>
          <Form.Item label={l('规则说明', 'Rule description')}>
            <Input.TextArea
              aria-label={l('规则说明', 'Rule description')}
              value={
                typeof value.presentation['description'] === 'string'
                  ? value.presentation['description']
                  : ''
              }
              onChange={(e) =>
                setValue({
                  ...value,
                  presentation: { ...value.presentation, description: e.target.value },
                })
              }
            />
          </Form.Item>
          <div className="admin-form-grid">
            <Form.Item label={l('严重程度', 'Severity')}>
              <Select
                aria-label={l('严重程度', 'Severity')}
                value={value.severity}
                options={[
                  { value: 'low', label: l('低', 'Low') },
                  { value: 'medium', label: l('中', 'Medium') },
                  { value: 'high', label: l('高', 'High') },
                  { value: 'critical', label: l('严重', 'Critical') },
                ]}
                onChange={(severity: Definition['severity']) => setValue({ ...value, severity })}
              />
            </Form.Item>
            <Form.Item label={l('适用平台', 'Applicable platform')}>
              <Select
                aria-label={l('适用平台', 'Applicable platform')}
                value={value.platform}
                options={[
                  { value: 'all', label: l('全部平台', 'All platforms') },
                  { value: 'windows', label: 'Windows' },
                  { value: 'macos', label: 'macOS' },
                ]}
                onChange={(platform: Definition['platform']) => setValue({ ...value, platform })}
              />
            </Form.Item>
          </div>
          <Checkbox
            checked={value.enabled}
            onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
          >
            {l('启用评估', 'Enable evaluation')}
          </Checkbox>
          <Form.Item label={l('目标范围', 'Target scope')}>
            <Select
              aria-label={l('目标范围', 'Target scope')}
              value={value.target.kind}
              options={[
                { value: 'all', label: l('全部已授权终端', 'All authorized endpoints') },
                { value: 'groups', label: l('指定终端组', 'Selected endpoint groups') },
              ]}
              onChange={(kind: Definition['target']['kind']) =>
                setValue({ ...value, target: kind === 'all' ? { kind } : { kind, ids: [] } })
              }
            />
          </Form.Item>
          {value.target.kind === 'groups' && (
            <>
              <ul className="admin-id-list">
                {value.target.ids.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                    <Button
                      onClick={() => {
                        if (value.target.kind === 'groups')
                          setValue({
                            ...value,
                            target: {
                              ...value.target,
                              ids: value.target.ids.filter((v) => v !== id),
                            },
                          })
                      }}
                    >
                      {l('移除目标组', 'Remove target group')}
                    </Button>
                  </li>
                ))}
              </ul>
              {canChooseGroups && (
                <GroupPicker
                  groups={groups}
                  locale={locale}
                  assetContext="endpoint"
                  value={null}
                  disabled={
                    !canWrite || pending !== null || action.busy || value.target.ids.length >= 16
                  }
                  onChange={(id) => {
                    if (value.target.kind === 'groups')
                      setValue({
                        ...value,
                        target: { ...value.target, ids: [...new Set([...value.target.ids, id])] },
                      })
                  }}
                />
              )}
            </>
          )}
          <ConditionContextEditor
            locale={locale}
            value={value.criteria}
            onChange={(context) =>
              setValue({ ...value, criteria: { ...value.criteria, ...context } })
            }
          />
          <CriteriaEditor
            locale={locale}
            value={value.criteria.criteria}
            onChange={(criteria) =>
              setValue({ ...value, criteria: { ...value.criteria, criteria } })
            }
          />
          <Button type="primary" htmlType="submit">
            {l('保存合规规则新版本', 'Save compliance rule revision')}
          </Button>
        </Form>
        {baseline && (
          <Space wrap className="admin-subsection">
            <Button
              disabled={!canRecompute || action.busy || guard.locked || pending !== null}
              onClick={() => start('recompute')}
            >
              {l('请求合规重算', 'Request compliance recomputation')}
            </Button>
            <Checkbox
              disabled={!canWrite || pending !== null}
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            >
              {l('确认删除规则', 'Confirm rule deletion')}
            </Checkbox>
            <Button
              danger
              disabled={!canWrite || !approved || action.busy || guard.locked || pending !== null}
              onClick={() => start('delete')}
            >
              {l('删除合规规则', 'Delete compliance rule')}
            </Button>
          </Space>
        )}
        {pending && (
          <div className="admin-recovery">
            <p>
              <code>{pending.change.operationId}</code> ·{' '}
              {l('原规则版本', 'Original rule revision')} {pending.change.expectedRevision}
            </p>
            {outcome === 'confirmed' ? (
              <Button disabled={guard.locked || action.busy} onClick={done}>
                {l('原规则操作已确认，重新读取', 'Original rule operation confirmed; read again')}
              </Button>
            ) : outcome === 'rejected' ? (
              <Button disabled={guard.locked || action.busy} onClick={done}>
                {l('放弃已拒绝规则操作并重读', 'Discard rejected rule operation and read again')}
              </Button>
            ) : (
              <>
                <Alert
                  type="warning"
                  title={l(
                    '原操作结果未确认。当前规则和评估任务不代替原写入回执，请显式重提原请求。',
                    'The original operation is unconfirmed. Current rules and evaluation tasks do not replace its write receipt; explicitly resubmit the original request.',
                  )}
                />
                <Button
                  disabled={
                    action.busy || !(pending.kind === 'recompute' ? canRecompute : canWrite)
                  }
                  onClick={() => void submit(pending)}
                >
                  {l('显式重提原合规操作', 'Resubmit original compliance operation')}
                </Button>
              </>
            )}
          </div>
        )}
        {task && (
          <div className="admin-subsection">
            <ComplianceTask
              key={task}
              compliance={compliance}
              locale={locale}
              rule={id}
              initialTask={task}
            />
          </div>
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}
