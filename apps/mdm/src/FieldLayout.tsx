import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import {
  freeze,
  validateLayout,
  type DisplayGroup,
  type FieldLayout as Layout,
  type Operation,
} from '@rss/mdm-inventory'
import type { InventoryUseCases } from './FieldEditor'
import type { Locale } from './i18n'
import { Failure, isUnknown, labels, ReadState, useAction, useRead } from './AdminUi'
import { SelectionGuard, usePendingSelection, useSelectionGuard } from './SelectionGuard'
import { StringItems } from './ValueTypeEditor'

function LayoutEditor({
  inventory,
  locale,
  baseline,
  canWrite,
  done,
}: {
  inventory: InventoryUseCases
  locale: Locale
  baseline: Layout
  canWrite: boolean
  done: () => void
}) {
  const l = labels(locale),
    action = useAction(),
    [groups, setGroups] = useState(baseline.groups),
    [invalid, setInvalid] = useState(false),
    [pending, setPending] = useState<Operation<{
      readonly groups: readonly DisplayGroup[]
    }> | null>(null),
    [outcome, setOutcome] = useState<'none' | 'confirmed' | 'unknown' | 'rejected'>('none')
  usePendingSelection(
    action.busy || (pending !== null && !['confirmed', 'rejected'].includes(outcome)),
  )
  async function submit(change: NonNullable<typeof pending>) {
    const result = await action.run(() => inventory.putLayout(change))
    setOutcome((previous) =>
      result.ok
        ? 'confirmed'
        : previous === 'unknown' || isUnknown(result.error)
          ? 'unknown'
          : 'rejected',
    )
  }
  return (
    <>
      <Failure locale={locale} error={action.error} />
      {invalid && (
        <Alert
          type="error"
          title={l(
            '分组名称需为 1–40 个字符，每组至少包含一个不同的 custom.* 字段。',
            'Group names need 1–40 characters and each group needs distinct custom.* fields.',
          )}
        />
      )}
      <Form
        layout="vertical"
        disabled={!canWrite || !baseline.editable || action.busy || pending !== null}
        onFinish={() => {
          try {
            validateLayout(groups)
            const change = freeze({
              operationId: crypto.randomUUID(),
              expectedRevision: baseline.revision,
              input: { groups },
            })
            setInvalid(false)
            setPending(change)
            void submit(change)
          } catch {
            setInvalid(true)
          }
        }}
      >
        <p className="subtitle">
          {l('已读取布局版本', 'Observed layout revision')} · {baseline.revision}
        </p>
        {groups.map((group, index) => (
          <fieldset key={group.id} className="asset-editor-section">
            <legend>
              {l('展示分组', 'Display group')} {index + 1}
            </legend>
            <Form.Item label={l('分组名称', 'Group name')}>
              <Input
                aria-label={`${l('分组名称', 'Group name')} ${index + 1}`}
                value={group.name}
                onChange={(e) =>
                  setGroups(
                    groups.map((g, i) => (i === index ? { ...g, name: e.target.value } : g)),
                  )
                }
              />
            </Form.Item>
            <StringItems
              locale={locale}
              label={l('自定义字段顺序', 'Custom field order')}
              value={group.fields}
              onChange={(fields) =>
                setGroups(groups.map((g, i) => (i === index ? { ...g, fields } : g)))
              }
            />
            <Space wrap>
              <Button
                disabled={index === 0}
                onClick={() => {
                  const next = [...groups]
                  ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                  setGroups(next)
                }}
              >
                {l('分组上移', 'Move group up')}
              </Button>
              <Button
                disabled={index === groups.length - 1}
                onClick={() => {
                  const next = [...groups]
                  ;[next[index + 1], next[index]] = [next[index]!, next[index + 1]!]
                  setGroups(next)
                }}
              >
                {l('分组下移', 'Move group down')}
              </Button>
              <Button onClick={() => setGroups(groups.filter((_, i) => i !== index))}>
                {l('移除分组', 'Remove group')}
              </Button>
            </Space>
          </fieldset>
        ))}
        <Space wrap>
          <Button
            onClick={() =>
              setGroups([...groups, { id: crypto.randomUUID(), name: '', fields: [] }])
            }
          >
            {l('添加展示分组', 'Add display group')}
          </Button>
          <Button type="primary" htmlType="submit">
            {l('保存布局', 'Save layout')}
          </Button>
        </Space>
      </Form>
      {pending && (
        <div className="admin-recovery">
          <code>{pending.operationId}</code>
          {outcome === 'confirmed' ? (
            <Button onClick={done}>
              {l('布局已确认，重新读取', 'Layout confirmed; read again')}
            </Button>
          ) : outcome === 'rejected' ? (
            <Button onClick={done}>
              {l('放弃已拒绝布局并重读', 'Discard rejected layout and read again')}
            </Button>
          ) : (
            <>
              <Alert
                type="warning"
                title={l(
                  '当前布局不能确认原写入；继续时使用同一请求。',
                  'Current layout does not confirm the original write. Continue with the same request.',
                )}
              />
              <Button disabled={!canWrite || action.busy} onClick={() => void submit(pending)}>
                {l('显式重提原布局', 'Resubmit original layout')}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  )
}
export function FieldLayout({
  inventory,
  locale,
  canWrite,
}: {
  inventory: InventoryUseCases
  locale: Locale
  canWrite: boolean
}) {
  const l = labels(locale),
    read = useRead('field-layout', inventory.layout),
    guard = useSelectionGuard(),
    [baseline, setBaseline] = useState<Layout | null>(null),
    [editor, setEditor] = useState(0)
  usePendingSelection(guard.locked)
  return (
    <SelectionGuard.Provider value={guard.register}>
      <Card title={l('资产字段布局', 'Asset field layout')}>
        <p className="subtitle">
          {l(
            '配置设备资产页中自定义字段的分组和顺序。内置分组由系统维护。',
            'Arrange custom fields on device asset pages. Built-in groups are maintained by the system.',
          )}
        </p>
        <ReadState locale={locale} busy={read.busy} error={read.error} />
        <Space wrap>
          <Button disabled={guard.locked} onClick={read.reload}>
            {l('读取布局', 'Read layout')}
          </Button>
          <Button
            disabled={guard.locked || !read.value || !read.value.editable || !canWrite}
            onClick={() => {
              if (read.value) {
                setBaseline(read.value)
                setEditor((n) => n + 1)
              }
            }}
          >
            {l('编辑已读取布局', 'Edit observed layout')}
          </Button>
        </Space>
        {read.value && !baseline && (
          <ol className="device-values">
            {read.value.groups.map((group) => (
              <li key={group.id}>
                <strong>{group.name}</strong>
                <p>{group.fields.join(' · ')}</p>
              </li>
            ))}
          </ol>
        )}
        {baseline && (
          <LayoutEditor
            key={editor}
            inventory={inventory}
            locale={locale}
            canWrite={canWrite}
            baseline={baseline}
            done={() => {
              setBaseline(null)
              read.reload()
            }}
          />
        )}
      </Card>
    </SelectionGuard.Provider>
  )
}
