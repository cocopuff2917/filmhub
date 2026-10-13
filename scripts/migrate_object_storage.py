"""Copy uploaded objects from a source Emergent bucket into a target.

Dry-run (default):
    python scripts/migrate_object_storage.py

Copy into another Emergent bucket:
    python scripts/migrate_object_storage.py --apply

Copy into AWS S3:
    python scripts/migrate_object_storage.py --apply --s3-bucket YOUR_BUCKET --region YOUR_REGION

Copy into Supabase Storage:
    python scripts/migrate_object_storage.py --apply --supabase-bucket YOUR_BUCKET

Download to a local directory:
    python scripts/migrate_object_storage.py --apply --download-dir exports/site-images

Required environment variables for --apply:
    MONGO_URL, DB_NAME, SOURCE_EMERGENT_LLM_KEY

AWS credentials are resolved by boto3's standard credential chain (for example,
an IAM role or AWS_PROFILE). Set AWS_REGION or pass --region for the destination.
Supabase migration requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The
destination bucket must already exist.

The Mongo connection must point to the production database so its `files`
collection provides the complete list of object paths used by production data.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import requests
import boto3
from botocore.exceptions import ClientError
from pymongo import MongoClient


DEFAULT_STORAGE_BASE = "https://integrations.emergentagent.com"


def storage_url(base_url):
    return base_url.rstrip("/") + "/objstore/api/v1/storage"


def initialize_bucket(api_url, emergent_key):
    response = requests.post(
        f"{api_url}/init",
        json={"emergent_key": emergent_key},
        timeout=30,
    )
    response.raise_for_status()
    bucket_key = response.json().get("storage_key")
    if not bucket_key:
        raise RuntimeError("Object storage did not return a bucket key")
    return bucket_key


def object_url(api_url, path):
    return f"{api_url}/objects/{quote(path, safe='/')}"


def object_paths(db):
    paths = {}
    for item in db.files.find({}, {"storage_path": 1, "content_type": 1}):
        path = (item.get("storage_path") or "").strip().lstrip("/")
        if path:
            paths[path] = item.get("content_type") or "application/octet-stream"
    return paths


def copy_objects(paths, api_url, source_key, target_key):
    copied = skipped = failed = 0
    for path, content_type in paths.items():
        url = object_url(api_url, path)
        headers = {"X-Storage-Key": target_key}
        target_response = requests.get(url, headers=headers, timeout=60)
        if target_response.status_code == 200:
            skipped += 1
            print(f"already present: {path}")
            continue
        if target_response.status_code != 404:
            print(f"target read failed ({target_response.status_code}): {path}")
            failed += 1
            continue

        source_response = requests.get(
            url,
            headers={"X-Storage-Key": source_key},
            timeout=60,
        )
        if source_response.status_code != 200:
            print(f"source read failed ({source_response.status_code}): {path}")
            failed += 1
            continue

        source_bytes = source_response.content
        upload_response = requests.put(
            url,
            headers={
                "X-Storage-Key": target_key,
                "Content-Type": source_response.headers.get("Content-Type") or content_type,
            },
            data=source_bytes,
            timeout=120,
        )
        if not upload_response.ok:
            print(f"target upload failed ({upload_response.status_code}): {path}")
            failed += 1
            continue

        verify_response = requests.get(url, headers=headers, timeout=60)
        if (
            verify_response.status_code != 200
            or hashlib.sha256(verify_response.content).digest() != hashlib.sha256(source_bytes).digest()
        ):
            print(f"checksum verification failed: {path}")
            failed += 1
            continue

        copied += 1
        print(f"copied and verified: {path}")

    return copied, skipped, failed


def download_objects(paths, api_url, source_key, destination, database):
    root = Path(destination).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "database": database,
        "objects": [],
    }
    downloaded = failed = 0

    for path, content_type in paths.items():
        relative_path = PurePosixPath(path)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            print(f"unsafe object path skipped: {path}")
            failed += 1
            continue

        target_path = (root / Path(*relative_path.parts)).resolve()
        if root not in target_path.parents:
            print(f"object path escaped destination and was skipped: {path}")
            failed += 1
            continue

        response = requests.get(
            object_url(api_url, path),
            headers={"X-Storage-Key": source_key},
            timeout=120,
        )
        if response.status_code != 200:
            print(f"source read failed ({response.status_code}): {path}")
            manifest["objects"].append({"path": path, "status": "failed"})
            failed += 1
            continue

        data = response.content
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = target_path.with_name(target_path.name + ".part")
        temporary_path.write_bytes(data)
        temporary_path.replace(target_path)
        manifest["objects"].append({
            "path": path,
            "content_type": response.headers.get("Content-Type") or content_type,
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "status": "downloaded",
        })
        downloaded += 1

    manifest_path = root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Download summary: downloaded={downloaded}, failed={failed}, manifest={manifest_path}")
    return downloaded, failed


def copy_objects_to_s3(paths, api_url, source_key, s3_client, bucket, prefix=""):
    copied = skipped = failed = 0
    prefix = prefix.strip("/")

    for path, content_type in paths.items():
        relative_path = PurePosixPath(path)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            print(f"unsafe object path skipped: {path}")
            failed += 1
            continue
        object_key = f"{prefix}/{path}" if prefix else path

        try:
            s3_client.head_object(Bucket=bucket, Key=object_key)
            skipped += 1
            print(f"already present in S3: {object_key}")
            continue
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = error.response.get("Error", {}).get("Code")
            if status != 404 and code not in ("404", "NoSuchKey", "NotFound"):
                print(f"S3 existence check failed ({code or status}): {object_key}")
                failed += 1
                continue

        source_response = requests.get(
            object_url(api_url, path),
            headers={"X-Storage-Key": source_key},
            timeout=120,
        )
        if source_response.status_code != 200:
            print(f"source read failed ({source_response.status_code}): {path}")
            failed += 1
            continue

        source_bytes = source_response.content
        digest = hashlib.sha256(source_bytes).hexdigest()
        actual_content_type = source_response.headers.get("Content-Type") or content_type
        try:
            s3_client.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=source_bytes,
                ContentType=actual_content_type,
                Metadata={"source-sha256": digest},
            )
            saved = s3_client.get_object(Bucket=bucket, Key=object_key)
            uploaded_bytes = saved["Body"].read()
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "unknown")
            print(f"S3 upload or verification failed ({code}): {object_key}")
            failed += 1
            continue

        if hashlib.sha256(uploaded_bytes).hexdigest() != digest:
            print(f"S3 checksum verification failed: {object_key}")
            failed += 1
            continue

        copied += 1
        print(f"copied and verified in S3: {object_key}")

    return copied, skipped, failed


def copy_objects_to_supabase(paths, api_url, source_key, supabase_url, service_role_key, bucket):
    copied = skipped = failed = 0
    base_url = supabase_url.rstrip("/")
    encoded_bucket = quote(bucket, safe="")
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
    }

    for path, content_type in paths.items():
        relative_path = PurePosixPath(path)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            print(f"unsafe object path skipped: {path}")
            failed += 1
            continue

        object_url = f"{base_url}/storage/v1/object/{encoded_bucket}/{quote(path, safe='/')}"
        existing = requests.get(object_url, headers=headers, timeout=60)
        if existing.status_code == 200:
            skipped += 1
            print(f"already present in Supabase: {path}")
            continue
        if existing.status_code != 404:
            print(f"Supabase existence check failed ({existing.status_code}): {path}")
            failed += 1
            continue

        source_response = requests.get(
            object_url(api_url, path),
            headers={"X-Storage-Key": source_key},
            timeout=120,
        )
        if source_response.status_code != 200:
            print(f"source read failed ({source_response.status_code}): {path}")
            failed += 1
            continue

        source_bytes = source_response.content
        upload_headers = {
            **headers,
            "Content-Type": source_response.headers.get("Content-Type") or content_type,
            "x-upsert": "true",
        }
        upload_response = requests.post(
            object_url,
            headers=upload_headers,
            data=source_bytes,
            timeout=120,
        )
        if not upload_response.ok:
            print(f"Supabase upload failed ({upload_response.status_code}): {path}")
            failed += 1
            continue

        verify_response = requests.get(object_url, headers=headers, timeout=60)
        if (
            verify_response.status_code != 200
            or hashlib.sha256(verify_response.content).digest() != hashlib.sha256(source_bytes).digest()
        ):
            print(f"Supabase checksum verification failed: {path}")
            failed += 1
            continue

        copied += 1
        print(f"copied and verified in Supabase: {path}")

    return copied, skipped, failed


def main():
    parser = argparse.ArgumentParser(description="Migrate uploaded files between Emergent Object Storage buckets")
    parser.add_argument("--apply", action="store_true", help="Copy missing objects; without this flag, only report the object count")
    parser.add_argument("--download-dir", help="With --apply, download source objects into this local directory")
    parser.add_argument("--s3-bucket", help="With --apply, copy source objects into this AWS S3 bucket")
    parser.add_argument("--s3-prefix", default="", help="Optional key prefix for objects copied to S3")
    parser.add_argument(
        "--supabase-bucket",
        help="With --apply, copy source objects into this Supabase Storage bucket",
    )
    parser.add_argument("--region", default=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"), help="AWS region (defaults to AWS_REGION/AWS_DEFAULT_REGION)")
    args = parser.parse_args()

    destinations = [args.download_dir, args.s3_bucket, args.supabase_bucket]
    if sum(bool(destination) for destination in destinations) > 1:
        parser.error("--download-dir, --s3-bucket, and --supabase-bucket are mutually exclusive")

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        parser.error("MONGO_URL and DB_NAME must point to the production database")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    try:
        db = client[db_name]
        paths = object_paths(db)
        print(f"Found {len(paths)} unique object paths in {db_name}.files")
        if not args.apply:
            destination = (
                f"S3 bucket {args.s3_bucket}" if args.s3_bucket else
                f"Supabase bucket {args.supabase_bucket}" if args.supabase_bucket else
                args.download_dir or "an Emergent bucket"
            )
            print(f"Dry-run only. Destination: {destination}. Re-run with --apply to copy or download objects.")
            return 0

        source_secret = os.environ.get("SOURCE_EMERGENT_LLM_KEY")
        if not source_secret:
            parser.error("SOURCE_EMERGENT_LLM_KEY is required with --apply")

        api_url = storage_url(os.environ.get("INTEGRATION_PROXY_URL") or DEFAULT_STORAGE_BASE)
        source_bucket = initialize_bucket(api_url, source_secret)
        if args.download_dir:
            downloaded, failed = download_objects(paths, api_url, source_bucket, args.download_dir, db_name)
            return 1 if failed else 0
        if args.s3_bucket:
            s3_client = boto3.client("s3", region_name=args.region)
            copied, skipped, failed = copy_objects_to_s3(
                paths,
                api_url,
                source_bucket,
                s3_client,
                args.s3_bucket,
                args.s3_prefix,
            )
            print(f"S3 migration summary: copied={copied}, already_present={skipped}, failed={failed}")
            return 1 if failed else 0
        if args.supabase_bucket:
            supabase_url = os.environ.get("SUPABASE_URL")
            service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not supabase_url or not service_role_key:
                parser.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase migration")
            copied, skipped, failed = copy_objects_to_supabase(
                paths,
                api_url,
                source_bucket,
                supabase_url,
                service_role_key,
                args.supabase_bucket,
            )
            print(f"Supabase migration summary: copied={copied}, already_present={skipped}, failed={failed}")
            return 1 if failed else 0

        target_secret = os.environ.get("TARGET_EMERGENT_LLM_KEY")
        if not target_secret:
            parser.error("TARGET_EMERGENT_LLM_KEY is required when copying to another bucket")
        target_bucket = initialize_bucket(api_url, target_secret)
        if source_bucket == target_bucket:
            print("Source and target resolve to the same bucket; no migration is needed.")
            return 0

        copied, skipped, failed = copy_objects(paths, api_url, source_bucket, target_bucket)
        print(f"Migration summary: copied={copied}, already_present={skipped}, failed={failed}")
        return 1 if failed else 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())