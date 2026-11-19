export default {
  app: {
    title: 'Tasky',
  },
  header: {
    settings: 'Settings',
    newTask: 'New task',
  },
  errors: {
    network: 'Could not reach the server. Check your connection and try again.',
    server: 'Something went wrong on the server. Please try again.',
    not_found: 'This task no longer exists.',
    generic: 'Something went wrong. Please try again.',
  },
  undo: {
    labels: {
      created: 'Task created',
      updated: 'Task updated',
      statusChanged: 'Status changed',
    },
    action: 'Undo',
    dismiss: 'Dismiss',
    failed: 'Could not undo. {reason}',
  },
  list: {
    loading: 'Loading tasks…',
    reloading: 'Updating tasks…',
    empty: 'No tasks yet',
    noResults: 'No tasks match your filters',
    retry: 'Try again',
    total: '{n} task | {n} tasks',
  },
  task: {
    status: {
      todo: 'To do',
      in_progress: 'In progress',
      done: 'Done',
    },
    priority: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    },
    noDeadline: 'No deadline',
    overdue: 'Overdue',
    due: 'Due {date}',
    created: 'Created {date}',
  },
  toolbar: {
    searchLabel: 'Search tasks',
    searchPlaceholder: 'Search by title',
    clearSearch: 'Clear search',
    statusLabel: 'Status',
    statusAll: 'All',
    sortLabel: 'Sort',
    sortBy: 'Sort: {sort}',
    sort: {
      newest: 'Newest first',
      oldest: 'Oldest first',
      deadlineSoonest: 'Deadline: soonest first',
      deadlineLatest: 'Deadline: latest first',
    },
    clearFilters: 'Clear filters',
  },
  pagination: {
    label: 'Pages',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page} of {pages}',
  },
  settings: {
    title: 'Settings',
    theme: 'Theme',
    themes: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    pageSize: 'Tasks per page',
    language: 'Language',
    languages: {
      uk: 'Українська',
      en: 'English',
    },
    close: 'Close',
  },
}
