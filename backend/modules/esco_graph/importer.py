"""
Populates ESCO graph + cross-taxonomy reference tables from bundled CSV files.
Runs once at startup if tables are empty; skips silently if CSVs are missing.
"""
import csv
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR  = Path(__file__).parent.parent.parent / "data"
ESCO_DIR  = DATA_DIR / "esco_v1.1"


def populate_graph_if_empty(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM esco_skills").fetchone()[0]
    if count > 0:
        return

    _import_esco_skills(conn)
    _import_esco_occupations(conn)
    _import_skill_occupation_links(conn)
    _import_isco_automation(conn)
    _import_isco_isic(conn)
    _import_country_frameworks(conn)

    total_skills = conn.execute("SELECT COUNT(*) FROM esco_skills").fetchone()[0]
    total_occ    = conn.execute("SELECT COUNT(*) FROM esco_occupations").fetchone()[0]
    logger.info("ESCO graph populated: %d skills, %d occupations", total_skills, total_occ)


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        logger.warning("CSV not found, skipping: %s", path)
        return []
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _import_esco_skills(conn: sqlite3.Connection) -> None:
    rows = _read_csv(ESCO_DIR / "skills_en.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR IGNORE INTO esco_skills
               (uri, label, alt_labels, skill_type, broader_uri, description)
               VALUES (:uri, :label, :altLabels, :skillType, :broaderUri, :description)""",
            [
                {
                    "uri":        r.get("conceptUri", ""),
                    "label":      r.get("preferredLabel", ""),
                    "altLabels":  r.get("altLabels", ""),
                    "skillType":  r.get("skillType", "skill"),
                    "broaderUri": r.get("broaderUri", ""),
                    "description": r.get("description", ""),
                }
                for r in rows if r.get("conceptUri")
            ],
        )
    logger.info("Imported %d ESCO skills", len(rows))


def _import_esco_occupations(conn: sqlite3.Connection) -> None:
    rows = _read_csv(ESCO_DIR / "occupations_en.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR IGNORE INTO esco_occupations (uri, label, isco_code, broader_uri)
               VALUES (:uri, :label, :iscoCode, :broaderUri)""",
            [
                {
                    "uri":        r.get("conceptUri", ""),
                    "label":      r.get("preferredLabel", ""),
                    "iscoCode":   r.get("iscoGroup", ""),
                    "broaderUri": r.get("broaderUri", ""),
                }
                for r in rows if r.get("conceptUri")
            ],
        )
    logger.info("Imported %d ESCO occupations", len(rows))


def _import_skill_occupation_links(conn: sqlite3.Connection) -> None:
    rows = _read_csv(ESCO_DIR / "skillsRelationsWithOccupations.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR IGNORE INTO skill_occupation_links (skill_uri, occupation_uri, relation_type)
               VALUES (:skillUri, :occupationUri, :relationType)""",
            [
                {
                    "skillUri":      r.get("skillUri", ""),
                    "occupationUri": r.get("occupationUri", ""),
                    "relationType":  r.get("relationType", "essential"),
                }
                for r in rows if r.get("skillUri") and r.get("occupationUri")
            ],
        )
    logger.info("Imported %d skill-occupation links", len(rows))


def _import_isco_automation(conn: sqlite3.Connection) -> None:
    rows = _read_csv(DATA_DIR / "isco_automation.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR REPLACE INTO isco_automation
               (isco_code, isco_title, soc_code, automation_probability)
               VALUES (:isco_code, :isco_title, :soc_code, :automation_probability)""",
            rows,
        )
    logger.info("Imported %d ISCO automation scores", len(rows))


def _import_isco_isic(conn: sqlite3.Connection) -> None:
    rows = _read_csv(DATA_DIR / "isco_isic.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR IGNORE INTO isco_isic_sectors (isco_code, isic_code, is_primary)
               VALUES (:isco_code, :isic_code, :is_primary)""",
            rows,
        )
    logger.info("Imported %d ISCO-ISIC sector mappings", len(rows))


def _import_country_frameworks(conn: sqlite3.Connection) -> None:
    rows = _read_csv(DATA_DIR / "country_frameworks.csv")
    if not rows:
        return
    with conn:
        conn.executemany(
            """INSERT OR IGNORE INTO country_frameworks
               (country_code, framework_name, nqf_level, isco_code, local_title, cert_body, isic_code)
               VALUES (:country_code, :framework_name, :nqf_level, :isco_code,
                       :local_title, :cert_body, :isic_code)""",
            rows,
        )
    logger.info("Imported %d country framework entries", len(rows))
