import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { App } from './App'
import { startRuntime } from './runtime'
import 'virtual:mdm-theme.css'
import './style.css'

const root = createRoot(document.getElementById('root')!)
try {
  const startup = await startRuntime(
    window.location.origin,
    window.location.pathname,
    window.sessionStorage,
    window.location.search,
  )
  if (startup.kind === 'console') {
    const { runtime, resumed } = startup
    if (resumed) window.history.replaceState(null, '', resumed)
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) flushSync(() => runtime.owner.pauseRevalidation())
      else runtime.owner.dispose()
    })
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return
      const { owner, tenant } = runtime
      const check = owner.getSnapshot().status === 'authenticated' ? owner.revalidate : owner.check
      void check(tenant).catch(() => undefined)
    })
    document.addEventListener('visibilitychange', () => {
      if (
        document.visibilityState === 'visible' &&
        runtime.owner.getSnapshot().status === 'authenticated'
      )
        void runtime.owner.revalidate(runtime.tenant).catch(() => undefined)
    })
  }
  root.render(<App startup={startup} />)
} catch {
  root.render(
    <main className="center-state" role="alert">
      <h1>RSS MDM</h1>
      <p>宿主配置不可用或绑定错误，应用无法启动。</p>
      <p>Host configuration is unavailable or invalid. Application startup was refused.</p>
    </main>,
  )
}
