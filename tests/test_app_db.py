import sqlite3
import tempfile
import unittest
from pathlib import Path

from server.app import create_app
from server.db import get_db, init_db, transaction


class AppDatabaseTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_directory.name) / "sayit-test.db"
        self.app = create_app(
            {
                "TESTING": True,
                "DATABASE_PATH": str(self.database_path),
                "SECRET_KEY": "test-secret",
            }
        )
        self.context = self.app.app_context()
        self.context.push()

    def tearDown(self) -> None:
        self.context.pop()
        self.temp_directory.cleanup()

    def test_factory_exposes_health_endpoint(self) -> None:
        response = self.app.test_client().get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_init_db_creates_sync_schema_and_enables_foreign_keys(self) -> None:
        init_db()
        connection = get_db()
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }

        self.assertTrue(
            {"users", "user_revisions", "tabs", "tombstones", "processed_operations"}
            <= tables
        )
        self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_transaction_rolls_back_on_error(self) -> None:
        init_db()
        with self.assertRaises(sqlite3.IntegrityError):
            with transaction() as connection:
                connection.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    ("same-user", "hash", 1),
                )
                connection.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    ("same-user", "hash", 2),
                )

        count = get_db().execute("SELECT COUNT(*) FROM users").fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
