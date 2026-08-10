<script setup lang="ts">
import { ErrorPage } from '@rss/core'
import { useRouter } from 'vue-router'

const router = useRouter()
const notFound = Object.freeze({
  kind: 'notFound' as const,
  code: 'WEB_NOT_FOUND',
  retryable: false,
  recovery: 'home' as const,
})
</script>

<template>
  <ErrorPage :error="notFound" @recover="router.replace({ name: 'home' })" />
</template>
