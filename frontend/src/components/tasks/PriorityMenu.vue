<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskPriority } from '../../api/generated/client'
import { TASK_PRIORITIES } from '../../api/taskPriorities'
import Badge from '../ui/Badge.vue'
import { FOCUS_RING_CLASS } from '../ui/control'
import DropdownMenu from '../ui/DropdownMenu.vue'
import { PRIORITY_TONES } from './taskDisplay'

// The classes a row gives the badge are for the button that now holds it.
defineOptions({ inheritAttrs: false })

const { priority, busy = false, disabled = false } = defineProps<{
  /** The priority the badge shows and the menu marks as current. */
  priority: TaskPriority
  /** A change of the priority is on its way to the server: the trigger says so and offers nothing. */
  busy?: boolean
  /** The menu still opens, but offers nothing to pick: the task is busy with something else. */
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [priority: TaskPriority] }>()

const { t } = useI18n()

const name = computed(() => t('actions.priority', { priority: t(`task.priority.${priority}`) }))
const items = computed(() =>
  TASK_PRIORITIES.map((value) => ({ value, label: t(`task.priority.${value}`), disabled: busy || disabled })),
)
</script>

<template>
  <DropdownMenu :items="items" :checked="priority" @select="emit('select', $event)">
    <template #trigger>
      <!--
        Draggable only to cancel the drag at once: a drag that starts here would otherwise be the drag of
        the board card around it.
      -->
      <button
        v-bind="$attrs"
        type="button"
        data-testid="task-priority"
        draggable="true"
        :aria-label="name"
        :title="name"
        :aria-busy="busy ? 'true' : undefined"
        :aria-disabled="busy ? 'true' : undefined"
        class="group/priority inline-flex shrink-0 rounded-full"
        :class="[FOCUS_RING_CLASS, busy ? 'cursor-progress' : 'cursor-pointer']"
        @dragstart.stop.prevent
      >
        <!-- On hover the tone's own text colour deepens the background, which reads in both themes. -->
        <Badge
          :tone="PRIORITY_TONES[priority]"
          class="transition-colors group-hover/priority:bg-[color-mix(in_oklab,currentColor_16%,var(--color-surface))] group-focus-visible/priority:bg-[color-mix(in_oklab,currentColor_16%,var(--color-surface))] group-aria-expanded/priority:bg-[color-mix(in_oklab,currentColor_16%,var(--color-surface))]"
          :class="{ 'animate-pulse': busy }"
        >
          {{ t(`task.priority.${priority}`) }}
          <ChevronDown
            class="-mr-0.5 size-3 opacity-0 transition-opacity group-hover/priority:opacity-100 group-focus-visible/priority:opacity-100 group-aria-expanded/priority:opacity-100"
            aria-hidden="true"
          />
        </Badge>
      </button>
    </template>
  </DropdownMenu>
</template>
