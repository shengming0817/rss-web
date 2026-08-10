<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { VerifiedProfile } from '@rss/identity'
defineProps<{ profile: VerifiedProfile }>()
const { t } = useI18n()
</script>

<template>
  <section class="profile" aria-labelledby="verified-profile-title">
    <h2 id="verified-profile-title">{{ t('identity.profile.title') }}</h2>
    <dl>
      <div>
        <dt>{{ t('identity.profile.subject') }}</dt>
        <dd>{{ profile.subject }}</dd>
      </div>
      <div>
        <dt>{{ t('identity.profile.tenant') }}</dt>
        <dd>{{ profile.tenantId }}</dd>
      </div>
      <div>
        <dt>{{ t('identity.profile.kind') }}</dt>
        <dd>{{ profile.kind }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile {
  max-width: 720px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
.profile h2 {
  margin: 0 0 18px;
}
.profile dl,
.profile dl div {
  display: grid;
  gap: 8px;
}
.profile dl {
  margin: 0;
  gap: 16px;
}
.profile dl div {
  grid-template-columns: minmax(100px, 0.35fr) 1fr;
}
.profile dt {
  color: var(--fg-muted);
}
.profile dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
