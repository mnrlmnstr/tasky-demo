"""Demo tasks for a fresh install, so every list feature has something to show.

The mix covers every status and priority, deadlines that are overdue, due within a few days,
further out or missing, and creation dates spread over the last 30 days. Several titles share
the word "звіт" so a search finds more than one. All dates are relative to the seed time.
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


# One task per block, its status, priority and dates on one line, so the mix reads at a glance.
# fmt: off
DEMO_TASKS: tuple[DemoTask, ...] = (
    DemoTask(
        "Підготувати квартальний звіт для керівництва",
        "Зібрати цифри за третій квартал, додати графіки та короткі висновки.",
        IN_PROGRESS, HIGH, _days(12.2), _days(-2),
    ),
    DemoTask(
        "Надіслати звіт про витрати бухгалтерії",
        "Чеки за відрядження до Львова лежать у спільній папці.",
        TODO, MEDIUM, _days(9.5), _days(-1),
    ),
    DemoTask(
        "Перевірити щотижневий звіт з продажів",
        "Звірити суми з CRM перед розсилкою.",
        TODO, HIGH, _days(1.3), _days(0.25),
    ),
    DemoTask(
        "Річний звіт: зібрати відгуки команди",
        "Короткий опитувальник на п'ять питань, відповіді до п'ятниці.",
        TODO, LOW, _days(4.1), _days(21),
    ),
    DemoTask(
        "Оновити залежності бекенду",
        "Підняти версії FastAPI та SQLAlchemy, прогнати тести.",
        TODO, MEDIUM, _days(6.4), _days(5),
    ),
    DemoTask(
        "Виправити помилку з часовими поясами в дедлайнах",
        "Користувачі з Києва бачать дедлайн на годину раніше.",
        IN_PROGRESS, HIGH, _days(3.2), _days(1),
    ),
    DemoTask(
        "Записатися до стоматолога",
        None,
        TODO, MEDIUM, _days(0.4), _days(2),
    ),
    DemoTask(
        "Купити подарунок мамі на день народження",
        "Вона згадувала про нову книгу Забужко або гарний шарф.",
        TODO, HIGH, _days(10.8), _days(-3),
    ),
    DemoTask(
        "Продовжити страховку на авто",
        "Порівняти пропозиції трьох страхових перед продовженням.",
        TODO, HIGH, _days(15.6), _days(9),
    ),
    DemoTask(
        "Провести ретроспективу спринту",
        "Формат «старт, стоп, продовжуй», дошка в Miro.",
        DONE, MEDIUM, _days(14.3), _days(-7),
    ),
    DemoTask(
        "Написати документацію до API",
        "Описати всі ендпоінти задач і приклади запитів.",
        IN_PROGRESS, MEDIUM, _days(7.7), _days(4),
    ),
    DemoTask(
        "Замовити воду в офіс",
        "Шість бутлів, доставка у вівторок зранку.",
        DONE, LOW, _days(5.9), None,
    ),
    DemoTask(
        "Підготувати презентацію для клієнта",
        "Кейс із запуску мобільного застосунку, до 15 слайдів.",
        TODO, HIGH, _days(2.6), _days(3),
    ),
    DemoTask(
        "Прочитати книгу «Чиста архітектура»",
        "По одному розділу щовечора.",
        IN_PROGRESS, LOW, _days(27.4), None,
    ),
    DemoTask(
        "Налаштувати резервне копіювання бази даних",
        "Щоденний дамп у сховище, зберігати 14 днів.",
        TODO, HIGH, _days(18.1), _days(-5),
    ),
    DemoTask(
        "Сплатити комунальні послуги",
        "Газ, світло та вода за жовтень.",
        DONE, MEDIUM, _days(20.5), _days(-10),
    ),
    DemoTask(
        "Оновити резюме та профіль на LinkedIn",
        "Додати останній проєкт і нові навички.",
        TODO, LOW, _days(23.2), _days(30),
    ),
    DemoTask(
        "Зустріч з дизайнером щодо нового логотипу",
        "Обговорити три варіанти кольорової палітри.",
        DONE, MEDIUM, _days(11.9), _days(-4),
    ),
    DemoTask(
        "Сходити в спортзал тричі цього тижня",
        "Понеділок, середа, п'ятниця, зранку перед роботою.",
        IN_PROGRESS, LOW, _days(2.1), _days(4.5),
    ),
    DemoTask(
        "Перекласти інструкцію користувача англійською",
        "Близько двадцяти сторінок, терміни узгодити з редактором.",
        TODO, MEDIUM, _days(8.3), _days(14),
    ),
    DemoTask(
        "Провести співбесіду з кандидатом на посаду QA",
        "Резюме в пошті, технічне завдання підготувала Оксана.",
        DONE, HIGH, _days(16.7), _days(-8),
    ),
    DemoTask(
        "Розібрати старі файли на ноутбуці",
        None,
        TODO, LOW, _days(29.1), None,
    ),
    DemoTask(
        "Спланувати відпустку в Карпатах",
        "Подивитися будиночки біля Яремче на кінець січня.",
        TODO, LOW, _days(13.4), _days(45),
    ),
    DemoTask(
        "Додати пагінацію в список задач",
        "Розмір сторінки за замовчуванням 20, кнопки вперед і назад.",
        DONE, MEDIUM, _days(25.8), _days(-15),
    ),
    DemoTask(
        "Полагодити кран на кухні",
        "Купити нову прокладку в будівельному магазині.",
        TODO, MEDIUM, _days(1.8), None,
    ),
    DemoTask(
        "Скласти бюджет на наступний місяць",
        "Врахувати подорожчання оренди та внески на депозит.",
        IN_PROGRESS, MEDIUM, _days(4.9), _days(6),
    ),
    DemoTask(
        "Звіт для податкової за рік",
        "Зібрати всі виписки з банку та акти виконаних робіт.",
        TODO, HIGH, _days(21.6), _days(60),
    ),
    DemoTask(
        "Привітати колег із релізом",
        "Замовити піцу на п'ятницю.",
        DONE, LOW, _days(19.3), None,
    ),
    DemoTask(
        "Записати подкаст про віддалену роботу",
        "Гість погодився на запис у четвер о 18:00.",
        TODO, MEDIUM, _days(6.9), _days(1.5),
    ),
    DemoTask(
        "Перевірити звіт тестового покриття",
        "Знайти модулі, де покриття впало нижче 90%.",
        DONE, LOW, _days(0.9), None,
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
    # The custom order starts as newest first, the way the list opens.
    newest_first = sorted(DEMO_TASKS, key=lambda demo: demo.created_ago)
    session.add_all([_build(demo, now, place) for place, demo in enumerate(newest_first)])
    await session.commit()
    logger.info("demo_seed_created", extra={"count": len(DEMO_TASKS)})
    return len(DEMO_TASKS)
