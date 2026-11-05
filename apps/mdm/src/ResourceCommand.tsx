import { useState } from 'react'
import { Alert, Button, Space } from 'antd'
import { freeze, type Operation } from '@rss/mdm-inventory'
import {
  resourceId,
  validateChange,
  type createResources,
  type Resource,
  type ResourceChange,
  type ResourceReceipt,
} from '@rss/mdm-resources'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { CollectionPlan } from './CollectionMappingEditor'
import { usePendingSelection } from './SelectionGuard'
import type { Locale } from './i18n'

export type ResourcesUseCases = ReturnType<typeof createResources>
/** Resource has no operation-query endpoint. Preserve the exact request until explicit replay acknowledges it. */
export function useResourceCommand(resources: ResourcesUseCases) {
  const action = useAction(),
    [pending, setPending] = useState<{
      resource: string
      change: Operation<ResourceChange>
    } | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [result, setResult] = useState<Resource | ResourceReceipt | null>(null),
    [observed, setObserved] = useState<Resource | null>(null)
  usePendingSelection(action.busy || outcome === 'unknown')
  async function send(original: NonNullable<typeof pending>) {
    const response = await action.run(() => {
      validateInput(() => {
        resourceId(original.resource)
        validateChange(original.change.input, original.change.expectedRevision)
      })
      return resources.change(original.resource, original.change)
    })
    setOutcome((previous) =>
      response.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(response.error)
          ? 'unknown'
          : 'rejected',
    )
    if (response.ok) setResult(response.value)
  }
  return {
    action,
    pending,
    outcome,
    result,
    observed,
    async submit(resource: string, expectedRevision: number, input: ResourceChange) {
      if (pending || action.busy) return
      const original = freeze({
        resource,
        change: { operationId: crypto.randomUUID(), expectedRevision, input },
      })
      setPending(original)
      await send(original)
    },
    async submitPrepared(original: { resource: string; change: Operation<ResourceChange> }) {
      if (pending || action.busy) return
      const fixed = freeze(original)
      setPending(fixed)
      await send(fixed)
    },
    replay: () => (pending ? send(pending) : Promise.resolve()),
    async read() {
      if (!pending) return
      const response = await action.run(() => resources.read(pending.resource))
      if (response.ok) setObserved(response.value)
    },
    edit() {
      if (outcome !== 'rejected') return
      setPending(null)
      setOutcome('none')
      action.clear()
    },
  }
}
export function ResourceCommandState({
  command,
  canWrite,
  locale,
}: {
  command: ReturnType<typeof useResourceCommand>
  canWrite: boolean
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <>
      <Failure error={command.action.error} locale={locale} />
      {command.pending && (
        <p className="subtitle">
          {l('原操作', 'Original operation')} <code>{command.pending.change.operationId}</code> ·{' '}
          {l('基于已读取版本', 'Observed revision')} {command.pending.change.expectedRevision}
        </p>
      )}
      {command.outcome === 'confirmed' && (
        <Alert
          type="success"
          title={l(
            '资源操作回执已确认。内容交付、软件准入和设备效果分别确认。',
            'Resource operation acknowledged. Content delivery, software admission and device effects are confirmed separately.',
          )}
        />
      )}
      {command.outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '原请求结果未知。读取当前资源用于比较；只有原请求回执能确认本次提交。',
            'The original outcome is unknown. Read the current resource for comparison; only its original receipt confirms this submission.',
          )}
        />
      )}
      {command.pending && (
        <Space wrap>
          {command.outcome === 'unknown' && (
            <Button
              disabled={!canWrite || command.action.busy}
              onClick={() => void command.replay()}
            >
              {l('显式重提原资源请求', 'Resubmit original resource request')}
            </Button>
          )}
          <Button disabled={command.action.busy} onClick={() => void command.read()}>
            {l('读取原资源当前状态', 'Read current state of original resource')}
          </Button>
          {command.outcome === 'rejected' && (
            <Button disabled={command.action.busy} onClick={command.edit}>
              {l('返回编辑', 'Return to editing')}
            </Button>
          )}
        </Space>
      )}
      {command.observed && (
        <details>
          <summary>
            {l(
              '已读取的当前状态（不是原操作回执）',
              'Observed current state (not the original receipt)',
            )}
          </summary>
          <CollectionPlan value={command.observed} />
        </details>
      )}
    </>
  )
}
