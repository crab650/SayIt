"""Authentication routes and decorators for the SayIt server."""

from __future__ import annotations

import re
import time
from functools import wraps
from typing import Any, Callable

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from .db import get_db, transaction

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator to restrict access to authenticated users."""
    @wraps(view)
    def wrapped_view(*args: Any, **kwargs: Any) -> Any:
        if "user_id" not in session:
            return jsonify(error="Unauthorized access. Please log in."), 401
        return view(*args, **kwargs)
    return wrapped_view


def validate_username(username: str) -> bool:
    """Validate username: 3-30 chars, alphanumeric, underscores, hyphens."""
    return bool(re.match(r"^[a-zA-Z0-9_-]{3,30}$", username))


@auth_bp.post("/register")
def register() -> tuple[Any, int]:
    """Register a new user account."""
    data = request.get_json() or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify(error="Username and password are required."), 400

    if not validate_username(username):
        return jsonify(
            error="Username must be 3-30 characters long and contain only letters, numbers, underscores, or hyphens."
        ), 400

    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters long."), 400

    db = get_db()
    try:
        # Start transaction to insert user and initialize user_revisions
        with transaction() as conn:
            # Check if user already exists
            existing_user = conn.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            if existing_user:
                return jsonify(error="Username is already taken."), 409

            password_hash = generate_password_hash(password)
            created_at = int(time.time() * 1000)  # milliseconds

            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, password_hash, created_at),
            )
            user_id = cursor.lastrowid

            conn.execute(
                "INSERT INTO user_revisions (user_id, current_revision) VALUES (?, 0)",
                (user_id,),
            )
    except Exception as e:
        return jsonify(error=f"Registration failed: {str(e)}"), 500

    return jsonify(
        status="ok",
        user={"id": user_id, "username": username}
    ), 201


@auth_bp.post("/login")
def login() -> tuple[Any, int]:
    """Log in an existing user and start session."""
    data = request.get_json() or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify(error="Username and password are required."), 400

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Incorrect username or password."), 401

    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session.permanent = True

    return jsonify(
        status="ok",
        user={"id": user["id"], "username": user["username"]}
    ), 200


@auth_bp.post("/logout")
def logout() -> tuple[Any, int]:
    """Log out the current user and clear session."""
    session.clear()
    return jsonify(status="ok"), 200


@auth_bp.get("/me")
def me() -> tuple[Any, int]:
    """Get the current logged-in user details."""
    user_id = session.get("user_id")
    if user_id is None:
        return jsonify(logged_in=False), 200

    db = get_db()
    user = db.execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()

    if user is None:
        # Session references a non-existent user
        session.clear()
        return jsonify(logged_in=False), 200

    return jsonify(
        logged_in=True,
        user={"id": user["id"], "username": user["username"]}
    ), 200
