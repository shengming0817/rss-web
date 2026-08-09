<script setup lang="ts">
import { useDecision } from '../pdp/useDecision'

const props = withDefaults(
  defineProps<{
    /** 操作名，例如 'read' / 'write' / 'delete' */
    action: string
    /** 资源标识，例如 'cell:123'（可选） */
    resource?: string
    /**
     * 权限不足时的行为：
     * - 'hide'（默认）：隐藏默认 slot，显示可选 #denied fallback
     * - 'disable'：始终渲染默认 slot，但包一层 aria-disabled + inert + pointer-events:none
     */
    mode?: 'hide' | 'disable'
  }>(),
  {
    mode: 'hide',
  },
)

defineSlots<{
  /** 主内容；通过 scoped slot 传入 { allowed: boolean } */
  default(props: { allowed: boolean }): unknown
  /** 可选降级内容，仅在 mode='hide' 且 denied 时渲染 */
  denied(): unknown
}>()

const allowed = useDecision(
  () => props.action,
  () => props.resource,
)
</script>

<template>
  <!-- mode=hide: 仅在 allowed 时渲染 default slot，否则渲染可选 #denied -->
  <template v-if="mode === 'hide'">
    <slot v-if="allowed" :allowed="allowed" />
    <slot v-else name="denied" />
  </template>

  <!-- mode=disable: 始终渲染，denied 时包一层 inert 容器 -->
  <template v-else-if="mode === 'disable'">
    <!-- allowed: 直接渲染，不加任何包装 -->
    <slot v-if="allowed" :allowed="allowed" />
    <!--
      denied: 包一层 <div> 实现 aria-disabled + inert。
      role="group" 给 aria-disabled 提供语义上下文。
      pointer-events 和透明度用 CSS 变量，禁 inline color / 魔法数字。
    -->
    <div v-else role="group" aria-disabled="true" inert class="gc-can-disabled">
      <slot :allowed="allowed" />
    </div>
  </template>
</template>

<style scoped>
/*
  denied 容器：pointer-events 禁用 + 降透明度。
  只用 tokens.css 暴露的 CSS 变量，禁魔法数字 / inline color。
  cursor: not-allowed 是死代码（pointer-events:none + inert 下永不触发），已删除。
*/
.gc-can-disabled {
  pointer-events: none;
  opacity: var(--opacity-disabled);
}
</style>
