import { Button } from 'antd'
import { usePresentation } from '../presentation'

export function QueryRows({
  items,
  required = ['id'],
  disabled = false,
  onOpen,
}: {
  items: readonly object[]
  required?: readonly string[]
  disabled?: boolean
  onOpen: (row: Record<string, unknown>) => void
}) {
  const { locale } = usePresentation()
  const rows = items as readonly Record<string, unknown>[]
  const columns = [...new Set(rows.flatMap(Object.keys))]
  const zh = locale === 'zh-CN'
  const display = (value: unknown) =>
    value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (
    <div className="directory-results">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
            <th scope="col">{zh ? '完整详情' : 'Full details'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{column in row ? display(row[column]) : '—'}</td>
              ))}
              <td>
                {required.every((key) => key in row && row[key] !== null) && (
                  <Button disabled={disabled} onClick={() => onOpen(row)}>
                    {zh ? '读取详情' : 'Read details'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
