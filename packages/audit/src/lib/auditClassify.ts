/**
 * auditClassify.ts — heuristic actor classification and day-grouping helpers.
 *
 * IMPORTANT: classifyActor is a best-effort prefix heuristic.
 * It is NOT authoritative; it will misclassify actors that don't follow the
 * known naming conventions. The backend is expected to expose an `actorType`
 * field in a future iteration (BR-006); when it does, replace this heuristic
 * with a direct field read.
 *
 * Current rules (newest-wins, checked in order):
 *   1. contains '@'        → human
 *   2. starts with 'sa:'   → service  (service accounts)
 *   3. starts with 'svc'   → service
 *   4. starts with 'sb-'   → sandbox  (AI sandboxes)
 *   5. ends with 'core'    → cell     (gocell internal cells, e.g. observecore)
 *   6. otherwise           → unknown
 */

import type { AuditEntry } from '../api/audit'

export type ActorKind = 'human' | 'service' | 'cell' | 'sandbox' | 'unknown'

/** Day-label kind: used by the view to render i18n keys for today/yesterday. */
export type DayLabelKind = 'today' | 'yesterday' | 'date'

/** Classify an opaque actorId into a best-effort actor kind. */
export function classifyActor(actorId: string): ActorKind {
  if (!actorId) return 'unknown'
  if (actorId.includes('@')) return 'human'
  if (actorId.startsWith('sa:')) return 'service'
  if (actorId.startsWith('svc')) return 'service'
  if (actorId.startsWith('sb-')) return 'sandbox'
  if (actorId.endsWith('core')) return 'cell'
  return 'unknown'
}

// ─── day grouping ─────────────────────────────────────────────────────────────

export interface DayGroup {
  /** YYYY-MM-DD local date key (used as Map key and for label lookup). */
  dayKey: string
  /**
   * Discriminant for i18n rendering:
   * - 'today'/'yesterday' → use t('audit.log.day.today') / t('audit.log.day.yesterday')
   * - 'date' → use the already-formatted `dateLabel` string from Intl
   */
  labelKind: DayLabelKind
  /** Intl-formatted date string; only meaningful when labelKind === 'date'. */
  dateLabel: string
  entries: AuditEntry[]
}

// Module-level Intl instance — reused across all calls (Q: avoid per-call allocation).
const dayLabelFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** Precise entry type: timestamp is required, occurredAt is optional. */
type EntryWithTs = { occurredAt?: string; timestamp: string }

/**
 * Return a local-date key (YYYY-MM-DD) for an entry, preferring `occurredAt`
 * over `timestamp` (both ISO-8601).
 */
function entryDateKey(entry: EntryWithTs): string {
  const iso = entry.occurredAt ?? entry.timestamp
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Use local date parts (matches what the user sees in the browser).
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Classify a YYYY-MM-DD dayKey into a DayLabelKind for i18n rendering.
 * Returns 'today', 'yesterday', or 'date' (with a pre-formatted dateLabel).
 * Exported so specs can assert the kind without depending on locale strings.
 */
export function formatDayLabel(dayKey: string): { kind: DayLabelKind; dateLabel: string } {
  const d = new Date(dayKey)
  if (Number.isNaN(d.getTime())) return { kind: 'date', dateLabel: dayKey }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  if (dayKey === todayKey) return { kind: 'today', dateLabel: '' }
  if (dayKey === yesterdayKey) return { kind: 'yesterday', dateLabel: '' }
  return { kind: 'date', dateLabel: dayLabelFormat.format(d) }
}

/**
 * Group a list of AuditEntry values by local date.
 * Preserves the input order within each group (typically newest-first).
 */
export function groupByDay(entries: AuditEntry[]): DayGroup[] {
  const map = new Map<string, AuditEntry[]>()

  for (const entry of entries) {
    const key = entryDateKey(entry)
    const existing = map.get(key)
    if (existing) {
      existing.push(entry)
    } else {
      map.set(key, [entry])
    }
  }

  return Array.from(map.entries()).map(([dayKey, dayEntries]) => {
    const { kind, dateLabel } = formatDayLabel(dayKey)
    return {
      dayKey,
      labelKind: kind,
      dateLabel,
      entries: dayEntries,
    }
  })
}
