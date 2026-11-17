export interface Tenant {
  readonly tenantId: string
  readonly management: boolean
  readonly name: string | null
  readonly notes: string | null
  readonly revision: number
  readonly deletable: boolean
}
export interface Provisioning {
  readonly tenantId: string
  readonly administratorId: string | null
  readonly phase: 'pending' | 'blocked' | 'configured'
  readonly blocked: string | null
  readonly entryPath: string
}
export interface Administrator {
  readonly tenantId: string
  readonly principalId: string
  readonly login: string
  readonly ruleId: string
  readonly ruleRevision: number
}
export type Receipt =
  | {
      readonly operationId: string
      readonly action: 'create' | 'update' | 'delete'
      readonly result: Tenant
    }
  | {
      readonly operationId: string
      readonly action: 'administrator_create'
      readonly result: Administrator
    }
  | { readonly operationId: string; readonly action: 'provision'; readonly result: Provisioning }
export type ProvisionReceipt = Extract<Receipt, { action: 'provision' }>
export interface ProvisionInput {
  readonly name: string
  readonly administratorLogin: string
  readonly administratorPassword: string
}
/** This is the only resumable provisioning intent. No password or password digest is retained. */
export interface ProvisionIntent {
  readonly operationId: string
  readonly name: string
  readonly administratorLogin: string
}
export interface UpdateIntent {
  readonly operationId: string
  readonly tenantId: string
  readonly expectedRevision: number
  readonly name: string | null
  readonly notes: string | null
}
export interface DirectoryQuery<F extends string> {
  readonly filter?: string
  readonly sort?: readonly string[]
  readonly fields?: readonly F[]
  readonly limit?: number
  readonly cursor?: string
}
export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}
export interface ProvisionRow {
  readonly operationId: string
  readonly action: 'provision'
  readonly result: Provisioning
}
export interface TenantAdministrationPort {
  tenants<F extends keyof Tenant = keyof Tenant>(
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<Tenant, F>>>
  tenant(id: string): Promise<Tenant>
  provisionings<F extends keyof ProvisionRow = keyof ProvisionRow>(
    query?: DirectoryQuery<F>,
  ): Promise<Page<Pick<ProvisionRow, F>>>
  provisioning(operationId: string): Promise<ProvisionReceipt>
  provision(operationId: string, input: ProvisionInput): Promise<ProvisionReceipt>
  update(input: UpdateIntent): Promise<Receipt>
  remove(tenantId: string, operationId: string, expectedRevision: number): Promise<Receipt>
  administrator(
    tenantId: string,
    operationId: string,
    input: { readonly login: string; readonly password: string },
  ): Promise<Receipt>
  operation(operationId: string): Promise<Receipt>
}
function uuid(value: string): void {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
  )
    throw new Error('Invalid identifier')
}
function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value >= Number.MAX_SAFE_INTEGER)
    throw new Error('Invalid revision')
}
function text(value: string, maximum: number, empty = false): void {
  if ((!empty && !value.trim()) || [...value].length > maximum || value.includes('\u0000'))
    throw new Error('Invalid text')
}
export function prepareUpdate(
  operationId: string,
  detail: Tenant,
  name: string | null,
  notes: string | null,
): UpdateIntent {
  uuid(operationId)
  uuid(detail.tenantId)
  positive(detail.revision)
  if (detail.management) throw new Error('Management tenant is immutable')
  if (name !== null) text(name, 128)
  if (notes !== null) text(notes, 2048, true)
  return { operationId, tenantId: detail.tenantId, expectedRevision: detail.revision, name, notes }
}
export function provisioningEntry(p: Provisioning): string | null {
  uuid(p.tenantId)
  if (p.entryPath !== `/tenants/${p.tenantId}`) throw new Error('Invalid tenant entry')
  return p.phase === 'configured' && p.administratorId !== null && p.blocked === null
    ? p.entryPath
    : null
}
export function confirmOperation(
  receipt: Receipt,
  operationId: string,
  action: Receipt['action'],
  tenantId?: string,
): Receipt {
  if (
    receipt.operationId !== operationId ||
    receipt.action !== action ||
    (tenantId !== undefined && receipt.result.tenantId !== tenantId)
  )
    throw new Error('Wrong tenant operation receipt')
  return receipt
}
/** Explicit use cases; re-entering credentials and resubmitting is always a caller action. */
export function createTenantAdministration(port: TenantAdministrationPort) {
  return {
    ...port,
    async provision(intent: ProvisionIntent, password: string) {
      uuid(intent.operationId)
      text(intent.name, 128)
      text(intent.administratorLogin, 256)
      text(password, 1024)
      const result = await port.provision(intent.operationId, {
        name: intent.name,
        administratorLogin: intent.administratorLogin,
        administratorPassword: password,
      })
      confirmOperation(result, intent.operationId, 'provision')
      return result
    },
    async update(intent: UpdateIntent) {
      uuid(intent.operationId)
      uuid(intent.tenantId)
      positive(intent.expectedRevision)
      if (intent.name !== null) text(intent.name, 128)
      if (intent.notes !== null) text(intent.notes, 2048, true)
      const result = confirmOperation(
        await port.update(intent),
        intent.operationId,
        'update',
        intent.tenantId,
      )
      if (result.action !== 'update' || result.result.revision !== intent.expectedRevision + 1)
        throw new Error('Wrong tenant revision')
      return result
    },
    async remove(detail: Tenant, operationId: string) {
      uuid(operationId)
      uuid(detail.tenantId)
      positive(detail.revision)
      if (detail.management || !detail.deletable) throw new Error('Tenant cannot be deleted')
      const result = confirmOperation(
        await port.remove(detail.tenantId, operationId, detail.revision),
        operationId,
        'delete',
        detail.tenantId,
      )
      if (result.action !== 'delete' || result.result.revision !== detail.revision + 1)
        throw new Error('Wrong deletion revision')
      return result
    },
    async administrator(tenantId: string, operationId: string, login: string, password: string) {
      uuid(tenantId)
      uuid(operationId)
      text(login, 256)
      text(password, 1024)
      return confirmOperation(
        await port.administrator(tenantId, operationId, { login, password }),
        operationId,
        'administrator_create',
        tenantId,
      )
    },
  }
}
