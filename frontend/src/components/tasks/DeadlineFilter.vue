<script setup lang="ts">
import { fromDate, parseDate, startOfWeek, toCalendarDate, type DateValue } from '@internationalized/date'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
  type DateRange,
} from 'reka-ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { clockTimeZone, useClock } from '../../i18n/clock'
import { formatDays } from '../../i18n/dates'
import { useListViewStore } from '../../stores/listView'
import Button from '../ui/Button.vue'
import { CONTROL_CLASS, FOCUS_RING_CLASS } from '../ui/control'

const { t, locale } = useI18n()
const view = useListViewStore()
const clock = useClock()

const open = ref(false)
// What the calendar shows while it is open; a first day alone is a range still being picked.
const range = shallowRef<DateRange>({ start: undefined, end: undefined })

// The user's today, in the zone the list's days are meant in.
const today = computed(() => toCalendarDate(fromDate(clock.now(), clockTimeZone(clock))))

const daysText = computed(() => {
  const { deadlineFrom: from, deadlineTo: to } = view
  const thisYear = today.value.year
  if (from !== '' && to !== '') return formatDays(from, to, locale.value, thisYear)
  if (from !== '') return t('dateFilter.from', { day: formatDays(from, from, locale.value, thisYear) })
  if (to !== '') return t('dateFilter.until', { day: formatDays(to, to, locale.value, thisYear) })
  return null
})

// The calendar opens on the month of the first day filtered, or of the last, or of today.
const firstShown = computed<DateValue>(() => {
  const day = view.deadlineFrom || view.deadlineTo
  return day === '' ? today.value : parseDate(day)
})

function apply(first: DateValue | undefined, last: DateValue | undefined): void {
  view.setDeadline(first?.toString() ?? '', last?.toString() ?? '')
  open.value = false
}

// Shows the filtered days as the selection when it opens; a first day picked alone is that day when it closes.
watch(open, (isOpen) => {
  if (isOpen) {
    range.value =
      view.deadlineFrom !== '' && view.deadlineTo !== ''
        ? { start: parseDate(view.deadlineFrom), end: parseDate(view.deadlineTo) }
        : { start: undefined, end: undefined }
  } else if (range.value.start !== undefined && range.value.end === undefined) {
    view.setDeadline(range.value.start.toString(), range.value.start.toString())
  }
})

function pickRange(next: DateRange): void {
  range.value = next
  if (next.start !== undefined && next.end !== undefined) apply(next.start, next.end)
}

function pickToday(): void {
  apply(today.value, today.value)
}

// The week as the calendar lays it out for the app language.
function pickThisWeek(): void {
  const first = startOfWeek(today.value, locale.value)
  apply(first, first.add({ days: 6 }))
}

// Everything due up to the end of today, with no first day.
function pickOverdue(): void {
  apply(undefined, today.value)
}

function clear(): void {
  apply(undefined, undefined)
}

const STEP_CLASS = `size-8 rounded-item text-text-muted hover:bg-surface-muted hover:text-text ${CONTROL_CLASS}`
const SMALL_CLASS = `h-7 rounded-item px-2.5 text-xs font-medium ${CONTROL_CLASS}`
const PICK_CLASS = `${SMALL_CLASS} border border-border bg-surface text-text hover:bg-surface-muted`
const CLEAR_CLASS = `${SMALL_CLASS} shrink-0 text-text hover:bg-surface-muted`
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        data-testid="deadline-filter"
        :aria-label="daysText === null ? t('dateFilter.label') : t('dateFilter.labelWith', { days: daysText })"
      >
        <CalendarDays class="size-4 text-text-muted" aria-hidden="true" />
        <span class="whitespace-nowrap">{{ daysText ?? t('dateFilter.label') }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="4"
        :collision-padding="16"
        data-testid="deadline-filter-popover"
        class="z-50 flex w-72 flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-overlay focus:outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
      >
        <div role="group" :aria-label="t('dateFilter.quickPicks')" class="flex flex-wrap gap-1.5">
          <button type="button" :class="PICK_CLASS" @click="pickToday">{{ t('dateFilter.today') }}</button>
          <button type="button" :class="PICK_CLASS" @click="pickThisWeek">{{ t('dateFilter.thisWeek') }}</button>
          <button type="button" :class="PICK_CLASS" @click="pickOverdue">{{ t('dateFilter.overdue') }}</button>
        </div>

        <RangeCalendarRoot
          v-slot="{ weekDays, grid }"
          :model-value="range"
          :default-placeholder="firstShown"
          :locale="locale"
          :calendar-label="t('dateFilter.calendar')"
          prevent-deselect
          fixed-weeks
          @update:model-value="pickRange"
        >
          <RangeCalendarHeader class="mb-2 flex items-center justify-between gap-2">
            <RangeCalendarPrev :aria-label="t('form.previousMonth')" :class="STEP_CLASS">
              <ChevronLeft class="size-4" aria-hidden="true" />
            </RangeCalendarPrev>
            <RangeCalendarHeading
              data-testid="deadline-filter-month"
              class="text-sm font-medium text-text first-letter:uppercase"
            />
            <RangeCalendarNext :aria-label="t('form.nextMonth')" :class="STEP_CLASS">
              <ChevronRight class="size-4" aria-hidden="true" />
            </RangeCalendarNext>
          </RangeCalendarHeader>
          <RangeCalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse select-none">
            <RangeCalendarGridHead>
              <RangeCalendarGridRow>
                <RangeCalendarHeadCell v-for="day in weekDays" :key="day" class="h-8 text-xs font-normal text-text-muted">
                  {{ day }}
                </RangeCalendarHeadCell>
              </RangeCalendarGridRow>
            </RangeCalendarGridHead>
            <RangeCalendarGridBody>
              <RangeCalendarGridRow v-for="(week, index) in month.rows" :key="index">
                <RangeCalendarCell v-for="day in week" :key="day.toString()" :date="day" class="p-0">
                  <RangeCalendarCellTrigger
                    :day="day"
                    :month="month.value"
                    class="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-item text-sm text-text hover:bg-surface-muted data-[highlighted]:bg-surface-muted data-[outside-view]:text-text-muted data-[outside-view]:opacity-60 data-[selected]:bg-accent-soft data-[selection-end]:bg-accent data-[selection-end]:text-accent-contrast data-[selection-start]:bg-accent data-[selection-start]:text-accent-contrast data-[today]:not-data-[selected]:font-semibold data-[today]:not-data-[selected]:text-accent-text"
                    :class="FOCUS_RING_CLASS"
                  />
                </RangeCalendarCell>
              </RangeCalendarGridRow>
            </RangeCalendarGridBody>
          </RangeCalendarGrid>
        </RangeCalendarRoot>

        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-text-muted">{{ t('dateFilter.hint') }}</p>
          <button type="button" :class="CLEAR_CLASS" @click="clear">{{ t('dateFilter.clear') }}</button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
