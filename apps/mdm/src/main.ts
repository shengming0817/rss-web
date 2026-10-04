import { createIdentityTransport } from '@rss/api/identity'
import { createMdmTransport } from '@rss/api/mdm'
import { loadConfig } from '@rss/auth'
import { decodeMdmConfig } from './services/workspace'
import { startMdm } from './bootstrap'
async function start() {
  const transport = createIdentityTransport()
  const config = await loadConfig(transport, window.location.origin)
  const mdm = await createMdmTransport().request({
    method: 'GET',
    path: '/api/v1/mdm-host/config.json',
    successStatus: 200,
    decode: (value) => decodeMdmConfig(value, window.location.origin),
  })
  startMdm(transport, config, mdm.tenant, false)
}
void start().catch(() => {
  const root = document.getElementById('app')
  if (root) root.textContent = 'MDM configuration unavailable / MDM 应用配置不可用'
})
