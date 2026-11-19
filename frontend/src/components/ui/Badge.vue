<script setup lang="ts">
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-text',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
}

const { tone = 'neutral' } = defineProps<{ tone?: BadgeTone }>()
</script>

<template>
  <span
    :data-tone="tone"
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="TONE_CLASSES[tone]"
  >
    <slot />
  </span>
</template>
