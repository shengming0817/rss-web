import { Alert, Button, Spin } from 'antd'
import { QueryControls } from '@rss/core'
import type { useDirectory } from '../services/directory'
import type { WriteState } from '../context'
export function ReadState({
  busy,
  error,
  reload,
}: {
  busy: boolean
  error: string
  reload: () => unknown
}) {
  return (
    <>
      {busy && <Spin aria-label="正在读取" />}
      {error && (
        <Alert
          type="error"
          title={error}
          action={<Button onClick={() => void reload()}>重新读取</Button>}
        />
      )}
    </>
  )
}
export function WriteStatus({ state, query }: { state: WriteState; query?: () => unknown }) {
  return (
    <div role="status">
      {state.id && (
        <p>
          原操作：<code>{state.id}</code> · {state.state}
        </p>
      )}
      {state.message && <p>{state.message}</p>}
      {state.review && <p>须先读取当前版本并显式接受，才能再次提交。</p>}
      {query && ['unknown', 'accepted'].includes(state.state) && (
        <Button onClick={() => void query()}>查询原操作</Button>
      )}
    </div>
  )
}
export function DirectoryControls({
  directory: d,
  disabled = false,
}: {
  directory: ReturnType<typeof useDirectory>
  disabled?: boolean
}) {
  return (
    <QueryControls
      {...d.draft}
      columns={d.columns}
      maximum={d.maximum}
      previous={!!d.trail.length}
      next={!!d.next}
      disabled={d.busy || disabled}
      labels={{
        filter: '服务端筛选',
        sort: '排序',
        fields: '字段投影',
        limit: '每页数量',
        apply: '应用查询',
        first: '首页 / 重新查询',
        previous: '上一页',
        next: '下一页',
      }}
      hint="查询草稿不影响续页；只提交成功读取的位置。"
      onFilter={(filter) => d.updateDraft({ filter })}
      onSort={(sort) => d.updateDraft({ sort })}
      onFields={(fields) => d.updateDraft({ fields })}
      onLimit={(limit) => d.updateDraft({ limit })}
      onApply={() => void d.apply()}
      onFirst={() => void d.first()}
      onPrevious={() => void d.previous()}
      onNext={() => void d.following()}
    />
  )
}
export function Unavailable({ reason }: { reason: string | null }) {
  return (
    <Alert
      type="info"
      title="当前正式能力尚未接入"
      description={reason ?? '此能力不提供正式编辑入口。'}
    />
  )
}
export function Json({ value }: { value: unknown }) {
  return <pre className="da-json">{JSON.stringify(value, null, 2)}</pre>
}
