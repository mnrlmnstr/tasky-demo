<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { computed, nextTick, reactive, ref, shallowReactive, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { TaskPriority, TaskRead, TaskStatus } from '../../api/generated/client'
import type { FieldError } from '../../api/http'
import { TASK_PRIORITIES } from '../../api/taskPriorities'
import { TASK_STATUSES } from '../../api/taskStatuses'
import { useClock } from '../../i18n/clock'
import { errorMessageKey } from '../../i18n/errorMessages'
import { useTaskFormStore } from '../../stores/taskForm'
import { useTaskFormSubmit, type TaskFormFailure, type TaskFormPayload } from '../../stores/taskFormSubmit'
import Button from '../ui/Button.vue'
import { FOCUS_RING_CLASS } from '../ui/control'
import Dialog from '../ui/Dialog.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import { editingTimeZone, toDeadlineParts, toTimestamp } from './deadline'
import DeadlineField from './DeadlineField.vue'
import {
  apiTitle,
  FORM_FIELDS,
  isFormField,
  serverErrorMessage,
  titleProblem,
  TITLE_MAX_LENGTH,
  type FormField,
} from './taskFormErrors'

/** What the fields hold. */
interface Values {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  date: DateValue | undefined
  time: string
}

const { t } = useI18n()
const form = useTaskFormStore()
const { saving, save } = useTaskFormSubmit()
const timeZone = editingTimeZone(useClock().timeZone)

const formId = useId()
const formElement = useTemplateRef<HTMLFormElement>('formElement')
const titleField = useTemplateRef<HTMLInputElement>('titleField')
const failureBlock = useTemplateRef<HTMLElement>('failureBlock')

// A deadline that cannot be read is edited like no deadline at all, as the list shows it.
function valuesOf(task: TaskRead | null): Values {
  const deadline = task?.deadline ? toDeadlineParts(task.deadline, timeZone) : null
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    date: deadline?.date,
    time: deadline?.time ?? '',
  }
}

function payloadOf(fields: Values): TaskFormPayload {
  const description = fields.description.trim()
  return {
    title: apiTitle(fields.title),
    description: description === '' ? null : description,
    status: fields.status,
    priority: fields.priority,
    deadline: fields.date === undefined ? null : toTimestamp(fields.date, fields.time, timeZone),
  }
}

// Shallow: a calendar date keeps private state and must not be wrapped in a proxy.
const values = shallowReactive(valuesOf(null))
// What the form would send if nothing was touched: an edit sends only what differs from it.
let untouched = payloadOf(values)

/** Message keys of what is wrong, by field: the form's own checks and the API's `422` answers. */
const errors = reactive<Partial<Record<FormField, string>>>({})
/** A failure that is not about one field. */
const failure = ref<string | null>(null)
/** `422` errors about fields the form does not show. */
const otherErrors = ref<FieldError[]>([])
/** The edited task turned out to be deleted: there is nothing left to save. */
const gone = ref(false)

// Nothing closes the form while its save is in flight, so the answer always has a form to land in.
const open = computed({
  get: () => form.open,
  set: (value) => {
    if (!saving.value) form.open = value
  },
})

function clearErrors(): void {
  for (const field of FORM_FIELDS) delete errors[field]
  failure.value = null
  otherErrors.value = []
}

watch(
  () => form.open,
  async (isOpen) => {
    if (!isOpen) return
    Object.assign(values, valuesOf(form.task))
    untouched = payloadOf(values)
    clearErrors()
    gone.value = false
    // The dialog focuses its first control, the close button, when it mounts: typing starts in the title instead.
    await nextTick()
    titleField.value?.focus()
  },
)

function checkTitle(): void {
  const problem = titleProblem(values.title)
  if (problem === null) delete errors.title
  else errors.title = problem
}

// A message stays until the field it is about changes; the title's follows the typing once it is shown.
watch(
  () => values.title,
  () => {
    if (errors.title) checkTitle()
  },
)
watch(
  () => values.description,
  () => delete errors.description,
)
watch(
  () => values.status,
  () => delete errors.status,
)
watch(
  () => values.priority,
  () => delete errors.priority,
)
watch(
  () => [values.date, values.time],
  () => delete errors.deadline,
)

function messageOf(key: string): string {
  return t(key, { max: TITLE_MAX_LENGTH })
}

const fieldMessages = computed(
  () =>
    Object.fromEntries(FORM_FIELDS.map((field) => [field, errors[field] ? messageOf(errors[field]) : ''])) as Record<
      FormField,
      string
    >,
)

const formMessages = computed(() => [
  ...(failure.value === null ? [] : [t(failure.value)]),
  ...otherErrors.value.map((error) =>
    t('form.errors.otherField', { field: error.field, message: messageOf(serverErrorMessage(error)) }),
  ),
])

