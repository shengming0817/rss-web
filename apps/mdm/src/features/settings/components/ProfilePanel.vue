<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import { type Profile, sourceKey, jsonDisplay } from '../clients/profiles'
const props = withDefaults(
  defineProps<{ principal?: string; view?: 'current' | 'latest'; preview?: boolean }>(),
  { principal: '', view: 'current', preview: false },
)
const { t } = useI18n(),
  runtime = useMdm(),
  value = ref<Profile>()
const now = ref(Date.now()),
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
onBeforeUnmount(() => clearInterval(timer))
function live(expires: number | null) {
  return expires !== null && expires * 1000 > now.value
}
const fields = computed(
  () =>
    value.value?.fields.map((field) => {
      const observation = value.value?.profiles.find(
        (p) => p.source && sourceKey(p.source) === sourceKey(field.source),
      )
      return observation?.status === 'available' && !live(observation.expiresAt)
        ? { ...field, status: 'expired' as const, value: null }
        : field
    }) ?? [],
)
const { run, busy, failure } = useSettingsAction(() => 'profile-read')
let request = 0
async function load() {
  value.value = undefined
  const own = ++request
  await run(
    () =>
      runtime.settings.profiles.read(
        props.principal || null,
        props.principal ? 'latest' : props.view,
        props.preview,
      ),
    (v) => {
      if (own === request) value.value = v
    },
  )
}
useSettingsFacts(() => {
  request++
  value.value = undefined
})
watch(
  () => [props.principal, props.view, props.preview],
  () => {
    void load()
  },
  { immediate: true },
)
watch(failure, (v) => {
  if (v) value.value = undefined
})
function date(value: number | null) {
  return value === null ? t('profiles.unknown') : new Date(value * 1000).toLocaleString()
}
</script>
<template>
  <section class="settings-stack">
    <UiButton :disabled="busy" @click="load">{{ t('profiles.reload') }}</UiButton>
    <UiMessage v-if="failure" tone="warning" :title="t('devices.' + failure)" />
    <p v-if="preview">{{ t('profiles.previewHelp') }}</p>
    <p>{{ t('profiles.noRefresh') }}</p>
    <template v-if="value">
      <p>
        {{ t(value.view === 'current' ? 'profiles.current' : 'profiles.latest') }} ·
        <code>{{ value.principalId }}</code>
      </p>
      <p role="status">
        {{ t('profiles.complete') }}:
        {{
          fields.filter((v) => v.required && ['available', 'redacted'].includes(v.status)).length
        }}
        / {{ value.completeness.required }} · {{ t('profiles.missingCount') }}:
        {{
          fields.filter((v) => v.required && !['available', 'redacted'].includes(v.status)).length
        }}
      </p>
      <article
        v-for="(p, index) in value.profiles"
        :key="p.snapshotId ?? index"
        class="console-panel"
      >
        <h3>
          {{
            p.source
              ? p.source.kind === 'identity_local'
                ? t('profiles.local')
                : sourceKey(p.source)
              : t('profiles.unknown')
          }}
        </h3>
        <p>
          {{
            t('profiles.' + (p.status === 'available' && !live(p.expiresAt) ? 'expired' : p.status))
          }}
          · {{ t('profiles.observed') }}: {{ date(p.observedAt) }} · {{ t('profiles.expires') }}:
          {{ date(p.expiresAt) }}
        </p>
        <p>
          {{ t('profiles.version') }}: {{ p.providerConfigVersion ?? '—' }} ·
          {{ t('profiles.revision') }}: {{ p.sourceRevision ?? '—' }}
        </p>
        <dl v-if="p.fixed && live(p.expiresAt)">
          <template v-for="(attribute, key) in p.fixed" :key="key"
            ><dt>{{ t('profiles.' + key) }}</dt>
            <dd>
              {{
                attribute.status === 'available'
                  ? typeof attribute.value === 'boolean'
                    ? t('profiles.' + String(attribute.value))
                    : attribute.value
                  : t('profiles.' + attribute.status)
              }}
            </dd></template
          >
        </dl>
      </article>
      <p v-if="!value.fields.length">{{ t('profiles.empty') }}</p>
      <dl>
        <template
          v-for="field in fields.filter((v) => preview || v.displayUse !== 'hidden')"
          :key="field.fieldId"
        >
          <dt>
            {{ field.displayName }}
            <span v-if="field.required">· {{ t('profiles.required') }}</span>
          </dt>
          <dd>
            <span>{{ t('profiles.' + field.status) }}</span>
            <pre v-if="field.status === 'available'" class="settings-public-input">{{
              jsonDisplay(field.value)
            }}</pre>
            <small>{{
              field.source.kind === 'identity_local' ? t('profiles.local') : sourceKey(field.source)
            }}</small>
          </dd>
        </template>
      </dl>
    </template>
  </section>
</template>
