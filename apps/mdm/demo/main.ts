import { createApp, computed } from 'vue'
import { createIdentityTransport } from '@rss/api/identity'
import { createDemo } from './bootstrap'
import { TENANT } from './scenario'
import DemoControls from './DemoControls.vue'
const controls = document.createElement('div')
document.body.prepend(controls)
const runtime = createDemo(
  createIdentityTransport(),
  { canonicalOrigin: window.location.origin, oidcEnabled: false },
  {
    canonicalOrigin: window.location.origin,
    serviceId: '44444444-4444-4444-8444-444444444444',
    tenant: TENANT,
    managementTenant: '99999999-9999-4999-8999-999999999999',
  },
)
runtime.mount()

createApp(DemoControls, {
  transport: runtime.transport,
  authenticated: computed(() => runtime.session.state.value.status === 'authenticated'),
})
  .use(runtime.i18n)
  .mount(controls)
