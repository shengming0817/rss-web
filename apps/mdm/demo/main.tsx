import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Alert, ConfigProvider, Select, Button, Space } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { createMdmDemoTransport } from '@rss/api/mdm-demo'
import { createRuntimeDiagnostics } from '@rss/mdm-runtime-diagnostics'
import type { Snapshot } from '@rss/mdm-runtime-diagnostics'
import { Diagnostics } from '../src/Diagnostics'
import { mdmTheme } from '../src/theme'
import type { Runtime } from '../src/runtime'
import 'virtual:mdm-theme.css'
import '../src/style.css'
// Only the explicit demo composition consumes this endpoint. No product failure routes here.
const transport = createMdmDemoTransport()
function Demo() {
  const [scenario, setScenario] = useState('unknown'),
    [allowed, setAllowed] = useState(true),
    [dark, setDark] = useState(false)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
  const diagnostics = createRuntimeDiagnostics({
    snapshot: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/runtime-diagnostics',
        query: { scenario },
        successStatus: 200,
        decode: (value) => value as Snapshot,
      }),
  })
  const runtime = {
    management: false,
    administration: () => ({
      binding: `explicit-mock/${scenario}/${allowed}`,
      diagnostics,
      authorization: {
        effective: async () => ({
          grants: allowed
            ? [{ operation: 'runtime_diagnostics_read', scope: { kind: 'tenant' } }]
            : [],
        }),
      },
    }),
  } as unknown as Runtime
  return (
    <StyleProvider>
      <ConfigProvider theme={mdmTheme(dark, true)}>
        <BrowserRouter>
          <main className="main" style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
            <Alert
              type="warning"
              showIcon
              title="模拟诊断 · 仅验证界面"
              description="以下数据来自显式模拟场景，不代表后端、外部服务或设备的实际状态。"
            />
            <Space wrap>
              <strong>RSS MDM · 显式模拟</strong>
              <Select
                aria-label="模拟场景"
                value={scenario}
                onChange={setScenario}
                options={['unknown', 'degraded', 'ready'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <Button onClick={() => setAllowed(!allowed)}>
                {allowed ? '撤回诊断权限' : '恢复诊断权限'}
              </Button>
              <Button aria-label="切换主题" onClick={() => setDark(!dark)}>
                主题
              </Button>
            </Space>
            <Diagnostics key={`${scenario}/${allowed}`} runtime={runtime} locale="zh" />
          </main>
        </BrowserRouter>
      </ConfigProvider>
    </StyleProvider>
  )
}
createRoot(document.getElementById('root')!).render(<Demo />)
