import json
import uuid
from pathlib import Path

from modules.auth.database import init_db, create_user, update_user, save_profile


HERE = Path(__file__).parent
DEMO_DIR = HERE.parent / "data" / "demo_profiles"


def _e164_fake(n: int) -> str:
    # Simple unique E.164-like numbers for local dev
    return f"+999000{n:07d}"


def main() -> None:
    init_db()

    demo_files = sorted(DEMO_DIR.glob("*.json"))
    if not demo_files:
        raise SystemExit(f"No demo profiles found in {DEMO_DIR}")

    created = 0
    for idx, path in enumerate(demo_files, start=1):
        demo = json.loads(path.read_text())

        phone = _e164_fake(idx)
        user = create_user(phone)

        # Best-effort populate some user fields from persona name and country
        persona = (demo.get("persona") or path.stem).replace("_", " ").title()
        cc = (demo.get("country") or {}).get("code")
        update_user(user["id"], name=persona, country_code=cc)

        session_id = f"seed-{path.stem}-{uuid.uuid4()}"
        demo["session_id"] = session_id
        demo["profile_id"] = f"{demo.get('profile_id', path.stem)}-{uuid.uuid4()}"

        save_profile(
            user_id=user["id"],
            session_id=session_id,
            profile_json=json.dumps(demo),
            validation_json=None,
        )
        created += 1

    print(f"Seeded {created} demo profiles into skill_profiles.")


if __name__ == "__main__":
    main()

