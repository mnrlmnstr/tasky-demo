<script setup lang="ts">
import { Circle, CircleCheck, Contrast } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskPriority, TaskRead, TaskStatus } from '../../api/generated/client'
import { formatDateTime, formatRelativeTime } from '../../i18n/dates'
import Badge, { type BadgeTone } from '../ui/Badge.vue'
import { useClock } from './clock'

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

const statusIcon = computed(() => STATUS_ICONS[task.status])
const isDone = computed(() => task.status === 'done')

const deadline = computed(() =>
  task.deadline === null ? null : formatDateTime(task.deadline, locale.value, { timeZone: clock.timeZone }),
)

const isOverdue = computed(
  () => task.deadline !== null && !isDone.value && new Date(task.deadline).getTime() < clock.now().getTime(),
)

const createdAgo = computed(() => formatRelativeTime(task.created_at, clock.now(), locale.value))
const createdAt = computed(() => formatDateTime(task.created_at, locale.value, { timeZone: clock.timeZone }))
</script>

<template>
  <div class="flex gap-3 py-3">
    <span role="img" :aria-label="t(`task.status.${task.status}`)" class="flex h-6 shrink-0 items-center">
      <component :is="statusIcon.icon" class="size-[18px]" :class="statusIcon.class" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex items-start gap-3">
        <p
          data-testid="task-title"
          class="min-w-0 flex-1 text-[15px] leading-6 font-medium wrap-anywhere"
          :class="{ 'text-text-muted': isDone }"
        >
          {{ task.title }}
        </p>
        <Badge :tone="PRIORITY_TONES[task.priority]" class="mt-0.5 shrink-0">
          {{ t(`task.priority.${task.priority}`) }}
        </Badge>
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
        <time :datetime="task.created_at" :title="createdAt">
          {{ t('task.created', { date: createdAgo }) }}
        </time>
      </p>
    </div>
  </div>
</template>
