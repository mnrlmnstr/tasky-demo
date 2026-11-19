"""`python -m app.seed`: load the demo tasks into the database the settings point at."""

import argparse
import asyncio
from datetime import UTC, datetime

from app.core.config import get_settings
from app.core.database import create_engine, create_session_factory
from app.core.logging import configure_logging
from app.services.demo_seed import seed_demo_tasks


async def _run(*, reset: bool) -> None:
    settings = get_settings()
    configure_logging(settings)
    engine = create_engine(settings)
    try:
        async with create_session_factory(engine)() as session:
            await seed_demo_tasks(session, datetime.now(UTC), reset=reset)
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.seed",
        description="Load the demo tasks, but only into a tasks table with no rows at all.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete every task (deleted ones included) and load the demo tasks again",
    )
    args = parser.parse_args(argv)
    asyncio.run(_run(reset=args.reset))
    return 0


if __name__ == "__main__":  # pragma: no cover - the module run as a script; tests call main()
    raise SystemExit(main())
