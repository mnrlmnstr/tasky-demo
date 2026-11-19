"""Counterexamples against issue #2, through the public interfaces."""


# Spec #2: "App factory with `/api/v1` router prefix"
def test_app_factory_builds_an_app_with_the_api_prefix() -> None:
    from app import main

    factory = getattr(main, "create_app", None)
    assert callable(factory), "app.main has no app factory (create_app)"
    paths = {route.path for route in factory().routes}
    assert "/api/v1/health" in paths
