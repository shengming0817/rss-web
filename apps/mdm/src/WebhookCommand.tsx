import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Descriptions, Space } from 'antd'
import { freeze, identifier, operation, uuid, type Operation } from '@rss/mdm-inventory'
import {
  validateSubscriptionChange,
  type Delivery,
  type RedriveReceipt,
  type ReplayReceipt,
  type Subscription,
  type SubscriptionChange,
  type TestReceipt,
  type Webhooks,
} from '@rss/mdm-webhooks'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { usePendingSelection } from './SelectionGuard'
import { DiagnosticReference } from './DiagnosticReference'

export type WebhookChange =
  | {
      readonly kind: 'subscription'
      readonly id: string
      readonly change: Operation<SubscriptionChange>
    }
  | {
      readonly kind: 'test'
      readonly id: string
      readonly operationId: string
      readonly device: string
    }
  | {
      readonly kind: 'replay'
      readonly operationId: string
      readonly source: Pick<Delivery, 'id' | 'eventId'>
    }
  | {
      readonly kind: 'redrive'
      readonly operationId: string
      readonly source: Pick<Delivery, 'id' | 'recoveryVersion'>
    }
export type WebhookResult =
  | { readonly kind: 'subscription'; readonly value: Subscription }
  | { readonly kind: 'test'; readonly value: TestReceipt }
  | { readonly kind: 'replay'; readonly value: ReplayReceipt }
  | { readonly kind: 'redrive'; readonly value: RedriveReceipt }
