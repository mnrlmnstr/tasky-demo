<script setup lang="ts">
import { onMounted, ref } from 'vue'

type ApiStatus = 'loading' | 'healthy' | 'failed'

const MESSAGES: Record<ApiStatus, string> = {
  loading: 'Checking API…',
  healthy: 'API is healthy',
  failed: 'API is unavailable',
}

const apiStatus = ref<ApiStatus>('loading')

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/health')
    apiStatus.value = response.ok ? 'healthy' : 'failed'
  } catch {
    apiStatus.value = 'failed'
  }
})
</script>

<template>
  <main>
    <h1>Tasky</h1>
    <p data-testid="api-status">{{ MESSAGES[apiStatus] }}</p>
  </main>
</template>
