import { useState } from 'react'
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space } from 'antd'
import { freeze, type AssetContext, type Operation } from '@rss/mdm-inventory'
import {
  validateChange,
  type GroupChange,
  type GroupCondition,
  type GroupRead,
} from '@rss/mdm-groups'
import type { GroupsUseCases } from './GroupPicker'
import type { DevicesUseCases } from './EndpointPicker'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction } from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { ConditionContextEditor } from './InventoryScopeEditor'
import { emptyPredicate, GroupCriteriaEditor } from './CriteriaEditor'
import { StringItems } from './ValueTypeEditor'
import { EndpointPicker } from './EndpointPicker'
import { GroupReferences } from './GroupReferences'
import { GroupResults, GroupTaskPanel } from './GroupResults'
import { Status } from './DevicePresentation'

type Pending =
  | { readonly kind: 'change'; readonly change: Operation<GroupChange> }
  | { readonly kind: 'preview'; readonly change: Operation<Record<string, never>> }
export function GroupEditor({
  groups,
  devices,
  locale,
  id,
  baseline,
  canWrite,
  canPreview,
  canRecompute,
  done,
}: {
  groups: GroupsUseCases
  devices: DevicesUseCases
  locale: Locale
  id: string
  baseline: GroupRead | null
  canWrite: boolean
  canPreview: boolean
  canRecompute: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    guard = useSelectionGuard(),
    group = baseline?.group,
    [kind, setKind] = useState<'static' | 'dynamic'>(
      group?.kind === 'dynamic' ? 'dynamic' : 'static',
    ),
    [assetContext, setAssetContext] = useState<AssetContext>(group?.assetContext ?? 'endpoint'),
    [presentation, setPresentation] = useState<Readonly<Record<string, unknown>>>(() =>
      structuredClone(group?.presentation ?? { name: '', description: '' }),
    ),
    [criteria, setCriteria] = useState<GroupCondition>(() =>
      structuredClone(
        baseline?.criteria ?? {
          selector: { kind: 'device' },
          quantifier: 'one',
          criteria: emptyPredicate(),
        },
      ),
    ),
    [add, setAdd] = useState<readonly string[]>([]),
    [remove, setRemove] = useState<readonly string[]>([]),
    [memberAction, setMemberAction] = useState<'add' | 'remove'>('add'),
    [pending, setPending] = useState<Pending | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'accepted' | 'unknown' | 'rejected'>(
      'none',
    ),
    [task, setTask] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    [invalid, setInvalid] = useState(false),
    [deletionBlocked, setDeletionBlocked] = useState<boolean | null>(null),
    mutable = canWrite && group?.kind !== 'system' && !group?.deleted
  usePendingSelection(
    guard.locked ||
      action.busy ||
      (pending !== null && !['confirmed', 'accepted', 'rejected'].includes(outcome)),
  )
  async function submit(intent: Pending) {
    const result = await action.run(() =>
      intent.kind === 'preview'
        ? groups.preview(id, intent.change)
        : groups.change(id, intent.change),
    )
    if (result.ok) {
      if ('statusUrl' in result.value) {
        setTask(result.value.task)
        setOutcome('accepted')
      } else {
        setTask(result.value.task)
        setOutcome('confirmed')
      }
    } else
      setOutcome((previous) =>
        previous === 'unknown' || isUnknown(result.error) ? 'unknown' : 'rejected',
      )
  }
  function start(input: GroupChange) {
    try {
      const change = freeze({
        operationId: crypto.randomUUID(),
        expectedRevision: group?.revision ?? 0,
        input,
      })
      validateChange(change)
      const intent: Pending = { kind: 'change', change }
      setPending(intent)
      setInvalid(false)
      void submit(intent)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card
        title={group ? l('设备组详情', 'Device group detail') : l('新建设备组', 'New device group')}
      >
        <p>
          <code>{id}</code> · {assetContext}
        </p>
        {group && (
          <>
            <dl className="device-facts">
              <div>
                <dt>{l('编辑版本', 'Edit revision')}</dt>
                <dd>{group.revision}</dd>
              </div>
              <div>
                <dt>{l('计算版本', 'Calculation revision')}</dt>
                <dd>{group.calculationRevision}</dd>
              </div>
              <div>
                <dt>{l('成员语义版本', 'Member version')}</dt>
                <dd>{group.memberVersion}</dd>
              </div>
              <div>
                <dt>{l('成员数', 'Members')}</dt>
                <dd>{group.memberCount}</dd>
              </div>
              <div>
                <dt>{l('规则版本', 'Rule version')}</dt>
                <dd>{group.ruleVersion ?? '—'}</dd>
              </div>
              <div>
                <dt>{l('来源新鲜度', 'Source freshness')}</dt>
                <dd>
                  <Status locale={locale} value={baseline!.freshness} />
                </dd>
              </div>
            </dl>
            {baseline?.freshness === 'pending' && (
              <Alert
                type="warning"
                title={l(
                  '来源或定义仍在处理中。下面的已有成员集不代表新规则已完成。',
                  'Inputs or definitions are pending. Existing membership below does not establish completion of a new rule.',
                )}
              />
            )}
          </>
        )}
        <Failure locale={locale} error={action.error} />
        {invalid && (
          <Alert
            type="error"
            title={l(
              '请检查名称、条件上下文、组引用和终端增减列表。',
              'Check the name, condition context, group references and endpoint additions/removals.',
            )}
          />
        )}
        <Form
          layout="vertical"
          disabled={!mutable || guard.locked || action.busy || pending !== null}
          onFinish={() =>
            start(
              group
                ? { action: 'edit', presentation }
                : {
                    action: 'create',
                    presentation,
                    assetContext: kind === 'static' ? 'endpoint' : assetContext,
                    criteria: kind === 'dynamic' ? criteria : null,
                  },
            )
          }
        >
          {!group && (
            <Form.Item label={l('设备组类型', 'Group kind')}>
              <Select
                aria-label={l('设备组类型', 'Group kind')}
                value={kind}
                options={[
                  { value: 'static', label: l('静态设备组', 'Static group') },
                  { value: 'dynamic', label: l('动态设备组', 'Dynamic group') },
                ]}
                onChange={(kind: 'static' | 'dynamic') => {
                  setKind(kind)
                  if (kind === 'static') setAssetContext('endpoint')
                }}
              />
            </Form.Item>
          )}
          <Form.Item label={l('设备组名称', 'Group name')}>
            <Input
              aria-label={l('设备组名称', 'Group name')}
              value={typeof presentation['name'] === 'string' ? presentation['name'] : ''}
              onChange={(e) => setPresentation({ ...presentation, name: e.target.value })}
            />
          </Form.Item>
          <Form.Item label={l('设备组说明', 'Group description')}>
            <Input.TextArea
              aria-label={l('设备组说明', 'Group description')}
              value={
                typeof presentation['description'] === 'string' ? presentation['description'] : ''
              }
              onChange={(e) => setPresentation({ ...presentation, description: e.target.value })}
            />
          </Form.Item>
          {!group && kind === 'dynamic' && (
            <Form.Item label={l('不可变资产上下文', 'Immutable asset context')}>
              <Select
                aria-label={l('不可变资产上下文', 'Immutable asset context')}
                value={assetContext}
                options={[
                  { value: 'endpoint', label: l('独立终端', 'Endpoint') },
                  { value: 'associated_device', label: l('关联设备', 'Associated device') },
                ]}
                onChange={(context: AssetContext) => setAssetContext(context)}
              />
            </Form.Item>
          )}
          {!group && kind === 'dynamic' && (
            <>
              <ConditionContextEditor
                locale={locale}
                value={criteria}
                onChange={(context) => setCriteria({ ...criteria, ...context })}
              />
              <GroupCriteriaEditor
                locale={locale}
                groups={groups}
                assetContext={assetContext}
                value={criteria.criteria}
                onChange={(value) => setCriteria({ ...criteria, criteria: value })}
              />
            </>
          )}
          <Button type="primary" htmlType="submit">
            {group ? l('保存设备组元数据', 'Save group metadata') : l('创建设备组', 'Create group')}
          </Button>
        </Form>
        {group?.kind === 'dynamic' && (
          <Form
            className="admin-subsection"
            layout="vertical"
            disabled={!mutable || guard.locked || action.busy || pending !== null}
            onFinish={() => start({ action: 'rule', criteria })}
          >
            <h3>{l('规则定义', 'Rule definition')}</h3>
            <ConditionContextEditor
              locale={locale}
              value={criteria}
              onChange={(context) => setCriteria({ ...criteria, ...context })}
            />
            <GroupCriteriaEditor
              locale={locale}
              groups={groups}
              referenceableFor={group.id}
              assetContext={group.assetContext}
              value={criteria.criteria}
              onChange={(value) => setCriteria({ ...criteria, criteria: value })}
            />
            <Button type="primary" htmlType="submit">
              {l('提交规则验证与保存任务', 'Submit rule validation and save task')}
            </Button>
          </Form>
        )}
        {group?.kind === 'static' && (
          <Form
            className="admin-subsection"
            layout="vertical"
            disabled={!mutable || guard.locked || action.busy || pending !== null}
            onFinish={() =>
              start({
                action: 'members',
                add: add.map((id) => ({ kind: 'endpoint', id })),
                remove: remove.map((id) => ({ kind: 'endpoint', id })),
              })
            }
          >
            <h3>{l('静态成员增减', 'Static membership changes')}</h3>
            <StringItems
              locale={locale}
              label={l('添加终端标识', 'Endpoint IDs to add')}
              value={add}
              onChange={setAdd}
            />
            <StringItems
              locale={locale}
              label={l('移除终端标识', 'Endpoint IDs to remove')}
              value={remove}
              onChange={setRemove}
            />
            <Select
              aria-label={l('终端选择用途', 'Endpoint selection action')}
              value={memberAction}
              options={[
                { value: 'add', label: l('添加到组', 'Add to group') },
                { value: 'remove', label: l('从组移除', 'Remove from group') },
              ]}
              onChange={(value: typeof memberAction) => setMemberAction(value)}
            />
            <EndpointPicker
              devices={devices}
              locale={locale}
              onChange={(id) =>
                memberAction === 'add'
                  ? setAdd([...new Set([...add, id])])
                  : setRemove([...new Set([...remove, id])])
              }
            />
            <Button htmlType="submit">{l('提交成员增减', 'Submit membership changes')}</Button>
          </Form>
        )}
        {group && (
          <Space wrap className="admin-subsection">
            <Button
              disabled={
                !canPreview || group.deleted || action.busy || pending !== null || guard.locked
              }
              onClick={() => {
                const intent: Pending = {
                  kind: 'preview',
                  change: freeze({
                    operationId: crypto.randomUUID(),
                    expectedRevision: group.revision,
                    input: {},
                  }),
                }
                setPending(intent)
                void submit(intent)
              }}
            >
              {l('预览已保存定义（不含草稿）', 'Preview saved definition (excludes drafts)')}
            </Button>
            <Button
              disabled={
                !canRecompute ||
                group.kind === 'system' ||
                group.deleted ||
                action.busy ||
                pending !== null ||
                guard.locked
              }
              onClick={() => start({ action: 'recompute' })}
            >
              {l('请求正式重算', 'Request formal recomputation')}
            </Button>
          </Space>
        )}
        {pending && (
          <div className="admin-recovery">
            <p>
              <code>{pending.change.operationId}</code> ·{' '}
              {l('原编辑版本', 'Original edit revision')} {pending.change.expectedRevision}
            </p>
            {['confirmed', 'accepted', 'rejected'].includes(outcome) ? (
              <Button disabled={guard.locked || action.busy} onClick={done}>
                {outcome === 'accepted'
                  ? l('任务已受理，重新读取组事实', 'Task accepted; read group facts again')
                  : outcome === 'confirmed'
                    ? l('变更已确认，重新读取', 'Change confirmed; read again')
                    : l('放弃已拒绝变更并重读', 'Discard rejected change and read again')}
              </Button>
            ) : (
              <>
                <Alert
                  type="warning"
                  title={l(
                    '结果未确认；当前组读取不能确认原写入。保留同一标识、版本与内容。',
                    'Outcome unconfirmed; current group reads do not confirm the original write. Retain the same ID, revision and content.',
                  )}
                />
                <Button
                  disabled={
                    action.busy ||
                    !(pending.kind === 'preview'
                      ? canPreview
                      : pending.change.input.action === 'recompute'
                        ? canRecompute
                        : canWrite)
                  }
                  onClick={() => void submit(pending)}
                >
                  {l('显式重提原设备组请求', 'Resubmit original group request')}
                </Button>
              </>
            )}
          </div>
        )}
        {task && (
          <GroupTaskPanel key={task} groups={groups} locale={locale} id={id} initialTask={task} />
        )}
      </Card>
      {baseline && (
        <>
          {baseline.memberSet ? (
            <GroupResults
              key={baseline.memberSet}
              groups={groups}
              locale={locale}
              id={id}
              result={baseline.memberSet}
            />
          ) : (
            <Alert
              className="admin-subsection"
              type="info"
              title={
                group?.kind === 'static' && group.memberCount === 0
                  ? l(
                      '初始静态组为空，尚未创建成员集。',
                      'The initial static group is empty and has no member set yet.',
                    )
                  : l('尚无正式成员集。', 'No formal member set yet.')
              }
            />
          )}
          {!task && <GroupTaskPanel groups={groups} locale={locale} id={id} />}
          <GroupReferences
            groups={groups}
            locale={locale}
            id={id}
            onDeletionChange={setDeletionBlocked}
          />
          <fieldset
            className="permission-panel admin-subsection"
            disabled={
              !mutable ||
              action.busy ||
              guard.locked ||
              pending !== null ||
              deletionBlocked !== false
            }
          >
            <Checkbox checked={approved} onChange={(e) => setApproved(e.target.checked)}>
              {l(
                '已核对服务端删除保护，确认删除设备组',
                'I reviewed server deletion protection and confirm group deletion',
              )}
            </Checkbox>
            <Button
              danger
              disabled={
                !approved ||
                !mutable ||
                action.busy ||
                guard.locked ||
                pending !== null ||
                deletionBlocked !== false
              }
              onClick={() => start({ action: 'delete' })}
            >
              {l('删除设备组', 'Delete group')}
            </Button>
          </fieldset>
        </>
      )}
    </SelectionGuard.Provider>
  )
}
