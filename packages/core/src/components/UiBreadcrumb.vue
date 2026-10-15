<script setup lang="ts">
defineProps<{ label: string; items: readonly { label: string; href?: string }[] }>()
</script>
<template>
  <nav :aria-label="label" class="ui-breadcrumb">
    <ol>
      <li v-for="(item, index) in items" :key="index">
        <span v-if="index" aria-hidden="true" class="ui-muted">/</span
        ><slot name="item" :item="item" :current="index === items.length - 1"
          ><a v-if="item.href && index !== items.length - 1" :href="item.href">{{ item.label }}</a
          ><span v-else :aria-current="index === items.length - 1 ? 'page' : undefined">{{
            item.label
          }}</span></slot
        >
      </li>
    </ol>
  </nav>
</template>
