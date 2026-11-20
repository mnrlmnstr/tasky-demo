<script setup lang="ts">
import { Ellipsis, Trash2 } from 'lucide-vue-next'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead } from '../../../api/generated/client'
import { useSettingsStore } from '../../../stores/settings'
import { usePriorityChange, useStatusChange, useTaskDelete } from '../../../stores/taskActions'
import DropdownMenu from '../../ui/DropdownMenu.vue'
import IconButton from '../../ui/IconButton.vue'
import PriorityMenu from '../PriorityMenu.vue'
import { useFocusOnLeave } from '../focusOnLeave'
import TaskDeadline from '../TaskDeadline.vue'
import TaskDeleteConfirm from '../TaskDeleteConfirm.vue'
import { useTaskDates } from '../taskDisplay'
import TaskStatusMenu from '../TaskStatusMenu.vue'
import TaskTitleButton from '../TaskTitleButton.vue'

const { task } = defineProps<{ task: TaskRead }>()

const { t } = useI18n()
const settings = useSettingsStore()

const { pickedStatus, isChangingStatus, status, changeStatus } = useStatusChange(() => task)
const { pickedPriority, isChangingPriority, priority, changePriority } = usePriorityChange(() => task)
const { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed } = useTaskDelete(
  () => task,
  () => isChangingStatus.value || isChangingPriority.value,
)
const isBusy = computed(() => isChangingStatus.value || isChangingPriority.value || isDeleting.value)

const { deadline, isOverdue, createdAgo, createdAt } = useTaskDates(() => task, status)

const cellClass = computed(() => (settings.density === 'compact' ? 'py-1' : 'py-2.5'))

const actions = computed(() => [{ value: 'delete' as const, label: t('actions.delete'), icon: Trash2 }])

useFocusOnLeave(useTemplateRef<HTMLElement>('row'), () => isDeleting.value || pickedStatus.value !== null || pickedPriority.value !== null)
</script>

<template>
  <tr
    ref="row"
    class="transition-opacity"
    :class="{ 'opacity-50': isDeleting }"
    :aria-busy="isDeleting ? 'true' : undefined"
  >
    <td class="w-10 pr-2 pl-1 align-middle" :class="cellClass">
      <span class="flex h-6 items-center">
        <TaskStatusMenu :status="status" :busy="isChangingStatus" :disabled="isBusy" @select="changeStatus" />
      </span>
    </td>
    <td class="min-w-48 pr-4 font-medium" :class="cellClass">
      <TaskTitleButton :task="task" :done="status === 'done'" />
    </td>
    <td class="pr-4" :class="cellClass">
      <PriorityMenu :priority="priority" :busy="isChangingPriority" :disabled="isBusy" @select="changePriority" />
    </td>
    <td class="pr-4 whitespace-nowrap text-text-muted" :class="cellClass">
      <TaskDeadline :deadline="deadline" :overdue="isOverdue" icon />
    </td>
    <td class="pr-2 whitespace-nowrap text-text-muted" :class="cellClass">
      <time :datetime="task.created_at" :title="createdAt">{{ createdAgo }}</time>{{ " " }}
      <span data-testid="task-created-at" class="sr-only">{{ createdAt }}</span>
    </td>
    <td class="w-10 text-right" :class="cellClass">
      <DropdownMenu :items="actions" @select="askToDelete">
        <template #trigger>
          <IconButton
            :label="t('table.rowActions', { title: task.title })"
            :aria-disabled="isBusy ? 'true' : undefined"
            class="-my-1 size-8! [&>svg]:size-4!"
          >
            <Ellipsis aria-hidden="true" />
          </IconButton>
        </template>
      </DropdownMenu>
      <TaskDeleteConfirm v-model:open="isConfirmingDelete" :title="task.title" @confirm="deleteConfirmed" />
    </td>
  </tr>
</template>
