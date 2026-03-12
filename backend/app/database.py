"""
database.py - SQLite database for emails + chat history.

Tables:
  chat_users    → stores user emails
  chat_messages → stores every message (user + bot) with email linked
"""

import sqlite3
import logging
from pathlib import Path
from app.config import BASE_DIR

logger  = logging.getLogger("database")
DB_PATH = BASE_DIR / "users.db"


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables on server startup."""
    conn = get_connection()

    # Table 1: Users (emails)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_users (
            id         INTEGER  PRIMARY KEY AUTOINCREMENT,
            email      TEXT     NOT NULL UNIQUE,
            name       TEXT     DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table 2: Chat messages — every Q&A saved here
    conn.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id         INTEGER  PRIMARY KEY AUTOINCREMENT,
            email      TEXT     NOT NULL,
            role       TEXT     NOT NULL CHECK(role IN ('user','bot')),
            message    TEXT     NOT NULL,
            sources    TEXT     DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email) REFERENCES chat_users(email)
        )
    """)

    conn.commit()
    conn.close()
    logger.info("✅ Database ready at %s", DB_PATH)


# ── Email functions ────────────────────────────────────────────────────────────

def save_email(email: str, name: str = "") -> bool:
    """Save user email. Returns True if new user, False if existing."""
    try:
        conn = get_connection()
        conn.execute(
            "INSERT OR IGNORE INTO chat_users (email, name) VALUES (?, ?)",
            (email.lower().strip(), name.strip()),
        )
        conn.commit()
        saved = conn.total_changes > 0
        conn.close()
        logger.info("%s email: %s", "New" if saved else "Existing", email)
        return saved
    except Exception as e:
        logger.error("Error saving email: %s", e)
        return False


def get_all_emails():
    """Get all users with their total message count."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            u.id,
            u.email,
            u.name,
            u.created_at,
            COUNT(m.id) as total_messages
        FROM chat_users u
        LEFT JOIN chat_messages m ON u.email = m.email
        GROUP BY u.email
        ORDER BY u.created_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Chat history functions ─────────────────────────────────────────────────────

def save_message(email: str, role: str, message: str, sources: list = []):
    """
    Save a single message to chat_messages.
    role = 'user' or 'bot'
    """
    try:
        conn = get_connection()
        conn.execute(
            """INSERT INTO chat_messages (email, role, message, sources)
               VALUES (?, ?, ?, ?)""",
            (
                email.lower().strip(),
                role,
                message,
                ", ".join(sources) if sources else "",
            ),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error("Error saving message: %s", e)


def get_chat_history(email: str):
    """Get full chat history for a specific user."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT role, message, sources, created_at
        FROM chat_messages
        WHERE email = ?
        ORDER BY created_at ASC
    """, (email.lower().strip(),)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_chats():
    """
    Admin view — all chats grouped by user email.
    Returns list of users, each with their messages.
    """
    conn = get_connection()

    # Get all users who have chatted
    users = conn.execute("""
        SELECT DISTINCT email FROM chat_messages ORDER BY email
    """).fetchall()

    result = []
    for user in users:
        email = user["email"]
        messages = conn.execute("""
            SELECT role, message, sources, created_at
            FROM chat_messages
            WHERE email = ?
            ORDER BY created_at ASC
        """, (email,)).fetchall()
        result.append({
            "email": email,
            "total_messages": len(messages),
            "messages": [dict(m) for m in messages],
        })

    conn.close()
    return result