import { useState } from 'react'
import { Alert, Button, Space, Tag } from 'antd'
import { freeze, type Operation } from '@rss/mdm-inventory'
import type { createSoftware, Lifecycle } from '@rss/mdm-software'
import type { createPublications } from '@rss/mdm-software/publications'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { CollectionPlan } from './CollectionMappingEditor'
import { usePendingSelection } from './SelectionGuard'
import type { Locale } from './i18n'

export type SoftwareUseCases = ReturnType<typeof createSoftware>
export type PublicationsUseCases = ReturnType<typeof createPublications>
export interface SoftwareRequest<C, I> {
  readonly target: C
  readonly change: Operation<I>
}
/** Local operation ownership; each domain use case retains its own admission and receipt rules. */
export function useSoftwareMutation<C, I, R>(
  write: (request: SoftwareRequest<C, I>) => Promise<R>,
  validate: (request: SoftwareRequest<C, I>) => void,
) {
  const action = useAction(),
    [pending, setPending] = useState<SoftwareRequest<C, I> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [result, setResult] = useState<R | null>(null)
  usePendingSelection(action.busy || outcome === 'unknown')
  async function send(original: SoftwareRequest<C, I>) {
    const response = await action.run(async () => {
      validateInput(() => validate(original))
      const fixed = freeze(original)
      setPending(fixed)
      return write(fixed)
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
    async submit(target: C, expectedRevision: number, input: I) {
      if (pending || action.busy) return
      await send({ target, change: { operationId: crypto.randomUUID(), expectedRevision, input } })
    },
    replay: () => (pending ? send(pending) : Promise.resolve()),
    clear() {
      if (outcome !== 'confirmed' && outcome !== 'rejected') return
      setPending(null)
      setResult(null)
      setOutcome('none')
      action.clear()
    },
  }
}
export function SoftwareMutationState<C, I, R>({
  mutation,
  locale,
  canReplay,
  confirmedText,
  lookup,
  lookupLabel,
  done,
  blocked = false,
}: {
  mutation: ReturnType<typeof useSoftwareMutation<C, I, R>>
  locale: Locale
  canReplay: boolean
  confirmedText: string
  lookup?: (request: SoftwareRequest<C, I>) => Promise<unknown>
  lookupLabel?: string
  done?: (request: SoftwareRequest<C, I>) => void
  blocked?: boolean
}) {
  const l = labels(locale),
    [observed, setObserved] = useState<{ operation: string; value: unknown } | null>(null)
  return (
    <>
      <Failure locale={locale} error={mutation.action.error} />
      {mutation.pending && (
        <p className="subtitle">
          {l('原操作', 'Original operation')} <code>{mutation.pending.change.operationId}</code> ·{' '}
          {l('已读取版本', 'Observed revision')} {mutation.pending.change.expectedRevision}
        </p>
      )}
      {mutation.outcome === 'confirmed' && <Alert type="success" title={confirmedText} />}
      {mutation.outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '原请求结果未知。读取相关记录仅作观察；显式重提同一原请求以确认回执。',
            'The original outcome is unknown. Related records provide an observation; explicitly resubmit the same original request to confirm its acknowledgement.',
          )}
        />
      )}
      {mutation.pending && (
        <Space wrap>
          {mutation.outcome === 'unknown' && (
            <Button
              disabled={!canReplay || mutation.action.busy}
              onClick={() => void mutation.replay()}
            >
              {l('显式重提原软件请求', 'Resubmit original software request')}
            </Button>
          )}
          {lookup && (
            <Button
              disabled={mutation.action.busy}
              onClick={() => {
                const original = mutation.pending!
                void mutation.action
                  .run(() => lookup(original))
                  .then((response) => {
                    if (response.ok)
                      setObserved({ operation: original.change.operationId, value: response.value })
                  })
              }}
            >
              {lookupLabel ?? l('读取原操作相关记录', 'Read records for the original operation')}
            </Button>
          )}
          {(mutation.outcome === 'confirmed' || mutation.outcome === 'rejected') && (
            <Button
              disabled={mutation.action.busy || blocked}
              onClick={() => {
                const original = mutation.pending!
                mutation.clear()
                done?.(original)
              }}
            >
              {l('结束此操作并重新编辑或读取', 'Finish this operation and edit or read again')}
            </Button>
          )}
        </Space>
      )}
      {observed && observed.operation === mutation.pending?.change.operationId && (
        <details>
          <summary>
            {l(
              '相关记录观察（不是原提交回执）',
              'Observed related records (not the original acknowledgement)',
            )}
          </summary>
          <CollectionPlan value={observed.value} />
        </details>
      )}
    </>
  )
}
export function LifecycleFacts({
  value,
  locale,
  title,
}: {
  value: Lifecycle | null
  locale: Locale
  title: string
}) {
  const l = labels(locale)
  return (
    <div className="software-lifecycle">
      <h3>{title}</h3>
      {value ? (
        <>
          <Tag>{value.state}</Tag>
          <dl className="device-facts">
            <div>
              <dt>{l('生命周期版本', 'Lifecycle revision')}</dt>
              <dd>{value.revision}</dd>
            </div>
            <div>
              <dt>{l('原操作', 'Original operation')}</dt>
              <dd>
                <code>{value.operation}</code>
              </dd>
            </div>
            <div>
              <dt>{l('操作者', 'Actor')}</dt>
              <dd>{value.actor}</dd>
            </div>
            <div>
              <dt>{l('更新时间（UTC）', 'Updated at (UTC)')}</dt>
              <dd>
                {new Date(value.at * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                  timeZone: 'UTC',
                })}
              </dd>
            </div>
            <div>
              <dt>{l('生命周期摘要', 'Lifecycle digest')}</dt>
              <dd>
                <code>
                  {value.digest.map((byte) => byte.toString(16).padStart(2, '0')).join('')}
                </code>
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p>{l('尚未准入', 'Not admitted yet')}</p>
      )}
    </div>
  )
}
