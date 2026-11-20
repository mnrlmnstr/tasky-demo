<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Search, X } from 'lucide-vue-next'
import { ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useListViewStore } from '../../stores/listView'
import { CONTROL_CLASS, FOCUS_RING_CLASS } from '../ui/control'

const SEARCH_DELAY_MS = 300

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

// Whichever "Clear filters" was pressed, the toolbar's or the empty list's, typing still waiting out
// the pause goes with the filters: the pause then ends on an empty field and searches for nothing.
view.onFiltersCleared(() => {
  typed.value = ''
})
</script>

<template>
  <div class="relative">
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
</template>
