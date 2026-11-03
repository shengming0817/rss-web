import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Select, Space } from 'antd'
import { freeze, type Operation } from '@rss/mdm-inventory'
import {
  validateDefinition,
  type ScopeChange,
  type ScopeDefinition,
  type ScopeRead,
  type ScopePreview,
} from '@rss/mdm-scopes'
import type { Channel } from '@rss/mdm-devices'
import { devicePath } from './Devices'
import { ScopeBlockers } from './ScopeBlockers'
import type { DevicesUseCases } from './EndpointPicker'
import type { GroupsUseCases } from './GroupPicker'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { ScopeReferences } from './ScopeReferences'
import { ScopeResults, ScopeTaskPanel, type ScopesUseCases } from './ScopeResults'

export function ScopeEditor({
  scopes,
  groups,
  devices,
  id,
  baseline,
  locale,
  canWrite,
  done,
}: {
  scopes: ScopesUseCases
  groups: GroupsUseCases
  devices: DevicesUseCases
  id: string
  baseline: ScopeRead | null
  locale: Locale
  canWrite: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [definition, setDefinition] = useState<ScopeDefinition>(() =>
      structuredClone(baseline?.definition ?? { targets: [], limitations: null, exclusions: [] }),
    ),
    [pending, setPending] = useState<Operation<ScopeChange> | null>(null),
    [unknown, setUnknown] = useState(false),
    [observed, setObserved] = useState<ScopeRead | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [task, setTask] = useState<string | null>(null),
    [invalid, setInvalid] = useState(false),
    [approveDelete, setApproveDelete] = useState(false),
    [retryApproved, setRetryApproved] = useState(false),
    [previewChannel, setPreviewChannel] = useState<Channel>('agent'),
    [preview, setPreview] = useState<ScopePreview | null>(null)
  usePendingSelection(action.busy || (pending !== null && !confirmed))
  async function submit(intent: Operation<ScopeChange>) {
    const result = await action.run(() => scopes.change(id, intent))
    if (result.ok) {
      setConfirmed(true)
      setTask(result.value.task)
      setUnknown(false)
    } else if (unknown || isUnknown(result.error)) setUnknown(true)
    else setPending(null)
  }
  async function start(input: ScopeChange) {
    try {
      if (input.action === 'put') validateDefinition(input.definition)
      const intent = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: baseline?.revision ?? 0,
        input,
      })
      setPending(intent)
      setInvalid(false)
      await submit(intent)
    } catch {
      setInvalid(true)
    }
  }
  function updateDefinition(value: ScopeDefinition) {
    setPreview(null)
    setDefinition(value)
  }
  const pickers = { groups, devices, locale }
  return (
    <section
      className="scope-editor"
      aria-label={baseline ? l('范围定义', 'Scope definition') : l('新建范围', 'New scope')}
    >
      <p>
        <code>{id}</code> · {l('定义修订', 'Definition revision')} {baseline?.revision ?? 0}
      </p>
      {baseline && (
        <p>
          {l('结果语义版本', 'Semantic result version')} {baseline.resolutionRevision} ·{' '}
          {baseline.resolution ?? l('尚无结果', 'No result yet')}
        </p>
      )}
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '请检查重复引用、标识与来源数量。',
            'Check duplicate references, identifiers and source budget.',
          )}
        />
      )}
      {unknown && (
        <Alert
          type="warning"
          title={l(
            pending?.input.action === 'recompute'
              ? '未收到重算结果。可读取当前状态，或确认后重提原重算请求。'
              : '未收到保存结果。请刷新页面查看服务器当前配置，再决定是否继续编辑。',
            pending?.input.action === 'recompute'
              ? 'Recomputation result was not received. Read current state or confirm resubmitting the original request.'
              : 'Save result was not received. Refresh the page to review the current server configuration before editing again.',
          )}
          description={<code>{pending?.operationId}</code>}
        />
      )}
      {unknown && pending && (
        <>
          <p className="subtitle">
            {l(
              '读取只展示原范围的当前状态，不能确认原操作是否成功；新写入保持锁定。',
              'Reading shows the original scope’s current state and cannot confirm the original operation. New writes remain locked.',
            )}
          </p>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action
                .run(() => scopes.read(id))
                .then((result) => {
                  if (result.ok) setObserved(result.value)
                })
            }
          >
            {l('读取原范围当前状态', 'Read original scope current state')}
          </Button>
          {observed && (
            <p>
              {l('当前定义修订', 'Current definition revision')} {observed.revision} ·{' '}
              {l('当前结果', 'Current result')} {observed.resolution ?? '—'}
            </p>
          )}
        </>
      )}
      {confirmed && (
        <Alert
          type="success"
          title={l(
            '操作已确认；计算、策略分配与设备执行分别观察。',
            'Operation confirmed; observe computation, policy assignment and device execution separately.',
          )}
        />
      )}
      <fieldset
        className="permission-panel"
        disabled={!canWrite || action.busy || pending !== null}
      >
        <ScopeReferences
          {...pickers}
          title={l('目标（并集）', 'Targets (union)')}
          value={definition.targets}
          onChange={(targets) => updateDefinition({ ...definition, targets })}
        />
        <Checkbox
          checked={definition.limitations !== null}
          onChange={(event) =>
            updateDefinition({ ...definition, limitations: event.target.checked ? [] : null })
          }
        >
          {l('限制范围（交集）', 'Limit scope (intersection)')}
        </Checkbox>
        <p className="subtitle">
          {definition.limitations === null
            ? l('不限制目标范围。', 'Targets are unrestricted.')
            : definition.limitations.length === 0
              ? l(
                  '已启用限制且未选择引用：结果为空。',
                  'Restrictions enabled without references: the result is empty.',
                )
              : l('目标必须同时满足限制。', 'Targets must also satisfy the limitations.')}
        </p>
        {definition.limitations !== null && (
          <ScopeReferences
            {...pickers}
            title={l('限制引用', 'Limitation references')}
            value={definition.limitations}
            onChange={(limitations) => updateDefinition({ ...definition, limitations })}
          />
        )}
        <ScopeReferences
          {...pickers}
          title={l('排除（差集）', 'Exclusions (difference)')}
          value={definition.exclusions}
          onChange={(exclusions) => updateDefinition({ ...definition, exclusions })}
        />
        <Space wrap>
          <Button type="primary" onClick={() => void start({ action: 'put', definition })}>
            {l('保存并计算范围', 'Save and compute scope')}
          </Button>
          {baseline && (
            <>
              <Button
                disabled={JSON.stringify(definition) !== JSON.stringify(baseline.definition)}
                onClick={() => void start({ action: 'recompute' })}
              >
                {l('重新计算已保存范围', 'Recompute saved scope')}
              </Button>
              <Checkbox
                checked={approveDelete}
                onChange={(event) => setApproveDelete(event.target.checked)}
              >
                {l(
                  '确认删除；服务端检查当前引用',
                  'Confirm deletion; server checks current references',
                )}
              </Checkbox>
              <Button
                danger
                disabled={!approveDelete}
                onClick={() => void start({ action: 'delete' })}
              >
                {l('删除范围', 'Delete scope')}
              </Button>
            </>
          )}
        </Space>
      </fieldset>
      <Card title={l('保存前范围样例', 'Scope sample before saving')}>
        <Space wrap>
          <Select
            aria-label={l('预览执行通道', 'Preview execution channel')}
            value={previewChannel}
            disabled={action.busy}
            options={[
              { value: 'agent', label: 'Agent' },
              { value: 'mdm', label: 'MDM' },
            ]}
            onChange={(channel: Channel) => {
              setPreview(null)
              setPreviewChannel(channel)
            }}
          />
          <Button
            disabled={action.busy || pending !== null}
            onClick={() => {
              setPreview(null)
              void action
                .run(() =>
                  scopes.preview({
                    definition,
                    channel: previewChannel,
                    ...(baseline
                      ? { editing: { scopeId: id, expectedRevision: baseline.revision } }
                      : {}),
                  }),
                )
                .then((result) => {
                  if (result.ok) setPreview(result.value)
                })
            }}
          >
            {l('预览当前范围样例（不保存）', 'Preview current scope sample (without saving)')}
          </Button>
        </Space>
        {preview && (
          <>
            <Alert
              type={!preview.scanComplete || preview.hasUnknown ? 'warning' : 'info'}
              title={
                !preview.scanComplete
                  ? l(
                      '扫描或样例达到上限；空样例不能说明范围为空。',
                      'Scan or sample limit reached; an empty sample is inconclusive.',
                    )
                  : preview.hasUnknown
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
              {l('本次匹配样例', 'Matching samples')} · {preview.items.length} · {preview.channel}
            </p>
            <ul>
              {preview.items.map((item) => (
                <li key={`${item.kind}/${item.id}`}>
                  <Link to={devicePath(item.kind, item.id)}>
                    {item.kind} · {item.id}
                  </Link>
                </li>
              ))}
            </ul>
            <details>
              <summary>{l('预览依据', 'Preview basis')}</summary>
              <p>
                {preview.inputFingerprint} · {preview.asOf}
              </p>
              <pre>
                {JSON.stringify({ assetCut: preview.assetCut, sources: preview.sources }, null, 2)}
              </pre>
            </details>
          </>
        )}
      </Card>
      {baseline && (
        <>
          <p className="subtitle">
            {l(
              '重新计算使用服务器已保存的定义，不保存当前草稿，也不改变定义修订。',
              'Recomputation uses the saved server definition, leaves the draft unsaved and keeps its definition revision.',
            )}{' '}
          </p>
          <ScopeBlockers scopes={scopes} id={id} locale={locale} />
        </>
      )}
      {unknown && pending?.input.action === 'recompute' && (
        <Space wrap>
          <Checkbox
            checked={retryApproved}
            onChange={(event) => setRetryApproved(event.target.checked)}
          >
            {l(
              '确认使用原操作标识和原输入重提重算请求',
              'Confirm resubmission with the original operation identity and input',
            )}
          </Checkbox>
          <Button disabled={!retryApproved || action.busy} onClick={() => void submit(pending)}>
            {l('重提原重算请求', 'Resubmit original recomputation')}
          </Button>
        </Space>
      )}
      {confirmed && (
        <p>
          <Link to={`/policies?scope=${encodeURIComponent(id)}`}>
            {l('将此范围用于策略 →', 'Use this scope in a policy →')}
          </Link>
        </p>
      )}
      {task && <ScopeTaskPanel scopes={scopes} id={id} task={task} locale={locale} />}
      {baseline?.resolution ? (
        <ScopeResults scopes={scopes} id={id} result={baseline.resolution} locale={locale} />
      ) : (
        <Alert
          type="info"
          title={l(
            '尚无已发布范围结果；这不表示成员为空。',
            'No published scope result yet; this does not mean zero members.',
          )}
        />
      )}
      <Button disabled={action.busy || (pending !== null && !confirmed)} onClick={done}>
        {l('返回目录并读取当前状态', 'Return to directory and read current state')}
      </Button>
    </section>
  )
}
