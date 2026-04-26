"""
Graph query helpers over the ESCO SQLite tables.
All functions open their own connection; pass conn= to reuse an existing one.
"""
import sqlite3
from modules.auth.database import _connect


def _conn(conn: sqlite3.Connection | None) -> tuple[sqlite3.Connection, bool]:
    if conn is not None:
        return conn, False
    return _connect(), True


def get_skill_by_label(label: str, conn: sqlite3.Connection | None = None) -> dict | None:
    c, own = _conn(conn)
    row = c.execute(
        "SELECT * FROM esco_skills WHERE label = ? COLLATE NOCASE LIMIT 1", (label,)
    ).fetchone()
    if not row:
        row = c.execute(
            "SELECT * FROM esco_skills WHERE alt_labels LIKE ? LIMIT 1", (f"%{label}%",)
        ).fetchone()
    if own:
        c.close()
    return dict(row) if row else None


def get_occupations_for_skill(skill_uri: str, conn: sqlite3.Connection | None = None) -> list[dict]:
    c, own = _conn(conn)
    rows = c.execute(
        """SELECT o.*, l.relation_type
           FROM esco_occupations o
           JOIN skill_occupation_links l ON l.occupation_uri = o.uri
           WHERE l.skill_uri = ?""",
        (skill_uri,),
    ).fetchall()
    if own:
        c.close()
    return [dict(r) for r in rows]


def get_automation_prob_by_isco(isco_code: str, conn: sqlite3.Connection | None = None) -> float | None:
    """Returns Frey-Osborne raw probability for a 4-digit ISCO-08 code, or None if not found."""
    c, own = _conn(conn)
    row = c.execute(
        "SELECT automation_probability FROM isco_automation WHERE isco_code = ? LIMIT 1",
        (isco_code,),
    ).fetchone()
    if not row:
        # Try 3-digit prefix (ISCO minor group)
        row = c.execute(
            "SELECT AVG(automation_probability) AS automation_probability FROM isco_automation WHERE isco_code LIKE ?",
            (isco_code[:3] + "%",),
        ).fetchone()
    if own:
        c.close()
    return row["automation_probability"] if row and row["automation_probability"] is not None else None


def get_skill_ancestors(skill_uri: str, max_depth: int = 4,
                        conn: sqlite3.Connection | None = None) -> list[dict]:
    """Traverse broader_uri chain upward. Returns list from immediate parent to root."""
    c, own = _conn(conn)
    rows = c.execute(
        """WITH RECURSIVE ancestors(uri, label, broader_uri, depth) AS (
               SELECT uri, label, broader_uri, 1
               FROM esco_skills WHERE uri = ?
               UNION ALL
               SELECT s.uri, s.label, s.broader_uri, a.depth + 1
               FROM esco_skills s JOIN ancestors a ON s.uri = a.broader_uri
               WHERE a.depth < ?
           )
           SELECT * FROM ancestors WHERE depth > 1 ORDER BY depth""",
        (skill_uri, max_depth),
    ).fetchall()
    if own:
        c.close()
    return [dict(r) for r in rows]


def get_sibling_skills(skill_uri: str, conn: sqlite3.Connection | None = None) -> list[dict]:
    """Skills that share the same broader_uri (lateral neighbors in the taxonomy)."""
    c, own = _conn(conn)
    # First get broader_uri of the target skill
    row = c.execute("SELECT broader_uri FROM esco_skills WHERE uri = ?", (skill_uri,)).fetchone()
    if not row or not row["broader_uri"]:
        if own:
            c.close()
        return []
    rows = c.execute(
        "SELECT * FROM esco_skills WHERE broader_uri = ? AND uri != ? LIMIT 30",
        (row["broader_uri"], skill_uri),
    ).fetchall()
    if own:
        c.close()
    return [dict(r) for r in rows]


def get_automation_for_skill(skill_label: str, conn: sqlite3.Connection | None = None) -> float | None:
    """
    Full pipeline: skill label → ESCO URI → ISCO code → Frey-Osborne probability.
    Returns None if any step in the chain is missing.
    """
    c, own = _conn(conn)
    skill = get_skill_by_label(skill_label, conn=c)
    if not skill:
        if own:
            c.close()
        return None
    occs = get_occupations_for_skill(skill["uri"], conn=c)
    if not occs:
        if own:
            c.close()
        return None
    # Average automation probability across all linked occupations
    probs = []
    for occ in occs:
        if occ.get("isco_code"):
            p = get_automation_prob_by_isco(occ["isco_code"], conn=c)
            if p is not None:
                probs.append(p)
    if own:
        c.close()
    return sum(probs) / len(probs) if probs else None


def get_country_framework(country_code: str, isco_code: str,
                          conn: sqlite3.Connection | None = None) -> dict | None:
    """Return the NQF framework entry for a country + ISCO code combination."""
    c, own = _conn(conn)
    row = c.execute(
        "SELECT * FROM country_frameworks WHERE country_code=? AND isco_code=? LIMIT 1",
        (country_code, isco_code),
    ).fetchone()
    if not row:
        # Try 3-digit ISCO prefix
        row = c.execute(
            "SELECT * FROM country_frameworks WHERE country_code=? AND isco_code LIKE ? LIMIT 1",
            (country_code, isco_code[:3] + "%"),
        ).fetchone()
    if own:
        c.close()
    return dict(row) if row else None
