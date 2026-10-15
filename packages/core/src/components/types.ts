export interface UiOption {
  value: string
  label: string
  disabled?: boolean
}
export interface UiColumn<T> {
  key: string
  label: string
  sortable?: boolean
  value?: (row: T) => unknown
}
export interface UiSort {
  key: string
  direction: 'asc' | 'desc'
}
export type UiPaginationState =
  | { kind: 'cursor'; hasPrevious: boolean; hasNext: boolean }
  | { kind: 'pages'; page: number; pageCount: number }
export type UiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export interface UiChartPoint {
  label: string
  value: number
}
export interface UiNotice {
  id: string
  title: string
  description?: string
  tone?: UiTone
}
