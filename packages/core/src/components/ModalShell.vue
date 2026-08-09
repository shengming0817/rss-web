<script setup lang="ts">
/**
 * ModalShell — accessible modal primitive (design-system UI shell, no business).
 *
 * Hand-rolled focus management (jsdom lacks HTMLDialogElement.showModal): on open
 * it records the opener, traps Tab within the panel, marks the rest of the page
 * `inert`, closes on Escape / backdrop click, and restores focus to the opener on
 * close. role/aria-modal/aria-labelledby/aria-describedby make it announce
 * correctly; `alertdialog` is used for destructive confirmations.
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** id of the element labelling the dialog (its title). */
    titleId: string
    /** id of the element describing the dialog (its body) — required for alertdialog. */
    descriptionId?: string
    role?: 'dialog' | 'alertdialog'
  }>(),
  { role: 'dialog' },
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE))
}

// Elements we set `inert` on while open, so we can undo exactly those on close.
const inerted: HTMLElement[] = []

/**
 * Mark everything visually behind the modal `inert` (not focusable / hidden from
 * the a11y tree) by walking panel→<body> and inert-ing each ancestor's other
 * children. Complements aria-modal for ATs (e.g. NVDA) that don't honour it on a
 * non-native dialog. Works without Teleport since the modal's own chain is skipped.
 */
function setBackgroundInert(on: boolean): void {
  if (on) {
    let node: HTMLElement | null = panel.value
    while (node && node.parentElement && node !== document.body) {
      const parent = node.parentElement
      for (const sib of Array.from(parent.children)) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert) {
          sib.inert = true
          inerted.push(sib)
        }
      }
      node = parent
    }
  } else {
    for (const el of inerted) el.inert = false
    inerted.length = 0
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab') return
  const els = focusables()
  if (els.length === 0) {
    e.preventDefault()
    panel.value?.focus()
    return
  }
  const first = els[0]!
  const last = els.at(-1)!
  const active = document.activeElement
  // idx === -1 covers focus resting on the panel itself or outside → still wrap,
  // so Tab/Shift+Tab can never escape the dialog.
  const idx = active instanceof HTMLElement ? els.indexOf(active) : -1
  if (e.shiftKey && idx <= 0) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (idx === -1 || idx === els.length - 1)) {
    e.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown, true)
      void nextTick(() => {
        setBackgroundInert(true)
        const els = focusables()
        ;(els[0] ?? panel.value)?.focus()
      })
    } else {
      document.removeEventListener('keydown', onKeydown, true)
      setBackgroundInert(false)
      opener?.focus?.()
      opener = null
    }
  },
  // flush: 'post' so the listener + focus run after the panel is committed to the
  // DOM (otherwise a Tab in the open-tick gap would find no focusables to trap).
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  setBackgroundInert(false)
})
</script>

<template>
  <div v-if="open" class="modal__backdrop" @click.self="emit('close')">
    <div
      ref="panel"
      class="modal__panel"
      :role="role"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      tabindex="-1"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--overlay-bg);
}

.modal__panel {
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
}

.modal__panel:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
