<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { ArrowUpDown, Search, X } from 'lucide-vue-next'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskOrdering } from '../../api/generated/client'
import { STATUS_FILTERS, useListViewStore } from '../../stores/listView'
import Button from '../ui/Button.vue'
import { CONTROL_CLASS, FOCUS_RING_CLASS } from '../ui/control'
import DropdownMenu from '../ui/DropdownMenu.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'

const SEARCH_DELAY_MS = 300

// In the order the menu lists them. Every ordering the API knows is here, so a new one does not
// compile until it has a label.
const SORT_MESSAGES: Record<TaskOrdering, string> = {
  '-created_at': 'toolbar.sort.newest',
  created_at: 'toolbar.sort.oldest',
  deadline: 'toolbar.sort.deadlineSoonest',
  '-deadline': 'toolbar.sort.deadlineLatest',
}
const SORT_ORDER: TaskOrdering[] = ['-created_at', 'created_at', 'deadline', '-deadline']

const { t } = useI18n()
const view = useListViewStore()

// What the field shows. It runs ahead of the view's search while the user is typing.
const typed = ref(view.search)
const searchField = useTemplateRef<HTMLInputElement>('searchField')

// Reads the field when the pause ends, so text cleared in the meantime is not searched for.
const searchLater = useDebounceFn(() => {
  view.search = typed.value
}, SEARCH_DELAY_MS)

function onType(event: Event): void {
  typed.value = (event.target as HTMLInputElement).value
  void searchLater()
}

// Back/forward and "Clear filters" change the search from outside. The view trims it, so text that
// differs only by its outer spaces is the user's own typing coming back and is left alone.
watch(
  () => view.search,
  (search) => {
    if (search !== typed.value.trim()) typed.value = search
  },
)

function clearSearch(): void {
  typed.value = ''
  view.search = ''
  searchField.value?.focus()
}

function clearFilters(): void {
  typed.value = ''
  view.clearFilters()
}

const statusOptions = computed(() =>
  STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === 'all' ? t('toolbar.statusAll') : t(`task.status.${status}`),
  })),
)

const sortLabel = computed(() => t(SORT_MESSAGES[view.ordering]))

const sortItems = computed(() =>
  SORT_ORDER.map((ordering) => ({ value: ordering, label: t(SORT_MESSAGES[ordering]) })),
)
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative min-w-0 flex-1 basis-48">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <input
        ref="searchField"
        type="search"
        :value="typed"
        :aria-label="t('toolbar.searchLabel')"
        :placeholder="t('toolbar.searchPlaceholder')"
        autocomplete="off"
        class="h-9 w-full rounded-control border border-border bg-surface px-9 text-sm text-text placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none"
        :class="FOCUS_RING_CLASS"
        @input="onType"
      />
      <button
        v-if="typed !== ''"
        type="button"
        :aria-label="t('toolbar.clearSearch')"
        :title="t('toolbar.clearSearch')"
        class="absolute top-1 right-1 size-7 rounded-item text-text-muted hover:bg-surface-muted hover:text-text"
        :class="CONTROL_CLASS"
        @click="clearSearch"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>

    <!-- On a phone the four statuses share the full width, with tighter segments so no label breaks in two. -->
    <SegmentedControl
      v-model="view.status"
      :options="statusOptions"
      :label="t('toolbar.statusLabel')"
      class="max-sm:w-full [&>button]:flex-auto [&>button]:whitespace-nowrap max-sm:[&>button]:px-1.5"
    />

    <DropdownMenu :items="sortItems" :checked="view.ordering" @select="view.ordering = $event">
      <template #trigger>
        <Button :aria-label="t('toolbar.sortBy', { sort: sortLabel })">
          <ArrowUpDown class="size-4 text-text-muted" aria-hidden="true" />
          {{ sortLabel }}
        </Button>
      </template>
    </DropdownMenu>

    <Button v-if="view.isFiltered" variant="ghost" @click="clearFilters">
      {{ t('toolbar.clearFilters') }}
    </Button>
  </div>
</template>
