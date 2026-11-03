import { useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Space, Steps } from 'antd'
import { freeze, operation, type Operation } from '@rss/mdm-inventory'
import {
  validateDefinition,
  type Policy,
  type PolicyChange,
  type PolicyDefinition,
} from '@rss/mdm-policies'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import type { ResourcesUseCases } from './ResourceCommand'
import type { ScopesUseCases } from './ScopeResults'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { BooleanField } from './AuthorFields'
import { ScopePicker } from './ScopePicker'
import { newPolicyAction, policyActionLabel, PolicyActionEditor } from './PolicyActionEditor'
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
    [step, setStep] = useState(0),
    [observed, setObserved] = useState<Policy | null>(null),
    [enabled, setEnabled] = useState(baseline?.state === 'enabled'),
    [pending, setPending] = useState<Intent | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [approve, setApprove] = useState(false),
    [archiveApproved, setArchiveApproved] = useState(false),
    [rerunApproved, setRerunApproved] = useState(false),
    [enableApproved, setEnableApproved] = useState(false),
    [deadline, setDeadline] = useState(() => Math.floor(Date.now() / 1000) + 86400),
    mutable = baseline?.state !== 'archived',
    blocked = action.busy || pending !== null,
    dirty = baseline !== null && JSON.stringify(definition) !== JSON.stringify(baseline.definition)
  usePendingSelection(action.busy || outcome === 'unknown')
  async function send(intent: Intent) {
    const result = await action.run<Policy | Awaited<ReturnType<PoliciesUseCases['rerun']>>>(() => {
      validateInput(() => {
        if (intent.kind === 'archive')
          operation({
            operationId: intent.operationId,
            expectedRevision: intent.expectedRevision,
            input: {},
          })
        else {
          operation<unknown>(intent.change)
          if (intent.kind === 'change' && intent.change.input.action === 'put')
            validateDefinition(intent.change.input.definition)
          if (intent.kind === 'rerun' && !Number.isSafeInteger(intent.change.input.deadline))
            throw new Error('Invalid deadline')
        }
      })
      return intent.kind === 'change'
        ? policies.change(id, intent.change)
        : intent.kind === 'archive'
          ? policies.archive(id, intent.operationId, intent.expectedRevision)
          : policies.rerun(id, intent.change)
    })
    const next = result.ok
      ? 'confirmed'
      : outcome === 'unknown' || isUnknown(result.error)
        ? 'unknown'
        : 'rejected'
    setOutcome(next)
    if (next === 'rejected') setPending(null)
  }
  function updateDefinition(value: PolicyDefinition) {
    setDefinition(value)
    setApprove(false)
    setEnableApproved(false)
    setRerunApproved(false)
  }

  function start(intent: Intent) {
    const fixed = freeze(intent)
    setPending(fixed)
    setApprove(false)
    setArchiveApproved(false)
    setRerunApproved(false)
    setEnableApproved(false)
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
    <section
      className="policy-editor"
      aria-label={baseline ? l('策略详情', 'Policy detail') : l('新建策略', 'New policy')}
    >
      {!baseline && (
        <Steps
          responsive={false}
          current={step}
          size="small"
          items={[
            { title: l('配置动作', 'Configure action') },
            { title: l('选择范围', 'Choose scope') },
            { title: l('审核部署', 'Review deployment') },
          ]}
        />
      )}
      <details className="policy-coordinate">
        <summary>{l('策略标识', 'Policy identifier')}</summary>
        <code>{id}</code>
      </details>
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
            '未收到保存结果。请刷新页面查看服务器当前配置，再决定是否继续编辑。',
            'Save result was not received. Refresh the page to review the current server configuration before editing again.',
          )}
        />
      )}
      {outcome === 'unknown' && pending && (
        <>
          <p className="subtitle">
            {l(
              '只读取原策略的当前状态，不能据此确认原操作；新写入保持锁定。',
              'Read only the original policy’s current state. It cannot confirm the original operation; new writes remain locked.',
            )}
          </p>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action
                .run(() => policies.read(id))
                .then((result) => {
                  if (result.ok) setObserved(result.value)
                })
            }
          >
            {l('读取原策略当前状态', 'Read original policy current state')}
          </Button>
          {observed && (
            <p>
              {l('当前配置修订', 'Current configuration revision')} {observed.revision} ·{' '}
              {l('生命周期', 'Lifecycle')} {observed.state}
            </p>
          )}
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
        <fieldset className="permission-panel" hidden={!baseline && step !== 1}>
          <ScopePicker
            scopes={scopes}
            value={definition.scope}
            locale={locale}
            onChange={(scope) => {
              const action = definition.action,
                stage =
                  action.kind === 'software' && action.rollout.stages.length === 1
                    ? action.rollout.stages[0]
                    : undefined,
                followsScope =
                  stage?.scope === definition.scope &&
                  stage.opensAt === 0 &&
                  stage.minimumVerifiedPercent === null
              updateDefinition({
                ...definition,
                scope,
                action:
                  action.kind === 'software' && followsScope
                    ? { ...action, rollout: { stages: [{ ...stage, scope }] } }
                    : action,
              })
            }}
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
                    updateDefinition({
                      ...definition,
                      [key]: e.target.value.trim().toLowerCase() || null,
                    })
                  }
                />
              </Form.Item>
            ))}
          </div>
        </fieldset>
        <fieldset className="permission-panel" hidden={!baseline && step !== 0}>
          <PolicyActionEditor
            value={definition.action}
            scope={definition.scope}
            resources={resources}
            scopes={scopes}
            locale={locale}
            onChange={(action) =>
              updateDefinition({
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
              onChange={(selfService) => updateDefinition({ ...definition, selfService })}
            />
          )}
        </fieldset>
        <fieldset className="permission-panel" hidden={!baseline && step !== 2}>
          {!baseline && (
            <dl className="device-facts">
              <div>
                <dt>{l('动作', 'Action')}</dt>
                <dd>{policyActionLabel(definition.action.kind, locale)}</dd>
              </div>
              <div>
                <dt>{l('范围', 'Scope')}</dt>
                <dd>
                  <code>{definition.scope}</code>
                </dd>
              </div>
              {'resource' in definition.action && (
                <div>
                  <dt>{l('固定资源', 'Fixed resource')}</dt>
                  <dd>
                    <code>
                      {definition.action.resource.id} @ {definition.action.resource.version}
                    </code>{' '}
                    ·{' '}
                    {'variant' in definition.action.resource
                      ? `${definition.action.resource.platform}/${definition.action.resource.architecture}/${definition.action.resource.variant}`
                      : Object.entries(definition.action.resource.variants)
                          .map(([target, variant]) => `${target}/${variant}`)
                          .join(' · ')}
                  </dd>
                </div>
              )}
              {'schedule' in definition.action && (
                <div>
                  <dt>{l('触发与有效期', 'Trigger and lifetime')}</dt>
                  <dd>
                    {
                      {
                        manual: l('手动', 'Manual'),
                        registration: l('设备注册', 'Registration'),
                        check_in: l('设备签入', 'Device check-in'),
                        once: l('指定时间', 'Once'),
                        interval: l('固定间隔', 'Fixed interval'),
                        weekly: l('每周', 'Weekly'),
                      }[definition.action.schedule.trigger.kind]
                    }
                    {'at' in definition.action.schedule.trigger &&
                      ` · ${new Date(definition.action.schedule.trigger.at * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'UTC', timeZoneName: 'short' })}`}
                    {'seconds' in definition.action.schedule.trigger &&
                      ` · ${definition.action.schedule.trigger.seconds}s`}
                    {'minimumSeconds' in definition.action.schedule.trigger &&
                      ` · ≥${definition.action.schedule.trigger.minimumSeconds}s`}
                    {'weekday' in definition.action.schedule.trigger &&
                      ` · ${definition.action.schedule.trigger.zone} / ${definition.action.schedule.trigger.weekday} / ${definition.action.schedule.trigger.minute}min`}
                    {` · ${definition.action.runLifetimeSeconds}s`}
                  </dd>
                </div>
              )}
              {definition.action.kind === 'software' && (
                <div>
                  <dt>
                    {l('灰度阶段 / 开放时间 / 效果门槛', 'Rollout stages / opening / effect gate')}
                  </dt>
                  <dd>
                    {definition.action.rollout.stages.map((stage, index) => (
                      <p key={index}>
                        {index + 1} · {stage.scope} ·{' '}
                        {stage.opensAt === 0
                          ? l('立即', 'Immediately')
                          : new Date(stage.opensAt * 1000).toLocaleString(
                              locale === 'zh' ? 'zh-CN' : 'en-US',
                              { timeZone: 'UTC', timeZoneName: 'short' },
                            )}{' '}
                        ·{' '}
                        {stage.minimumVerifiedPercent === null
                          ? l('无门槛', 'No gate')
                          : `${stage.minimumVerifiedPercent}%`}
                      </p>
                    ))}
                  </dd>
                </div>
              )}
              <div>
                <dt>{l('别名 / 共享事件', 'Alias / shared event')}</dt>
                <dd>
                  {definition.alias ?? '—'} / {definition.customEvent ?? '—'}
                </dd>
              </div>
            </dl>
          )}
          <BooleanField
            label={l('保存后启用策略', 'Enable after saving')}
            value={enabled}
            onChange={(enabled) => {
              setEnabled(enabled)
              setApprove(false)
            }}
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
        </fieldset>
        {!baseline && (
          <Space className="policy-step-controls">
            {step > 0 && <Button onClick={() => setStep(step - 1)}>{l('上一步', 'Back')}</Button>}
            {step < 2 && (
              <Button
                type="primary"
                disabled={step === 1 && !definition.scope}
                onClick={() => setStep(step + 1)}
              >
                {l('下一步', 'Next')}
              </Button>
            )}
          </Space>
        )}
      </Form>
      {!blocked && mutable && (baseline !== null || step === 2) && (
        <PolicyPreview policies={policies} definition={definition} locale={locale} />
      )}
      {baseline && mutable && (
        <fieldset className="permission-panel" disabled={blocked}>
          <Space wrap>
            {canWrite && baseline.state === 'disabled' && (
              <>
                <Alert
                  type="warning"
                  title={l('启用以下已保存配置', 'Enable the following saved configuration')}
                  description={
                    <>
                      {policyActionLabel(baseline.definition.action.kind, locale)} ·{' '}
                      {l('范围', 'Scope')} <code>{baseline.definition.scope}</code> ·{' '}
                      {l('配置修订', 'Configuration revision')} {baseline.revision}
                    </>
                  }
                />
                {dirty && (
                  <Alert
                    type="info"
                    title={l(
                      '草稿已变化，请先保存或放弃草稿，再启用已保存策略。',
                      'The draft has changed. Save or discard it before enabling the saved policy.',
                    )}
                  />
                )}
                <Checkbox
                  checked={enableApproved && !dirty}
                  disabled={dirty}
                  onChange={(event) => setEnableApproved(event.target.checked)}
                >
                  {l(
                    '确认已保存范围与动作后启用',
                    'Confirm saved scope and action before enabling',
                  )}
                </Checkbox>
              </>
            )}
            {canWrite && (
              <Button
                disabled={baseline.state === 'disabled' && (dirty || !enableApproved)}
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
    </section>
  )
}
