<script setup lang="ts">
import { Ellipsis, Trash2 } from 'lucide-vue-next'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskRead } from '../../../api/generated/client'
import { useSettingsStore } from '../../../stores/settings'
import { useTaskFormStore } from '../../../stores/taskForm'
import Badge from '../../ui/Badge.vue'
import { FOCUS_RING_CLASS } from '../../ui/control'
import DropdownMenu from '../../ui/DropdownMenu.vue'
import IconButton from '../../ui/IconButton.vue'
import { useFocusOnLeave, useStatusChange, useTaskDelete } from '../taskActions'
import TaskDeleteConfirm from '../TaskDeleteConfirm.vue'
import { PRIORITY_TONES, useTaskDates } from '../taskDisplay'
import TaskStatusMenu from '../TaskStatusMenu.vue'

const { task } = defineProps<{ task: TaskRead }>()

const { t } = useI18n()
const settings = useSettingsStore()

const { pickedStatus, isChangingStatus, status, changeStatus } = useStatusChange(() => task)
const { isConfirmingDelete, isDeleting, askToDelete, deleteConfirmed } = useTaskDelete(
  () => task,
  () => isChangingStatus.value,
)
const isBusy = computed(() => isChangingStatus.value || isDeleting.value)

const { deadline, isOverdue, createdAgo, createdAt } = useTaskDates(() => task, status)

const cellClass = computed(() => (settings.density === 'compact' ? 'py-1' : 'py-2.5'))

const actions = computed(() => [{ value: 'delete' as const, label: t('actions.delete'), icon: Trash2 }])

useFocusOnLeave(useTemplateRef<HTMLElement>('row'), () => isDeleting.value || pickedStatus.value !== null)
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
    <td class="pr-4 font-medium" :class="cellClass">
      <p data-testid="task-title" class="wrap-anywhere" :class="{ 'text-text-muted': status === 'done' }">
        <button
          type="button"
          :aria-label="t('form.editTask', { title: task.title })"
          class="cursor-pointer rounded-item text-left decoration-text-muted underline-offset-4 hover:underline"
          :class="FOCUS_RING_CLASS"
          @click="useTaskFormStore().openEdit(task)"
        >
          {{ task.title }}
        </button>
      </p>
    </td>
    <td class="pr-4" :class="cellClass">
      <Badge :tone="PRIORITY_TONES[task.priority]">{{ t(`task.priority.${task.priority}`) }}</Badge>
    </td>
    <td class="pr-4 whitespace-nowrap text-text-muted" :class="cellClass">
      <span data-testid="task-deadline" :class="{ 'text-danger-text': isOverdue }">
        <template v-if="deadline === null">
          <span aria-hidden="true">—</span>
          <span class="sr-only">{{ t('task.noDeadline') }}</span>
        </template>
        <template v-else>
          {{ deadline }}
          <template v-if="isOverdue"> · {{ t('task.overdue') }}</template>
        </template>
      </span>
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
