<script setup lang="ts">
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { CONTROL_CLASS } from '../ui/control'
import DropdownMenu from '../ui/DropdownMenu.vue'

// The classes a card or row gives the menu are for its button.
defineOptions({ inheritAttrs: false })

const {
  title,
  canMoveUp,
  canMoveDown,
  busy = false,
  handle = false,
} = defineProps<{
  /** The task's title, for the button's name. */
  title: string
  canMoveUp: boolean
  canMoveDown: boolean
  /** The task is busy with a change: the menu still opens, but offers nothing to pick. */
  busy?: boolean
  /** The button is also what the task is dragged by (a list row); on a card the whole card is. */
  handle?: boolean
}>()

const emit = defineEmits<{
  /** One place up (-1) or down (1) in the custom order: the keyboard way of dragging. */
  move: [delta: -1 | 1]
  dragstart: [event: DragEvent]
  dragend: []
}>()

const { t } = useI18n()

const name = computed(() => t('actions.move', { title }))
const items = computed(() => [
  { value: 'up' as const, label: t('actions.moveUp'), icon: ArrowUp, disabled: busy || !canMoveUp },
  { value: 'down' as const, label: t('actions.moveDown'), icon: ArrowDown, disabled: busy || !canMoveDown },
])

// The menu opens on a click, which a drag never ends in, so one button serves both.
function startDrag(event: DragEvent): void {
  if (handle) emit('dragstart', event)
}
</script>

<template>
  <DropdownMenu :items="items" @select="emit('move', $event === 'up' ? -1 : 1)">
    <template #trigger>
      <button
        v-bind="$attrs"
        type="button"
        data-testid="task-move"
        :aria-label="name"
        :title="name"
        :draggable="handle ? !busy : undefined"
        :aria-busy="busy ? 'true' : undefined"
        class="grid size-8 shrink-0 place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
        :class="[CONTROL_CLASS, handle && !busy ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
        @dragstart="startDrag"
        @dragend="emit('dragend')"
      >
        <GripVertical class="size-4" aria-hidden="true" />
      </button>
    </template>
  </DropdownMenu>
</template>
