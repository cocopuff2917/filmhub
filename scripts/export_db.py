"""Export all MongoDB collections to JSON files in /app/exports/.

Usage:
    python /app/scripts/export_db.py
"""
import json
import os
from datetime import datetime, date
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

EXPORT_DIR = Path("/app/exports")
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def default_json(obj):
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except UnicodeDecodeError:
            return obj.hex()
    raise TypeError(f"Not serializable: {type(obj)}")


def main():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    summary = {}
    for name in sorted(db.list_collection_names()):
        docs = list(db[name].find({}))
        out = EXPORT_DIR / f"{name}.json"
        with out.open("w", encoding="utf-8") as f:
            json.dump(docs, f, default=default_json, ensure_ascii=False, indent=2)
        summary[name] = {"count": len(docs), "file": str(out.name)}
        print(f"Exported {name}: {len(docs)} docs -> {out}")

    manifest = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "database": DB_NAME,
        "collections": summary,
        "restore_hint": (
            "To restore, use mongoimport: "
            "mongoimport --db <DB> --collection <name> --file exports/<name>.json --jsonArray"
        ),
    }
    with (EXPORT_DIR / "_manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest: {EXPORT_DIR/'_manifest.json'}")


if __name__ == "__main__":
    main()
