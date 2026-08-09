<script setup lang="ts">
/**
 * IdentityStatusPill — status badge for a user identity.
 *
 * a11y (WCAG 1.4.1 + 1.4.3): state is conveyed by the text label, never by
 * colour alone. The label is rendered in high-contrast `--fg` (≥ AA on the
 * `--bg-sunken` chip) so it passes 1.4.3 regardless of state; the variant colour
 * lives only on the decorative dot (`aria-hidden`), which is a redundant cue.
 * Known states map to an i18n label; unknown backend states fall back to the raw
 * value in a neutral variant so the UI never hides information it can't classify.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ status: string }>()
const { t } = useI18n()

type Variant = 'ok' | 'warn' | 'neutral'
const VARIANT: Partial<Record<string, Variant>> = { active: 'ok', locked: 'warn' }
const KNOWN = new Set(['active', 'locked'])

const variant = computed<Variant>(() => VARIANT[props.status] ?? 'neutral')
const label = computed<string>(() =>
  KNOWN.has(props.status) ? t(`access.identities.status.${props.status}`) : props.status,
)
</script>

<template>
  <span class="pill" :class="`pill--${variant}`" :data-variant="variant">
    <span class="pill__dot" aria-hidden="true" />
    <span class="pill__label">{{ label }}</span>
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
  /* High-contrast label colour (passes WCAG AA on --bg-sunken for all states);
     state colour is carried by the dot, not the text. */
  color: var(--fg);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
}

.pill__dot {
  width: 6px;
  height: 6px;
  background: var(--fg-faint);
  border-radius: var(--r-pill);
}

.pill--ok .pill__dot {
  background: var(--ok);
}

.pill--warn .pill__dot {
  background: var(--warn);
}

.pill--neutral .pill__dot {
  background: var(--fg-faint);
}
</style>
