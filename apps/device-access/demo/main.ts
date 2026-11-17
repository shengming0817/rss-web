/** MOCK_SOURCE: explicitly selected demo entry; never a production recovery path. */
import { bindSession } from '@rss/auth-http'
import { createIdentityTransport } from '@rss/api/identity'
import { createDeviceAccessDemoTransport } from '@rss/api/device-access-demo'
import { createFlows } from '@rss/auth-core'
import { createDeviceAccess } from '../src/bootstrap'
import { createDemoClients } from './client'
import DemoControls from './DemoControls'
import { TENANT } from './constants'
createDeviceAccess(
  createIdentityTransport(),
  { canonicalOrigin: window.location.origin, oidcEnabled: false },
  TENANT,
  createFlows(window.sessionStorage),
  {
    source: 'demo',
    controls: DemoControls,
    clients: (session) =>
      createDemoClients(bindSession(createDeviceAccessDemoTransport(), session)),
  },
).mount()
