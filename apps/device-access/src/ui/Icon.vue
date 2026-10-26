<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  sync: 'M4 8a9 9 0 0 1 16-1M20 3v5h-5M20 16A9 9 0 0 1 4 17M4 21v-5h5M9 12h6',
  passkeys: 'M14 3a6 6 0 1 0 4 10l4-4-3-3-3 3M9 8h.01M7 13l-5 5v4h4l2-2v-2h2l2-2',
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  devices: 'M4 3h16v13H4zM2 20h20l-2-4H4z',
  policies:
    'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M8 2h8v4H8zM7 11h10M7 16h7',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6',
  recovery: 'M14 3a6 6 0 1 0 4 10l4-4-3-3-3 3M9 8h.01M7 13l-5 5v4h4l2-2v-2h2l2-2',
  lifecycle: 'M4 8a9 9 0 0 1 16-1M20 3v5h-5M20 16A9 9 0 0 1 4 17M4 21v-5h5',
  audit: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h4',
  integration: 'M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
  arrow: 'M5 12h14M14 7l5 5-5 5',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  moon: 'M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11',
  check: 'm5 12 4 4L19 6',
  back: 'M19 12H5m5-5-5 5 5 5',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 22v-3a9 9 0 0 1 18 0v3',
  logout: 'M9 3H4v18h5M13 8l5 4-5 4M8 12h13',
  chevron: 'm9 5 7 7-7 7',
}
</script>
<template>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.shield" />
  </svg>
</template>
