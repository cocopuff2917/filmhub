import asyncio
from copy import deepcopy
from types import SimpleNamespace

from bson import ObjectId

from backend import server


class FakeCollection:
    def __init__(self, documents):
        self.documents = {doc["_id"]: deepcopy(doc) for doc in documents}

    async def find_one(self, query, projection):
        doc = self.documents.get(query["_id"])
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


def test_image_transform_failure_returns_original_for_all_formats(monkeypatch):
    original = b"browser-supported image data"
    monkeypatch.setattr(server, "get_object", lambda path: (original, "image/svg+xml"))

    for image_format in ("jpeg", "thumbnail"):
        response = asyncio.run(server.download_file("logo.svg", image_format))

        assert response.status_code == 200
        assert response.media_type == "image/svg+xml"
        assert response.body == original


def test_actor_headshot_can_be_replaced_but_not_cleared_by_users_or_moderators():
    old_photo = "old-headshot.jpg"
    for user in ({"role": "user"}, {"role": "moderator", "effective_role": "moderator"}):
        replacement = {"photo_url": "new-headshot.jpg"}
        server._enforce_image_delete_guard(
            {"photo_url": old_photo},
            replacement,
            user,
            single_fields=["photo_url"],
            single_field_replacement_allowed=["photo_url"],
        )
        assert replacement["photo_url"] == "new-headshot.jpg"

        removal = {"photo_url": ""}
        server._enforce_image_delete_guard(
            {"photo_url": old_photo},
            removal,
            user,
            single_fields=["photo_url"],
            single_field_replacement_allowed=["photo_url"],
        )
        assert removal["photo_url"] == old_photo


def test_tmdb_image_recovery_rejects_actor_photos_and_movie_posters():
    for entity_type, image_field in (("actor", "photo_url"), ("movie", "poster_url")):
        payload = server.TMDBImageFallbackRequest(
            entity_type=entity_type,
            entity_id=str(ObjectId()),
            image_field=image_field,
        )
        try:
            asyncio.run(server.recover_tmdb_image(payload))
        except server.HTTPException as error:
            assert error.status_code == 400
        else:
            raise AssertionError(f"TMDB recovery unexpectedly accepted {entity_type} {image_field}")


def test_tmdb_cast_actor_creation_does_not_import_profile_photo(monkeypatch):
    class FakeActorCollection:
        created = None

        async def find_one(self, query):
            return None

        def find(self, query):
            return self

        async def to_list(self, limit):
            return []

        async def insert_one(self, document):
            self.created = document
            return SimpleNamespace(inserted_id=ObjectId())

    actors = FakeActorCollection()

    async def ignore_log(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "db", SimpleNamespace(actors=actors))
    monkeypatch.setattr(server, "log_edit", ignore_log)

    actor_id = asyncio.run(server._tmdb_actor_id(
        {"id": 123, "name": "Example Actor", "profile_path": "/tmdb-photo.jpg"},
        {"id": "bot-user"},
    ))

    assert actor_id
    assert actors.created["photo_url"] == ""


def test_tmdb_replacement_images_are_only_available_for_series(monkeypatch):
    async def unexpected_tmdb_request(*args, **kwargs):
        raise AssertionError("TMDB must not be queried for actor photos or movie posters")

    monkeypatch.setattr(server, "_tmdb_request", unexpected_tmdb_request)

    for kind in ("actors", "movies"):
        assert asyncio.run(server._tmdb_replacement_image(kind, {})) is None