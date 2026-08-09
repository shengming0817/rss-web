<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCellsStore } from '../stores/useCellsStore'
import { SMART_GROUPS, groupMembers, type SmartGroup } from '../data/smartGroups'

const { t } = useI18n()

const store = useCellsStore()
const cells = computed(() => store.cells)

// ── Search ─────────────────────────────────────────────────────────────────
const searchQuery = ref('')

const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q === '') return SMART_GROUPS
  return SMART_GROUPS.filter((g) => t(g.nameKey).toLowerCase().includes(q))
})

// ── Selection (default to first group) ────────────────────────────────────
const selectedGroupId = ref<string | null>(
  SMART_GROUPS[0] !== undefined ? SMART_GROUPS[0].id : null,
)

const selectedGroup = computed<SmartGroup | null>(() => {
  if (selectedGroupId.value === null) return null
  return SMART_GROUPS.find((g) => g.id === selectedGroupId.value) ?? null
})

function selectGroup(id: string): void {
  selectedGroupId.value = id
}

// ── Members (real-time derived) ────────────────────────────────────────────
const selectedMembers = computed(() => {
  if (selectedGroup.value === null) return []
  return groupMembers(selectedGroup.value, cells.value)
})

// ── Member counts precomputed (perf: avoid re-running groupMembers per render) ──
const groupMemberCounts = computed(
  () => new Map(SMART_GROUPS.map((g) => [g.id, groupMembers(g, cells.value).length])),
)
</script>

<template>
  <div class="groups">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <div class="groups__head">
      <div class="groups__title-group">
        <h1 class="groups__h1">
          {{ t('groups.title') }}
          <span class="groups__count">{{ t('groups.count', { n: SMART_GROUPS.length }) }}</span>
          <span class="groups__preview-badge">
            {{ t('groups.preview.label') }}
          </span>
        </h1>
        <p class="groups__subtitle">{{ t('groups.subtitle') }}</p>
      </div>
      <p class="groups__preview-note" role="note">
        {{ t('groups.preview.note') }}
      </p>
    </div>

    <!-- ── Two-column layout ───────────────────────────────────────────── -->
    <div class="groups__body">
      <!-- ── Left: Group list ──────────────────────────────────────────── -->
      <nav class="groups__list" :aria-label="t('groups.listLabel')">
        <!-- Search -->
        <div class="groups__search-wrap">
          <label for="groups-search" class="groups__search-label">
            {{ t('groups.search.label') }}
          </label>
          <input
            id="groups-search"
            v-model="searchQuery"
            type="search"
            class="groups__search"
            :placeholder="t('groups.search.placeholder')"
          />
        </div>

        <!-- Group rows -->
        <template v-if="filteredGroups.length > 0">
          <button
            v-for="group in filteredGroups"
            :key="group.id"
            class="groups__group-btn"
            data-testid="group-btn"
            :aria-pressed="selectedGroupId === group.id ? 'true' : 'false'"
            :aria-current="selectedGroupId === group.id ? 'true' : undefined"
            @click="selectGroup(group.id)"
          >
            <span class="groups__group-name">{{ t(group.nameKey) }}</span>
            <span class="groups__group-count">{{
              t('groups.detail.memberCount', { n: groupMemberCounts.get(group.id) ?? 0 })
            }}</span>
          </button>
        </template>
        <template v-else>
          <p class="groups__empty">{{ t('groups.empty') }}</p>
        </template>
      </nav>

      <!-- ── Right: Detail panel ───────────────────────────────────────── -->
      <section class="groups__detail" aria-live="polite" :aria-label="t('groups.title')">
        <template v-if="selectedGroup !== null">
          <!-- Group name + description -->
          <h2 class="groups__detail-title">{{ t(selectedGroup.nameKey) }}</h2>
          <p class="groups__detail-desc">{{ t(selectedGroup.descKey) }}</p>

          <!-- Query / Predicates -->
          <div class="groups__query-block">
            <h3 class="groups__block-heading">{{ t('groups.detail.query') }}</h3>
            <div class="groups__predicates">
              <template
                v-for="(predicate, idx) in selectedGroup.predicates"
                :key="`${predicate.field}-${predicate.op}-${predicate.value}`"
              >
                <span v-if="idx > 0" class="groups__and-sep" aria-hidden="true">{{
                  t('groups.detail.and')
                }}</span>
                <span class="groups__predicate-chip" data-testid="predicate-chip">
                  <span class="groups__pred-field">{{ t(`groups.field.${predicate.field}`) }}</span>
                  <span class="groups__pred-op">{{ t(`groups.op.${predicate.op}`) }}</span>
                  <span class="groups__pred-value">{{ predicate.value }}</span>
                </span>
              </template>
            </div>
          </div>

          <!-- Members -->
          <div class="groups__members-block">
            <h3 id="groups-members-heading" class="groups__block-heading">
              {{ t('groups.detail.members') }}
              <span class="groups__member-count-badge">{{
                t('groups.detail.memberCount', { n: selectedMembers.length })
              }}</span>
            </h3>

            <template v-if="selectedMembers.length > 0">
              <div class="groups__table-wrap">
                <table class="groups__table" aria-labelledby="groups-members-heading">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('groups.member.cell') }}</th>
                      <th scope="col">{{ t('groups.member.domain') }}</th>
                      <th scope="col">{{ t('groups.member.tier') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="cell in selectedMembers" :key="cell.id" class="groups__member-row">
                      <td>
                        <span class="groups__member-id">{{ cell.id }}</span>
                      </td>
                      <td class="groups__member-domain">{{ cell.domain }}</td>
                      <td>
                        <span class="groups__tier-chip">{{ cell.consistencyLevel }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <template v-else>
              <p class="groups__no-members">{{ t('groups.detail.noMembers') }}</p>
            </template>
          </div>
        </template>
        <template v-else>
          <p class="groups__detail-empty">{{ t('groups.detail.empty') }}</p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ── Root ──────────────────────────────────────────────────────────────── */
.groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.groups__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.groups__title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.groups__h1 {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.groups__count {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--fg-muted);
  font-family: var(--font-mono);
}

.groups__preview-badge {
  display: inline-block;
  padding: 1px 8px;
  font-size: var(--text-xs);
  font-weight: 500;
  font-family: var(--font-sans);
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  border-radius: var(--r-pill);
  white-space: nowrap;
}

.groups__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.groups__preview-note {
  margin: 0;
  padding: 8px 12px;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

/* ── Two-column body ───────────────────────────────────────────────────── */
.groups__body {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  align-items: start;
  min-height: 0;
}

/* ── Left list ─────────────────────────────────────────────────────────── */
.groups__list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--bg);
  box-shadow: var(--shadow-sm);
}

.groups__search-wrap {
  padding: 8px;
  border-bottom: 1px solid var(--line-soft);
}

.groups__search-label {
  /* visually hidden, linked via for/id */
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.groups__search {
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--fg);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  outline: none;
  box-sizing: border-box;
}

.groups__search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.groups__group-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--fg-muted);
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  text-align: left;
  transition:
    background 100ms,
    color 100ms;
}

