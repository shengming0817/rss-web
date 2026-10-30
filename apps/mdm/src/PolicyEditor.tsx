import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Space } from 'antd'
import { freeze, type Operation } from '@rss/mdm-inventory'
import type { Policy, PolicyChange, PolicyDefinition } from '@rss/mdm-policies'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import type { ResourcesUseCases } from './ResourceCommand'
import type { ScopesUseCases } from './ScopeResults'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { BooleanField } from './AuthorFields'
import { ScopePicker } from './ScopePicker'
import { newPolicyAction, PolicyActionEditor } from './PolicyActionEditor'
import { PolicySelfService } from './PolicySelfService'
import { PolicyPreview, type PoliciesUseCases } from './PolicyPreview'

type Intent =
  | { readonly kind: 'change'; readonly change: Operation<PolicyChange> }
  | { readonly kind: 'archive'; readonly operationId: string; readonly expectedRevision: number }
  | { readonly kind: 'rerun'; readonly change: Operation<{ readonly deadline: number }> }
export function PolicyEditor({
  policies,
  scopes,
  resources,
  baseline,
  id,
  initialScope,
  runtime,
  instance,
  locale,
  canWrite,
  canRerun,
  done,
}: {
  policies: PoliciesUseCases
  scopes: ScopesUseCases
  resources: ResourcesUseCases
  baseline: Policy | null
  id: string
  initialScope: string
  runtime: Runtime
  instance: string
  locale: Locale
  canWrite: boolean
  canRerun: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [definition, setDefinition] = useState<PolicyDefinition>(() =>
      structuredClone(
        baseline?.definition ?? {
          scope: initialScope,
          action: newPolicyAction('execution', initialScope),
          alias: null,
          customEvent: null,
        },
      ),
    ),
    [enabled, setEnabled] = useState(baseline?.state === 'enabled'),
    [pending, setPending] = useState<Intent | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [approve, setApprove] = useState(false),
    [archiveApproved, setArchiveApproved] = useState(false),
    [rerunApproved, setRerunApproved] = useState(false),
    [deadline, setDeadline] = useState(() => Math.floor(Date.now() / 1000) + 86400),
    mutable = baseline?.state !== 'archived',
    blocked = action.busy || pending !== null
  usePendingSelection(action.busy || outcome === 'unknown')
  async function send(intent: Intent) {
    const result = await action.run<Policy | Awaited<ReturnType<PoliciesUseCases['rerun']>>>(() =>
      intent.kind === 'change'
        ? policies.change(id, intent.change)
        : intent.kind === 'archive'
          ? policies.archive(id, intent.operationId, intent.expectedRevision)
          : policies.rerun(id, intent.change),
    )
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  function start(intent: Intent) {
    const fixed = freeze(intent)
    setPending(fixed)
    setApprove(false)
    setArchiveApproved(false)
    setRerunApproved(false)
    void send(fixed)
  }
  function change(input: PolicyChange) {
    start({
      kind: 'change',
      change: {
        operationId: crypto.randomUUID(),
        expectedRevision: baseline?.revision ?? 0,
        input,
      },
    })
  }
  return (
    <Card title={baseline ? l('策略详情', 'Policy detail') : l('新建策略', 'New policy')}>
      <p>
        <code>{id}</code>
      </p>
      {baseline && (
        <dl className="device-facts">
          <div>
            <dt>{l('配置修订', 'Configuration revision')}</dt>
            <dd>{baseline.revision}</dd>
          </div>
          <div>
            <dt>{l('执行版本', 'Execution version')}</dt>
            <dd>
              {baseline.version} · {baseline.versionId}
            </dd>
          </div>
          <div>
            <dt>{l('生命周期', 'Lifecycle')}</dt>
            <dd>{baseline.state}</dd>
          </div>
        </dl>
      )}
      <Failure locale={locale} error={action.error} />
      {pending && (
        <p>
          {l('原操作', 'Original operation')} ·{' '}
          <code>
            {pending.kind === 'archive' ? pending.operationId : pending.change.operationId}
          </code>
        </p>
      )}
      {outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '提交结果未知，新写入已锁定。读取当前配置不证明原回执。',
            'Submission outcome unknown; new writes are locked. Current configuration does not prove the original receipt.',
          )}
        />
      )}
      {outcome === 'unknown' && pending && (
        <>
          <p className="subtitle">
            {l(
              '核对会显式重提原操作 ID、CAS 与冻结全文；此前未受理时可能受理原请求。',
              'Reconciliation explicitly resubmits the original operation ID, CAS and frozen input. If not previously accepted, the original request may be accepted now.',
            )}
          </p>
          <Button disabled={action.busy} onClick={() => void send(pending)}>
            {l('核对原请求', 'Reconcile original request')}
          </Button>
        </>
      )}
      {outcome === 'confirmed' && (
        <Alert
          type="success"
          title={l(
            '原操作已确认。请重新读取策略；这不证明设备已执行或效果已核实。',
            'Original operation confirmed. Re-read the policy; this does not establish device execution or verified effect.',
          )}
        />
      )}
      <Form layout="vertical" disabled={!canWrite || !mutable || blocked}>
        <ScopePicker
          scopes={scopes}
          value={definition.scope}
          locale={locale}
          onChange={(scope) =>
            setDefinition({
              ...definition,
              scope,
              action:
                definition.action.kind === 'software' &&
                definition.action.rollout.stages.length === 1
                  ? {
                      ...definition.action,
                      rollout: { stages: [{ scope, opensAt: 0, minimumVerifiedPercent: null }] },
                    }
                  : definition.action,
            })
          }
        />
        <div className="admin-form-grid">
          {(['alias', 'customEvent'] as const).map((key) => (
            <Form.Item
              key={key}
              label={
                key === 'alias'
                  ? l('唯一别名', 'Unique alias')
                  : l('共享事件名', 'Shared event name')
              }
            >
              <Input
                aria-label={
                  key === 'alias'
                    ? l('唯一别名', 'Unique alias')
                    : l('共享事件名', 'Shared event name')
                }
                value={definition[key] ?? ''}
                maxLength={64}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    [key]: e.target.value.trim().toLowerCase() || null,
                  })
                }
              />
            </Form.Item>
          ))}
        </div>
        <PolicyActionEditor
          value={definition.action}
          scope={definition.scope}
          resources={resources}
          scopes={scopes}
          locale={locale}
          onChange={(action) =>
            setDefinition({
              ...definition,
              action,
              ...(action.kind === 'execution' ||
              (action.kind === 'software' && action.intent === 'available_install')
                ? {}
                : { selfService: null }),
            })
          }
        />
        {(definition.action.kind === 'execution' ||
          (definition.action.kind === 'software' &&
            definition.action.intent === 'available_install')) && (
          <PolicySelfService
            runtime={runtime}
            instance={instance}
            locale={locale}
            software={definition.action.kind === 'software'}
            value={definition.selfService ?? null}
            onChange={(selfService) => setDefinition({ ...definition, selfService })}
          />
        )}
        <BooleanField
          label={l('保存后启用策略', 'Enable after saving')}
          value={enabled}
          onChange={setEnabled}
        />
        <Checkbox checked={approve} onChange={(e) => setApprove(e.target.checked)}>
          {l(
            '确认范围、资源、调度与潜在影响',
            'Confirm scope, resources, schedule and potential impact',
          )}
        </Checkbox>
        <Button
          type="primary"
          disabled={!approve}
          onClick={() => change({ action: 'put', definition, enabled })}
        >
          {l('保存策略定义', 'Save policy definition')}
        </Button>
      </Form>
      {!blocked && mutable && (
        <PolicyPreview policies={policies} definition={definition} locale={locale} />
      )}
      {baseline && mutable && (
        <fieldset className="permission-panel" disabled={blocked}>
          <Space wrap>
            {canWrite && (
              <Button
                onClick={() =>
                  change({ action: baseline.state === 'enabled' ? 'disable' : 'enable' })
                }
              >
                {baseline.state === 'enabled'
                  ? l('停用策略', 'Disable policy')
                  : l('启用策略', 'Enable policy')}
              </Button>
            )}
            {canWrite && baseline.state === 'disabled' && (
              <>
                <Checkbox
                  checked={archiveApproved}
                  onChange={(e) => setArchiveApproved(e.target.checked)}
                >
                  {l('确认归档并保留历史', 'Confirm archive and retain history')}
                </Checkbox>
                <Button
                  danger
                  disabled={!archiveApproved}
                  onClick={() =>
                    start({
                      kind: 'archive',
                      operationId: crypto.randomUUID(),
                      expectedRevision: baseline.revision,
                    })
                  }
                >
                  {l('归档策略', 'Archive policy')}
                </Button>
              </>
            )}
            {canRerun && (
              <>
                <InputNumber
                  aria-label={l(
                    '重新执行截止时间（UTC Unix 秒）',
                    'Rerun deadline (UTC Unix seconds)',
                  )}
                  value={deadline}
                  precision={0}
                  onChange={(n) => {
                    if (n !== null) setDeadline(n)
                  }}
                />
                <Checkbox
                  checked={rerunApproved}
                  onChange={(e) => setRerunApproved(e.target.checked)}
                >
                  {l('确认显式重新执行', 'Confirm explicit rerun')}
                </Checkbox>
                <Button
                  disabled={!rerunApproved}
                  onClick={() =>
                    start({
                      kind: 'rerun',
                      change: {
                        operationId: crypto.randomUUID(),
                        expectedRevision: baseline.revision,
                        input: { deadline },
                      },
                    })
                  }
                >
                  {l('重新执行', 'Rerun')}
                </Button>
              </>
            )}
          </Space>
        </fieldset>
      )}
      <Button disabled={action.busy || outcome === 'unknown'} onClick={done}>
        {l('返回并重新读取策略', 'Return and re-read policies')}
      </Button>
    </Card>
  )
}
