<script setup lang="ts">
/**
 * ActorPill — decorative actor-kind badge for an audit log entry.
 *
 * a11y (WCAG 1.4.1 + 1.4.3): actor kind is conveyed by the text label
 * (the full actorId), never by colour alone. The variant colour lives only on
 * the decorative dot (`aria-hidden`). The label text is the raw actorId —
 * actors that don't match a known prefix fall back to the 'unknown' variant
 * but still show the full opaque id so the UI never hides information.
 *
 * Note: actor classification is a heuristic (see auditClassify.ts). Awaiting
 * backend actorType field (BR-006).
 */
import { computed } from 'vue'
import { classifyActor, type ActorKind } from '../lib/auditClassify'

const props = defineProps<{ actorId: string }>()

const kind = computed<ActorKind>(() => classifyActor(props.actorId))
</script>

<template>
  <span class="pill" :class="`pill--${kind}`" :data-variant="kind" :title="actorId">
    <span class="pill__dot" aria-hidden="true" />
    <span class="pill__label">{{ actorId }}</span>
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 9px;
  font-size: 12px;
  line-height: 18px;
  color: var(--fg);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  background: var(--fg-faint);
  border-radius: var(--r-pill);
}

.pill--human .pill__dot {
  background: var(--accent);
}

.pill--service .pill__dot {
  background: var(--ok);
}

.pill--cell .pill__dot {
  background: var(--fg-muted);
}

.pill--sandbox .pill__dot {
  background: var(--warn);
}

.pill--unknown .pill__dot {
  background: var(--fg-faint);
}
</style>
