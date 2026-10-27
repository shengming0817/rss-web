<script setup lang="ts">
import { VBtn, VCheckbox, VForm, VTable, VTextField, VTextarea } from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { useI18n } from 'vue-i18n'
import { useProviders } from '@rss/auth'
import MdmPage from '../../../ui/MdmPage.vue'
const { t } = useI18n()
const {
  session,
  busy,
  error,
  errorMessage,
  run,
  blocked,
  editorOpen,
  newProvider,
  closeEditor,
  rows,
  loaded,
  selected,
  report,
  pending,
  issuer,
  client,
  clientSecret,
  caPem,
  scopes,
  extensionsClaim,
  profileMaxAge,
  groups,
  jit,
  edit,
  load,
  save,
  toggle,
  confirmDisable,
  test,
} = useProviders()
</script>
<template>
  <MdmPage :title="t('identity.providers')" :busy="busy">
    <p v-if="error" role="alert">{{ errorMessage }}</p>
    <p v-if="report" role="status">{{ report }}</p>
    <p v-if="session.state.value.navigation !== 'ready'" role="status">
      {{ t('identity.navigationUnavailable') }}
    </p>
    <p v-else-if="!session.providerHint.value">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else
      ><div class="auth-actions">
        <VBtn :disabled="!!busy" type="submit" @click="run(load)">
          {{ t(loaded ? 'identity.reload' : 'identity.loadList') }}</VBtn
        ><VBtn :disabled="!!(busy || blocked)" type="submit" @click="newProvider">
          {{ t('identity.newProvider') }}
        </VBtn>
      </div>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="ui-table-scroll">
          <VTable>
            <thead>
              <tr>
                <th>{{ t('identity.issuer') }}</th>
                <th>{{ t('identity.state') }}</th>
                <th>{{ t('identity.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in rows" :key="p.id">
                <td>
                  {{ p.settings.issuer }}<small>{{ p.id }}</small>
                </td>
                <td>
                  {{ t(p.enabled ? 'identity.enabled' : 'identity.disabled') }} · v{{ p.version }}
                </td>
                <td class="auth-actions">
                  <VBtn :disabled="!!(busy || blocked)" type="submit" @click="edit(p)">
                    {{ t('identity.edit') }}</VBtn
                  ><VBtn :disabled="!!(busy || blocked)" type="submit" @click="toggle(p)">
                    {{
                      t(p.enabled ? 'identity.disableProvider' : 'identity.enableProvider')
                    }}</VBtn
                  ><VBtn :disabled="!!(busy || blocked)" type="submit" @click="test(p)">
                    {{ t('identity.test') }}
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </div>
      </div>
      <OperationDialog
        :open="editorOpen"
        :title="t(selected ? 'identity.editProvider' : 'identity.newProvider')"
        :close-label="t('identity.cancel')"
        placement="right"
        :dismissible="!busy"
        @update:open="!$event && closeEditor()"
      >
        <p v-if="error" role="alert">{{ errorMessage }}</p>
        <VForm
          :disabled="busy"
          class="auth-form"
          @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (save())"
        >
          <h2>{{ t(selected ? 'identity.editProvider' : 'identity.newProvider') }}</h2>
          <p>{{ t('identity.providerHelp') }}</p>
          <VTextField
            id="issuer"
            v-model="issuer"
            type="url"
            :readonly="selected !== null"
            required
            :label="t('identity.issuer')"
          />
          <VTextField id="client-id" v-model="client" required :label="t('identity.client')" />
          <VTextField
            id="client-secret"
            v-model="clientSecret"
            type="password"
            autocomplete="new-password"
            required
            :label="t('identity.clientSecret')"
          />
          <VTextarea id="ca-pem" v-model="caPem" autocomplete="off" :label="t('identity.caPem')" />
          <VTextField id="scopes" v-model="scopes" required :label="t('identity.scopes')" />
          <VTextField
            id="profile-claim"
            v-model="extensionsClaim"
            :label="t('identity.profileClaim')"
          />
          <VTextField
            id="profile-age"
            v-model.number="profileMaxAge"
            type="number"
            min="60"
            max="86400"
            required
            :label="t('identity.profileAge')"
          />
          <VTextField id="groups-claim" v-model="groups" :label="t('identity.groupsClaim')" />
          <VCheckbox
            v-if="session.providerHint.value"
            id="jit"
            v-model="jit"
            class="auth-checkbox"
            :label="t('identity.jit')"
          />
          <VBtn type="submit" :disabled="!!(busy || blocked)">{{ t('identity.save') }}</VBtn>
        </VForm>
      </OperationDialog>
    </template>
    <OperationDialog
      :open="pending !== null"
      :title="t('identity.disableProvider')"
      :description="`${pending?.settings.issuer ?? ''} · ${t('identity.disableProviderHelp')}`"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="!$event && (pending = null)"
    >
      <template #footer>
        <VBtn class="ui-button" type="submit" @click="pending = null">{{
          t('identity.cancel')
        }}</VBtn>
        <VBtn
          class="ui-button ui-button--primary"
          :disabled="!!busy"
          type="submit"
          @click="confirmDisable"
        >
          {{ t('identity.confirm') }}
        </VBtn>
      </template>
    </OperationDialog>
  </MdmPage>
</template>
