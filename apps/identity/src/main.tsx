import '@rss/core/styles/tokens.css'
import 'virtual:rss-theme.css'
import './style.css'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Presentation } from '@rss/core'
import { createFlows, createSession } from '@rss/auth-core'
import { createAuthPort, createIdentityTransport, loadHostConfig } from '@rss/auth-http'
import { Runtime } from './runtime'
import { IdentityApp } from './App'

async function start() {
  const transport = createIdentityTransport()
  const config = await loadHostConfig(transport, window.location.origin)
  const owner = createSession(createAuthPort(transport), { oidcEnabled: config.oidcEnabled })
  const element = document.getElementById('app')
  if (!element) throw new Error('Missing application root')
  createRoot(element).render(
    <Presentation>
      <Runtime
        value={{
          owner,
          transport,
          config,
          flows: createFlows(window.sessionStorage),
        }}
      >
        <BrowserRouter>
          <IdentityApp />
        </BrowserRouter>
      </Runtime>
    </Presentation>,
  )
}
void start().catch(() => {
  const root = document.getElementById('app')
  if (root) {
    root.setAttribute('role', 'alert')
    root.textContent = 'Identity configuration unavailable / 身份应用配置不可用'
  }
})
