import { createIdentityTransport } from '@rss/api/identity'
import { createDeviceAccessTransport } from '@rss/api/device-access'
import { loadConfig } from '@rss/auth'
import { loadHost } from './config'
import { createDeviceAccess } from './bootstrap'
async function start() {
  const identity = createIdentityTransport()
  const [config, host] = await Promise.all([
    loadConfig(identity, window.location.origin),
    loadHost(createDeviceAccessTransport(), window.location.origin),
  ])
  createDeviceAccess(identity, config, host).mount()
}
void start().catch(() => {
  const root = document.getElementById('app')
  if (root) {
    root.textContent = 'Device Access 配置不可用。请检查同源 HTTPS 宿主与租户配置。'
    root.setAttribute('role', 'alert')
  }
})
