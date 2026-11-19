<script setup lang="ts">
import { computed, provide, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ApiErrorKind } from '../../api/http'
import { formatNumber } from '../../i18n/numbers'
import { useListViewStore } from '../../stores/listView'
import { useTasksStore } from '../../stores/tasks'
import Button from '../ui/Button.vue'
import { FOCUS_TASK_LIST } from './listFocus'
import Pagination from './Pagination.vue'
import TaskRow from './TaskRow.vue'

const SKELETON_ROWS = 6

// Every kind is listed, so a new one does not compile until it has a message.
const ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'errors.network',
  server: 'errors.server',
  not_found: 'errors.not_found',
  validation: 'errors.generic',
  aborted: 'errors.generic',
}

const { t, locale } = useI18n()
const tasks = useTasksStore()
const view = useListViewStore()

const hasRows = computed(() => tasks.items.length > 0)
const isRequesting = computed(() => tasks.status === 'loading' || tasks.status === 'reloading')

const errorMessage = computed(() => (tasks.error === null ? null : t(ERROR_MESSAGES[tasks.error])))

// The number is written for the language; the plural form is still chosen by the count itself.
const totalText = computed(() => t('list.total', { n: formatNumber(tasks.total, locale.value) }, tasks.total))

const emptyText = computed(() => t(view.isFiltered ? 'list.noResults' : 'list.empty'))

// What the live region says. A failure is left to the alert, which would otherwise be announced twice.
// With no rows to keep on screen a reload looks like a first load, and is announced as one.
const announcement = computed(() => {
  if (tasks.status === 'failed') return ''
  if (tasks.status === 'ready') return hasRows.value ? totalText.value : emptyText.value
  return t(hasRows.value ? 'list.reloading' : 'list.loading')
})

// The controls count from the page of the rows on screen. After a page failed to load that is still
// the page before it, so asking for the same page once more is a retry, not a change of the view.
function goToPage(page: number): void {
  if (page !== view.page) view.page = page
  else if (tasks.status === 'failed') tasks.retry()
}

// A leaving row is taken out of the flow, so the rows replacing it do not start below it;
// pinned to where it was, it fades out in place.
function pinInPlace(row: Element): void {
  const element = row as HTMLElement
  element.style.top = `${element.offsetTop}px`
}

// Where the focus goes when the row holding it leaves the list.
const region = useTemplateRef<HTMLElement>('region')
provide(FOCUS_TASK_LIST, () => region.value?.focus({ preventScroll: true }))
</script>

<template>
  <section ref="region" tabindex="-1" :aria-label="t('actions.listLabel')" class="outline-none">
    <!-- Always in the page, with only its text changing: a region inserted already filled is not announced. -->
    <p role="status" class="sr-only">{{ announcement }}</p>

    <div
      v-if="errorMessage !== null"
      role="alert"
      class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-danger-soft px-4 py-3"
    >
      <p class="min-w-0 flex-1 basis-60 text-sm text-danger-text">{{ errorMessage }}</p>
      <Button :loading="isRequesting" @click="tasks.retry()">{{ t('list.retry') }}</Button>
    </div>

    <template v-if="hasRows">
      <p data-testid="task-total" class="h-5 text-[13px] leading-5 text-text-muted">
        {{ totalText }}
      </p>
      <ul
        class="relative mt-2 divide-y divide-border border-y border-border transition-opacity"
        :class="{ 'opacity-50': tasks.status === 'reloading' }"
        :aria-busy="tasks.status === 'reloading' ? 'true' : undefined"
      >
        <TransitionGroup name="task-row" @before-leave="pinInPlace">
          <li v-for="task in tasks.items" :key="task.id">
            <TaskRow :task="task" />
          </li>
        </TransitionGroup>
      </ul>
      <Pagination :page="tasks.page" :pages="tasks.pages" class="mt-5" @update:page="goToPage" />
    </template>

    <template v-else-if="errorMessage === null">
      <div v-if="tasks.status === 'ready'" data-testid="task-list-empty" class="py-16 text-center">
        <p class="text-sm text-text-muted">{{ emptyText }}</p>
        <Button v-if="view.isFiltered" class="mt-4" @click="view.clearFilters()">
          {{ t('toolbar.clearFilters') }}
        </Button>
      </div>

      <div v-else>
        <div aria-hidden="true" class="animate-pulse">
          <div class="flex h-5 items-center">
            <div class="h-3 w-20 rounded-full bg-surface-muted" />
          </div>
          <div class="mt-2 divide-y divide-border border-y border-border">
            <div v-for="row in SKELETON_ROWS" :key="row" class="flex gap-3 py-3">
              <div class="flex h-6 items-center">
                <div class="size-[18px] rounded-full bg-surface-muted" />
              </div>
              <div class="flex-1">
                <div class="flex h-6 items-center">
                  <div class="h-3.5 w-1/2 rounded-full bg-surface-muted" />
                </div>
                <div class="mt-0.5 flex h-5 items-center">
                  <div class="h-3 w-1/3 rounded-full bg-surface-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.task-row-enter-active,
.task-row-leave-active {
  transition: opacity 150ms ease-out;
}

.task-row-enter-from,
.task-row-leave-to {
  opacity: 0;
}

.task-row-leave-active {
  position: absolute;
  inset-inline: 0;
}
</style>
