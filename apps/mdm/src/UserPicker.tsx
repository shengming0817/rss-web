import { useEffect, useRef, useState } from 'react'
import { Button, Input, Select, Space } from 'antd'
import type { User } from '@rss/mdm-devices'
import type { Runtime } from './runtime'
import type { Locale } from './i18n'
import { labels, ReadState, useAction, useRead, Failure } from './AdminUi'
import { useAdministration } from './useAdministration'
/** Choose from the formal account directory; membership is re-read before selection. */
export function UserPicker({
  runtime,
  locale,
  value,
  onChange,
  onPendingChange,
  disabled = false,
}: {
  runtime: Runtime
  locale: Locale
  value: User | null
  onChange(value: User | null): void
  onPendingChange(pending: boolean): void
  disabled?: boolean
}) {
  const l = labels(locale),
    { identity, authorization, binding } = useAdministration(runtime),
    action = useAction()
  const [source, setSource] = useState(''),
    [sourceDraft, setSourceDraft] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [principal, setPrincipal] = useState<string | null>(null)
  const selection = useRef(0)
  useEffect(
    () => () => {
      selection.current++
      onPendingChange(false)
    },
    [onPendingChange],
  )
  useEffect(() => {
    if (disabled) {
      selection.current++
      setPrincipal(null)
      onPendingChange(false)
    }
  }, [disabled, onPendingChange])
  const read = useRead(`${binding}/user-picker/${source}/${cursor ?? ''}`, () =>
    identity.accounts({
      fields: [
        'principalId',
        'login',
        'enabled',
        'memberActive',
        ...(source ? (['displayName', 'email'] as const) : []),
      ],
      limit: 20,
      ...(source ? { source } : {}),
      ...(cursor ? { cursor } : {}),
    }),
  )
  return (
    <div className="user-picker">
      <Space wrap>
        <Input
          aria-label={l('人员目录来源（留空为全部）', 'Personnel source (empty for all)')}
          placeholder={l('全部来源 / local / Provider UUID', 'All sources / local / Provider UUID')}
          value={sourceDraft}
          disabled={disabled || action.busy}
          onChange={(event) => setSourceDraft(event.target.value)}
        />
        <Button
          disabled={disabled || action.busy}
          onClick={() => {
            selection.current++
            setCursor(undefined)
            setSource(sourceDraft)
            setPrincipal(null)
            onPendingChange(false)
          }}
        >
          {l('应用来源', 'Apply source')}
        </Button>
      </Space>
      <ReadState locale={locale} busy={read.busy} error={read.error} />
      <Failure error={action.error} locale={locale} kind="read" />
      <Select
        aria-label={l('选择租户人员', 'Choose tenant account')}
        className="full-width"
        value={principal ?? value?.principalId ?? null}
        disabled={disabled || action.busy || read.busy}
        loading={action.busy}
        placeholder={l('选择人员并核对当前账户', 'Choose an account to verify membership')}
        options={(read.value?.items ?? []).map((account) => ({
          value: account.principalId,
          label: account.displayName ?? account.email ?? account.login ?? account.principalId,
          disabled: account.enabled === false || account.memberActive === false,
        }))}
        onChange={(selected: string) => {
          setPrincipal(selected)
          onPendingChange(true)
          const own = ++selection.current
          void action
            .run(async () => {
              const [account, effective] = await Promise.all([
                identity.account(selected),
                authorization.effective(),
              ])
              if (!account.enabled || !account.memberActive)
                throw { status: 409, code: 'configuration_changed' }
              return {
                tenantId: runtime.tenant,
                instanceId: effective.instanceId,
                principalId: account.principalId,
              }
            })
            .then((result) => {
              if (own !== selection.current) return
              setPrincipal(null)
              if (result.ok) onChange(result.value)
              onPendingChange(false)
            })
        }}
      />
      <Space wrap>
        <Button disabled={disabled || action.busy || !cursor} onClick={() => setCursor(undefined)}>
          {l('返回首页', 'First page')}
        </Button>
        <Button
          disabled={disabled || action.busy || !read.value?.nextCursor}
          onClick={() => {
            if (read.value?.nextCursor) setCursor(read.value.nextCursor)
          }}
        >
          {l('下一页', 'Next page')}
        </Button>
        <Button
          disabled={disabled || action.busy}
          onClick={() => {
            selection.current++
            setPrincipal(null)
            onPendingChange(false)
            onChange(null)
          }}
        >
          {l('清空人员归属', 'Clear assigned person')}
        </Button>
      </Space>
      {action.busy && (
        <p role="status">
          {l(
            '正在核验所选人员，完成前不能保存。',
            'Verifying the selected account; saving is disabled until it completes.',
          )}
        </p>
      )}
      {value && <p className="subtitle">{value.principalId}</p>}
    </div>
  )
}
