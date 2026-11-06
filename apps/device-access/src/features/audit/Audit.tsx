import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Space } from 'antd'
import { useDa } from '../../context'
import { useRead } from '../../services/read'
import { utc } from '../../services/status'
import { ReadState } from '../../ui/common'
export function Audit() {
  const r = useDa(),
    [params] = useSearchParams(),
    device = params.get('device'),
    [cursor, setCursor] = useState<string | null>(null),
    [trail, setTrail] = useState<(string | null)[]>([])
  const reader = useRead((signal) => r.client.audit(device, cursor, signal), `${device}/${cursor}`)
  return (
    <>
      <h1>{device ? '计算机时间线' : '安全审计'}</h1>
      {device && (
        <p>
          Endpoint {device} ·{' '}
          <Link to={`/computers/${encodeURIComponent(device)}/diagnostics`}>返回计算机</Link>
        </p>
      )}
      <ReadState {...reader} />
      <Button onClick={() => void reader.reload()}>重新读取</Button>
      {reader.data && (
        <table>
          <thead>
            <tr>
              <th>UTC 时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>设备</th>
              <th>阶段</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {reader.data.items.map((row) => (
              <tr key={row.id}>
                <td>{utc(row.recordedAt)}</td>
                <td>{row.actor}</td>
                <td>{row.action}</td>
                <td>
                  {row.device ? (
                    <Link to={`/computers/${encodeURIComponent(row.device)}/diagnostics`}>
                      {row.device}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{row.phase}</td>
                <td>{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Space>
        <Button
          onClick={() => {
            setCursor(null)
            setTrail([])
          }}
        >
          首页
        </Button>
        <Button
          disabled={!trail.length || reader.busy}
          onClick={() => {
            setCursor(trail.at(-1) ?? null)
            setTrail((v) => v.slice(0, -1))
          }}
        >
          上一页
        </Button>
        <Button
          disabled={!reader.data?.nextCursor || reader.busy}
          onClick={() => {
            setTrail((v) => [...v, cursor])
            setCursor(reader.data!.nextCursor)
          }}
        >
          下一页
        </Button>
      </Space>
      <p>仅显示公开安全事实，不包含恢复秘密；空观察不代表设备已完成。</p>
    </>
  )
}
