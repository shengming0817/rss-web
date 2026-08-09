<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * AIBottomBar — placeholder component (MVP: minimal 32px bar).
 *
 * Design: three expansion stages — 32px strip | 320px panel | fullscreen.
 * This PR implements stage 1 only (collapsed strip + click-to-expand stub).
 * Stages 2/3 are reserved for a future AI Studio batch.
 */

type BarStage = 'collapsed' | 'docked' | 'fullscreen'

const stage = ref<BarStage>('collapsed')

function expand(): void {
  stage.value = 'docked'
}

function collapse(): void {
  stage.value = 'collapsed'
}
</script>

<template>
  <div
    class="ai-bar"
    :class="{
      'ai-bar--docked': stage === 'docked',
      'ai-bar--fullscreen': stage === 'fullscreen',
    }"
    role="complementary"
    :aria-label="t('shell.ai.label')"
  >
    <div class="ai-bar__strip">
      <button
        v-if="stage === 'collapsed'"
        type="button"
        class="ai-bar__trigger v1-ghost"
        :aria-label="t('shell.ai.expand')"
        @click="expand"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M12 2v4 M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2 M9 14h.01 M15 14h.01 M9 17h6"
          />
        </svg>
        <span class="ai-bar__label">{{ t('shell.ai.name') }}</span>
      </button>
      <button
        v-else
        type="button"
        class="ai-bar__trigger v1-ghost"
        :aria-label="t('shell.ai.collapse')"
        @click="collapse"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
        <span class="ai-bar__label">{{ t('shell.ai.name') }}</span>
      </button>
    </div>

    <!-- Docked panel placeholder -->
    <div v-if="stage === 'docked'" class="ai-bar__panel">
      <div class="ai-bar__placeholder">
        <span class="v1-mute">{{ t('shell.ai.studioPlaceholder') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-bar {
  border-top: 1px solid var(--line);
  background: var(--bg-sunken);
  flex-shrink: 0;
  transition: height 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .ai-bar {
    transition: none;
  }
}

.ai-bar__strip {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
}

.ai-bar__trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  width: auto;
  padding: 0 6px;
  /* min-height ≥ 30px per PRD §4 btn exception lower bound */
  min-height: 30px;
}

.ai-bar__label {
  font-size: 11.5px;
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
  color: var(--fg-muted);
}

.ai-bar__panel {
  border-top: 1px solid var(--line-soft);
  height: 288px; /* 320px total - 32px strip */
  overflow-y: auto;
}

.ai-bar__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
