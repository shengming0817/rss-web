import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Select, Space } from 'antd'
import { Link } from 'react-router-dom'
import type { ScopeDefinition, ScopeOwner, ScopeRead } from '@rss/mdm-scopes'
import type { Channel } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { DevicesUseCases } from './EndpointPicker'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, usePageRead } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { useAdministration } from './useAdministration'
import { ScopeReferences } from './ScopeReferences'
import { ScopeResults, ScopeTaskPanel, type ScopesUseCases } from './ScopeResults'
import { useSecretVisibility } from './SecretTabs'
import { devicePath } from './Devices'

export function emptyScope(): ScopeDefinition {
  return { targets: [], limitations: null, exclusions: [] }
}
export interface PolicyScopeProps {
  owner: ScopeOwner
  policyRevision: number
  value: ScopeDefinition
  saved: ScopeRead | null
  onChange(value: ScopeDefinition): void
  scopes: ScopesUseCases
  groups: GroupsUseCases
  devices: DevicesUseCases
  runtime: Runtime
  locale: Locale
  canRecompute: boolean
  disabled: boolean
}
export function PolicyScope(props: PolicyScopeProps) {
  const { value, onChange, locale, owner, policyRevision, scopes, groups, devices, disabled } =
      props,
    l = labels(locale),
    prefix = `scope.${owner.policyId}.${owner.stageId ?? 'overall'}.`
  return (
    <section aria-label={l('策略范围', 'Policy scope')}>
      <fieldset className="permission-panel">
        <p>
          {l(
            '范围与配置一起保存。目标取并集，再与限制相交，最后减去排除对象。',
            'Scope is saved with configuration: union the targets, intersect limitations, then subtract exclusions.',
          )}
        </p>
        <ScopeReferences
          title={l('目标（并集）', 'Targets (union)')}
          value={value.targets}
          onChange={(targets) => onChange({ ...value, targets })}
          {...{ groups, devices, locale, disabled }}
          queryPrefix={prefix + 'targets.'}
        />
        <Checkbox
          disabled={disabled}
          checked={value.limitations !== null}
          onChange={(e) => onChange({ ...value, limitations: e.target.checked ? [] : null })}
        >
          {l('限制范围（交集）', 'Limit scope (intersection)')}
        </Checkbox>
        <p>
          {value.limitations === null
            ? l('不限制目标范围。', 'Targets are unrestricted.')
            : value.limitations.length === 0
              ? l(
                  '已启用限制且未选择引用：结果为空。',
                  'Restrictions enabled without references: the result is empty.',
                )
              : l('目标必须同时满足限制。', 'Targets must also satisfy limitations.')}
        </p>
        {value.limitations !== null && (
          <ScopeReferences
            title={l('限制引用', 'Limitation references')}
            value={value.limitations}
            onChange={(limitations) => onChange({ ...value, limitations })}
            {...{ groups, devices, locale, disabled }}
            queryPrefix={prefix + 'limitations.'}
          />
        )}
        <ScopeReferences
          title={l('排除（差集）', 'Exclusions (difference)')}
          value={value.exclusions}
          onChange={(exclusions) => onChange({ ...value, exclusions })}
          {...{ groups, devices, locale, disabled }}
          queryPrefix={prefix + 'exclusions.'}
        />
      </fieldset>
      <ScopeSample
        key={JSON.stringify([owner, policyRevision, value])}
        {...{ owner, policyRevision, value, scopes, locale }}
      />
      <SavedScope key={JSON.stringify(owner)} {...props} />
    </section>
  )
}
function ScopeSample({
  owner,
  policyRevision,
  value,
  scopes,
  locale,
}: Pick<PolicyScopeProps, 'owner' | 'policyRevision' | 'value' | 'scopes' | 'locale'>) {
  const active = useSecretVisibility(),
    l = labels(locale),
    [channel, setChannel] = useState<Channel>('agent'),
    [requested, setRequested] = useState(0),
    read = usePageRead(
      `scope-sample/${JSON.stringify(owner)}/${policyRevision}/${active}/${channel}/${requested}`,
      (signal) =>
        active && requested
          ? scopes.preview(
              owner,
              { expectedRevision: policyRevision, definition: value, channel },
              signal,
            )
          : Promise.resolve(null),
    )
  return (
    <Card title={l('保存前范围样例', 'Scope sample before saving')}>
      <Space wrap>
        <Select
          aria-label={l('预览执行通道', 'Preview execution channel')}
          value={channel}
          options={[
            { value: 'agent', label: 'Agent' },
            { value: 'mdm', label: 'MDM' },
          ]}
          onChange={(value) => {
            setRequested(0)
            setChannel(value)
          }}
        />
        <Button disabled={read.busy} onClick={() => setRequested((n) => n + 1)}>
          {l('预览当前范围样例（不保存）', 'Preview current scope sample (without saving)')}
        </Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {read.value && (
        <>
          <Alert
            type={!read.value.scanComplete || read.value.hasUnknown ? 'warning' : 'info'}
            title={
              !read.value.scanComplete
                ? l(
                    '扫描或样例达到上限；空样例不能说明范围为空。',
                    'Scan or sample limit reached; an empty sample is inconclusive.',
                  )
                : read.value.hasUnknown
                  ? l(
                      '扫描完成，但部分来源未知；空样例不能说明范围为空。',
                      'Scan complete with unknown source facts; an empty sample is inconclusive.',
                    )
                  : l(
                      '扫描完成；样例不保存定义、不发布成员或部署。',
                      'Scan complete; samples do not save definitions, publish members or deploy.',
                    )
            }
          />
          <p>
            {l('本次匹配样例', 'Matching samples')} · {read.value.items.length} ·{' '}
            {read.value.channel} · {read.value.stopReason}
          </p>
          <ul>
            {read.value.items.map((item) => (
              <li key={`${item.kind}/${item.id}`}>
                <Link to={devicePath(item.kind, item.id)}>
                  {item.kind} · {item.id}
                </Link>
              </li>
            ))}
          </ul>
          <details>
            <summary>{l('预览依据', 'Preview basis')}</summary>
            <pre>
              {JSON.stringify(
                {
                  inputFingerprint: read.value.inputFingerprint,
                  assetCut: read.value.assetCut,
                  sources: read.value.sources,
                  asOf: read.value.asOf,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
    </Card>
  )
}
function SavedScope({
  owner,
  policyRevision,
  value,
  saved,
  scopes,
  runtime,
  locale,
  canRecompute,
  disabled,
}: PolicyScopeProps) {
  const l = labels(locale),
    action = useAction(),
    { operationDiagnostics } = useAdministration(runtime),
    [pending, setPending] = useState<{ operationId: string; expectedRevision: number } | null>(
      null,
    ),
    [unknown, setUnknown] = useState(false),
    [approved, setApproved] = useState(false),
    [task, setTask] = useState<string | null>(null),
    [reload, setReload] = useState(0),
    read = usePageRead(
      `owned-scope/${JSON.stringify(owner)}/${policyRevision}/${reload}`,
      (signal) => (saved ? scopes.read(owner, signal) : Promise.resolve(null)),
    ),
    current = read.value ?? saved,
    unchanged = current !== null && JSON.stringify(current.definition) === JSON.stringify(value)
  usePendingSelection(action.busy || unknown)
  async function send(intent: NonNullable<typeof pending>) {
    const result = await action.run(() => scopes.recompute(owner, intent))
    if (result.ok) {
      setUnknown(false)
      setPending(null)
      setTask(result.value.task)
      setReload((n) => n + 1)
    } else if (unknown || isUnknown(result.error)) setUnknown(true)
    else setPending(null)
  }
  if (!saved)
    return (
      <Alert
        type="info"
        title={l(
          '保存策略后可读取正式范围结果。',
          'Save the policy to read published scope results.',
        )}
      />
    )
  return (
    <Card title={l('已保存范围与计算', 'Saved scope and computation')}>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      {!unchanged && (
        <Alert
          type="info"
          title={l(
            '当前草稿与已保存范围不同；以下结果属于已保存范围。',
            'The draft differs from the saved scope; results below belong to the saved scope.',
          )}
        />
      )}
      <p>
        {l(
          '范围标识 / 定义修订 / 结果版本',
          'Scope identifier / definition revision / result version',
        )}{' '}
        · {current?.id} / {current?.revision} / {current?.resolutionRevision}
      </p>
      <Failure locale={locale} error={action.error} />
      <Space wrap>
        <Button
          disabled={action.busy || disabled || !canRecompute || !unchanged || pending !== null}
          onClick={() => {
            const intent = Object.freeze({
              operationId: crypto.randomUUID(),
              expectedRevision: policyRevision,
            })
            setPending(intent)
            void send(intent)
          }}
        >
          {l('重新计算已保存范围', 'Recompute saved scope')}
        </Button>
        <Button onClick={() => setReload((n) => n + 1)}>
          {l('读取已保存范围', 'Read saved scope')}
        </Button>
      </Space>
      <p>
        {l(
          '重算使用已保存范围，不保存草稿，不推进 Policy 配置修订。',
          'Recomputation uses the saved scope, leaves the draft unsaved and preserves the Policy configuration revision.',
        )}
      </p>
      {unknown && pending && (
        <>
          <Alert
            type="warning"
            title={l(
              '重算结果未知，新重算保持锁定。',
              'Recomputation outcome is unknown; new recomputations remain locked.',
            )}
            description={pending.operationId}
          />
          <Button
            disabled={action.busy}
            onClick={() =>
              void action
                .run(() =>
                  operationDiagnostics.mdm!.operation({
                    owner: 'scope',
                    operationId: pending.operationId,
                  }),
                )
                .then((result) => {
                  if (!result.ok) return
                  const receipt = result.value.originalResult
                  if (
                    receipt.availability === 'available' &&
                    receipt.value.operationId === pending.operationId &&
                    receipt.value.object === current?.id
                  ) {
                    setUnknown(false)
                    setPending(null)
                    setReload((n) => n + 1)
                  }
                })
            }
          >
            {l('读取原重算回执', 'Read original recomputation receipt')}
          </Button>
          <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
            {l('确认重发原重算操作', 'Confirm resending the original recomputation')}
          </Checkbox>
          <Button
            disabled={!approved || action.busy || !canRecompute}
            onClick={() => {
              setApproved(false)
              void send(pending)
            }}
          >
            {l('重提原重算请求', 'Resubmit original recomputation')}
          </Button>
        </>
      )}
      {current && (task ?? current.task) && (
        <ScopeTaskPanel
          owner={owner}
          scopes={scopes}
          id={current.id}
          task={(task ?? current.task)!}
          locale={locale}
        />
      )}
      {current?.resolution ? (
        <ScopeResults
          key={`${current.id}/${current.resolution}`}
          owner={owner}
          scopes={scopes}
          id={current.id}
          result={current.resolution}
          locale={locale}
        />
      ) : (
        <Alert
          type="info"
          title={l(
            '尚无已发布范围结果；这不表示成员为空。',
            'No published scope result yet; this does not mean zero members.',
          )}
        />
      )}
    </Card>
  )
}
