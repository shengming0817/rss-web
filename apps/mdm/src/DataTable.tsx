import type { Key, ReactNode } from 'react'
import { Empty } from 'antd'
import { labels } from './AdminUi'
import type { Locale } from './i18n'

interface Column<Row> {
  title: ReactNode
  dataIndex?: keyof Row & string
  render?(value: unknown, row: Row, index: number): ReactNode
}
/** Server-paged rows need semantic rendering, not client sorting or scrollbar measurement.
 * rc-table 1.11.1 calls getTargetScrollBarSize on mount, which injects an inline style
 * even without fixed columns. Keep the host's self-only CSP and the design's native table.
 * ref: react-component/table src/Table.tsx; util src/getScrollBarSize.tsx.
 */
export function DataTable<Row extends object>({
  dataSource,
  columns,
  rowKey,
  locale,
}: {
  dataSource: readonly Row[]
  columns: readonly Column<Row>[]
  rowKey: (keyof Row & string) | ((row: Row, index: number) => Key)
  locale: Locale
}) {
  const l = labels(locale)
  return (
    <div
      className="data-table-scroll"
      role="region"
      aria-label={l('查询结果，可横向滚动', 'Query results, horizontally scrollable')}
      tabIndex={0}
    >
      <table className="data-table" aria-label={l('查询结果', 'Query results')}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th scope="col" key={column.dataIndex ?? index}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={l('没有数据', 'No data')}
                />
              </td>
            </tr>
          ) : (
            dataSource.map((row, index) => {
              const key = typeof rowKey === 'function' ? rowKey(row, index) : String(row[rowKey])
              return (
                <tr key={key} data-row-key={key}>
                  {columns.map((column, cell) => {
                    const value = column.dataIndex === undefined ? undefined : row[column.dataIndex]
                    return (
                      <td key={column.dataIndex ?? cell}>
                        {column.render
                          ? column.render(value, row, index)
                          : value === null || value === undefined
                            ? '—'
                            : String(value)}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
