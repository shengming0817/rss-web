<script setup lang="ts">
import { VBtn, VForm, VSelect, VTextField } from 'vuetify/components'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
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
  <MdmPage :title="t('profiles.mine')">
    <p>{{ t('profiles.latestHelp') }}</p>
    <VSelect
      id="profile-view"
      v-model="view"
      :disabled="!!selected"
      :items="[
        { title: t('profiles.current'), value: 'current' },
        { title: t('profiles.latest'), value: 'latest' },
      ]"
      :label="t('profiles.source')"
    />
    <VForm v-if="canRead" class="settings-actions" @submit.prevent="selected = principal.trim()">
      <VTextField
        id="profile-principal"
        v-model="principal"
        :label="t('profiles.principal')"
      /><VBtn type="submit">{{ t('profiles.load') }}</VBtn>
    </VForm>
    <ProfilePanel :key="selected + view" :principal="selected" :view="view" />
  </MdmPage>
</template>
