import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useIdentity, loginTarget } from './context'
import { uuid } from './services/decode'
export function useIdentityError() {
  const route = useRoute()
  const { session, flows, hostLogin: host } = useIdentity()
  const pending = flows.read()
  flows.clear()
  let queryTenant: string | null = null
  try {
    queryTenant = uuid(route.query['tenant'])
  } catch {
    /* no valid route locator */
  }
  const tenant = pending?.tenant ?? queryTenant ?? session.state.value.tenant
  const reason = computed(() =>
    ['cancelled', 'unavailable', 'failed'].includes(String(route.query['reason']))
      ? String(route.query['reason'])
      : 'entry',
  )

  return { reason, tenant, host, loginTarget }
}
