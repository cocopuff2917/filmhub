import asyncio
from copy import deepcopy
from io import BytesIO
from types import SimpleNamespace

from bson import ObjectId

from backend import server


class FakeCollection:
    def __init__(self, documents):
        self.documents = {doc["_id"]: deepcopy(doc) for doc in documents}

    async def find_one(self, query, projection):
        id_query = next((part for part in query.get("$and", []) if "_id" in part), query)
        doc = self.documents.get(id_query["_id"])
        if not doc or doc.get("deleted") is True or doc.get("deleted_at"):
            return None
        return deepcopy(doc)

    async def update_one(self, query, update):
        doc = self.documents.get(query["_id"])
        if not doc:
            return SimpleNamespace(modified_count=0)
        for field, value in query.items():
            if field != "_id" and doc.get(field) != value:
                return SimpleNamespace(modified_count=0)
        doc.update(update["$set"])
        return SimpleNamespace(modified_count=1)


def test_cleanup_clears_confirmed_images_and_preserves_healthy_gallery(monkeypatch):
    user_id = ObjectId()
    actor_id = ObjectId()
    movie_id = ObjectId()
    users = FakeCollection([{"_id": user_id, "avatar_url": "missing-avatar.jpg"}])
    actors = FakeCollection([{"_id": actor_id, "photo_url": "missing-actor.jpg"}])
    movies = FakeCollection([{
        "_id": movie_id,
        "poster_url": "missing-poster.jpg",
        "poster_urls": ["missing-poster.jpg", "healthy-poster.jpg"],
    }])
    monkeypatch.setattr(server, "db", SimpleNamespace(users=users, actors=actors, movies=movies, series=FakeCollection([])))
    payload = server.BrokenImageCleanupRequest(items=[
        {"id": str(user_id), "kind": "users", "field": "avatar_url", "url": "missing-avatar.jpg"},
        {"id": str(actor_id), "kind": "actors", "field": "photo_url", "url": "missing-actor.jpg"},
        {"id": str(movie_id), "kind": "movies", "field": "poster_url", "url": "missing-poster.jpg"},
        {"id": str(movie_id), "kind": "movies", "field": "poster_urls", "url": "missing-poster.jpg"},
    ])

    result = asyncio.run(server.apply_image_cleanup(payload, admin={"role": "admin"}))

    assert result == {"removed": 4, "conflicted": 0}
    assert users.documents[user_id]["avatar_url"] == ""
    assert actors.documents[actor_id]["photo_url"] == ""
    assert movies.documents[movie_id]["poster_url"] == "healthy-poster.jpg"
    assert movies.documents[movie_id]["poster_urls"] == ["healthy-poster.jpg"]


def test_cleanup_leaves_changed_image_reference_untouched(monkeypatch):
    user_id = ObjectId()
    users = FakeCollection([{"_id": user_id, "avatar_url": "new-avatar.jpg"}])
    monkeypatch.setattr(server, "db", SimpleNamespace(users=users, actors=FakeCollection([]), movies=FakeCollection([]), series=FakeCollection([])))
    payload = server.BrokenImageCleanupRequest(items=[
        {"id": str(user_id), "kind": "users", "field": "avatar_url", "url": "old-avatar.jpg"},
    ])

    result = asyncio.run(server.apply_image_cleanup(payload, admin={"role": "admin"}))

    assert result == {"removed": 0, "conflicted": 1}
    assert users.documents[user_id]["avatar_url"] == "new-avatar.jpg"


def test_cleanup_removes_broken_actor_gallery_image_and_updates_headshot(monkeypatch):
    actor_id = ObjectId()
    actors = FakeCollection([{
        "_id": actor_id,
        "photo_url": "broken-gallery.jpg",
        "gallery": ["broken-gallery.jpg", "healthy-gallery.jpg"],
    }])
    monkeypatch.setattr(server, "db", SimpleNamespace(actors=actors))
    payload = server.BrokenImageCleanupRequest(items=[
        {"id": str(actor_id), "kind": "actors", "field": "gallery", "url": "broken-gallery.jpg"},
    ])

    result = asyncio.run(server.apply_image_cleanup(payload, admin={"role": "admin"}))

    assert result == {"removed": 1, "conflicted": 0}
    assert actors.documents[actor_id]["gallery"] == ["healthy-gallery.jpg"]
    assert actors.documents[actor_id]["photo_url"] == "healthy-gallery.jpg"


def test_automatic_cleanup_cron_is_disabled(monkeypatch):
    monkeypatch.setattr(server, "_verify_cron_auth", lambda authorization: None)

    result = asyncio.run(server.cron_cleanup(SimpleNamespace(headers={}), authorization=None))

    assert result == {"ok": True, "disabled": True}


def test_manual_disk_cleanup_is_disabled(monkeypatch):
    async def fail_if_run():
        raise AssertionError("disk cleanup must remain disabled")

    monkeypatch.setattr(server, "_run_cleanup", fail_if_run)

    result = asyncio.run(server.run_cleanup_now(_admin={"role": "admin"}))

    assert result == {"ok": True, "disabled": True}


def test_image_transform_failure_returns_original_for_all_formats(monkeypatch):
    original = b"browser-supported image data"
    monkeypatch.setattr(server, "get_object", lambda path: (original, "image/svg+xml"))

    for image_format in ("jpeg", "thumbnail"):
        response = server.download_file("logo.svg", image_format)

        assert response.status_code == 200
        assert response.media_type == "image/svg+xml"
        assert response.body == original


def test_thumbnail_is_resized_webp_and_long_cached(monkeypatch):
    source = BytesIO()
    server.Image.new("RGB", (1200, 1800), "red").save(source, format="PNG")
    monkeypatch.setattr(server, "get_object", lambda path: (source.getvalue(), "image/png"))

    response = server.download_file("poster.png", "thumbnail")

    assert response.media_type == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    with server.Image.open(BytesIO(response.body)) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == (640, 960)


def test_thumbnail_uses_cached_jpeg_when_source_is_missing(monkeypatch):
    cached_bytes = b"cached jpeg image"

    def read_cache(path, image_format):
        if image_format == "jpeg":
            return cached_bytes, "image/jpeg"
        return None

    def fail_if_storage_is_called(path):
        raise AssertionError("missing source should be served from the alternate cache")

    monkeypatch.setattr(server, "_thumb_cache_read", read_cache)
    monkeypatch.setattr(server, "get_object", fail_if_storage_is_called)

    response = server.download_file("missing-poster.png", "thumbnail")

    assert response.status_code == 200
    assert response.media_type == "image/jpeg"
    assert response.body == cached_bytes