function validate(change: WebhookChange): void {
  if (change.kind === 'subscription') {
    uuid(change.id)
    validateSubscriptionChange(change.change)
  } else {
    uuid(change.operationId)
    if (change.kind === 'test') {
      uuid(change.id)
      identifier(change.device, 255)
    } else {
      uuid(change.source.id)
      if (change.kind === 'replay') uuid(change.source.eventId)
      else {
        operation({
          operationId: change.operationId,
          expectedRevision: change.source.recoveryVersion,
          input: null,
        })
        if (!change.source.recoveryVersion) throw new Error('Recovery version required')
      }
    }
  }
}
/** Explicit resubmission, when chosen, uses only the frozen request. */
export function useWebhookCommand(webhooks: Webhooks, permitted: boolean) {
  const action = useAction(),
    running = useRef(false),
    live = useRef(true),
    epoch = useRef(0),
    [pending, setPending] = useState<WebhookChange | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipt, setReceipt] = useState<WebhookResult | null>(null)
  usePendingSelection(action.busy || outcome === 'unknown')
  useEffect(() => {
    if (!permitted) {
      epoch.current++
      setReceipt(null)
    }
  }, [permitted])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  async function execute(original: WebhookChange) {
    if (running.current || !permitted) return
    running.current = true
    const generation = epoch.current
    setReceipt(null)
    try {
      const result = await action.run(async (): Promise<WebhookResult> => {
        validateInput(() => validate(original))
        setPending(original)
        switch (original.kind) {
          case 'subscription':
            return {
              kind: 'subscription',
              value: await webhooks.change(original.id, original.change),
            }
          case 'test':
            return {
              kind: 'test',
              value: await webhooks.test(original.id, original.operationId, original.device),
            }
          case 'replay':
            return {
              kind: 'replay',
              value: await webhooks.replay(original.source, original.operationId),
            }
          case 'redrive':
            return {
              kind: 'redrive',
              value: await webhooks.redrive(original.source, original.operationId),
            }
        }
      })
      if (!live.current) return
      setOutcome((previous) =>
        result.ok
          ? 'confirmed'
          : previous === 'unknown' || isUnknown(result.error)
            ? 'unknown'
            : 'rejected',
      )
      if (result.ok && generation === epoch.current) setReceipt(result.value)
      return result
    } finally {
      running.current = false
    }
  }
  return {
    action,
    pending,
    outcome,
    receipt,
    submit(change: WebhookChange) {
      if (!pending && !running.current) return execute(freeze(change))
      return Promise.resolve(undefined)
    },
    replay: () => (pending ? execute(pending) : Promise.resolve(undefined)),
    next() {
      if (running.current || outcome === 'unknown') return
      setPending(null)
      setReceipt(null)
      setOutcome('none')
      action.clear()
    },
  }
}
export function WebhookCommandState({
  command,
  permitted,
  locale,
}: {
  command: ReturnType<typeof useWebhookCommand>
  permitted: boolean
  locale: Locale
}) {
  const l = labels(locale),
    pending = command.pending,
    operationId =
      pending?.kind === 'subscription' ? pending.change.operationId : pending?.operationId
  return (
    <>
      <Failure error={command.action.error} locale={locale} />
      {pending && (
        <Descriptions column={1} size="small">
          <Descriptions.Item label={l('原操作', 'Original operation')}>
            {operationId && (
              <DiagnosticReference
                locale={locale}
                selection={{ mode: 'operation', address: { owner: 'webhook', operationId } }}
              />
            )}
          </Descriptions.Item>
          <Descriptions.Item label={l('原操作类别', 'Original operation kind')}>
            {pending.kind}
          </Descriptions.Item>
          {pending.kind === 'subscription' && (
            <Descriptions.Item label={l('原 CAS 版本', 'Original CAS revision')}>
              {pending.change.expectedRevision}
            </Descriptions.Item>
          )}
          {pending.kind === 'redrive' && (
            <Descriptions.Item label={l('原投递恢复版本', 'Original delivery recovery version')}>
              {pending.source.recoveryVersion}
            </Descriptions.Item>
          )}
        </Descriptions>
      )}
      {command.outcome === 'unknown' && (
        <Alert
          type="warning"
          title={l(
            '原写入结果未知。请先通过操作排障查询原回执。当前配置只供比较。',
            'The original write outcome is unknown. Read the original receipt in Operation diagnostics first. Current configuration is for comparison.',
          )}
        />
      )}
      {command.outcome === 'confirmed' && (
        <Alert
          type="success"
          title={l(
            '原业务回执已确认；投递接收、下游业务完成和设备效果分别核对。',
            'The original business receipt is acknowledged. Delivery acceptance, downstream completion and device effects remain separate facts.',
          )}
        />
      )}
      {permitted && command.receipt && (
        <Descriptions column={1} size="small">
          <Descriptions.Item
            label={
              command.receipt.kind === 'subscription'
                ? l('订阅', 'Subscription')
                : l('投递', 'Delivery')
            }
          >
            {command.receipt.value.id}
          </Descriptions.Item>
          {command.receipt.kind === 'subscription' && (
            <>
              <Descriptions.Item label={l('回执配置版本', 'Receipt configuration revision')}>
                {command.receipt.value.revision}
              </Descriptions.Item>
              <Descriptions.Item label={l('回执目标版本', 'Receipt target version')}>
                {command.receipt.value.targetVersion}
              </Descriptions.Item>
            </>
          )}
          {(command.receipt.kind === 'test' || command.receipt.kind === 'replay') && (
            <Descriptions.Item
              label={l('事件 ID（不含原 payload）', 'Event ID (without raw payload)')}
            >
              {command.receipt.value.eventId}
            </Descriptions.Item>
          )}
          {command.receipt.kind === 'test' && (
            <Descriptions.Item label={l('受理事实', 'Admission fact')}>
              {l(
                '已持久排队，尚不代表外部接收',
                'Durably queued; external acceptance is not implied',
              )}
            </Descriptions.Item>
          )}
          {command.receipt.kind === 'replay' && (
            <Descriptions.Item label={l('原投递', 'Source delivery')}>
              {command.receipt.value.sourceDelivery}
            </Descriptions.Item>
          )}
          {command.receipt.kind === 'redrive' && (
            <Descriptions.Item label={l('原投递恢复回执', 'Original delivery recovery receipt')}>
              {command.receipt.value.status} · {command.receipt.value.recoveryVersion}
            </Descriptions.Item>
          )}
        </Descriptions>
      )}
      <Space wrap>
        {pending &&
          (command.outcome === 'unknown' ||
            (command.outcome === 'confirmed' && !command.receipt)) && (
            <Button
              disabled={!permitted || command.action.busy}
              onClick={() => void command.replay()}
            >
              {l('显式重提原 Webhook 请求', 'Resubmit original Webhook request')}
            </Button>
          )}
        {pending && command.outcome !== 'unknown' && (
          <Button disabled={command.action.busy} onClick={command.next}>
            {l('开始新的操作', 'Start a new operation')}
          </Button>
        )}
      </Space>
    </>
  )
}
