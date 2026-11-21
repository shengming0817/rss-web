import { useState } from 'react'
import { Alert, Button, Drawer, Form, Input, Space } from 'antd'
import type { OperationDiagnostics } from '@rss/mdm-audit'
import {
  freeze,
  validateRetentionPolicy,
  validateRetentionReference,
  type Operation,
  type RetentionPolicy,
  type RetentionReference,
} from '@rss/mdm-inventory'
import {
  codeOf,
  Failure,
  isUnknown,
  labels,
  ReadState,
  useAction,
  useRead,
  validateInput,
} from './AdminUi'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'

export interface RetentionPolicyTarget {
  reference?: RetentionReference | undefined
  apply?: (reference: RetentionReference) => void
}

type DurationName = 'rawSeconds' | 'summarySeconds' | 'restoreSeconds'
interface Publication {
  key: string
  base: RetentionPolicy | null
  edits: Partial<Record<DurationName, string>>
  conflicted: boolean
}
type PendingPublication = {
  change: Operation<RetentionPolicy>
  draft: Publication
  canResubmit: boolean
}
interface Workspace {
  target: RetentionPolicyTarget | null
  key: string
  revision: string
  lookup: RetentionReference | null
  verifiedReceipt: RetentionPolicy | null
  confirmed: boolean
  draft: Publication | null
}

const emptyPublication: Publication = { key: '', base: null, edits: {}, conflicted: false }

function durationText(draft: Publication, name: DurationName): string {
  return draft.edits[name] ?? (draft.base ? String(draft.base[name]) : '')
}
function decimalInteger(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN
}

function workspace(target: RetentionPolicyTarget | null): Workspace {
  return {
    target,
    key: target?.reference?.key ?? '',
    revision: target?.reference?.revision.toString() ?? '',
    lookup: null,
    verifiedReceipt: null,
    confirmed: false,
    draft: null,
  }
}

