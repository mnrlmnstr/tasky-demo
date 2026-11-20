<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskStatus } from '../../api/generated/client'
import { CONTROL_CLASS } from '../ui/control'
import DropdownMenu from '../ui/DropdownMenu.vue'
import { TASK_STATUSES } from '../../api/taskStatuses'
import { STATUS_ICONS } from './taskDisplay'

const { status, busy = false, disabled = false } = defineProps<{
  /** The status the trigger shows and the menu marks as current. */
  status: TaskStatus
  /** A change is on its way to the server: the icon pulses. */
  busy?: boolean
  /** The menu still opens, but offers nothing to pick. */
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [status: TaskStatus] }>()

const { t } = useI18n()

const icon = computed(() => STATUS_ICONS[status])
const name = computed(() => t('actions.status', { status: t(`task.status.${status}`) }))
const items = computed(() =>
  TASK_STATUSES.map((value) => ({
    value,
    label: t(`task.status.${value}`),
    icon: STATUS_ICONS[value].icon,
    disabled,
  })),
)
</script>

<template>
  <DropdownMenu :items="items" :checked="status" @select="emit('select', $event)">
    <template #trigger>
      <!-- Drawn 26px for the pointer, but takes the 18px by 24px of the icon it replaces in the layout. -->
      <button
        type="button"
        data-testid="task-status"
        :aria-label="name"
        :title="name"
        :aria-busy="busy ? 'true' : undefined"
        class="-mx-1 -my-px size-[26px] shrink-0 rounded-full hover:bg-surface-muted"
        :class="CONTROL_CLASS"
      >
        <component
          :is="icon.icon"
          class="size-[18px]"
          :class="[icon.class, { 'animate-pulse': busy }]"
          aria-hidden="true"
        />
      </button>
    </template>
  </DropdownMenu>
</template>
