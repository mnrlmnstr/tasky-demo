import { Circle, CircleCheck, Contrast } from 'lucide-vue-next'
import { computed, type Component, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskPriority, TaskRead, TaskStatus } from '../../api/generated/client'
import { useClock } from '../../i18n/clock'
import { formatDateTime, formatRelativeTime, isPast } from '../../i18n/dates'
import type { BadgeTone } from '../ui/Badge.vue'

export const STATUS_ICONS: Record<TaskStatus, { icon: Component; class: string }> = {
  todo: { icon: Circle, class: 'text-text-muted' },
  in_progress: { icon: Contrast, class: 'text-accent-text' },
  done: { icon: CircleCheck, class: 'text-success-text' },
}

// Only high priority gets a colour: three colours side by side would read as a traffic light.
export const PRIORITY_TONES: Record<TaskPriority, BadgeTone> = {
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
}

/** The deadline and creation time of a task, written for the language and the clock's zone. */
export function useTaskDates(task: () => TaskRead, status: Ref<TaskStatus>) {
  const { locale } = useI18n()
  const clock = useClock()

  // A deadline that cannot be read is shown like no deadline at all.
  const deadline = computed(() => {
    const value = task().deadline
    return value === null ? null : formatDateTime(value, locale.value, { timeZone: clock.timeZone }) || null
  })

  // Read by the same parser as the text above, so the mark never disagrees with the date next to it.
  const isOverdue = computed(() => {
    const value = task().deadline
    return value !== null && status.value !== 'done' && isPast(value, clock.now())
  })

  const createdAgo = computed(() => formatRelativeTime(task().created_at, clock.now(), locale.value))
  const createdAt = computed(() => formatDateTime(task().created_at, locale.value, { timeZone: clock.timeZone }))

  return { deadline, isOverdue, createdAgo, createdAt }
}
