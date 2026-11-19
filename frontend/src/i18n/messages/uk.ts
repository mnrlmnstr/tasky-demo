import type en from './en'

// Counted messages carry three forms, in the order one | few | many: «1 задача | 2 задачі | 5 задач».
const uk: typeof en = {
  app: {
    title: 'Tasky',
  },
  header: {
    settings: 'Налаштування',
    newTask: 'Нова задача',
  },
  errors: {
    network: 'Не вдалося зв’язатися із сервером. Перевірте з’єднання і спробуйте ще раз.',
    server: 'На сервері сталася помилка. Спробуйте ще раз.',
    not_found: 'Цієї задачі вже немає.',
    generic: 'Щось пішло не так. Спробуйте ще раз.',
  },
  list: {
    loading: 'Завантажуємо задачі…',
    reloading: 'Оновлюємо задачі…',
    empty: 'Задач поки немає',
    noResults: 'За цими фільтрами нічого не знайдено',
    retry: 'Спробувати ще раз',
    total: '{n} задача | {n} задачі | {n} задач',
  },
  task: {
    status: {
      todo: 'До виконання',
      in_progress: 'У роботі',
      done: 'Виконано',
    },
    priority: {
      low: 'Низький',
      medium: 'Середній',
      high: 'Високий',
    },
    noDeadline: 'Без дедлайну',
    overdue: 'Прострочено',
    due: 'До {date}',
    created: 'Створено {date}',
  },
  toolbar: {
    searchLabel: 'Пошук задач',
    searchPlaceholder: 'Пошук за назвою',
    clearSearch: 'Очистити пошук',
    statusLabel: 'Статус',
    statusAll: 'Усі',
    sortLabel: 'Сортування',
    sortBy: 'Сортування: {sort}',
    sort: {
      newest: 'Спочатку нові',
      oldest: 'Спочатку старі',
      deadlineSoonest: 'Дедлайн: спочатку найближчі',
      deadlineLatest: 'Дедлайн: спочатку найдальші',
    },
    clearFilters: 'Скинути фільтри',
  },
  pagination: {
    label: 'Сторінки',
    previous: 'Назад',
    next: 'Далі',
    page: 'Сторінка {page} з {pages}',
  },
  settings: {
    title: 'Налаштування',
    theme: 'Тема',
    themes: {
      light: 'Світла',
      dark: 'Темна',
      system: 'Системна',
    },
    pageSize: 'Задач на сторінці',
    language: 'Мова',
    languages: {
      uk: 'Українська',
      en: 'English',
    },
    close: 'Закрити',
  },
}

export default uk
