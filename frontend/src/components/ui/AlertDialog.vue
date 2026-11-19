<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'

import Button from './Button.vue'
import { DESCRIPTION_CLASS, FOOTER_CLASS, PANEL_CLASS, SCRIM_CLASS, TITLE_CLASS } from './overlay'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay data-testid="alert-dialog-overlay" :class="SCRIM_CLASS" />
      <AlertDialogContent :class="PANEL_CLASS" @escape-key-down="emit('cancel')">
        <div class="flex flex-col gap-1">
          <AlertDialogTitle :class="TITLE_CLASS">{{ title }}</AlertDialogTitle>
          <AlertDialogDescription :class="DESCRIPTION_CLASS">
            {{ description }}
          </AlertDialogDescription>
        </div>
        <footer :class="FOOTER_CLASS">
          <AlertDialogCancel as-child>
            <Button @click="emit('cancel')">{{ cancelLabel }}</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button variant="danger" @click="emit('confirm')">{{ confirmLabel }}</Button>
          </AlertDialogAction>
        </footer>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
