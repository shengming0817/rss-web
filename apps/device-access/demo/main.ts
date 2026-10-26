/** MOCK_SOURCE: explicitly selected demo entry; never a production recovery path. */
import { bindSession } from '@rss/auth'
import { createIdentityTransport } from '@rss/api/identity'
import { createDeviceAccessDemoTransport } from '@rss/api/device-access-demo'
import { createDeviceAccess } from '../src/bootstrap'
import { createDemoClients } from './client'
import DemoControls from './DemoControls.vue'
import { TENANT, INSTANCE } from './constants'
createDeviceAccess(
  createIdentityTransport(),
  { canonicalOrigin: window.location.origin, oidcEnabled: false },
  { canonicalOrigin: window.location.origin, tenant: TENANT, serviceId: INSTANCE },
  {
    source: 'demo',
    controls: DemoControls,
    clients: (session) =>
      createDemoClients(bindSession(createDeviceAccessDemoTransport(), session)),
  },
).mount()
