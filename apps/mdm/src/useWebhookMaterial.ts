import type {
  MaterialOutcome,
  PendingMaterial,
  WebhookMaterialRecovery,
} from './webhook-material-recovery'
import { useEffect, useRef, useState } from 'react'
import { freeze, uuid } from '@rss/mdm-inventory'
import {
  materialIntent,
  matchMaterialOperation,
  validateMaterialTransition,
  type MaterialInput,
  type MaterialOperation,
  type MaterialTransition,
  type Webhooks,
} from '@rss/mdm-webhooks'
import { isUnknown, useAction, validateInput } from './AdminUi'
import { inputFingerprint, useProtectedDelivery } from './useProtectedDelivery'
import { usePendingSelection } from './SelectionGuard'

/** This owner retains only public intent and an ephemeral imported-input comparison. */
export function useWebhookMaterial(
  webhooks: Webhooks,
  canRead: boolean,
  canWrite: boolean,
  clearInputs: () => void,
  recovery?: { owner: WebhookMaterialRecovery; binding: string },
) {
  const action = useAction(),
    running = useRef(false),
    live = useRef(true),
    delivery = useProtectedDelivery(clearInputs, canWrite),
    authority = useRef({ canRead, canWrite }),
    epoch = useRef(0),
    [pending, setPending] = useState<PendingMaterial | null>(null),
    [receipt, setReceipt] = useState<MaterialOperation | null>(null),
    [observed, setObserved] = useState<MaterialOperation | null>(null),
    [outcome, setOutcome] = useState<MaterialOutcome>('none'),
    [restoring, setRestoring] = useState(() => !!recovery?.owner.available(recovery.binding)),
    [restored, setRestored] = useState(false)
  authority.current = { canRead, canWrite }
  useEffect(() => {
    if (!recovery) return
    let current = true
    void recovery.owner
      .take(recovery.binding, (value) => {
        if (!current) return false
        setPending(value.pending)
        setOutcome(value.outcome)
        setRestored(true)
        return true
      })
      .then(() => {
        if (current) setRestoring(false)
      })
    return () => {
      current = false
    }
  }, [])
  usePendingSelection(restoring || action.busy || outcome === 'unknown')
  useEffect(() => {
    epoch.current++
    setReceipt(null)
    setObserved(null)
  }, [canRead, canWrite])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  async function execute(original: PendingMaterial, secret: string) {
    if (!authority.current.canWrite || running.current) return
    running.current = true
    setObserved(null)
    const captured = delivery.capture(),
      generation = epoch.current
    try {
      const result = await action.run(async () => {
        if (original.kind === 'prepare') {
          if (original.input.source === 'import') {
            const fingerprint = await inputFingerprint(secret)
            validateInput(() => {
              if (original.fingerprint !== fingerprint)
                throw new Error('Original imported secret required')
            })
          }
          if (!delivery.isCurrent(captured) || !authority.current.canWrite)
            throw { cause: 'client', code: 'invalid_input' }
          return webhooks.prepare(original.operationId, {
            ...original.input,
            source:
              original.input.source === 'generate'
                ? { kind: 'generate' }
                : { kind: 'import', secret },
          })
        }
        return webhooks.transition(original.operationId, original.input)
      })
      if (!live.current) return
      setOutcome((previous) =>
        result.ok
          ? 'confirmed'
          : previous === 'unknown' || isUnknown(result.error)
            ? 'unknown'
            : 'rejected',
      )
      if (result.ok && generation === epoch.current && authority.current.canWrite)
        setReceipt(result.value)
      return result
    } finally {
      running.current = false
    }
  }
  return {
    action,
    restoring,
    restored,
    pending,
    receipt,
    observed,
    outcome,
    async prepare(operationId: string, input: MaterialInput) {
      if (restoring || pending || running.current || !canWrite) return
      const captured = delivery.capture()
      const result = await action.run(async () => {
        validateInput(() => {
          uuid(operationId)
          materialIntent(input)
        })
        const original: PendingMaterial = freeze({
          kind: 'prepare',
          operationId,
          input: materialIntent(input),
          fingerprint:
            input.source.kind === 'import' ? await inputFingerprint(input.source.secret) : null,
        })
        if (!delivery.isCurrent(captured) || !authority.current.canWrite)
          throw { cause: 'client', code: 'invalid_input' }
        setPending(original)
        return original
      })
      if (result.ok)
        return execute(result.value, input.source.kind === 'import' ? input.source.secret : '')
    },
    async transition(operationId: string, input: MaterialTransition) {
      if (restoring || pending || running.current || !canWrite) return
      const result = await action.run(async () => {
        validateInput(() => {
          uuid(operationId)
          validateMaterialTransition(input)
        })
        const original = freeze({ kind: 'transition' as const, operationId, input })
        setPending(original)
        return original
      })
      if (result.ok) return execute(result.value, '')
    },
    replay: (secret: string) => (pending ? execute(pending, secret) : Promise.resolve(undefined)),
    async lookup() {
      if (!pending || running.current || !authority.current.canRead) return
      running.current = true
      setObserved(null)
      const original = pending,
        generation = epoch.current
      try {
        const result = await action.run(async () => {
          const value = await webhooks.materialOperation(original.operationId)
          matchMaterialOperation(original.operationId, original.input, value)
          return value
        })
        if (!live.current) return
        // GET does not echo the action/source or full input fingerprint. Only the
        // explicit original POST can confirm that this frozen request was accepted.
        if (result.ok && generation === epoch.current && authority.current.canRead)
          setObserved(result.value)
        return result
      } finally {
        running.current = false
      }
    },
    next() {
      if (running.current || action.busy || outcome === 'unknown') return
      setPending(null)
      setReceipt(null)
      setObserved(null)
      setOutcome('none')
      setRestored(false)
      action.clear()
    },
  }
}
