<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import TaskList from './components/tasks/TaskList.vue'
import Button from './components/ui/Button.vue'
import IconButton from './components/ui/IconButton.vue'
import { useTasksStore } from './stores/tasks'

const { t } = useI18n()

useTasksStore().start()
</script>

<template>
  <div class="mx-auto min-h-dvh max-w-[760px] border-x border-border bg-surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <h1 class="mr-auto text-lg font-semibold">{{ t('app.title') }}</h1>
      <IconButton :label="t('header.settings')">
        <Settings aria-hidden="true" />
      </IconButton>
      <Button variant="primary">
        <Plus class="size-4" aria-hidden="true" />
        {{ t('header.newTask') }}
      </Button>
    </header>
    <main class="px-5 py-5">
      <!-- The toolbar (search, status, sort) goes here, above the list. -->
      <TaskList />
    </main>
  </div>
</template>
