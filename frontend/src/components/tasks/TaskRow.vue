<script setup lang="ts">
import { Circle, CircleCheck, Contrast, Trash2 } from 'lucide-vue-next'
import { computed, inject, onBeforeUnmount, onUnmounted, ref, useTemplateRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  deleteTask,
  updateTask,
  type TaskPriority,
  type TaskRead,
  type TaskStatus,
} from '../../api/generated/client'
import { failureKind } from '../../api/http'
import { useClock } from '../../i18n/clock'
import { formatDateTime, formatRelativeTime, isPast } from '../../i18n/dates'
import { useTaskFormStore } from '../../stores/taskForm'
import { useTasksStore } from '../../stores/tasks'
import { useUndoStore } from '../../stores/undo'
import { offerUndoOfStatusChange } from '../../stores/undoActions'
import AlertDialog from '../ui/AlertDialog.vue'
import Badge, { type BadgeTone } from '../ui/Badge.vue'
import { CONTROL_CLASS, FOCUS_RING_CLASS } from '../ui/control'
import DropdownMenu from '../ui/DropdownMenu.vue'
import IconButton from '../ui/IconButton.vue'
import { FOCUS_TASK_LIST } from './listFocus'

// In the order the status menu lists them.
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done']

const STATUS_ICONS: Record<TaskStatus, { icon: Component; class: string }> = {
  todo: { icon: Circle, class: 'text-text-muted' },
  in_progress: { icon: Contrast, class: 'text-accent-text' },
  done: { icon: CircleCheck, class: 'text-success-text' },
}

// Only high priority gets a colour: three colours side by side would read as a traffic light.
const PRIORITY_TONES: Record<TaskPriority, BadgeTone> = {
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
}

const { task } = defineProps<{ task: TaskRead }>()

const { t, locale } = useI18n()
const clock = useClock()

const tasks = useTasksStore()
const undo = useUndoStore()

// The status picked from the menu: the row shows it at once, ahead of the list, whose next answer takes over.
const pickedStatus = ref<TaskStatus | null>(null)
const isChangingStatus = ref(false)
const isConfirmingDelete = ref(false)
const isDeleting = ref(false)

// One request per row at a time: the controls stay focusable meanwhile, but do nothing.
const isBusy = computed(() => isChangingStatus.value || isDeleting.value)

const status = computed(() => pickedStatus.value ?? task.status)
const statusIcon = computed(() => STATUS_ICONS[status.value])
const isDone = computed(() => status.value === 'done')

const statusName = computed(() => t('actions.status', { status: t(`task.status.${status.value}`) }))
const statusItems = computed(() =>
  STATUS_ORDER.map((value) => ({
    value,
    label: t(`task.status.${value}`),
    icon: STATUS_ICONS[value].icon,
    disabled: isBusy.value,
  })),
)

// A new answer of the list knows better than the pick, unless the pick is still on its way to the server.
watch(
  () => task,
  () => {
    if (!isChangingStatus.value) pickedStatus.value = null
  },
)

async function changeStatus(next: TaskStatus): Promise<void> {
  if (next === status.value) return
  // As the row showed it, which is not the list's copy when the reload after an earlier change failed.
  const before: TaskRead = { ...task, status: status.value }
  pickedStatus.value = next
  isChangingStatus.value = true
  try {
    const after = await updateTask(task.id, { status: next })
    // The task may no longer match the filter, or sort elsewhere.
    tasks.retry()
    offerUndoOfStatusChange(before, after)
  } catch (failure) {
    pickedStatus.value = before.status
    const kind = failureKind(failure)
    // The task is gone, so the row should go too.
    if (kind === 'not_found') tasks.retry()
    undo.notifyError(kind)
  } finally {
    isChangingStatus.value = false
  }
}

function askToDelete(): void {
  if (!isBusy.value) isConfirmingDelete.value = true
}

// Not undoable, which is why it is confirmed first. The row stays dimmed until the server has deleted
// the task, then leaves the list at once; the reload that follows fills the page up again.
async function deleteConfirmed(): Promise<void> {
  isDeleting.value = true
  try {
    await deleteTask(task.id)
  } catch (failure) {
    const kind = failureKind(failure)
    // Deleted by someone else in the meantime: that is the outcome the user asked for.
    if (kind !== 'not_found') {
      isDeleting.value = false
      undo.notifyError(kind)
      return
    }
  }
  tasks.forget(task.id)
  tasks.retry()
}

const row = useTemplateRef<HTMLElement>('row')
const focusList = inject(FOCUS_TASK_LIST, null)

// Whether the focus is nowhere, or in a menu or dialog: one of this row's own, when the row was just acted on.
function isFocusAdrift(): boolean {
  const focused = document.activeElement as Element
  return focused === document.body || focused.closest('[role="menu"], [role="alertdialog"]') !== null
}

