<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SourceBadge } from '@rss/core'
import type { WebReleaseMeta } from '../release-meta'

defineProps<{ readonly releaseMeta: WebReleaseMeta }>()
const { t } = useI18n()
</script>

<template>
  <section class="about" aria-labelledby="about-title">
    <header>
      <h1 id="about-title" class="v1-h1">{{ t('about.title') }}</h1>
      <p class="v1-sub">{{ t('about.subtitle') }}</p>
    </header>

    <section class="about__panel" aria-labelledby="about-web-title">
      <header class="about__panel-header">
        <h2 id="about-web-title">{{ t('about.web.title') }}</h2>
        <SourceBadge :source="releaseMeta.web.source" />
      </header>
      <dl>
        <dt>{{ t('about.web.revision') }}</dt>
        <dd>
          <code data-release-web-revision>{{ releaseMeta.web.revision }}</code>
        </dd>
      </dl>
    </section>

    <section class="about__panel" aria-labelledby="about-rss-title">
      <header class="about__panel-header">
        <h2 id="about-rss-title">{{ t('about.rss.title') }}</h2>
        <SourceBadge :source="releaseMeta.rssContractLedger.source" />
      </header>
      <dl>
        <dt>{{ t('about.rss.baseline') }}</dt>
        <dd>
          <code data-release-rss-ledger-id>{{ releaseMeta.rssContractLedger.id }}</code>
        </dd>
        <dt>{{ t('about.rss.sourceRevision') }}</dt>
        <dd>
          <code data-release-rss-source-revision>{{
            releaseMeta.rssContractLedger.sourceRevision
          }}</code>
        </dd>
      </dl>
      <p data-release-rss-notice>{{ t('about.rss.notice') }}</p>
    </section>

    <section class="about__panel" aria-labelledby="about-preview-title">
      <h2 id="about-preview-title">{{ t('about.preview.title') }}</h2>
      <p v-if="releaseMeta.previewSources.length === 0">{{ t('about.preview.none') }}</p>
      <ul v-else>
        <li
          v-for="preview in releaseMeta.previewSources"
          :key="preview.id"
          :data-release-preview-source="preview.id"
        >
          <span>{{ t(`about.preview.sources.${preview.id}`) }}</span>
          <SourceBadge :source="preview.source" />
        </li>
      </ul>
      <p>{{ t('about.preview.notice') }}</p>
    </section>
  </section>
</template>

<style scoped>
.about {
  display: grid;
  gap: 20px;
  max-width: 900px;
  padding: 32px;
}

.about__panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.about__panel-header,
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

dl > div,
li {
  margin: 10px 0;
}

code {
  overflow-wrap: anywhere;
}
</style>
