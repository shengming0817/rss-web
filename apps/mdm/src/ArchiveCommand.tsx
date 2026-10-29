import { useState } from 'react'
import { Button, Card, Space } from 'antd'
import { freeze } from '@rss/mdm-inventory'
import type {
  CertificateArchive,
  GenerateIntent,
  ImportIntent,
  ImportMaterial,
  ManageIntent,
  MetadataIntent,
  OriginalOperation,
  Receipt,
  SettingsIntent,
} from '@rss/mdm-certificates/archive'
import {
  validateGeneration,
  validateImport,
  validateMetadata,
  validateOriginal,
  validatePassword,
  validateSettings,
} from '@rss/mdm-certificates/archive'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, useAction, validateInput } from './AdminUi'
import { Status } from './DevicePresentation'
import { usePendingSelection } from './SelectionGuard'
export type ArchiveChange =
  | { readonly kind: 'generate'; readonly input: GenerateIntent }
  | { readonly kind: 'import'; readonly input: ImportIntent; readonly fingerprint: string }
  | { readonly kind: 'metadata'; readonly input: MetadataIntent }
  | { readonly kind: 'manage'; readonly input: ManageIntent }
  | { readonly kind: 'settings'; readonly input: SettingsIntent }
  | {
      readonly kind: 'initialize' | 'password_change'
      readonly operationId: string
      readonly fingerprint: string
    }
export type ArchiveSecrets =
  | {
      readonly kind: 'import'
      readonly materials: readonly ImportMaterial[]
      readonly fingerprint: string
    }
  | { readonly kind: 'initialize'; readonly password: string; readonly fingerprint: string }
  | {
      readonly kind: 'password_change'
      readonly oldPassword: string
      readonly newPassword: string
      readonly fingerprint: string
    }
