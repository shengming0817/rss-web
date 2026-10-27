/** MOCK_SOURCE: a small, explicit synthetic dataset evaluated only by the loopback demo server. */
import { randomUUID } from 'node:crypto'
import { closed, count, enumeration, uuid } from '../../src/services/decode'
import type { DemoRequest, DomainHandler } from '../scenario'
import { TENANT } from '../scenario'
import { createPages, createReceipts, error, ok } from '../http'
import {
  filters,
  mapping,
  modes,
  standard,
  type AssetDevice,
  type Bucket,
  type Coverage,
  type Evidence,
  type Facet,
  type Filters,
  type Group,
  type Mapping,
  type Mode,
  type Receipt,
  type Result,
  type Standard,
  type Verdict,
} from './model'
export const softwareAssetsDemoPath = '/api/v1/mdm-candidate/software/assets-demo'
export const fixtureIds = {
  editor: 'a1000000-0000-4000-8000-000000000001',
  utilities: 'a1000000-0000-4000-8000-000000000002',
  engineering: 'b1000000-0000-4000-8000-000000000001',
  overlap: 'b1000000-0000-4000-8000-000000000002',
  pending: 'b1000000-0000-4000-8000-000000000003',
}
const deviceNames = {
  'demo-asset-a': 'A · Finance Windows',
  'demo-asset-b': 'B · Design Mac',
  'demo-asset-c': 'C · Engineering Windows',
}
function initialStandards(): Standard[] {
  return [
    {
      id: fixtureIds.editor,
      revision: 1,
      name: 'Acme Editor',
      risk: 'medium',
      marks: ['productivity'],
      threshold: 2,
      allowedGroups: [fixtureIds.engineering],
      archived: false,
    },
    {
      id: fixtureIds.utilities,
      revision: 1,
      name: 'Enterprise Utilities',
      risk: null,
      marks: [],
      threshold: null,
      allowedGroups: null,
      archived: false,
    },
  ]
}
function initialMappings(): Mapping[] {
  return ['acme.editor', 'acme.editor.plugin', 'acme.editor.component']
    .map<Mapping>((identity, i) => ({
      id: `c1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      revision: 1,
      standardId: fixtureIds.editor,
      enabled: true,
      source: 'device.software.installations',
      platform: 'any',
      origin: null,
      identity,
      publisher: 'Acme',
      version: null,
    }))
    .concat([
      {
        id: 'c1000000-0000-4000-8000-000000000004',
        revision: 1,
        standardId: fixtureIds.editor,
        enabled: true,
        source: 'device.software.windows.win32',
        platform: 'windows',
        origin: null,
        identity: 'acme.editor',
        publisher: 'Acme',
        version: null,
      },
    ])
}
function initialGroups(): Group[] {
  return [
    {
      id: fixtureIds.engineering,
      name: 'Synthetic · Engineering (A, C)',
      members: ['demo-asset-a', 'demo-asset-c'],
      revision: 1,
    },
    {
      id: fixtureIds.overlap,
      name: 'Synthetic · Managed (A, B)',
      members: ['demo-asset-a', 'demo-asset-b'],
      revision: 1,
    },
    { id: fixtureIds.pending, name: 'Synthetic · Pending membership', members: null, revision: 1 },
  ]
}
function initialEvidence(): Evidence[] {
  const base = (
    id: string,
    deviceId: keyof typeof deviceNames,
    identity: string,
    version: string,
    component: string,
    scope = 'device',
  ): Evidence => ({
    id,
    deviceId,
    deviceName: deviceNames[deviceId],
    platform: deviceId === 'demo-asset-b' ? 'macos' : 'windows',
    architecture: deviceId === 'demo-asset-b' ? 'arm64' : 'x64',
    scope,
    identity,
    name: identity.startsWith('acme.') ? 'Acme Editor' : 'Text Studio',
    version,
    publisher: 'Acme',
    component,
    source: 'device.software.installations',
    origin: deviceId === 'demo-asset-b' ? 'application' : 'win32.uninstall.64',
    observedAt: '2026-10-26T10:00:00Z',
    presence: 'installed',
    retained: false,
    mappingIds: [],
    standardIds: [],
  })
  const native = base('a-native', 'demo-asset-a', 'acme.editor', '2.0', 'Editor')
  native.source = 'device.software.windows.win32'
  const other = base('other-vendor', 'demo-asset-b', 'beta.text', '7.0', 'Application')
  other.publisher = 'Beta'
  const provisioned = base('provisioned', 'demo-asset-a', 'acme.future', '3.0', 'Provisioned')
  provisioned.presence = 'provisioned'
  return [
    base('a-v1', 'demo-asset-a', 'acme.editor', '1.0', 'Editor'),
    base('a-v2', 'demo-asset-a', 'acme.editor', '2.0', 'Editor'),
    base('a-plugin', 'demo-asset-a', 'acme.editor.plugin', '1.2', 'Plugin'),
    base('a-user501', 'demo-asset-a', 'acme.editor', '2.0', 'Editor', 'user:501'),
    base('a-user502', 'demo-asset-a', 'acme.editor', '2.0', 'Editor', 'user:502'),
    native,
    base('b-component', 'demo-asset-b', 'acme.editor.component', '2.0', 'Component'),
    base('unmapped', 'demo-asset-a', 'acme.text', '1.0', 'Application'),
    other,
    provisioned,
  ]
}
interface QueryState {
  result: Omit<Result, 'rows' | 'nextCursor'>
  rows: Bucket[]
  details: Map<string, AssetDevice[]>
  actor: string
}
export function createSoftwareAssetsDemo() {
  let revision = 1,
    mode: Mode = 'normal',
    standards = initialStandards(),
    mappings = initialMappings(),
    groups = initialGroups()
  const pages = createPages(),
    receipts = createReceipts(),
    applied = new Map<string, { actor: string; receipt: Receipt }>(),
    queries = new Map<string, QueryState>(),
    deleted = new Set<string>()
  const actor = (request: DemoRequest) => `${request.actor.tenantId}/${request.actor.principalId}`
  function reset() {
    revision = 1
    mode = 'normal'
    standards = initialStandards()
    mappings = initialMappings()
    groups = initialGroups()
    pages.reset()
    receipts.reset()
    applied.clear()
    queries.clear()
    deleted.clear()
  }
  function observations(): { evidence: Evidence[]; coverage: Coverage } {
    let evidence = initialEvidence()
    const coverage: Coverage = { current: 2, retained: 0, unknown: 0, conflict: 0, empty: 1 }
    if (mode === 'empty')
      return {
        evidence: [],
        coverage: { current: 0, retained: 0, unknown: 0, conflict: 0, empty: 3 },
      }
    if (mode === 'failed') {
      coverage.current = 1
      coverage.retained = 1
      evidence
        .filter((e) => e.deviceId === 'demo-asset-b')
        .forEach((e) => {
          e.retained = true
          e.observedAt = '2026-10-25T08:00:00Z'
        })
    }
    if (mode === 'partial' || mode === 'conflict') {
      evidence = evidence.filter((e) => e.deviceId !== 'demo-asset-b')
      coverage.current = 1
      if (mode === 'partial') coverage.unknown = 1
      else coverage.conflict = 1
    }
    evidence.forEach((e) => {
      const hits = mappings.filter(
        (m) =>
          m.enabled &&
          standards.some((s) => s.id === m.standardId && !s.archived) &&
          m.source === e.source &&
          (m.platform === 'any' || m.platform === e.platform) &&
          (m.origin === null || m.origin === e.origin) &&
          m.identity === e.identity &&
          m.publisher === e.publisher &&
          (m.version === null || m.version === e.version),
      )
      e.mappingIds = hits.map((m) => m.id)
      e.standardIds = [...new Set(hits.map((m) => m.standardId))]
    })
    return { evidence, coverage }
  }
  function groupDecision(
    device: string,
    selected: string[],
    relationship: 'any' | 'all',
  ): boolean | null {
    if (!selected.length) return true
    const decisions = selected.map((id) => {
      const g = groups.find((g) => g.id === id)
      return g?.members ? g.members.includes(device) : null
    })
    if (relationship === 'any')
      return decisions.includes(true) ? true : decisions.includes(null) ? null : false
    return decisions.includes(false) ? false : decisions.includes(null) ? null : true
  }
  function verdict(device: string, standard?: Standard): Verdict {
    if (!standard?.allowedGroups) return 'disabled'
    const allowed = groupDecision(device, standard.allowedGroups, 'any')
    return allowed === null ? 'unknown' : allowed ? 'allowed' : 'denied'
  }
  function facets(
    evidence: Evidence[],
    field: 'version' | 'component' | 'publisher' | 'platform',
  ): Facet[] {
    const values = new Map<string, Set<string>>()
    evidence.forEach((e) => {
      const set = values.get(e[field]) ?? new Set<string>()
      set.add(e.deviceId)
      values.set(e[field], set)
    })
    return [...values]
      .map(([value, devices]) => ({ value, devices: devices.size }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }
  function query(input: Filters, owner: string): QueryState {
    const { evidence, coverage } = observations(),
      installed = evidence.filter((e) => e.presence === 'installed')
    const uncertain =
      coverage.unknown + coverage.conflict > 0 ||
      input.groups.some((id) => !groups.find((g) => g.id === id)?.members)
    const selected = installed.filter(
      (e) =>
        groupDecision(e.deviceId, input.groups, input.groupMode) === true &&
        (!input.device ||
          `${e.deviceName} ${e.deviceId}`.toLowerCase().includes(input.device.toLowerCase())) &&
        (!input.platform || e.platform === input.platform) &&
        (!input.architecture || e.architecture === input.architecture) &&
        (!input.name ||
          `${e.name} ${e.identity}`.toLowerCase().includes(input.name.toLowerCase())) &&
        (!input.version || e.version === input.version) &&
        (!input.publisher || e.publisher === input.publisher) &&
        (!input.source || e.source === input.source),
    )
    const buckets = new Map<
      string,
      {
        standard?: Standard
        evidence: Evidence[]
        id: string
        name: string
        resolution: Bucket['resolution']
      }
    >()
    standards
      .filter((s) => !s.archived)
      .forEach((s) =>
        buckets.set(`standard:${s.id}`, {
          standard: s,
          evidence: [],
          id: s.id,
          name: s.name,
          resolution: 'mapped',
        }),
      )
    selected.forEach((e) => {
      const standard =
        e.standardIds.length === 1 ? standards.find((s) => s.id === e.standardIds[0]) : undefined
      const resolution = standard ? 'mapped' : e.standardIds.length > 1 ? 'conflict' : 'unmapped'
      const key = standard
        ? `standard:${standard.id}`
        : JSON.stringify([resolution, e.source, e.platform, e.origin, e.publisher, e.identity])
      const bucket = buckets.get(key) ?? {
        id: randomUUID(),
        name: `${e.name} · ${e.publisher} · ${e.identity}`,
        evidence: [],
        resolution,
      }
      bucket.evidence.push(e)
      buckets.set(key, bucket)
    })
    const rows: Bucket[] = [],
      details = new Map<string, AssetDevice[]>()
    buckets.forEach((b) => {
      const s = b.standard
      if (
        (input.standardId && s?.id !== input.standardId) ||
        (input.risk && (s?.risk ?? 'unclassified') !== input.risk) ||
        (input.mark && !s?.marks.includes(input.mark)) ||
        (input.resolution && b.resolution !== input.resolution)
      )
        return
      const byDevice = new Map<string, Evidence[]>()
      b.evidence.forEach((e) => byDevice.set(e.deviceId, [...(byDevice.get(e.deviceId) ?? []), e]))
      const devices = [...byDevice].map(([id, items]) => ({
        id,
        name: items[0]!.deviceName,
        verdict: verdict(id, s),
        evidence: items,
      }))
      const assessmentSet = new Set(
        installed
          .filter((e) => s && e.standardIds.length === 1 && e.standardIds[0] === s.id)
          .map((e) => e.deviceId),
      )
      const assessmentUncertain = coverage.unknown + coverage.conflict > 0
      const assessmentCount =
        assessmentSet.size === 0 && assessmentUncertain ? null : assessmentSet.size
      const threshold = s?.threshold ?? null
      const thresholdState =
        threshold === null
          ? 'disabled'
          : assessmentSet.size >= threshold
            ? 'reached'
            : assessmentUncertain
              ? 'unknown'
              : 'below'
      const compliance = {
        state: !s?.allowedGroups
          ? ('disabled' as const)
          : devices.some((d) => d.verdict === 'unknown') || uncertain
            ? ('unknown' as const)
            : ('known' as const),
        allowed: devices.filter((d) => d.verdict === 'allowed').length,
        denied: devices.filter((d) => d.verdict === 'denied').length,
        unknown: devices.filter((d) => d.verdict === 'unknown').length,
      }
      rows.push({
        id: b.id,
        name: b.name,
        standardId: s?.id ?? null,
        risk: s?.risk ?? null,
        marks: s?.marks ?? [],
        resolution: b.resolution,
        deviceCount: devices.length === 0 && uncertain ? null : devices.length,
        assessmentCount,
        threshold,
        thresholdState,
        compliance,
        versions: facets(b.evidence, 'version'),
        components: facets(b.evidence, 'component'),
        publishers: facets(b.evidence, 'publisher'),
        platforms: facets(b.evidence, 'platform'),
      })
      details.set(b.id, devices)
    })
    const countDevices = new Set(
      [...details.values()].flatMap((devices) => devices.map((d) => d.id)),
    ).size
    return {
      result: {
        id: randomUUID(),
        revision,
        watermark: `Mock configuration r${revision} / synthetic snapshot ${mode} / group r1`,
        coverage,
        totalRows: rows.length,
        devices: countDevices === 0 && uncertain ? null : countDevices,
      },
      rows,
      details,
      actor: owner,
    }
  }
  function change(request: DemoRequest) {
    const outer = closed(request.body, ['operationId', 'change']),
      operationId = uuid(outer['operationId']),
      v = closed(outer['change'], ['kind', 'action', 'id', 'expectedRevision', 'value'])
    const kind = enumeration(v['kind'], ['standard', 'mapping']),
      action = enumeration(
        v['action'],
        kind === 'standard' ? ['put', 'archive', 'delete'] : ['put', 'delete'],
      ),
      id = uuid(v['id']),
      expected = count(v['expectedRevision'])
    return receipts.write(request, operationId, () => {
      const records = kind === 'standard' ? standards : mappings,
        old = records.find((s) => s.id === id)
      if (
        deleted.has(`${kind}/${id}`) ||
        (old?.revision ?? 0) !== expected ||
        (!old && action !== 'put')
      )
        return error('operation_conflict')
      if (action === 'delete' && kind === 'standard' && mappings.some((m) => m.standardId === id))
        return error('operation_conflict')
      if (action === 'put') {
        const value = kind === 'standard' ? standard(v['value']) : mapping(v['value'])
        if (value.id !== id || value.revision !== expected) return error('malformed_request', 400)
        if (kind === 'standard') {
          const s = value as Standard
          if (s.allowedGroups?.some((id) => !groups.some((g) => g.id === id)))
            return error('malformed_request', 400)
          standards = [...standards.filter((s) => s.id !== id), { ...s, revision: expected + 1 }]
        } else {
          const m = value as Mapping
          if (!standards.some((s) => s.id === m.standardId && !s.archived))
            return error('malformed_request', 400)
          mappings = [...mappings.filter((m) => m.id !== id), { ...m, revision: expected + 1 }]
        }
      } else if (action === 'archive' && kind === 'standard')
        standards = standards.map((s) =>
          s.id === id ? { ...s, archived: true, revision: s.revision + 1 } : s,
        )
      else if (kind === 'standard') {
        standards = standards.filter((s) => s.id !== id)
        deleted.add(`${kind}/${id}`)
      } else {
        mappings = mappings.filter((m) => m.id !== id)
        deleted.add(`${kind}/${id}`)
      }
      revision++
      const receipt: Receipt = { operationId, revision, kind, target: id }
      applied.set(operationId, { actor: actor(request), receipt })
      return ok(receipt)
    })
  }
  const handle: DomainHandler = (request, scenario) => {
    if (!request.path.startsWith(softwareAssetsDemoPath)) return
    if (request.actor.tenantId !== TENANT || scenario === 'denied')
      return error('permission_denied', 403)
    try {
      const tail = request.path.slice(softwareAssetsDemoPath.length)
      if (!tail && request.method === 'GET')
        return ok({ revision, mode, standards, mappings, groups })
      if (tail === '/changes' && request.method === 'POST') return change(request)
      if (tail === '/collection' && request.method === 'POST') {
        const v = closed(request.body, ['mode'])
        mode = enumeration(v['mode'], modes)
        revision++
        return ok({ revision, mode, standards, mappings, groups })
      }
      if (tail.startsWith('/receipts/') && request.method === 'GET') {
        const receipt = applied.get(uuid(tail.slice(10)))
        return receipt?.actor === actor(request)
          ? ok(receipt.receipt)
          : error('operation_not_found', 404)
      }
      if (tail === '/queries' && request.method === 'POST') {
        const f = filters(request.body),
          q = query(f, actor(request))
        if (scenario === 'empty') {
          q.rows = []
          q.details.clear()
          q.result.totalRows = 0
          q.result.devices = 0
        }
        queries.set(q.result.id, q)
        while (queries.size > 64) queries.delete(queries.keys().next().value!)
        const page = pages.page(`${q.result.id}/rows`, q.rows, request.query)
        return ok({ ...q.result, rows: page.items, nextCursor: page.nextCursor })
      }
      const match = /^\/queries\/([^/]+)(?:\/buckets\/([^/]+))?$/.exec(tail)
      if (match && request.method === 'GET') {
        const q = queries.get(uuid(match[1]))
        if (!q || q.actor !== actor(request)) return error('operation_not_found', 404)
        if (q.result.revision !== revision) return error('operation_conflict')
        if (match[2]) {
          const bucketId = uuid(match[2]),
            devices = q.details.get(bucketId)
          if (!devices) return error('operation_not_found', 404)
          const page = pages.page(`${q.result.id}/${bucketId}`, devices, request.query)
          return ok({
            queryId: q.result.id,
            bucketId,
            devices: page.items,
            nextCursor: page.nextCursor,
          })
        }
        const page = pages.page(`${q.result.id}/rows`, q.rows, request.query)
        return ok({ ...q.result, rows: page.items, nextCursor: page.nextCursor })
      }
      return error('operation_not_found', 404)
    } catch {
      return error('malformed_request', 400)
    }
  }
  return { handle, reset }
}
