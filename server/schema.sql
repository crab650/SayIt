PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_revisions (
    user_id INTEGER PRIMARY KEY,
    current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tabs (
    user_id INTEGER NOT NULL,
    tab_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    eyebrow TEXT NOT NULL DEFAULT '',
    placeholder TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'text',
    code_theme TEXT NOT NULL DEFAULT 'midnight',
    content TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (user_id, tab_id),
    UNIQUE (user_id, revision),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tabs_user_revision
    ON tabs (user_id, revision);

CREATE TABLE IF NOT EXISTS tombstones (
    user_id INTEGER NOT NULL,
    tab_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    deleted_at INTEGER NOT NULL,
    deleted_by TEXT NOT NULL,
    PRIMARY KEY (user_id, tab_id),
    UNIQUE (user_id, revision),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tombstones_user_revision
    ON tombstones (user_id, revision);

CREATE TABLE IF NOT EXISTS processed_operations (
    user_id INTEGER NOT NULL,
    operation_id TEXT NOT NULL,
    revision INTEGER,
    result_json TEXT NOT NULL,
    processed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, operation_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_processed_operations_user_time
    ON processed_operations (user_id, processed_at);
