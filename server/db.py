"""SQLite connection and schema initialization helpers."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import click
from flask import Flask, current_app, g


def _database_path() -> Path:
    """Return the configured database path as an absolute path."""
    configured = Path(current_app.config["DATABASE_PATH"])
    if not configured.is_absolute():
        configured = Path(current_app.instance_path) / configured
    return configured.resolve()


def get_db() -> sqlite3.Connection:
    """Get the request-scoped SQLite connection."""
    if "db" not in g:
        database_path = _database_path()
        database_path.parent.mkdir(parents=True, exist_ok=True)

        busy_timeout_ms = int(current_app.config["DATABASE_BUSY_TIMEOUT_MS"])
        connection = sqlite3.connect(
            database_path,
            timeout=busy_timeout_ms / 1000,
            isolation_level=None,
        )
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(f"PRAGMA busy_timeout = {busy_timeout_ms}")
        except BaseException:
            connection.close()
            raise
        g.db = connection

    return g.db


def close_db(_error: BaseException | None = None) -> None:
    """Close the request-scoped database connection, if present."""
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


@contextmanager
def transaction(*, immediate: bool = True) -> Iterator[sqlite3.Connection]:
    """Run database work atomically and roll it back on failure."""
    connection = get_db()
    connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
    try:
        yield connection
    except BaseException:
        connection.rollback()
        raise
    else:
        connection.commit()


def init_db() -> None:
    """Create all database objects declared in schema.sql."""
    schema_path = Path(__file__).with_name("schema.sql")
    get_db().executescript(schema_path.read_text(encoding="utf-8"))


@click.command("init-db")
def init_db_command() -> None:
    """Initialize the configured SQLite database."""
    init_db()
    click.echo(f"Initialized database at {_database_path()}")


def init_app(app: Flask) -> None:
    """Register database lifecycle hooks and CLI commands."""
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