function original(change: ArchiveChange): OriginalOperation {
  if (!('input' in change))
    return {
      operationId: change.operationId,
      action: change.kind,
      entryId: null,
      version: null,
      expectedRevision: null,
    }
  const { operationId, expectedRevision } = change.input
  return {
    operationId,
    action: change.kind,
    entryId: 'entryId' in change.input ? change.input.entryId : null,
    version: ['generate', 'import', 'metadata'].includes(change.kind) ? expectedRevision + 1 : null,
    expectedRevision,
  }
}
/** Archive requests only. Secrets are borrowed by one submission and never held by pending state. */
export function useArchiveCommand(archive: CertificateArchive) {
  const action = useAction(),
    [pending, setPending] = useState<ArchiveChange | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none'),
    [receipt, setReceipt] = useState<Receipt | null>(null)
  usePendingSelection(!!pending)
  async function submit(change: ArchiveChange, secret?: ArchiveSecrets) {
    const selected = pending ?? freeze(change)
    const result = await action.run(async () => {
      if (pending && JSON.stringify(change) !== JSON.stringify(pending))
        throw { cause: 'client', code: 'invalid_input' }
      if (
        'fingerprint' in selected &&
        (!secret || secret.kind !== selected.kind || secret.fingerprint !== selected.fingerprint)
      )
        throw { cause: 'client', code: 'invalid_input' }
      if (!('fingerprint' in selected) && secret) throw { cause: 'client', code: 'invalid_input' }
      validateInput(() => {
        validateOriginal(original(selected))
        switch (selected.kind) {
          case 'generate':
            validateGeneration(selected.input)
            break
          case 'import':
            if (secret?.kind !== 'import') throw new Error('Import material required')
            validateImport(selected.input, secret.materials)
            break
          case 'metadata':
            validateMetadata(selected.input.metadata)
            if (!selected.input.expectedRevision) throw new Error('Detail revision required')
            break
          case 'manage':
            if (
              !selected.input.expectedRevision ||
              typeof selected.input.retired !== 'boolean' ||
              (selected.input.recommendedVersion !== null &&
                (!Number.isSafeInteger(selected.input.recommendedVersion) ||
                  selected.input.recommendedVersion < 1))
            )
              throw new Error('Invalid entry management')
            break
          case 'settings':
            validateSettings(selected.input.value)
            break
          case 'initialize':
            if (secret?.kind !== 'initialize') throw new Error('Password required')
            validatePassword(secret.password)
            break
          case 'password_change':
            if (secret?.kind !== 'password_change') throw new Error('Passwords required')
            validatePassword(secret.oldPassword, false)
            validatePassword(secret.newPassword)
            break
        }
      })
      setPending(selected)
      switch (selected.kind) {
        case 'generate':
          return archive.generate(selected.input)
        case 'metadata':
          return archive.metadata(selected.input)
        case 'manage':
          return archive.manage(selected.input)
        case 'settings':
          return archive.saveSettings(selected.input)
        case 'import':
          if (secret?.kind !== 'import') throw { cause: 'client', code: 'invalid_input' }
          return archive.import(selected.input, secret.materials)
        case 'initialize':
          if (secret?.kind !== 'initialize') throw { cause: 'client', code: 'invalid_input' }
          return archive.initialize(selected.operationId, secret.password)
        case 'password_change':
          if (secret?.kind !== 'password_change') throw { cause: 'client', code: 'invalid_input' }
          return archive.changePassword(
            selected.operationId,
            secret.oldPassword,
            secret.newPassword,
          )
      }
    })
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
    if (result.ok) setReceipt(result.value)
    return result
  }
  async function lookup() {
    if (!pending) return
    const result = await action.run(() => archive.operation(original(pending)))
    if (result.ok) {
      setReceipt(result.value)
      setOutcome('confirmed')
    }
  }
  return {
    ...action,
    pending,
    outcome,
    receipt,
    submit,
    lookup,
    original: pending ? original(pending) : null,
    release() {
      if (action.busy || outcome === 'unknown') return
      setPending(null)
      setOutcome('none')
      setReceipt(null)
      action.clear()
    },
  }
}
export function ArchiveCommandState({
  command,
  locale,
  canRead,
  canWrite,
  onResolved,
}: {
  command: ReturnType<typeof useArchiveCommand>
  locale: Locale
  canRead: boolean
  canWrite: boolean
  onResolved?: () => void
}) {
  const l = labels(locale),
    pending = command.pending
  return (
    <>
      <Failure error={command.error} locale={locale} />
      {pending && (
        <Card size="small" title={l('本次档案操作', 'Current archive operation')}>
          <p className="mono">{command.original?.operationId}</p>
          <p>
            {l('操作结果', 'Operation result')} · <Status value={command.outcome} locale={locale} />
          </p>
          {command.receipt && (
            <p>
              {command.receipt.action} · {l('条目', 'Entry')} {command.receipt.entryId ?? '—'} ·{' '}
              {l('材料版本 / 条目版本', 'Material version / entry revision')}{' '}
              {command.receipt.version ?? '—'} / {command.receipt.revision}
            </p>
          )}
          <p className="subtitle">
            {'fingerprint' in pending
              ? l(
                  '秘密与文件已从表单清除。重提需要重新输入完全相同的密码或重新选择原文件；不会自动重放。',
                  'Secrets and files have been cleared from the form. Resubmission requires the same passwords or original files; writes are never replayed automatically.',
                )
              : l(
                  '原请求与版本已保留。发生冲突或结果未知时，先读取原回执，再显式处理。',
                  'The original request and revision are retained. On conflict or unknown results, read its receipt before explicitly continuing.',
                )}
          </p>
          <Space wrap>
            <Button disabled={!canRead || command.busy} onClick={() => void command.lookup()}>
              {l('读取原操作回执', 'Read original operation receipt')}
            </Button>
            {!('fingerprint' in pending) && (
              <Button
                disabled={!canWrite || command.busy}
                onClick={() => void command.submit(pending)}
              >
                {l('显式重提原请求', 'Explicitly resubmit original request')}
              </Button>
            )}
            {command.outcome !== 'unknown' && (
              <Button
                disabled={command.busy}
                onClick={() => {
                  command.release()
                  onResolved?.()
                }}
              >
                {l('结束本次操作并读取当前状态', 'Finish this operation and read current state')}
              </Button>
            )}
          </Space>
        </Card>
      )}
    </>
  )
}
