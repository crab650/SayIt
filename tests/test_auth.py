import tempfile
import unittest
from pathlib import Path

from server.app import create_app
from server.db import get_db, init_db


class AuthTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_directory.name) / "sayit-auth-test.db"
        self.app = create_app(
            {
                "TESTING": True,
                "DATABASE_PATH": str(self.database_path),
                "SECRET_KEY": "test-secret",
            }
        )
        self.context = self.app.app_context()
        self.context.push()
        init_db()
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.context.pop()
        self.temp_directory.cleanup()

    def test_register_success(self) -> None:
        response = self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "password123"},
        )
        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["user"]["username"], "testuser")

        # Verify db insertion and user_revisions initialization
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = 'testuser'").fetchone()
        self.assertIsNotNone(user)
        
        revision = db.execute(
            "SELECT current_revision FROM user_revisions WHERE user_id = ?", (user["id"],)
        ).fetchone()
        self.assertIsNotNone(revision)
        self.assertEqual(revision["current_revision"], 0)

    def test_register_validation(self) -> None:
        # Missing fields
        response = self.client.post("/api/auth/register", json={})
        self.assertEqual(response.status_code, 400)

        # Invalid username (too short)
        response = self.client.post(
            "/api/auth/register",
            json={"username": "ab", "password": "password123"},
        )
        self.assertEqual(response.status_code, 400)

        # Invalid username (special characters)
        response = self.client.post(
            "/api/auth/register",
            json={"username": "user@name", "password": "password123"},
        )
        self.assertEqual(response.status_code, 400)

        # Password too short
        response = self.client.post(
            "/api/auth/register",
            json={"username": "validuser", "password": "123"},
        )
        self.assertEqual(response.status_code, 400)

    def test_register_duplicate_username(self) -> None:
        self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "password123"},
        )
        response = self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "differentpassword"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("already taken", response.get_json()["error"])

    def test_login_success(self) -> None:
        # Register user
        self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "password123"},
        )

        # Log in
        response = self.client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "password123"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["user"]["username"], "testuser")

        # Check session /me endpoint
        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200)
        me_data = me_response.get_json()
        self.assertTrue(me_data["logged_in"])
        self.assertEqual(me_data["user"]["username"], "testuser")

    def test_login_failure(self) -> None:
        self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "password123"},
        )

        # Wrong password
        response = self.client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "wrongpassword"},
        )
        self.assertEqual(response.status_code, 401)

        # Non-existent user
        response = self.client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "password123"},
        )
        self.assertEqual(response.status_code, 401)

    def test_logout(self) -> None:
        # Register and login
        self.client.post(
            "/api/auth/register",
            json={"username": "testuser", "password": "password123"},
        )
        self.client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "password123"},
        )

        # Verify logged in
        me_response = self.client.get("/api/auth/me")
        self.assertTrue(me_response.get_json()["logged_in"])

        # Logout
        logout_response = self.client.post("/api/auth/logout")
        self.assertEqual(logout_response.status_code, 200)

        # Verify logged out
        me_response = self.client.get("/api/auth/me")
        self.assertFalse(me_response.get_json()["logged_in"])


if __name__ == "__main__":
    unittest.main()
