<script setup lang="ts">
import { h, defineComponent, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DependencyTreeNode } from '../../composables/useDepsGraph'

defineProps<{
  forest: readonly DependencyTreeNode[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const CAPTION_ID = 'deps-tree-caption'

const { t } = useI18n()

// Inline recursive subtree renderer — avoids a separate file and the
// multiple-default-export problem from dual <script> blocks.
const DepsTreeSubtree = defineComponent({
  name: 'DepsTreeSubtree',
  props: {
    nodes: {
      type: Array as PropType<readonly DependencyTreeNode[]>,
      required: true,
    },
  },
  emits: {
    select: (id: string) => typeof id === 'string',
  },
  setup(subtreeProps, { emit: subtreeEmit }) {
    function renderNode(node: DependencyTreeNode): ReturnType<typeof h> {
      if (node.children.length > 0) {
        return h('li', { class: 'deps-tree__item' }, [
          h('details', { open: true, class: 'deps-tree__details' }, [
            h('summary', { class: 'deps-tree__summary' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: 'deps-tree__node-btn',
                  onClick: (ev: MouseEvent) => {
                    ev.stopPropagation()
                    subtreeEmit('select', node.id)
                  },
                },
                [h('span', { class: 'deps-tree__mono' }, node.id)],
              ),
            ]),
            h(DepsTreeSubtree, {
              nodes: node.children,
              onSelect: (id: string) => subtreeEmit('select', id),
            }),
          ]),
        ])
      }
      return h('li', { class: 'deps-tree__item' }, [
        h(
          'button',
          {
            type: 'button',
            class: 'deps-tree__node-btn deps-tree__node-btn--leaf',
            onClick: () => subtreeEmit('select', node.id),
          },
          [h('span', { class: 'deps-tree__mono' }, node.id)],
        ),
        h('span', { class: 'sr-only' }, t('deps.tree.leaf')),
      ])
    }

    return () =>
      h(
        'ul',
        { class: 'deps-tree__subtree' },
        subtreeProps.nodes.map((n) => renderNode(n)),
      )
  },
})
</script>

<template>
  <section class="deps-tree" :aria-labelledby="CAPTION_ID">
    <p :id="CAPTION_ID" class="deps-tree__caption">{{ t('deps.tree.caption') }}</p>
    <ul class="deps-tree__root-list">
      <li v-for="node in forest" :key="node.id" class="deps-tree__item">
        <template v-if="node.children.length > 0">
          <details open class="deps-tree__details">
            <summary class="deps-tree__summary">
              <button
                type="button"
                class="deps-tree__node-btn"
                @click.stop="emit('select', node.id)"
              >
                <span class="deps-tree__mono">{{ node.id }}</span>
              </button>
            </summary>
            <DepsTreeSubtree :nodes="node.children" @select="emit('select', $event)" />
          </details>
        </template>
        <template v-else>
          <button
            type="button"
            class="deps-tree__node-btn deps-tree__node-btn--leaf"
            @click="emit('select', node.id)"
          >
            <span class="deps-tree__mono">{{ node.id }}</span>
          </button>
          <span class="sr-only">{{ t('deps.tree.leaf') }}</span>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.deps-tree {
  font-size: var(--text-base);
}

.deps-tree__caption {
  font-size: var(--text-sm);
  color: var(--fg-muted);
  font-weight: 500;
  margin: 0 0 8px;
}

.deps-tree__root-list,
:deep(.deps-tree__subtree) {
  list-style: none;
  margin: 0;
  padding: 0;
}

:deep(.deps-tree__subtree) {
  margin-left: 20px;
  border-left: 1px solid var(--line-soft);
  padding-left: 12px;
}

.deps-tree__item {
  margin: 4px 0;
}

.deps-tree__summary {
  list-style: none;
  cursor: default;
}

.deps-tree__summary::-webkit-details-marker {
  display: none;
}

.deps-tree__node-btn {
  background: none;
  border: none;
  padding: 2px 4px;
  cursor: pointer;
  color: var(--fg);
  border-radius: var(--r-sm);
  font-size: var(--text-base);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.deps-tree__node-btn:hover {
  background: var(--bg-sunken);
}

.deps-tree__node-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.deps-tree__mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .deps-tree__node-btn {
    transition: none;
  }
}
</style>
