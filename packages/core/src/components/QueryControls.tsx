import { useId } from 'react'
import { Button, Input, InputNumber, Select, Space } from 'antd'

export interface QueryControlsProps {
  filter: string
  sort: string
  fields: readonly string[]
  columns: readonly string[]
  limit: number
  maximum: number
  previous?: boolean
  next?: boolean
  disabled?: boolean
  labels: Record<
    'filter' | 'sort' | 'fields' | 'limit' | 'apply' | 'first' | 'previous' | 'next',
    string
  >
  hint?: string
  onFilter: (value: string) => void
  onSort: (value: string) => void
  onFields: (value: string[]) => void
  onLimit: (value: number) => void
  onApply: () => void
  onFirst: () => void
  onPrevious: () => void
  onNext: () => void
}
/** Display only: consumers own query semantics, accepted pages and requests. */
export function QueryControls(p: QueryControlsProps) {
  const id = useId()
  const disabled = p.disabled ?? false
  const apply = () => {
    if (
      !p.disabled &&
      p.fields.length &&
      Number.isInteger(p.limit) &&
      p.limit >= 1 &&
      p.limit <= p.maximum
    )
      p.onApply()
  }
  return (
    <div className="directory-query">
      <details>
        <summary>
          {p.labels.filter} / {p.labels.sort} / {p.labels.fields} / {p.labels.limit}
        </summary>
        <fieldset disabled={disabled}>
          <label htmlFor={`${id}-filter`}>{p.labels.filter}</label>
          <Input
            id={`${id}-filter`}
            value={p.filter}
            maxLength={8192}
            disabled={disabled}
            onChange={(e) => p.onFilter(e.target.value)}
            onPressEnter={apply}
          />
          <label htmlFor={`${id}-sort`}>{p.labels.sort}</label>
          <Input
            id={`${id}-sort`}
            value={p.sort}
            maxLength={2048}
            disabled={disabled}
            onChange={(e) => p.onSort(e.target.value)}
            onPressEnter={apply}
          />
          <label htmlFor={`${id}-fields`}>{p.labels.fields}</label>
          <Select
            id={`${id}-fields`}
            mode="multiple"
            value={[...p.fields]}
            disabled={disabled}
            options={p.columns.map((value) => ({ value }))}
            onChange={p.onFields}
          />
          <label htmlFor={`${id}-limit`}>{p.labels.limit}</label>
          <InputNumber
            id={`${id}-limit`}
            min={1}
            max={p.maximum}
            value={p.limit}
            disabled={disabled}
            onChange={(value) => p.onLimit(value ?? 0)}
          />
          <p>{p.hint}</p>
          <Button disabled={disabled} onClick={apply}>
            {p.labels.apply}
          </Button>
        </fieldset>
      </details>
      <Space role="navigation" aria-label={p.labels.first}>
        <Button disabled={disabled} onClick={p.onFirst}>
          {p.labels.first}
        </Button>
        <Button disabled={disabled || !p.previous} onClick={p.onPrevious}>
          {p.labels.previous}
        </Button>
        <Button disabled={disabled || !p.next} onClick={p.onNext}>
          {p.labels.next}
        </Button>
      </Space>
    </div>
  )
}