// The first field at fault, or with none the message that explains the failure.
async function focusFirstInvalid(): Promise<void> {
  await nextTick()
  const field = FORM_FIELDS.find((candidate) => errors[candidate])
  if (field === undefined) {
    failureBlock.value?.focus()
    return
  }
  formElement.value
    ?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input, textarea, button)`)
    ?.focus()
}

// The API's `422` answers go to the fields they are about; the rest is shown under the form.
async function showFailure(result: TaskFormFailure): Promise<void> {
  for (const error of result.fieldErrors) {
    if (isFormField(error.field)) errors[error.field] ??= serverErrorMessage(error)
    else otherErrors.value.push(error)
  }
  if (result.gone) gone.value = true
  if (result.kind !== null) failure.value = errorMessageKey(result.kind)
  await focusFirstInvalid()
}

async function submit(): Promise<void> {
  if (saving.value || gone.value) return
  clearErrors()
  checkTitle()
  if (errors.title) {
    await focusFirstInvalid()
    return
  }

  const result = await save(payloadOf(values), untouched)
  if (result !== null) await showFailure(result)
}

const statusOptions = computed(() =>
  TASK_STATUSES.map((status) => ({ value: status, label: t(`task.status.${status}`) })),
)
const priorityOptions = computed(() =>
  TASK_PRIORITIES.map((priority) => ({ value: priority, label: t(`task.priority.${priority}`) })),
)

const LABEL_CLASS = 'text-sm text-text-muted'
const INPUT_CLASS = `w-full rounded-control border border-border bg-surface px-3 text-sm text-text aria-invalid:border-danger ${FOCUS_RING_CLASS}`
const ERROR_CLASS = 'text-[13px] leading-5 text-danger-text'
</script>

<template>
  <Dialog
    v-model:open="open"
    wide
    :title="form.task === null ? t('form.createTitle') : t('form.editTitle')"
    :close-label="t('form.close')"
  >
    <form
      :id="formId"
      ref="formElement"
      novalidate
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <!-- The title's message keeps its line even when empty, so showing it on blur moves nothing under the pointer. -->
      <div data-field="title" class="-mb-2 flex flex-col gap-1.5">
        <label :for="`${formId}-title`" :class="LABEL_CLASS">{{ t('form.title') }}</label>
        <input
          :id="`${formId}-title`"
          ref="titleField"
          v-model="values.title"
          type="text"
          autocomplete="off"
          :aria-invalid="fieldMessages.title !== ''"
          :aria-describedby="`${formId}-title-error`"
          class="h-9"
          :class="INPUT_CLASS"
          @blur="checkTitle"
          @keydown.enter.prevent="submit"
        />
        <p :id="`${formId}-title-error`" data-testid="error-title" class="min-h-5" :class="ERROR_CLASS">
          {{ fieldMessages.title }}
        </p>
      </div>

      <div data-field="description" class="flex flex-col gap-1.5">
        <label :for="`${formId}-description`" :class="LABEL_CLASS">{{ t('form.description') }}</label>
        <textarea
          :id="`${formId}-description`"
          v-model="values.description"
          rows="3"
          :aria-invalid="fieldMessages.description !== ''"
          :aria-describedby="fieldMessages.description ? `${formId}-description-error` : undefined"
          class="min-h-20 resize-y py-2"
          :class="INPUT_CLASS"
        />
        <p
          v-if="fieldMessages.description"
          :id="`${formId}-description-error`"
          data-testid="error-description" :class="ERROR_CLASS">
          {{ fieldMessages.description }}
        </p>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-4">
        <div data-field="status" class="flex flex-col items-start gap-1.5">
          <span :class="LABEL_CLASS" aria-hidden="true">{{ t('form.status') }}</span>
          <SegmentedControl
            v-model="values.status"
            :options="statusOptions"
            :label="t('form.status')"
            :aria-describedby="fieldMessages.status ? `${formId}-status-error` : undefined"
          />
          <p v-if="fieldMessages.status" :id="`${formId}-status-error`" data-testid="error-status" :class="ERROR_CLASS">
            {{ fieldMessages.status }}
          </p>
        </div>
        <div data-field="priority" class="flex flex-col items-start gap-1.5">
          <span :class="LABEL_CLASS" aria-hidden="true">{{ t('form.priority') }}</span>
          <SegmentedControl
            v-model="values.priority"
            :options="priorityOptions"
            :label="t('form.priority')"
            :aria-describedby="fieldMessages.priority ? `${formId}-priority-error` : undefined"
          />
          <p
            v-if="fieldMessages.priority"
            :id="`${formId}-priority-error`"
            data-testid="error-priority" :class="ERROR_CLASS">
            {{ fieldMessages.priority }}
          </p>
        </div>
      </div>

      <div data-field="deadline" class="flex flex-col items-start gap-1.5">
        <span :class="LABEL_CLASS" aria-hidden="true">{{ t('form.deadline') }}</span>
        <DeadlineField
          v-model:date="values.date"
          v-model:time="values.time"
          :time-zone="timeZone"
          :aria-describedby="fieldMessages.deadline ? `${formId}-deadline-error` : undefined"
        />
        <p
          v-if="fieldMessages.deadline"
          :id="`${formId}-deadline-error`"
          data-testid="error-deadline" :class="ERROR_CLASS">
          {{ fieldMessages.deadline }}
        </p>
      </div>

      <!-- Focused when the failure is about no field, so the keyboard is not left on a button that waits. -->
      <div
        v-if="formMessages.length > 0"
        ref="failureBlock"
        role="alert"
        tabindex="-1"
        data-testid="form-error"
        class="rounded-item"
        :class="[ERROR_CLASS, FOCUS_RING_CLASS]"
      >
        <p v-for="message in formMessages" :key="message">{{ message }}</p>
      </div>
    </form>

    <template #footer>
      <!-- Busy rather than disabled while saving, so the focus stays where it was; both ignore a press meanwhile. -->
      <Button :busy="saving" @click="open = false">{{ t('form.cancel') }}</Button>
      <Button variant="primary" type="submit" :form="formId" :busy="saving" :disabled="gone">
        {{ form.task === null ? t('form.create') : t('form.save') }}
      </Button>
    </template>
  </Dialog>
</template>
