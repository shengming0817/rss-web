<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const { t } = useI18n()

const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const overlayRef = ref<HTMLDivElement | null>(null)

/**
 * Store a reference to the element that triggered the palette open,
 * so focus can be returned on close (a11y: ARIA APG dialog pattern).
 */
function openPalette(): void {
  triggerRef.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  emit('update:open', true)
}

function closePalette(): void {
  emit('update:open', false)
  searchQuery.value = ''
  // Return focus to trigger element
  nextTick(() => {
    /* v8 ignore next */
    triggerRef.value?.focus()
  })
}

// Focus the input when opened
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  },
)

// Focus trap: keep focus inside the overlay while open
function onOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
    return
  }

  if (event.key === 'Tab') {
    // Trap focus within the overlay
    const overlay = overlayRef.value
    if (!overlay) return

    const focusable = overlay.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    /* v8 ignore next */
    if (!first || !last) return

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

// Expose open/close so parent (AppShell) can call them with a ref
defineExpose({ open: openPalette, close: closePalette })
</script>

<template>
  <Teleport to="body">
    <Transition name="cmd-fade">
      <div
        v-if="open"
        class="cmd-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="t('shell.commandPalette.title')"
        @click.self="closePalette"
        @keydown="onOverlayKeydown"
      >
        <div ref="overlayRef" class="cmd-panel">
          <!-- Search input -->
          <div class="cmd-search">
            <svg
              class="cmd-search-ico"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              class="cmd-input"
              :placeholder="t('command.placeholder')"
              :aria-label="t('command.searchLabel')"
              role="combobox"
              aria-controls="cmd-listbox"
              aria-expanded="false"
              aria-autocomplete="list"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button
              type="button"
              class="cmd-esc v1-kbd"
              :aria-label="t('shell.commandPalette.close')"
              @click="closePalette"
            >
              {{ t('shell.commandPalette.escKey') }}
            </button>
          </div>

          <hr class="v1-divider" />

          <!-- Results area (placeholder) -->
          <div
            id="cmd-listbox"
            class="cmd-results"
            role="listbox"
            :aria-label="t('command.resultsLabel')"
          >
            <div class="cmd-empty">
              <span class="cmd-empty-text">{{ t('command.hint') }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ------ Overlay ------ */
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 900;
}

/* ------ Panel ------ */
.cmd-panel {
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  width: 560px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
}

/* ------ Search row ------ */
.cmd-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 48px;
}

.cmd-search-ico {
  color: var(--fg-faint);
  flex-shrink: 0;
}

.cmd-input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 14px;
  color: var(--fg);
  min-width: 0;
}

.cmd-input::placeholder {
  color: var(--fg-faint);
}

.cmd-esc {
  flex-shrink: 0;
  cursor: pointer;
}

/* ------ Results ------ */
.cmd-results {
  min-height: 120px;
  max-height: 380px;
  overflow-y: auto;
}

.cmd-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
}

.cmd-empty-text {
  font-size: 13px;
  color: var(--fg-faint);
}

/* ------ Transition ------ */
.cmd-fade-enter-active,
.cmd-fade-leave-active {
  transition: opacity 0.15s ease;
}

.cmd-fade-enter-from,
.cmd-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cmd-fade-enter-active,
  .cmd-fade-leave-active {
    transition: none;
  }
}
</style>
