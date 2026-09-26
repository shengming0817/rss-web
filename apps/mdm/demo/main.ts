import { createApp, computed } from 'vue'
import { createIdentityTransport } from '@rss/api/identity'
import { startMdm } from '../src/bootstrap'
import { TENANT } from './scenario'
import DemoControls from './DemoControls.vue'
const controls = document.createElement('div')
document.body.prepend(controls)
const runtime = startMdm(
  createIdentityTransport(),
  { canonicalOrigin: window.location.origin, oidcEnabled: false },
  TENANT,
  true,
)

createApp(DemoControls, {
  transport: runtime.transport,
  authenticated: computed(() => runtime.session.state.value.status === 'authenticated'),
})
  .use(runtime.i18n)
  .mount(controls)
