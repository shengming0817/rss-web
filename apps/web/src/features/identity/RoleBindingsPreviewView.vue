<script setup lang="ts">
import { SourceBadge } from '@rss/core'
import { MOCK_SOURCE } from '@rss/shared'
import { useI18n } from 'vue-i18n'
import { groupRoleBindingsPreview } from './role-bindings-preview'

const { t } = useI18n()
const bySubject = groupRoleBindingsPreview('subject')
const byRole = groupRoleBindingsPreview('roleId')
</script>

<template>
  <section class="bindings-preview" aria-labelledby="bindings-preview-title">
    <header class="bindings-preview__header">
      <div>
        <h1 id="bindings-preview-title" class="v1-h1">{{ t('roleBindingsPreview.title') }}</h1>
        <p class="v1-sub">{{ t('roleBindingsPreview.subtitle') }}</p>
      </div>
      <SourceBadge :source="MOCK_SOURCE" />
    </header>
    <p class="bindings-preview__warning" role="note">
      {{ t('roleBindingsPreview.warning') }}
    </p>

    <section aria-labelledby="bindings-preview-subjects">
      <h2 id="bindings-preview-subjects">{{ t('roleBindingsPreview.bySubject') }}</h2>
      <article v-for="group in bySubject" :key="group.key" class="bindings-preview__group">
        <h3>{{ group.key }}</h3>
        <ul>
          <li v-for="binding in group.rows" :key="binding.previewId">
            <span>{{ binding.roleId }}</span> — <span>{{ binding.roleName }}</span>
          </li>
        </ul>
      </article>
    </section>

    <section aria-labelledby="bindings-preview-roles">
      <h2 id="bindings-preview-roles">{{ t('roleBindingsPreview.byRole') }}</h2>
      <article v-for="group in byRole" :key="group.key" class="bindings-preview__group">
        <h3>{{ group.key }}</h3>
        <ul>
          <li v-for="binding in group.rows" :key="binding.previewId">
            {{ binding.subject }}
          </li>
        </ul>
      </article>
    </section>
  </section>
</template>

<style scoped>
.bindings-preview {
  display: grid;
  gap: 24px;
  max-width: 1000px;
  padding: 32px;
}

.bindings-preview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.bindings-preview__warning,
.bindings-preview__group {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg-raised);
}

.bindings-preview__group + .bindings-preview__group {
  margin-top: 12px;
}
</style>
