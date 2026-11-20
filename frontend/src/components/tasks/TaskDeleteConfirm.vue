<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AlertDialog from '../ui/AlertDialog.vue'

const open = defineModel<boolean>('open', { default: false })

defineProps<{ title: string }>()

const emit = defineEmits<{ confirm: [] }>()

const { t } = useI18n()
</script>

<template>
  <AlertDialog
    v-model:open="open"
    :title="t('actions.deleteTitle', { title })"
    :description="t('actions.deleteDescription')"
    :cancel-label="t('actions.cancel')"
    :confirm-label="t('actions.deleteConfirm')"
    @confirm="emit('confirm')"
  />
</template>
