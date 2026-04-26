"""
SQLite persistence layer for UNMAPPED.
One connection per call — safe under FastAPI's thread pool.
PRAGMA journal_mode=WAL allows concurrent reads during writes.
"""
import os
import secrets
import sqlite3
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

from modules.esco_graph.importer import populate_graph_if_empty

_HERE = Path(__file__).parent
DB_PATH = _HERE.parent.parent / "data" / "unmapped.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ── Schema ────────────────────────────────────────────────────────────────────

def init_db() -> None:
    conn = _connect()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                phone        TEXT    NOT NULL UNIQUE,
                name         TEXT,
                dob          TEXT,
                gender       TEXT,
                country_code TEXT,
                created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );

            CREATE TABLE IF NOT EXISTS otp_sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                phone       TEXT    NOT NULL,
                otp         TEXT    NOT NULL,
                expires_at  TEXT    NOT NULL,
                used        INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS user_tokens (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                token       TEXT    NOT NULL UNIQUE,
                user_id     INTEGER NOT NULL REFERENCES users(id),
                expires_at  TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS skill_profiles (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL REFERENCES users(id),
                session_id      TEXT    NOT NULL UNIQUE,
                profile_json    TEXT    NOT NULL,
                validation_json TEXT,
                created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );

            CREATE TABLE IF NOT EXISTS recruiter_shortlist (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT    NOT NULL UNIQUE,
                notes       TEXT,
                created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            );

            -- ESCO skill graph (read-only reference data)
            CREATE TABLE IF NOT EXISTS esco_skills (
                uri         TEXT PRIMARY KEY,
                label       TEXT NOT NULL,
                alt_labels  TEXT,
                skill_type  TEXT,
                broader_uri TEXT,
                description TEXT
            );

            CREATE TABLE IF NOT EXISTS esco_occupations (
                uri         TEXT PRIMARY KEY,
                label       TEXT NOT NULL,
                isco_code   TEXT,
                broader_uri TEXT
            );

            CREATE TABLE IF NOT EXISTS skill_occupation_links (
                skill_uri       TEXT NOT NULL REFERENCES esco_skills(uri),
                occupation_uri  TEXT NOT NULL REFERENCES esco_occupations(uri),
                relation_type   TEXT NOT NULL DEFAULT 'essential'
            );

            -- ISCO-08 → Frey-Osborne automation scores
            CREATE TABLE IF NOT EXISTS isco_automation (
                isco_code              TEXT PRIMARY KEY,
                isco_title             TEXT,
                soc_code               TEXT,
                automation_probability REAL
            );

            -- ISCO-08 → ISIC Rev.4 sector mapping
            CREATE TABLE IF NOT EXISTS isco_isic_sectors (
                isco_code  TEXT NOT NULL,
                isic_code  TEXT NOT NULL,
                is_primary INTEGER NOT NULL DEFAULT 1
            );

            -- Country NQF framework mappings (all 195 countries via UNESCO/ILO data)
            CREATE TABLE IF NOT EXISTS country_frameworks (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                country_code   TEXT    NOT NULL,
                framework_name TEXT,
                nqf_level      INTEGER,
                isco_code      TEXT,
                local_title    TEXT,
                cert_body      TEXT,
                isic_code      TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_esco_skills_label ON esco_skills(label);
            CREATE INDEX IF NOT EXISTS idx_skill_occ_skill ON skill_occupation_links(skill_uri);
            CREATE INDEX IF NOT EXISTS idx_skill_occ_occ ON skill_occupation_links(occupation_uri);
            CREATE INDEX IF NOT EXISTS idx_country_frameworks_cc ON country_frameworks(country_code);
            CREATE INDEX IF NOT EXISTS idx_country_frameworks_isco ON country_frameworks(isco_code);
        """)
    populate_graph_if_empty(conn)
    conn.close()


# ── User CRUD ─────────────────────────────────────────────────────────────────

def get_user_by_phone(phone: str, *, conn: sqlite3.Connection | None = None) -> dict | None:
    own = conn is None
    if own:
        conn = _connect()
    row = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
    if own:
        conn.close()
    return dict(row) if row else None


def create_user(phone: str) -> dict:
    conn = _connect()
    with conn:
        conn.execute("INSERT INTO users (phone) VALUES (?)", (phone,))
    user = get_user_by_phone(phone, conn=conn)
    conn.close()
    return user


def update_user(user_id: int, *, name: str | None = None, dob: str | None = None,
                gender: str | None = None, country_code: str | None = None) -> dict | None:
    fields, values = [], []
    if name is not None:
        fields.append("name = ?"); values.append(name)
    if dob is not None:
        fields.append("dob = ?"); values.append(dob)
    if gender is not None:
        fields.append("gender = ?"); values.append(gender)
    if country_code is not None:
        fields.append("country_code = ?"); values.append(country_code)
    if not fields:
        conn = _connect()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
    values.append(user_id)
    conn = _connect()
    with conn:
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ── OTP CRUD ──────────────────────────────────────────────────────────────────

def create_otp(phone: str) -> str:
    otp = str(secrets.randbelow(9000) + 1000)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = _connect()
    with conn:
        conn.execute(
            "INSERT INTO otp_sessions (phone, otp, expires_at) VALUES (?, ?, ?)",
            (phone, otp, expires_at),
        )
    conn.close()
    return otp


def verify_otp(phone: str, otp: str) -> bool:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = _connect()
    row = conn.execute(
        "SELECT id FROM otp_sessions WHERE phone=? AND otp=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1",
        (phone, otp, now),
    ).fetchone()
    if not row:
        conn.close()
        return False
    with conn:
        conn.execute("UPDATE otp_sessions SET used=1 WHERE id=?", (row["id"],))
    conn.close()
    return True


# ── Token CRUD ────────────────────────────────────────────────────────────────

def create_token(user_id: int) -> str:
    token = secrets.token_hex(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = _connect()
    with conn:
        conn.execute(
            "INSERT INTO user_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at),
        )
    conn.close()
    return token


def get_user_by_token(token: str) -> dict | None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = _connect()
    row = conn.execute(
        """SELECT u.* FROM users u
           JOIN user_tokens t ON t.user_id = u.id
           WHERE t.token=? AND t.expires_at>?""",
        (token, now),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ── Profile CRUD ──────────────────────────────────────────────────────────────

def save_profile(user_id: int, session_id: str, profile_json: str,
                 validation_json: str | None = None) -> dict:
    conn = _connect()
    with conn:
        conn.execute(
            """INSERT INTO skill_profiles (user_id, session_id, profile_json, validation_json)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(session_id) DO UPDATE SET
                   profile_json    = excluded.profile_json,
                   validation_json = COALESCE(excluded.validation_json, skill_profiles.validation_json)""",
            (user_id, session_id, profile_json, validation_json),
        )
    row = conn.execute("SELECT * FROM skill_profiles WHERE session_id=?", (session_id,)).fetchone()
    conn.close()
    return dict(row)


def get_user_profiles(user_id: int) -> list[dict]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM skill_profiles WHERE user_id=? ORDER BY created_at DESC", (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_skill_profiles(*, country_code: str | None = None, limit: int = 50) -> list[dict]:
    """
    Returns rows from skill_profiles for recruiter matching.
    Note: profile_json is stored as TEXT; callers may parse it as JSON.
    """
    conn = _connect()
    if country_code:
        # country_code is inside profile_json, so we filter in memory after fetch.
        rows = conn.execute(
            "SELECT * FROM skill_profiles ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()
        out: list[dict] = []
        for r in rows:
            d = dict(r)
            try:
                pj = json.loads(d.get("profile_json") or "{}")
                if (pj.get("country") or {}).get("code") == country_code:
                    out.append(d)
            except Exception:
                continue
        return out

    rows = conn.execute(
        "SELECT * FROM skill_profiles ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_skill_profiles_with_users(*, country_code: str | None = None, limit: int = 50) -> list[dict]:
    """
    Same as get_all_skill_profiles(), but includes user fields from users table.
    Returns dict rows containing: skill_profiles.* + user_name + user_phone + user_country_code.
    """
    conn = _connect()
    rows = conn.execute(
        """SELECT sp.*, u.name as user_name, u.phone as user_phone, u.country_code as user_country_code
           FROM skill_profiles sp
           JOIN users u ON u.id = sp.user_id
           ORDER BY sp.created_at DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()

    out = [dict(r) for r in rows]
    if not country_code:
        return out

    filtered: list[dict] = []
    for d in out:
        try:
            pj = json.loads(d.get("profile_json") or "{}")
            if (pj.get("country") or {}).get("code") == country_code:
                filtered.append(d)
        except Exception:
            continue
    return filtered


def get_skill_profile_with_user_by_session_id(session_id: str) -> dict | None:
    conn = _connect()
    row = conn.execute(
        """SELECT sp.*, u.name as user_name, u.phone as user_phone, u.country_code as user_country_code
           FROM skill_profiles sp
           JOIN users u ON u.id = sp.user_id
           WHERE sp.session_id = ?
           LIMIT 1""",
        (session_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def shortlist_add(session_id: str, notes: str | None = None) -> dict:
    conn = _connect()
    with conn:
        conn.execute(
            """INSERT INTO recruiter_shortlist (session_id, notes)
               VALUES (?, ?)
               ON CONFLICT(session_id) DO UPDATE SET
                   notes = excluded.notes""",
            (session_id, notes),
        )
    row = conn.execute("SELECT * FROM recruiter_shortlist WHERE session_id=?", (session_id,)).fetchone()
    conn.close()
    return dict(row)


def shortlist_remove(session_id: str) -> None:
    conn = _connect()
    with conn:
        conn.execute("DELETE FROM recruiter_shortlist WHERE session_id=?", (session_id,))
    conn.close()


def shortlist_list(limit: int = 200) -> list[dict]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM recruiter_shortlist ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
