<script setup lang="ts">
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCheckbox,
  VDialog,
  VTable,
  VTextField,
  VTextarea,
} from 'vuetify/components'
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProviders } from '../useProviders'
const dialogId = useId()
const editorActivator = ref<HTMLElement>()
const disableActivator = ref<HTMLElement>()
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
  <section class="auth-page">
    <h1>{{ t('identity.providers') }}</h1>
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
        ><VBtn
          :disabled="!!(busy || blocked)"
          type="submit"
          @click="
            ($event: MouseEvent) => {
              editorActivator = $event.currentTarget as HTMLElement
              newProvider()
            }
          "
        >
          {{ t('identity.newProvider') }}
        </VBtn>
      </div>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="auth-table-scroll">
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
                  <VBtn
                    :disabled="!!(busy || blocked)"
                    type="submit"
                    @click="
                      ($event: MouseEvent) => {
                        editorActivator = $event.currentTarget as HTMLElement
                        edit(p)
                      }
                    "
                  >
                    {{ t('identity.edit') }}</VBtn
                  ><VBtn
                    :disabled="!!(busy || blocked)"
                    type="submit"
                    @keydown.esc="!busy && (pending = null)"
                    @click="
                      ($event: MouseEvent) => {
                        disableActivator = $event.currentTarget as HTMLElement
                        toggle(p)
                      }
                    "
                  >
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
      <VDialog
        :model-value="editorOpen"
        :activator="editorActivator"
        :open-on-click="false"
        :persistent="busy"
        :aria-label="t(selected ? 'identity.editProvider' : 'identity.newProvider')"
        content-class="auth-side-dialog"
        @update:model-value="!$event && closeEditor()"
        ><VCard
          ><VCardTitle tag="h2" class="auth-dialog-heading"
            ><span>{{ t(selected ? 'identity.editProvider' : 'identity.newProvider') }}</span
            ><VBtn
              variant="text"
              :aria-label="t('identity.cancel')"
              :disabled="busy"
              @click="closeEditor()"
              >{{ t('identity.cancel') }}</VBtn
            ></VCardTitle
          ><VCardText
            ><p v-if="error" role="alert">{{ errorMessage }}</p>
            <form class="auth-form" @submit.prevent="save">
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

              <VTextarea
                id="ca-pem"
                v-model="caPem"
                autocomplete="off"
                :label="t('identity.caPem')"
                auto-grow
              />
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
                :label="t('identity.jit')"
              />
              <VBtn type="submit" :disabled="!!(busy || blocked)">{{ t('identity.save') }}</VBtn>
            </form></VCardText
          ></VCard
        ></VDialog
      >
    </template>
    <VDialog
      :model-value="pending !== null"
      :activator="disableActivator"
      :open-on-click="false"
      :persistent="true"
      :aria-label="t('identity.disableProvider')"
      :aria-describedby="`${dialogId}-2`"
      role="alertdialog"
      @update:model-value="!$event && (pending = null)"
      @keydown.esc.stop="!busy && (pending = null)"
      ><VCard
        ><VCardTitle tag="h2" class="auth-dialog-heading"
          ><span>{{ t('identity.disableProvider') }}</span
          ><VBtn
            variant="text"
            :aria-label="t('identity.cancel')"
            :disabled="busy"
            @click="pending = null"
            >{{ t('identity.cancel') }}</VBtn
          ></VCardTitle
        ><VCardText
          ><p :id="`${dialogId}-2`">
            {{ `${pending?.settings.issuer ?? ''} · ${t('identity.disableProviderHelp')}` }}
          </p></VCardText
        ><VCardActions class="auth-actions">
          <VBtn type="submit" @click="pending = null">{{ t('identity.cancel') }}</VBtn>
          <VBtn color="primary" :disabled="!!busy" type="submit" @click="confirmDisable">
            {{ t('identity.confirm') }}
          </VBtn>
        </VCardActions></VCard
      ></VDialog
    >
  </section>
</template>