export function RetentionPolicies({
  canWrite,
  target,
  onClose,
  inventory,
  diagnostics,
  locale,
}: {
  canWrite: boolean
  target: RetentionPolicyTarget | null
  onClose: () => void
  inventory: InventoryUseCases
  diagnostics: OperationDiagnostics
  locale: Locale
}) {
  const l = labels(locale),
    action = useAction(),
    [editing, setEditing] = useState(() => workspace(null)),
    [pending, setPending] = useState<PendingPublication | null>(null),
    open = canWrite && target !== null,
    current = editing.target === target ? editing : workspace(target),
    lookup = open ? current.lookup : null,
    read = useRead(lookup ? 'retention-policy' : 'idle-retention-policy', async (signal) => {
      if (!lookup) return null
      validateInput(() => validateRetentionReference(lookup))
      return inventory.retentionPolicy(lookup, signal)
    }),
    verified = lookup ? read.value : current.verifiedReceipt,
    draft = current.draft,
    previousRevision = draft?.base?.revision ?? 0

  function changeLookup(key: string, revision: string) {
    setEditing({ ...current, key, revision, lookup: null, verifiedReceipt: null, confirmed: false })
  }
  function finish(reference: RetentionReference, policy: RetentionPolicy | null) {
    setPending(null)
    setEditing({
      ...workspace(target),
      key: reference.key,
      revision: String(reference.revision),
      verifiedReceipt: policy,
      confirmed: true,
    })
  }
  function publish(original?: PendingPublication) {
    const publication = original?.draft ?? draft
    if (
      !open ||
      !publication ||
      (original ? !original.canResubmit : pending || publication.conflicted)
    )
      return
    void action.run(async () => {
      const expectedRevision = publication.base?.revision ?? 0
      let change = original?.change
      if (!change) {
        const input = {
          key: publication.key,
          revision: expectedRevision + 1,
          rawSeconds: decimalInteger(durationText(publication, 'rawSeconds')),
          summarySeconds: decimalInteger(durationText(publication, 'summarySeconds')),
          restoreSeconds: decimalInteger(durationText(publication, 'restoreSeconds')),
        }
        validateInput(() => validateRetentionPolicy(input))
        change = freeze({ operationId: crypto.randomUUID(), expectedRevision, input })
      }
      try {
        const policy = await inventory.publishRetentionPolicy(change)
        finish(policy, policy)
      } catch (error) {
        if (codeOf(error) === 'operation_conflict') {
          // A definitive conflict from the same operation passed the server's original receipt check.
          setPending(null)
          setEditing({ ...current, draft: { ...publication, conflicted: true } })
        } else if (original || isUnknown(error)) {
          setPending({ change, draft: publication, canResubmit: false })
        }
        throw error
      }
    })
  }
  function readReceipt() {
    if (!open || !pending) return
    void action.run(async () => {
      const { change } = pending
      setPending({ ...pending, canResubmit: false })
      const result = await diagnostics.operation({
        owner: 'asset',
        operationId: change.operationId,
      })
      const receipt = result.originalResult
      if (receipt.availability === 'not_found') {
        setPending({ ...pending, canResubmit: true })
        return
      }
      if (
        receipt.availability !== 'available' ||
        receipt.value.operationId !== change.operationId ||
        receipt.value.revision !== change.input.revision
      )
        throw { cause: 'client', code: 'receipt_unavailable' }
      finish(change.input, null)
    })
  }

  return (
    <Drawer
      getContainer={false}
      title={l('遥测保留策略', 'Telemetry retention policies')}
      open={open}
      onClose={() => {
        if (!action.busy) {
          action.clear()
          onClose()
        }
      }}
      size="large"
    >
      <Form
        layout="vertical"
        disabled={action.busy}
        onFinish={() => {
          if (!open || action.busy) return
          setEditing({
            ...current,
            lookup: {
              key: current.key,
              revision: decimalInteger(current.revision),
            },
            verifiedReceipt: null,
          })
          read.reload()
        }}
      >
        <div className="admin-form-grid">
          <Form.Item label={l('查询策略键', 'Policy key to look up')}>
            <Input
              aria-label={l('查询策略键', 'Policy key to look up')}
              value={current.key}
              maxLength={64}
              onChange={(event) => changeLookup(event.target.value, current.revision)}
            />
          </Form.Item>
          <Form.Item label={l('查询策略版本', 'Policy revision to look up')}>
            <Input
              aria-label={l('查询策略版本', 'Policy revision to look up')}
              inputMode="numeric"
              value={current.revision}
              onChange={(event) => changeLookup(current.key, event.target.value)}
            />
          </Form.Item>
        </div>
        <Button htmlType="submit" disabled={action.busy || !current.key || !current.revision}>
          {l('读取精确保留策略', 'Read exact retention policy')}
        </Button>
      </Form>

      {lookup && <ReadState locale={locale} busy={read.busy} error={read.error} />}
      {lookup && read.value === null && (
        <Alert
          type="info"
          title={l('该策略版本不存在。', 'This policy revision does not exist.')}
        />
      )}
      {current.confirmed && (
        <Alert type="success" title={l('策略发布已确认。', 'Policy publication confirmed.')} />
      )}
      {verified && (
        <div className="admin-subsection">
          <p>
            <code>{verified.key}</code> · {l('版本', 'Revision')} {verified.revision}
          </p>
          <dl className="device-values">
            <div>
              <dt>{l('原始数据保留（秒）', 'Raw retention (seconds)')}</dt>
              <dd>{verified.rawSeconds}</dd>
            </div>
            <div>
              <dt>{l('汇总保留（秒）', 'Summary retention (seconds)')}</dt>
              <dd>{verified.summarySeconds}</dd>
            </div>
            <div>
              <dt>{l('删除恢复（秒）', 'Deletion recovery (seconds)')}</dt>
              <dd>{verified.restoreSeconds}</dd>
            </div>
          </dl>
          <Space wrap>
            {target?.apply && (
              <Button
                type="primary"
                disabled={action.busy}
                onClick={() => {
                  if (!open || action.busy || !target.apply) return
                  const { key, revision } = verified
                  target.apply({ key, revision })
                  action.clear()
                  onClose()
                }}
              >
                {l('应用到字段草稿', 'Apply to field draft')}
              </Button>
            )}
            <Button
              disabled={
                action.busy ||
                pending !== null ||
                verified.revision === Number.MAX_SAFE_INTEGER ||
                (draft?.conflicted === true &&
                  draft.key === verified.key &&
                  verified.revision <= previousRevision)
              }
              onClick={() => {
                action.clear()
                setEditing({
                  ...current,
                  draft: {
                    key: verified.key,
                    base: verified,
                    edits: draft?.conflicted && draft.key === verified.key ? draft.edits : {},
                    conflicted: false,
                  },
                })
              }}
            >
              {l('基于此版本起草新版', 'Draft next revision from this version')}
            </Button>
          </Space>
        </div>
      )}
      <div className="admin-subsection">
        <Button
          disabled={action.busy || pending !== null}
          onClick={() => {
            action.clear()
            setEditing({ ...current, draft: emptyPublication })
          }}
        >
          {l('起草首版保留策略', 'Draft first retention policy revision')}
        </Button>
        {draft && (
          <Form
            layout="vertical"
            disabled={action.busy || pending !== null}
            onFinish={() => publish()}
          >
            {draft.base === null ? (
              <Form.Item label={l('新策略键', 'New policy key')}>
                <Input
                  aria-label={l('新策略键', 'New policy key')}
                  value={draft.key}
                  maxLength={64}
                  onChange={(event) =>
                    setEditing({ ...current, draft: { ...draft, key: event.target.value } })
                  }
                />
              </Form.Item>
            ) : (
              <p>
                <code>{draft.key}</code> · {l('前一版本', 'Previous revision')} {previousRevision}
              </p>
            )}
            <p>
              {l('待发布版本', 'Revision to publish')} {previousRevision + 1}
            </p>
            <div className="admin-form-grid">
              {(
                [
                  ['rawSeconds', l('原始数据时长（秒）', 'Raw duration (seconds)')],
                  ['summarySeconds', l('汇总时长（秒）', 'Summary duration (seconds)')],
                  [
                    'restoreSeconds',
                    l('删除恢复时长（秒）', 'Deletion recovery duration (seconds)'),
                  ],
                ] as const
              ).map(([name, label]) => (
                <Form.Item key={name} label={label}>
                  <Input
                    aria-label={label}
                    inputMode="numeric"
                    value={durationText(draft, name)}
                    onChange={(event) => {
                      const value = event.target.value
                      const edits = { ...draft.edits }
                      if (value === (draft.base ? String(draft.base[name]) : '')) delete edits[name]
                      else edits[name] = value
                      setEditing({ ...current, draft: { ...draft, edits } })
                    }}
                  />
                </Form.Item>
              ))}
            </div>
            <p>
              {l(
                '原始数据时长须大于零，汇总时长至少等于原始数据时长，删除恢复时长最多等于原始数据时长。',
                'Raw duration must be positive. Summary duration must be at least as long, and deletion recovery duration may be at most as long.',
              )}
            </p>
            <Button
              type="primary"
              htmlType="submit"
              disabled={action.busy || pending !== null || draft.conflicted}
            >
              {l('发布保留策略', 'Publish retention policy')}
            </Button>
          </Form>
        )}
        <Failure locale={locale} error={action.error} />
        {pending && (
          <div className="admin-recovery">
            <Alert
              type="warning"
              title={l('原发布结果待确认。', 'Original publication outcome is unconfirmed.')}
              description={<code>{pending.change.operationId}</code>}
            />
            <Space wrap>
              <Button disabled={action.busy} onClick={readReceipt}>
                {l('读取原发布回执', 'Read original publication receipt')}
              </Button>
              {pending.canResubmit && (
                <Button disabled={action.busy} onClick={() => publish(pending)}>
                  {l('显式重提原发布请求', 'Resubmit original publication request')}
                </Button>
              )}
            </Space>
          </div>
        )}
      </div>
    </Drawer>
  )
}
