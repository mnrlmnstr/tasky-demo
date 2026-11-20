<script setup lang="ts">
import { DateFormatter, fromDate, toCalendarDate, type DateValue } from '@internationalized/date'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import {
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerNext,
  DatePickerPrev,
  DatePickerRoot,
  DatePickerTrigger,
} from 'reka-ui'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useClock } from '../../i18n/clock'
import { CONTROL_CLASS, FOCUS_RING_CLASS } from '../ui/control'
import IconButton from '../ui/IconButton.vue'
import { END_OF_DAY } from './deadline'

/** The chosen day; nothing chosen means the task has no deadline. */
const date = defineModel<DateValue | undefined>('date', { required: true })
/** Wall-clock time on that day as `HH:MM`; empty while there is no day. */
const time = defineModel<string>('time', { required: true })

const { timeZone } = defineProps<{
  /** IANA zone the date and time are meant in. */
  timeZone: string
}>()

const { t, locale } = useI18n()
const dateButton = useTemplateRef<HTMLButtonElement>('dateButton')

// The calendar opens on the month of the deadline, or with none on the current month by the app's clock.
const firstShown = date.value ?? toCalendarDate(fromDate(useClock().now(), timeZone))

const dateText = computed(() =>
  date.value === undefined
    ? null
    : new DateFormatter(locale.value, { dateStyle: 'medium', timeZone }).format(date.value.toDate(timeZone)),
)

function pick(day: DateValue | undefined): void {
  date.value = day
  if (time.value === '') time.value = END_OF_DAY
}

// The clear button goes away with the deadline, so focus moves to the control next to it.
function clear(): void {
  date.value = undefined
  time.value = ''
  dateButton.value?.focus()
}

const FIELD_CLASS = `h-9 rounded-control border border-border bg-surface px-3 text-sm text-text ${FOCUS_RING_CLASS}`
const STEP_CLASS = `size-8 rounded-item text-text-muted hover:bg-surface-muted hover:text-text ${CONTROL_CLASS}`
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <DatePickerRoot
      :model-value="date"
      :default-placeholder="firstShown"
      :locale="locale"
      prevent-deselect
      close-on-select
      @update:model-value="pick"
    >
      <DatePickerTrigger as-child>
        <button
          ref="dateButton"
          type="button"
          data-testid="deadline-date"
          :aria-label="dateText === null ? t('form.deadlineDate') : `${t('form.deadlineDate')}: ${dateText}`"
          class="inline-flex cursor-pointer items-center gap-2 hover:bg-surface-muted"
          :class="[FIELD_CLASS, { 'text-text-muted': dateText === null }]"
        >
          <CalendarDays class="size-4 text-text-muted" aria-hidden="true" />
          {{ dateText ?? t('form.pickDate') }}
        </button>
      </DatePickerTrigger>
      <!-- Above the dialog it opens from. -->
      <DatePickerContent
        align="start"
        :side-offset="6"
        data-testid="deadline-calendar"
        class="z-[60] rounded-card border border-border bg-surface p-3 shadow-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
      >
        <DatePickerCalendar v-slot="{ weekDays, grid }" :calendar-label="t('form.deadline')">
          <DatePickerHeader class="mb-2 flex items-center justify-between gap-2">
            <DatePickerPrev :aria-label="t('form.previousMonth')" :class="STEP_CLASS">
              <ChevronLeft class="size-4" aria-hidden="true" />
            </DatePickerPrev>
            <DatePickerHeading
              data-testid="deadline-month"
              class="text-sm font-medium text-text first-letter:uppercase"
            />
            <DatePickerNext :aria-label="t('form.nextMonth')" :class="STEP_CLASS">
              <ChevronRight class="size-4" aria-hidden="true" />
            </DatePickerNext>
          </DatePickerHeader>
          <DatePickerGrid v-for="month in grid" :key="month.value.toString()" class="border-collapse select-none">
            <DatePickerGridHead>
              <DatePickerGridRow>
                <DatePickerHeadCell
                  v-for="day in weekDays"
                  :key="day"
                  class="size-8 text-xs font-normal text-text-muted"
                >
                  {{ day }}
                </DatePickerHeadCell>
              </DatePickerGridRow>
            </DatePickerGridHead>
            <DatePickerGridBody>
              <DatePickerGridRow v-for="(week, index) in month.rows" :key="index">
                <DatePickerCell v-for="day in week" :key="day.toString()" :date="day" class="p-0">
                  <DatePickerCellTrigger
                    :day="day"
                    :month="month.value"
                    class="flex size-8 cursor-pointer items-center justify-center rounded-item text-sm text-text hover:bg-surface-muted data-[outside-view]:text-text-muted data-[outside-view]:opacity-60 data-[selected]:bg-accent data-[selected]:text-accent-contrast data-[today]:not-data-[selected]:font-semibold data-[today]:not-data-[selected]:text-accent-text"
                    :class="FOCUS_RING_CLASS"
                  />
                </DatePickerCell>
              </DatePickerGridRow>
            </DatePickerGridBody>
          </DatePickerGrid>
        </DatePickerCalendar>
      </DatePickerContent>
    </DatePickerRoot>

    <input
      v-model="time"
      type="time"
      data-testid="deadline-time"
      :aria-label="t('form.deadlineTime')"
      :disabled="date === undefined"
      class="disabled:cursor-not-allowed disabled:opacity-50"
      :class="FIELD_CLASS"
    />

    <IconButton v-if="date !== undefined" :label="t('form.clearDeadline')" @click="clear">
      <X aria-hidden="true" />
    </IconButton>
  </div>
</template>
