import { createIdentityTransport } from '@rss/api/identity'
import { createDeviceAccessTransport } from '@rss/api/device-access'
import { loadMdmHostConfig, mdmTenantFromPath } from '@rss/api/mdm'
import { createFlows } from '@rss/auth-core'
import { loadHostConfig } from '@rss/auth-http'
import { createDeviceAccess } from './bootstrap'

const { origin, pathname } = window.location
let login: string | undefined
async function start() {
  const identity = createIdentityTransport()
  const [config, host] = await Promise.all([
    loadHostConfig(identity, origin),
    loadMdmHostConfig(createDeviceAccessTransport(), origin),
  ])
  const flows = createFlows(window.sessionStorage)
  if (pathname === '/auth/resume' || pathname === '/auth/error') {
    const flow = flows.take()
    if (!config.oidcEnabled || !flow || flow.kind === 'link') throw new Error('Invalid flow')
    const tenant = mdmTenantFromPath(`/tenants/${flow.tenant}`, host.managementTenant)
    if (!tenant) throw new Error('Invalid tenant locator')
    login = `/tenants/${tenant}/login`
    if (pathname === '/auth/error') throw new Error('Authentication failed')
    await createDeviceAccess(identity, config, tenant, flows).mount(flow.kind)
    return
  }
  const tenant = mdmTenantFromPath(pathname, host.managementTenant)
  if (!tenant) throw new Error('Invalid tenant locator')
  await createDeviceAccess(identity, config, tenant, flows).mount()
}
void start().catch(() => {
  const root = document.getElementById('app')
  if (!root) return
  root.textContent = '无法打开 Device Access。请使用当前业务租户的入口链接。'
  root.setAttribute('role', 'alert')
  if (login) {
    const link = document.createElement('a')
    link.href = login
    link.textContent = '返回登录'
    root.append(' ', link)
  }
})
