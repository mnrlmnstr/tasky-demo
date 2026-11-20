"""Demo tasks for a fresh install, in Ukrainian: the story of building Tasky itself.

The shipped work of the backend and frontend milestones is done, the current work is in
progress and a few plausible next steps are to do. Deadlines are overdue, due within a few
days, further out or missing; creation dates follow the order the work happened over the last
three weeks. Five titles mention filters («фільтр», «фільтри») so a search for «фільтр» finds
more than one. All dates are relative to the seed time.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TaskPriority, TaskStatus
from app.models.task import Task

logger = logging.getLogger(__name__)

TODO, IN_PROGRESS, DONE = TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE
LOW, MEDIUM, HIGH = TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH


@dataclass(frozen=True)
class DemoTask:
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    created_ago: timedelta
    # From the seed time; negative is overdue, None means no deadline.
    deadline_in: timedelta | None


def _days(days: float) -> timedelta:
    return timedelta(days=days)


# In board order, which is also the custom order: the work in progress, then the next steps,
# each by importance, then the shipped work, latest first. One task per block, its status,
# priority, age and deadline on one line, so the mix reads at a glance.
# fmt: off
DEMO_TASKS: tuple[DemoTask, ...] = (
    # In progress
    DemoTask(
        "Рефакторинг: спільні компоненти назви й дедлайну задачі",
        "Винести назву, бейдж дедлайну, збереження форми й дії із задачею зі списку, дошки "
        "й таблиці, щоб три вигляди не розходилися.",
        IN_PROGRESS, HIGH, _days(6.6), _days(1.5),
    ),
    DemoTask(
        "Демодані, що розповідають історію створення Tasky",
        "Замінити заглушки в демоданих справжніми задачами проєкту, щоб після чистого "
        "встановлення дошка виглядала живою.",
        IN_PROGRESS, HIGH, _days(0.2), _days(2),
    ),
    DemoTask(
        "README: спершу швидкий старт",
        "Угорі клонування й одна команда; конфігурація, розробка й довідник API нижче.",
        IN_PROGRESS, MEDIUM, _days(1.6), _days(-0.3),
    ),
    DemoTask(
        "Оновити скриншоти в README",
        None,
        IN_PROGRESS, LOW, _days(0.4), None,
    ),
    # To do
    DemoTask(
        "CI: перевірка фронтенду й тести бекенду на кожен pull request",
        "GitHub Actions запускає `npm run check` і тести бекенду на PostgreSQL; без зеленого "
        "прогону злиття заблоковане.",
        TODO, HIGH, _days(8.1), _days(-2),
    ),
    DemoTask(
        "Спільний request id у логах браузера й бекенду",
        "Клієнт надсилає X-Request-ID, і обидві сторони пишуть його в логи, тож одне невдале "
        "збереження можна простежити від початку до кінця.",
        TODO, HIGH, _days(2.8), _days(2.5),
    ),
    DemoTask(
        "Перенумерація позицій, коли у власному порядку закінчуються проміжки",
        "Кожне перетягування між тими самими двома задачами вдвічі зменшує проміжок; колонку "
        "треба перенумерувати, поки float не втратив точність.",
        TODO, MEDIUM, _days(5.2), _days(-1),
    ),
    DemoTask(
        "Переглянути залежності, потрібні лише для тестів",
        "Перевірити, що тягнуть за собою dev-залежності фронтенду й бекенду, і прибрати те, "
        "чим тести вже не користуються.",
        TODO, MEDIUM, _days(2.1), _days(8),
    ),
    DemoTask(
        "e2e-тести у справжньому браузері: форма, фільтри й перетягування",
        "Кілька прогонів Playwright на стеку Compose: створити, відредагувати, відфільтрувати "
        "й перетягнути задачу.",
        TODO, MEDIUM, _days(3.9), _days(14),
    ),
    DemoTask(
        "Гарячі клавіші: нова задача, пошук і скасування",
        "N відкриває форму, / ставить курсор у пошук, Ctrl+Z скасовує останню зміну.",
        TODO, LOW, _days(1.1), None,
    ),
    DemoTask(
        "Зміна статусу кількох задач одразу",
        None,
        TODO, LOW, _days(0.7), _days(30),
    ),
    # Done, latest first
    DemoTask(
        "Заглушки на дошці не зникають після завантаження колонки",
        "Картки-заглушки сиділи всередині transition group карток, і їхня pulse-анімація не "
        "давала leave-переходу завершитися.",
        DONE, MEDIUM, _days(3.4), None,
    ),
    DemoTask(
        "Зміна пріоритету зі списку, дошки й таблиці",
        "Меню пріоритету на кожній задачі в усіх трьох виглядах.",
        DONE, LOW, _days(4.6), None,
    ),
    DemoTask(
        "Власний порядок: перетягування карток на дошці й рядків у таблиці",
        "Позиція в кожної задачі, ендпоінт переміщення, що ставить задачу між двома іншими, "
        "і «Перемістити вище» / «Перемістити нижче» для клавіатури.",
        DONE, HIGH, _days(5.8), _days(-4),
    ),
    DemoTask(
        "Правки після рев’ю: фільтр дедлайнів, дошка й доступність",
        "Виправлення за результатами рев’ю фільтра дедлайнів, дошки, форми, роботи з "
        "клавіатури та зі скринрідером.",
        DONE, MEDIUM, _days(7.4), _days(-5),
    ),
    DemoTask(
        "Вигляди задач: список, канбан-дошка й таблиця",
        "Три вигляди тих самих відфільтрованих задач із налаштуваннями щільності й описів.",
        DONE, HIGH, _days(8.7), _days(-6),
    ),
    DemoTask(
        "Фільтр задач за дедлайном: один день або діапазон",
        "Календар для одного дня чи діапазону, на сервер іде як deadline_from і deadline_to.",
        DONE, MEDIUM, _days(9.6), _days(-7),
    ),
    DemoTask(
        "Видалення задачі й зміна статусу просто з рядка",
        None,
        DONE, MEDIUM, _days(11.4), _days(-9),
    ),
    DemoTask(
        "Форма створення й редагування з тостом для скасування",
        "Один діалог для обох дій із тією самою валідацією, що й в API; будь-яке створення, "
        "редагування чи зміну статусу можна скасувати протягом кількох секунд.",
        DONE, HIGH, _days(12.2), _days(-9),
    ),
    DemoTask(
        "Панель інструментів: пошук, фільтр за статусом і сортування",
        "Пошук чекає паузи в наборі; увесь стан вигляду живе в адресі, тож після "
        "перезавантаження видно ті самі задачі.",
        DONE, HIGH, _days(13.1), _days(-10),
    ),
    DemoTask(
        "Налаштування: тема, кількість задач на сторінці, українська й англійська",
        "Зберігаються в local storage і застосовуються без перезавантаження.",
        DONE, MEDIUM, _days(13.9), _days(-11),
    ),
    DemoTask(
        "Список задач із пагінацією",
        "Типово двадцять задач на сторінці, номер сторінки зберігається в адресі.",
        DONE, HIGH, _days(14.6), _days(-12),
    ),
    DemoTask(
        "Основа фронтенду: згенерований API-клієнт, дизайн-токени й каркас застосунку",
        "orval генерує клієнт з експортованої специфікації; токени Tailwind і reka-ui дають "
        "світлу й темну теми.",
        DONE, HIGH, _days(15.4), _days(-13),
    ),
    DemoTask(
        "Демодані для чистого встановлення",
        None,
        DONE, LOW, _days(16.5), None,
    ),
    DemoTask(
        "Тести бекенду зі 100% покриттям",
        "Інтеграційні тести на справжньому PostgreSQL; прогін падає, якщо покриття знижується.",
        DONE, MEDIUM, _days(17.2), _days(-15),
    ),
    DemoTask(
        "Документація OpenAPI з прикладами запитів і відповідей",
        "Кожен ендпоінт, параметр і помилка описані в Swagger UI та ReDoc, а специфікація "
        "експортується для клієнта.",
        DONE, MEDIUM, _days(17.8), _days(-15),
    ),
    DemoTask(
        "Фільтри списку задач: статус, пошук за назвою, сортування й пагінація",
        "Пошук не зважає на регістр, а % і _ сприймає буквально; видалені задачі не "
        "показуються ніколи.",
        DONE, HIGH, _days(19.3), _days(-17),
    ),
    DemoTask(
        "API задач: схеми, валідація й CRUD із м’яким видаленням",
        "Моделі Pydantic для створення, оновлення й читання, однаковий формат помилок, а "
        "видалені задачі лишаються в базі з позначкою часу.",
        DONE, HIGH, _days(20.1), _days(-18),
    ),
    DemoTask(
        "Каркас застосунку на FastAPI і шар бази даних",
        "Налаштування із середовища, ендпоінт health, асинхронний SQLAlchemy з Alembic і "
        "перша міграція Task.",
        DONE, HIGH, _days(21.0), _days(-19),
    ),
    DemoTask(
        "Docker Compose: база даних, бекенд і фронтенд однією командою",
        "PostgreSQL, API й вебзастосунок стартують через `docker compose up`; порядок запуску "
        "визначають health checks.",
        DONE, HIGH, _days(21.6), _days(-20.5),
    ),
)
# fmt: on


def _build(demo: DemoTask, now: datetime, position: float) -> Task:
    created_at = now - demo.created_ago
    return Task(
        position=position,
        title=demo.title,
        description=demo.description,
        status=demo.status,
        priority=demo.priority,
        deadline=None if demo.deadline_in is None else now + demo.deadline_in,
        created_at=created_at,
        updated_at=created_at,
    )


async def seed_demo_tasks(session: AsyncSession, now: datetime, *, reset: bool = False) -> int:
    """Add the demo tasks if the table has no rows at all; returns how many were added.

    Deleted tasks count as rows: a database someone has used is never seeded again.
    With `reset`, every row (deleted ones too) is removed first, in the same transaction.
    """
    if reset:
        await session.execute(delete(Task))
        logger.info("demo_seed_reset")
    elif await session.scalar(select(exists().select_from(Task))):
        logger.info("demo_seed_skipped", extra={"reason": "tasks_exist"})
        return 0
    session.add_all([_build(demo, now, place) for place, demo in enumerate(DEMO_TASKS)])
    await session.commit()
    logger.info("demo_seed_created", extra={"count": len(DEMO_TASKS)})
    return len(DEMO_TASKS)