@media (prefers-reduced-motion: reduce) {
  .groups__group-btn {
    transition: none;
  }
}

.groups__group-btn:last-child {
  border-bottom: none;
}

.groups__group-btn[aria-pressed='true'] {
  background: var(--bg-sunken);
  color: var(--fg);
  font-weight: 500;
  border-left: 2px solid var(--accent);
  padding-left: 10px;
}

.groups__group-btn:hover:not([aria-pressed='true']) {
  background: var(--bg-sunken);
  color: var(--fg);
}

.groups__group-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.groups__group-name {
  flex: 1;
}

.groups__group-count {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-faint);
}

.groups__group-btn[aria-pressed='true'] .groups__group-count {
  color: var(--fg-muted);
}

.groups__empty {
  padding: 20px 12px;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  text-align: center;
}

/* ── Detail panel ──────────────────────────────────────────────────────── */
.groups__detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--bg);
  box-shadow: var(--shadow-sm);
  min-height: 240px;
}

.groups__detail-empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.groups__detail-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.groups__detail-desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.groups__block-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Predicates ────────────────────────────────────────────────────────── */
.groups__predicates {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.groups__predicate-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--fg);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.groups__pred-op {
  color: var(--accent);
}

.groups__pred-value {
  font-weight: 500;
}

.groups__and-sep {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Members ───────────────────────────────────────────────────────────── */
.groups__member-count-badge {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--fg-faint);
}

.groups__table-wrap {
  overflow-x: auto;
}

.groups__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  color: var(--fg);
}

.groups__table thead th {
  padding: 6px 10px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
}

.groups__table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.groups__member-row:last-child td {
  border-bottom: none;
}

.groups__member-row:hover td {
  background: var(--bg-sunken);
}

.groups__member-id {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg);
}

.groups__member-domain {
  color: var(--fg-muted);
}

.groups__tier-chip {
  display: inline-block;
  padding: 1px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.groups__no-members {
  margin: 0;
  padding: 16px 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}
</style>
