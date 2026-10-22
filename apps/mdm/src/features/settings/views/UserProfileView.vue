<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import ProfilePanel from '../components/ProfilePanel.vue'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts } from '../useSettingsAction'
const { t } = useI18n(),
  view = ref<'current' | 'latest'>('current'),
  principal = ref(''),
  selected = ref('')
const { canRead } = usePermission('user_profiles_read', 'user_profiles_read')
useSettingsFacts(() => {
  principal.value = ''
  selected.value = ''
})
</script>
<template>
  <PageFrame :title="t('profiles.mine')">
    <p>{{ t('profiles.latestHelp') }}</p>
    <label for="profile-view">{{ t('profiles.source') }}</label
    ><select id="profile-view" v-model="view" class="ui-input" :disabled="!!selected">
      <option value="current">{{ t('profiles.current') }}</option>
      <option value="latest">{{ t('profiles.latest') }}</option>
    </select>
    <form v-if="canRead" class="settings-actions" @submit.prevent="selected = principal.trim()">
      <label for="profile-principal">{{ t('profiles.principal') }}</label
      ><input id="profile-principal" v-model="principal" class="ui-input" /><UiButton
        type="submit"
        >{{ t('profiles.load') }}</UiButton
      >
    </form>
    <ProfilePanel :key="selected + view" :principal="selected" :view="view" />
  </PageFrame>
</template>
