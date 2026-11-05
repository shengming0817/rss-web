import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createRuntime } from './runtime'
import 'virtual:mdm-theme.css'
import './style.css'

const root = createRoot(document.getElementById('root')!)
try {
  const runtime = await createRuntime(
    window.location.origin,
    window.location.pathname,
    window.sessionStorage,
  )
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) {
      runtime.owner.suspend()
    } else runtime.owner.dispose()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void runtime.owner.check(runtime.tenant).catch(() => undefined)
  })
  root.render(<App runtime={runtime} />)
} catch {
  root.render(
    <main className="center-state" role="alert">
      <h1>RSS MDM</h1>
      <p>宿主配置不可用或绑定错误，应用无法启动。</p>
      <p>Host configuration is unavailable or invalid. Application startup was refused.</p>
    </main>,
  )
}