// A row that goes away while it holds the focus would drop it to the top of the page. The focus may
// also still be in the row's closing menu or dialog, which hands it back to a trigger that is gone
// by then, or that is fading out with the row.
let leavesWithFocus = false

onBeforeUnmount(() => {
  const element = row.value as HTMLElement
  const wasActedOn = isDeleting.value || pickedStatus.value !== null
  leavesWithFocus = element.contains(document.activeElement) || (wasActedOn && isFocusAdrift())
  if (focusList !== null) element.addEventListener('focusin', focusList)
})

// Only now: an overlay that is still open traps the focus until it is taken down with the row.
onUnmounted(() => {
  if (leavesWithFocus) focusList?.()
})

// A deadline that cannot be read is shown like no deadline at all.
const deadline = computed(() =>
  task.deadline === null
    ? null
    : formatDateTime(task.deadline, locale.value, { timeZone: clock.timeZone }) || null,
)

// Read by the same parser as the text above, so the mark never disagrees with the date next to it.
const isOverdue = computed(() => task.deadline !== null && !isDone.value && isPast(task.deadline, clock.now()))

const createdAgo = computed(() => formatRelativeTime(task.created_at, clock.now(), locale.value))
const createdAt = computed(() => formatDateTime(task.created_at, locale.value, { timeZone: clock.timeZone }))
</script>

<template>
  <div
    ref="row"
    class="row flex gap-3 py-3 transition-opacity"
    :class="{ 'opacity-50': isDeleting }"
    :aria-busy="isDeleting ? 'true' : undefined"
  >
    <DropdownMenu :items="statusItems" :checked="status" @select="changeStatus">
      <template #trigger>
        <!-- Drawn 26px for the pointer, but takes the 18px by 24px of the icon it replaces in the layout. -->
        <button
          type="button"
          data-testid="task-status"
          :aria-label="statusName"
          :title="statusName"
          :aria-busy="isChangingStatus ? 'true' : undefined"
          class="-mx-1 -my-px size-[26px] shrink-0 rounded-full hover:bg-surface-muted"
          :class="CONTROL_CLASS"
        >
          <component
            :is="statusIcon.icon"
            class="size-[18px]"
            :class="[statusIcon.class, { 'animate-pulse': isChangingStatus }]"
            aria-hidden="true"
          />
        </button>
      </template>
    </DropdownMenu>
    <div class="min-w-0 flex-1">
      <div class="flex items-start gap-3">
        <p
          data-testid="task-title"
          class="min-w-0 flex-1 text-[15px] leading-6 font-medium wrap-anywhere"
          :class="{ 'text-text-muted': isDone }"
        >
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
        <Badge :tone="PRIORITY_TONES[task.priority]" class="mt-0.5 shrink-0">
          {{ t(`task.priority.${task.priority}`) }}
        </Badge>
        <IconButton
          :label="t('actions.delete')"
          :aria-disabled="isBusy ? 'true' : undefined"
          class="row-action -my-1 -mr-1.5 size-8! shrink-0 transition-opacity hover:text-danger-text! [&>svg]:size-4!"
          @click="askToDelete"
        >
          <Trash2 aria-hidden="true" />
        </IconButton>
        <AlertDialog
          v-model:open="isConfirmingDelete"
          :title="t('actions.deleteTitle', { title: task.title })"
          :description="t('actions.deleteDescription')"
          :cancel-label="t('actions.cancel')"
          :confirm-label="t('actions.deleteConfirm')"
          @confirm="deleteConfirmed"
        />
      </div>
      <p class="mt-0.5 flex flex-wrap gap-x-4 text-[13px] leading-5 text-text-muted">
        <span data-testid="task-deadline" :class="{ 'text-danger-text': isOverdue }">
          <template v-if="deadline === null">
            <span aria-hidden="true">—</span>
            <span class="sr-only">{{ t('task.noDeadline') }}</span>
          </template>
          <template v-else>
            {{ t('task.due', { date: deadline }) }}
            <template v-if="isOverdue"> · {{ t('task.overdue') }}</template>
          </template>
        </span>
        <span>
          <time :datetime="task.created_at" :title="createdAt">
            {{ t('task.created', { date: createdAgo }) }}
          </time>
          <!-- The tooltip needs a pointer; this says the same to a screen reader. -->
          <span data-testid="task-created-at" class="sr-only">{{ createdAt }}</span>
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* With a pointer that hovers and room to aim, the delete button waits for the row to be pointed at or focused. */
@media (hover: hover) and (min-width: 40rem) {
  .row-action {
    opacity: 0;
  }

  .row:hover .row-action,
  .row:focus-within .row-action {
    opacity: 1;
  }
}
</style>
