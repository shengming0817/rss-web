<script setup lang="ts">
/**
 * RolePermissionMatrix — read-only table visualising roles × permissions.
 *
 * Props:   roles — array of Role objects from the contract
 * Emits:   (none — purely presentational)
 *
 * Design:
 * - Columns = de-duplicated union of all permissions across all roles,
 *   sorted stably by resource then action.
 * - Rows = one per role; first cell is th[scope=row] with the role name.
 * - Cells carry data-granted="true|false" for stable test assertions.
 * - Empty state → role="status" paragraph; no table rendered.
 * - Tokens-only styling; no inline colors or magic numbers.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Role } from '../api/roles'

const props = defineProps<{
  roles: Role[]
}>()

const { t } = useI18n()

/** A permission column identifier */
interface PermCol {
  key: string // "${resource} ${action}" — unique, used for Set dedup
  resource: string
  action: string
}

/** Hoisted collator — avoids re-constructing on every sort comparison. */
const collator = new Intl.Collator('en', { sensitivity: 'base' })

/**
 * Compute the sorted, de-duplicated union of all permissions across all roles.
 * Sort order: resource ASC, then action ASC (stable, locale-independent).
 */
const permColumns = computed<PermCol[]>(() => {
  const seen = new Map<string, PermCol>()
  for (const role of props.roles) {
    for (const perm of role.permissions) {
      const key = `${perm.resource} ${perm.action}`
      if (!seen.has(key)) {
        seen.set(key, { key, resource: perm.resource, action: perm.action })
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => collator.compare(a.resource, b.resource) || collator.compare(a.action, b.action),
  )
})

/**
 * Pre-compute granted sets per role for O(1) cell lookup.
 * key = role.id, value = Set of permission keys held by that role.
 */
const grantedMatrix = computed<Map<string, Set<string>>>(() => {
  const m = new Map<string, Set<string>>()
  for (const role of props.roles) {
    m.set(role.id, new Set(role.permissions.map((p) => `${p.resource} ${p.action}`)))
  }
  return m
})

function granted(roleId: string, key: string): boolean {
  return grantedMatrix.value.get(roleId)?.has(key) ?? false
}
</script>

<template>
  <p v-if="roles.length === 0" class="matrix__empty" role="status" data-testid="matrix-empty">
    {{ t('access.policies.matrix.empty') }}
  </p>

  <div
    v-else
    class="matrix__wrapper"
    tabindex="0"
    role="region"
    :aria-label="t('access.policies.matrix.label')"
  >
    <table class="matrix__table">
      <thead>
        <tr>
          <!-- Role name header column -->
          <th scope="col" class="matrix__col-role">
            {{ t('access.policies.matrix.roleHeader') }}
          </th>
          <!-- Permission columns -->
          <th v-for="col in permColumns" :key="col.key" scope="col" class="matrix__col-perm">
            <span class="matrix__perm-resource">{{ col.resource }}</span>
            <span class="matrix__perm-sep" aria-hidden="true">:</span>
            <span class="matrix__perm-action">{{ col.action }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="role in roles" :key="role.id" class="matrix__row" :data-role-id="role.id">
          <th scope="row" class="matrix__cell matrix__cell--name">
            {{ role.name }}
          </th>
          <td
            v-for="col in permColumns"
            :key="col.key"
            class="matrix__cell matrix__cell--perm"
            :data-granted="String(granted(role.id, col.key))"
            :aria-label="
              granted(role.id, col.key)
                ? t('access.policies.matrix.granted')
                : t('access.policies.matrix.denied')
            "
          >
            <span
              class="matrix__glyph"
              :class="
                granted(role.id, col.key) ? 'matrix__glyph--granted' : 'matrix__glyph--denied'
              "
              aria-hidden="true"
            >
              {{ granted(role.id, col.key) ? '✓' : '·' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.matrix__wrapper {
  overflow-x: auto;
}

.matrix__wrapper:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.matrix__empty {
  margin: 0;
  padding: 32px 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.matrix__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.matrix__table thead th {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

.matrix__col-role {
  min-width: 140px;
}

.matrix__col-perm {
  min-width: 110px;
  text-align: center;
}

.matrix__perm-resource {
  color: var(--fg);
}

.matrix__perm-sep {
  color: var(--fg-faint);
}

.matrix__perm-action {
  color: var(--fg-muted);
}

.matrix__row {
  border-bottom: 1px solid var(--line-soft);
}

.matrix__row:last-child {
  border-bottom: none;
}

.matrix__cell {
  padding: 10px 12px;
  color: var(--fg);
  vertical-align: middle;
}

.matrix__cell--name {
  font-weight: 500;
  text-align: left;
}

.matrix__cell--perm {
  text-align: center;
}

.matrix__glyph {
  display: inline-block;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
}

.matrix__glyph--granted {
  color: var(--ok);
}

.matrix__glyph--denied {
  color: var(--fg-faint);
}

@media (prefers-reduced-motion: reduce) {
  /* No transitions in this component — nothing to disable */
}
</style>
