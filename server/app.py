"""Flask application factory for the SayIt sync server."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from flask import Flask, jsonify

from . import db


def _environment_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Create and configure a SayIt Flask application instance."""
    app = Flask(__name__, instance_relative_config=True)

    environment = os.getenv("SAYIT_ENV", "development").strip().lower()
    secret_key = os.getenv("SECRET_KEY")
    if environment == "production" and not secret_key and test_config is None:
        raise RuntimeError("SECRET_KEY must be set when SAYIT_ENV=production")

    app.config.from_mapping(
        SECRET_KEY=secret_key or "development-only-change-me",
        DATABASE_PATH=os.getenv("DATABASE_PATH", "sayit.db"),
        DATABASE_BUSY_TIMEOUT_MS=int(os.getenv("DATABASE_BUSY_TIMEOUT_MS", "5000")),
        MAX_CONTENT_LENGTH=int(os.getenv("MAX_CONTENT_LENGTH", str(2 * 1024 * 1024))),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=_environment_bool(
            "SESSION_COOKIE_SECURE", environment == "production"
        ),
        PERMANENT_SESSION_LIFETIME=30 * 24 * 60 * 60,
        JSON_SORT_KEYS=False,
    )

    if test_config:
        app.config.from_mapping(test_config)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    db.init_app(app)

    from .auth import auth_bp
    app.register_blueprint(auth_bp)

    @app.get("/api/health")
    def health() -> tuple[Any, int]:
        return jsonify(status="ok"), 200

    return app


if __name__ == "__main__":
    create_app().run()
