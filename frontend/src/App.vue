<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsDialog from './components/settings/SettingsDialog.vue'
import TaskFormDialog from './components/tasks/TaskFormDialog.vue'
import TaskList from './components/tasks/TaskList.vue'
import TaskSearch from './components/tasks/TaskSearch.vue'
import TaskToolbar from './components/tasks/TaskToolbar.vue'
import Button from './components/ui/Button.vue'
import IconButton from './components/ui/IconButton.vue'
import UndoToast from './components/undo/UndoToast.vue'
import { useTaskFormStore } from './stores/taskForm'
import { useTasksStore } from './stores/tasks'

const { t } = useI18n()
const settingsOpen = ref(false)
const taskForm = useTaskFormStore()

useTasksStore().start()
</script>

<template>
  <!-- From the small breakpoint up the page is a card held off the window's edges; on a phone it runs edge to edge. -->
  <div class="sm:px-6 sm:py-8">
    <div
      class="mx-auto min-h-dvh max-w-[760px] border-border bg-surface sm:min-h-[calc(100dvh-4rem)] sm:rounded-card sm:border sm:shadow-raised"
    >
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <!-- The app's name stays the page heading for assistive technology; the search takes its place on screen. -->
        <h1 class="sr-only">{{ t('app.title') }}</h1>
        <TaskSearch class="min-w-0 flex-1" />
        <IconButton :label="t('header.settings')" @click="settingsOpen = true">
          <Settings aria-hidden="true" />
        </IconButton>
        <SettingsDialog v-model:open="settingsOpen" />
        <!-- Icon alone on a phone, so the search keeps its room; the label stays as its accessible name. -->
        <Button
          variant="primary"
          :title="t('header.newTask')"
          class="shrink-0 max-sm:w-9 max-sm:px-0"
          @click="taskForm.openCreate()"
        >
          <Plus class="size-4" aria-hidden="true" />
          <span class="max-sm:sr-only">{{ t('header.newTask') }}</span>
        </Button>
        <TaskFormDialog />
      </header>
      <main class="px-5 py-5">
        <TaskToolbar class="mb-4" />
        <TaskList />
      </main>
    </div>
    <UndoToast />
  </div>
</template>
