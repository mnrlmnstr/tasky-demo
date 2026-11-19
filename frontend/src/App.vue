<script setup lang="ts">
import { Plus, Settings } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { getHealth } from './api/generated/client'
import Button from './components/ui/Button.vue'
import IconButton from './components/ui/IconButton.vue'

type ApiStatus = 'loading' | 'healthy' | 'failed'

const { t } = useI18n()

const apiStatus = ref<ApiStatus>('loading')

// A 200 with a JSON body alone proves nothing: only the health route answers with this exact shape.
function reportsOk(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
}

onMounted(async () => {
  try {
    // Without the proxy the dev server answers /api with its own page; the client rejects that non-JSON body.
    apiStatus.value = reportsOk(await getHealth()) ? 'healthy' : 'failed'
  } catch {
    apiStatus.value = 'failed'
  }
})
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
    <main class="px-5 py-6">
      <p data-testid="api-status" role="status" class="text-sm text-text-muted">
        {{ t(`apiStatus.${apiStatus}`) }}
      </p>
    </main>
  </div>
</template>
