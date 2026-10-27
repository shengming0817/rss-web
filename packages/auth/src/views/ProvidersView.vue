<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useProviders } from '../useProviders'
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
        <UiButton :disabled="!!busy" type="submit" @click="run(load)">
          {{ t(loaded ? 'identity.reload' : 'identity.loadList') }}</UiButton
        ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="newProvider">
          {{ t('identity.newProvider') }}
        </UiButton>
      </div>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="ui-table-scroll">
          <table class="ui-table">
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
                  <UiButton :disabled="!!(busy || blocked)" type="submit" @click="edit(p)">
                    {{ t('identity.edit') }}</UiButton
                  ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="toggle(p)">
                    {{
                      t(p.enabled ? 'identity.disableProvider' : 'identity.enableProvider')
                    }}</UiButton
                  ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="test(p)">
                    {{ t('identity.test') }}
                  </UiButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <UiDialog
        :open="editorOpen"
        :title="t(selected ? 'identity.editProvider' : 'identity.newProvider')"
        :close-label="t('identity.cancel')"
        placement="right"
        :dismissible="!busy"
        @update:open="!$event && closeEditor()"
      >
        <p v-if="error" role="alert">{{ errorMessage }}</p>
        <form class="auth-form" @submit.prevent="save">
          <h2>{{ t(selected ? 'identity.editProvider' : 'identity.newProvider') }}</h2>
          <p>{{ t('identity.providerHelp') }}</p>
          <label for="issuer">{{ t('identity.issuer') }}</label
          ><input
            id="issuer"
            v-model="issuer"
            class="ui-input"
            type="url"
            :readonly="selected !== null"
            required
          />
          <label for="client-id">{{ t('identity.client') }}</label
          ><input id="client-id" v-model="client" class="ui-input" required />
          <label for="client-secret">{{ t('identity.clientSecret') }}</label
          ><input
            id="client-secret"
            v-model="clientSecret"
            class="ui-input"
            type="password"
            autocomplete="new-password"
            required
          />
          <label for="ca-pem">{{ t('identity.caPem') }}</label>
          <textarea id="ca-pem" v-model="caPem" class="ui-input" autocomplete="off"></textarea>
          <label for="scopes">{{ t('identity.scopes') }}</label
          ><input id="scopes" v-model="scopes" class="ui-input" required />
          <label for="profile-claim">{{ t('identity.profileClaim') }}</label
          ><input id="profile-claim" v-model="extensionsClaim" class="ui-input" />
          <label for="profile-age">{{ t('identity.profileAge') }}</label
          ><input
            id="profile-age"
            v-model.number="profileMaxAge"
            class="ui-input"
            type="number"
            min="60"
            max="86400"
            required
          />
          <label for="groups-claim">{{ t('identity.groupsClaim') }}</label
          ><input id="groups-claim" v-model="groups" class="ui-input" />
          <label v-if="session.providerHint.value" class="auth-checkbox" for="jit"
            ><input id="jit" v-model="jit" type="checkbox" />{{ t('identity.jit') }}</label
          >
          <UiButton type="submit" :disabled="!!(busy || blocked)">{{
            t('identity.save')
          }}</UiButton>
        </form>
      </UiDialog>
    </template>
    <UiDialog
      :open="pending !== null"
      :title="t('identity.disableProvider')"
      :description="`${pending?.settings.issuer ?? ''} · ${t('identity.disableProviderHelp')}`"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="!$event && (pending = null)"
    >
      <template #footer>
        <UiButton class="ui-button" type="submit" @click="pending = null">{{
          t('identity.cancel')
        }}</UiButton>
        <UiButton
          class="ui-button ui-button--primary"
          :disabled="!!busy"
          type="submit"
          @click="confirmDisable"
        >
          {{ t('identity.confirm') }}
        </UiButton>
      </template>
    </UiDialog>
  </section>
</template>
