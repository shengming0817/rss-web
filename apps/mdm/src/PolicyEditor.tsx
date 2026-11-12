import { useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Space } from 'antd'
import { useSearchParams } from 'react-router-dom'
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
import { codeOf, Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { useAdministration } from './useAdministration'
import { BooleanField } from './AuthorFields'
import { newPolicyAction, PolicyActionEditor } from './PolicyActionEditor'
import { PolicySelfService } from './PolicySelfService'
import { PolicyPreview, type PoliciesUseCases } from './PolicyPreview'
import { emptyScope, PolicyScope } from './PolicyScope'
import { PolicyRolloutEditor } from './PolicyRolloutEditor'
import { SecretTabs } from './SecretTabs'
import { PolicyAssignments, PolicyRollout, PolicyRuns } from './PolicyProgress'
import { PolicyEvents } from './PolicyEvents'
import { PolicyNames } from './PolicyNames'

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
  initialAction,
  runtime,
  instance,
  locale,
  canRead,
  canWrite,
  canRerun,
  canInventory = false,
  canOperations = false,
  done,
  doneLabel,
}: {
  policies: PoliciesUseCases
  scopes: ScopesUseCases
  resources: ResourcesUseCases
  baseline: Policy | null
  id: string
  initialAction?: PolicyDefinition['action'] | undefined
  runtime: Runtime
  instance: string
  locale: Locale
  canRead: boolean
  canWrite: boolean
  canRerun: boolean
  canInventory?: boolean
  canOperations?: boolean
  done(): void
  doneLabel?: string | undefined
}) {
  const l = labels(locale),
    action = useAction(),
    scopeGuard = useSelectionGuard(),
    { devices, groups, operationDiagnostics, policyEvents } = useAdministration(runtime),
    [params, setParams] = useSearchParams(),
    [base, setBase] = useState(baseline),
    [initial] = useState<PolicyDefinition>(() =>
      structuredClone(
        baseline?.definition ?? {
          scope: emptyScope(),
          action: initialAction ?? newPolicyAction('execution'),
          alias: null,
          customEvent: null,
        },
      ),
    ),
    [definition, setDefinition] = useState(initial),
    [enabled, setEnabled] = useState(baseline?.state === 'enabled'),
    [observed, setObserved] = useState<Policy | null>(null),
    [pending, setPending] = useState<Intent | null>(null),
    [unknown, setUnknown] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [approved, setApproved] = useState(false),
    [retryApproved, setRetryApproved] = useState(false),
    [discardApproved, setDiscardApproved] = useState(false),
    [archiveApproved, setArchiveApproved] = useState(false),
    [rerunApproved, setRerunApproved] = useState(false),
    [enableApproved, setEnableApproved] = useState(false),
    [deadline, setDeadline] = useState(() => Math.floor(Date.now() / 1000) + 86400),
    dirty =
      JSON.stringify(definition) !== JSON.stringify(base?.definition ?? initial) ||
      enabled !== (base?.state === 'enabled'),
    blocked = action.busy || pending !== null || scopeGuard.locked,
    mutable = base?.state !== 'archived',
    conflict =
      !unknown &&
      ['conflict', 'revision_conflict', 'operation_conflict', 'configuration_changed'].includes(
        codeOf(action.error),
      ),
    sameScopes =
      base !== null &&
      JSON.stringify([
        definition.scope,
        definition.action.kind === 'software'
          ? definition.action.rollout.stages.map((s) => [s.id, s.scope])
          : [],
      ]) ===
        JSON.stringify([
          base.definition.scope,
          base.definition.action.kind === 'software'
            ? base.definition.action.rollout.stages.map((s) => [s.id, s.scope])
            : [],
        ]),
    scopeProps = {
      owner: { policyId: id },
      policyRevision: base?.revision ?? 0,
      scopes,
      groups,
      devices,
      runtime,
      locale,
      canRecompute: canWrite,
      disabled: !canWrite || !mutable || blocked,
    }
  usePendingSelection(dirty || blocked || unknown)
  function edit(next: PolicyDefinition) {
    setDefinition(next)
    setApproved(false)
    setEnableApproved(false)
    setRerunApproved(false)
    setDiscardApproved(false)
  }
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
        }
      })
      return intent.kind === 'change'
        ? policies.change(id, intent.change)
        : intent.kind === 'archive'
          ? policies.archive(id, intent.operationId, intent.expectedRevision)
          : policies.rerun(id, intent.change)
    })
    if (result.ok) {
      setConfirmed(true)
      setUnknown(false)
      setPending(null)
      if (intent.kind !== 'rerun') {
        const value = result.value as Policy
        setBase(value)
        setDefinition(structuredClone(value.definition))
        setEnabled(value.state === 'enabled')
      }
    } else if (unknown || isUnknown(result.error)) setUnknown(true)
    else setPending(null)
  }
  function start(intent: Intent) {
    const fixed = freeze(intent)
    setPending(fixed)
    setConfirmed(false)
    setApproved(false)
    setEnableApproved(false)
    setArchiveApproved(false)
    setRerunApproved(false)
    void send(fixed)
  }
  function change(input: PolicyChange) {
    start({
      kind: 'change',
      change: { operationId: crypto.randomUUID(), expectedRevision: base?.revision ?? 0, input },
    })
  }
  const operationId =
    pending?.kind === 'archive' ? pending.operationId : pending?.change.operationId
  return (
    <section
      className="policy-editor"
      aria-label={base ? l('策略详情', 'Policy detail') : l('新建策略', 'New policy')}
    >
      <details>
        <summary>{l('策略标识与版本', 'Policy identifier and versions')}</summary>
        <p>
          {id} · r{base?.revision ?? 0} · {base?.version ?? '—'} · {base?.versionId ?? '—'} ·{' '}
          {base?.state ?? l('未保存', 'Unsaved')}
        </p>
      </details>
      <Failure locale={locale} error={action.error} />
      {conflict && (
        <Alert
          type="warning"
          title={l(
            '保存冲突，草稿已保留。读取最新配置并核对差异后继续。',
            'Save conflict; the draft is retained. Read the latest configuration and review differences before continuing.',
          )}
        />
      )}
      {(conflict || unknown) && (
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
      )}
      {observed && (
        <CardComparison
          current={observed}
          draft={definition}
          draftEnabled={enabled}
          locale={locale}
          canAdopt={!unknown && !blocked && canWrite}
          adopt={() => {
            setBase(observed)
            setObserved(null)
            action.clear()
            setApproved(false)
          }}
        />
      )}
      {unknown && pending && (
        <>
          <Alert
            type="warning"
            title={l(
              '原操作结果未知，新写入保持锁定。当前状态不能确认原操作。',
              'The original outcome is unknown; new writes remain locked. Current state cannot confirm the original operation.',
            )}
            description={operationId}
          />
          <Button
            disabled={action.busy}
            onClick={() =>
              void action
                .run(async () => {
                  const detail = await operationDiagnostics.mdm!.operation({
                      owner: 'policy',
                      operationId: operationId!,
                    }),
                    receipt = detail.originalResult
                  if (
                    receipt.availability !== 'available' ||
                    receipt.value.operationId !== operationId ||
                    receipt.value.object !== id
                  )
                    throw { cause: 'client', code: 'receipt_unavailable' }
                  return policies.read(id)
                })
                .then((result) => {
                  if (result.ok) {
                    setUnknown(false)
                    setPending(null)
                    setConfirmed(true)
                    setBase(result.value)
                    setDefinition(structuredClone(result.value.definition))
                    setEnabled(result.value.state === 'enabled')
                    setObserved(null)
                    setApproved(false)
                    setEnableApproved(false)
                    setArchiveApproved(false)
                    setRerunApproved(false)
                  }
                })
            }
          >
            {l('读取原操作回执', 'Read original operation receipt')}
          </Button>
          <Checkbox checked={retryApproved} onChange={(e) => setRetryApproved(e.target.checked)}>
            {l('确认使用原标识和原输入重发', 'Confirm resending the original identity and input')}
          </Checkbox>
          <Button
            disabled={!canWrite || action.busy || !retryApproved}
            onClick={() => {
              setRetryApproved(false)
              void send(pending)
            }}
          >
            {l('重提原操作', 'Resubmit original operation')}
          </Button>
        </>
      )}
      {confirmed && (
        <Alert
          type="success"
          title={l(
            '原操作已确认；设备执行与效果需分别核实。',
            'Original operation confirmed; verify device execution and effect separately.',
          )}
        />
      )}
      <SecretTabs
        uiLocale={locale}
        authorizedKeys={[
          ...(canRead || canWrite ? ['configuration', 'scope'] : []),
          ...(canRead ? ['records'] : []),
        ]}
        activeKey={params.get('tab') ?? 'configuration'}
        onChange={(tab) => {
          const next = new URLSearchParams(params)
          next.set('tab', tab)
          setParams(next)
        }}
        items={[
          {
            key: 'configuration',
            label: l('配置', 'Configuration'),
            children: (
              <>
                <Form layout="vertical" disabled={!canWrite || !mutable || blocked}>
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
                          maxLength={64}
                          value={definition[key] ?? ''}
                          onChange={(e) =>
                            edit({
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
                    resources={resources}
                    locale={locale}
                    onChange={(action) =>
                      edit({
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
                      onChange={(selfService) => edit({ ...definition, selfService })}
                    />
                  )}
                </Form>
                {base && (
                  <PolicyNames
                    policies={policies}
                    policy={base}
                    locale={locale}
                    runtime={runtime}
                  />
                )}
              </>
            ),
          },
          {
            key: 'scope',
            label: l('范围', 'Scope'),
            children: (
              <SelectionGuard.Provider value={scopeGuard.register}>
                <PolicyScope
                  {...scopeProps}
                  value={definition.scope}
                  onChange={(scope) => edit({ ...definition, scope })}
                  saved={
                    base?.scopes.find((scope) => scope.stage === null && !scope.retired) ?? null
                  }
                />
                {definition.action.kind === 'software' && (
                  <PolicyRolloutEditor
                    {...scopeProps}
                    value={definition.action.rollout.stages}
                    savedScopes={base?.scopes ?? []}
                    onChange={(stages) => {
                      if (definition.action.kind === 'software')
                        edit({
                          ...definition,
                          action: { ...definition.action, rollout: { stages } },
                        })
                    }}
                  />
                )}
              </SelectionGuard.Provider>
            ),
          },
          {
            key: 'records',
            label: l('记录', 'Records'),
            children: base ? (
              <SecretTabs
                uiLocale={locale}
                activeKey={params.get('record') ?? 'assignments'}
                onChange={(record) => {
                  const next = new URLSearchParams(params)
                  next.set('record', record)
                  setParams(next)
                }}
                items={[
                  ...(canInventory
                    ? [
                        {
                          key: 'assignments',
                          label: l('设备分配', 'Device assignments'),
                          children: (
                            <PolicyAssignments
                              policies={policies}
                              devices={devices}
                              policy={base}
                              locale={locale}
                            />
                          ),
                        },
                      ]
                    : []),
                  ...(canOperations
                    ? [
                        {
                          key: 'runs',
                          label: l('执行事实', 'Execution facts'),
                          children: (
                            <PolicyRuns
                              policies={policies}
                              devices={devices}
                              policy={base}
                              locale={locale}
                            />
                          ),
                        },
                        ...(base.definition.action.kind === 'software'
                          ? [
                              {
                                key: 'rollout',
                                label: l('灰度进度', 'Rollout progress'),
                                children: (
                                  <PolicyRollout
                                    policies={policies}
                                    policy={base}
                                    locale={locale}
                                  />
                                ),
                              },
                            ]
                          : []),
                      ]
                    : []),
                  {
                    key: 'events',
                    label: l('独立事件', 'Independent events'),
                    children: (
                      <PolicyEvents
                        events={policyEvents}
                        devices={devices}
                        runtime={runtime}
                        ownerPolicy={id}
                        event={base.definition.customEvent}
                        locale={locale}
                        canSubmit={canRerun}
                      />
                    ),
                  },
                ]}
              />
            ) : (
              <Alert
                type="info"
                title={l('保存策略后查看记录。', 'Save the policy to view records.')}
              />
            ),
          },
        ]}
      />
      {sameScopes && base ? (
        <PolicyPreview
          key={JSON.stringify([base.revision, definition])}
          policies={policies}
          id={id}
          expectedRevision={base.revision}
          definition={definition}
          locale={locale}
        />
      ) : (
        <Alert
          type="info"
          title={l(
            '资格预览要求先保存当前范围；范围样例可在范围页签直接预览。',
            'Save the current scopes before qualification preview. Scope samples are available in the Scope tab.',
          )}
        />
      )}
      <fieldset className="asset-editor-section" disabled={!canWrite || !mutable || blocked}>
        <BooleanField
          label={l('保存后启用策略', 'Enable after saving')}
          value={enabled}
          onChange={(value) => {
            setEnabled(value)
            setApproved(false)
          }}
        />
        <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
          {l(
            '确认范围、资源、调度与潜在影响',
            'Confirm scope, resources, schedule and potential impact',
          )}
        </Checkbox>
        <Button
          type="primary"
          disabled={!approved || conflict}
          onClick={() => change({ action: 'put', definition, enabled })}
        >
          {l('保存策略定义', 'Save policy definition')}
        </Button>
      </fieldset>
      {base && mutable && (
        <fieldset
          className="asset-editor-section"
          disabled={!canWrite || blocked || dirty || conflict}
        >
          <Space wrap>
            {base.state === 'disabled' && (
              <Checkbox
                checked={enableApproved}
                onChange={(e) => setEnableApproved(e.target.checked)}
              >
                {l('确认已保存范围与动作后启用', 'Confirm saved scope and action before enabling')}
              </Checkbox>
            )}
            <Button
              disabled={base.state === 'disabled' && !enableApproved}
              onClick={() => change({ action: base.state === 'enabled' ? 'disable' : 'enable' })}
            >
              {base.state === 'enabled'
                ? l('停用策略', 'Disable policy')
                : l('启用策略', 'Enable policy')}
            </Button>
            {base.state === 'disabled' && (
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
                      expectedRevision: base.revision,
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
                        expectedRevision: base.revision,
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
      {dirty && (
        <Checkbox checked={discardApproved} onChange={(e) => setDiscardApproved(e.target.checked)}>
          {l('确认放弃未保存草稿', 'Confirm discarding the unsaved draft')}
        </Checkbox>
      )}
      <Button disabled={blocked || unknown || (dirty && !discardApproved)} onClick={done}>
        {doneLabel ?? l('返回策略目录', 'Return to policies')}
      </Button>
    </section>
  )
}
function CardComparison({
  current,
  draft,
  draftEnabled,
  locale,
  canAdopt,
  adopt,
}: {
  current: Policy
  draft: PolicyDefinition
  draftEnabled: boolean
  locale: Locale
  canAdopt: boolean
  adopt(): void
}) {
  const l = labels(locale)
  return (
    <section>
      <p>
        {l('服务端最新配置修订', 'Latest server configuration revision')} · {current.revision}
      </p>
      <details>
        <summary>
          {l('核对服务端配置与当前草稿', 'Compare server configuration and current draft')}
        </summary>
        <pre>
          {JSON.stringify(
            {
              server: { definition: current.definition, state: current.state },
              draft: { definition: draft, enabled: draftEnabled },
            },
            null,
            2,
          )}
        </pre>
      </details>
      <Button disabled={!canAdopt} onClick={adopt}>
        {l('保留草稿，采用此修订继续编辑', 'Keep draft and continue editing against this revision')}
      </Button>
    </section>
  )
}
