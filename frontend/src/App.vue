<script setup lang="ts">
import { onMounted, ref } from 'vue'

type ApiStatus = 'loading' | 'healthy' | 'failed'

const MESSAGES: Record<ApiStatus, string> = {
  loading: 'Checking API…',
  healthy: 'API is healthy',
  failed: 'API is unavailable',
}

const apiStatus = ref<ApiStatus>('loading')

// A 200 alone proves nothing: without the proxy the dev server answers /api with its own page.
function reportsOk(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok'
}

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/health')
    // A body that is not JSON makes json() throw, which lands in the catch below.
    apiStatus.value = response.ok && reportsOk(await response.json()) ? 'healthy' : 'failed'
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
