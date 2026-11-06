/** MOCK_SOURCE: explicit loopback demo only. */
import { useContext, useState } from 'react'
import { Select } from 'antd'
import { bindSession } from '@rss/auth-http'
import { createDeviceAccessDemoTransport } from '@rss/api/device-access-demo'
import { DaContext, useDa } from '../src/context'
const options = [
  ['normal', '正常'],
  ['readonly', '只读'],
  ['forbidden', '无权限'],
  ['empty', '空目录'],
  ['offline', '离线'],
  ['conflict', '版本冲突'],
  ['unknown', '响应未知'],
  ['unavailable', '服务故障'],
  ['expired', '会话失效'],
  ['stepup', '需要重新认证'],
].map(([value, label]) => ({ value: value!, label: label! }))
export default function DemoControls() {
  const runtime = useContext(DaContext)
  if (runtime) return <AuthenticatedDemoControls />
  return (
    <div className="demo-bar">
      <strong>MOCK · 合成接口数据 · 非设备验收</strong>
      <span>演示账号 demo / demo；只读账号 reader / demo</span>
    </div>
  )
}
export function AuthenticatedDemoControls() {
  const r = useDa(),
    [value, setValue] = useState('normal'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function change(next: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await bindSession(createDeviceAccessDemoTransport(), r.session).request({
        method: 'POST',
        path: '/api/da-demo/scenario',
        body: { scenario: next },
        successStatus: 200,
        decode: () => undefined,
      })
      setValue(next)
    } catch {
      setError('场景未切换')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="demo-bar">
      <strong>MOCK · 合成接口数据 · 非设备验收</strong>
      <Select
        aria-label="接口场景（切换后重新读取）"
        value={value}
        options={options}
        disabled={busy}
        onChange={(next) => void change(next)}
      />
      <span role="status">{error}</span>
    </div>
  )
}
