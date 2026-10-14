import asyncio
from types import SimpleNamespace

import pytest
from bson import ObjectId

from backend import server


def test_actor_headshot_is_in_gallery_and_marked_by_photo_url():
    actor = server._normalize_actor_gallery({
        "photo_url": "legacy-headshot.jpg",
        "gallery": ["gallery-one.jpg", "legacy-headshot.jpg"],
    })

    assert actor["gallery"] == ["gallery-one.jpg", "legacy-headshot.jpg"]
    assert actor["photo_url"] in actor["gallery"]


def test_first_gallery_image_becomes_headshot_when_unset():
    actor = server._normalize_actor_gallery({
        "photo_url": "",
        "gallery": ["gallery-one.jpg", "gallery-two.jpg"],
    })

    assert actor["photo_url"] == "gallery-one.jpg"


class FakeActors:
    def __init__(self, actor):
        self.actor = actor

    async def find_one(self, query):
        return self.actor

    async def update_one(self, query, update):
        self.actor.update(update["$set"])


def test_moderator_can_set_actor_gallery_image_as_headshot(monkeypatch):
    actor_id = ObjectId()
    actor = {
        "_id": actor_id,
        "name": "Test Actor",
        "photo_url": "old-photo.jpg",
        "gallery": ["gallery-one.jpg", "gallery-two.jpg"],
    }
    monkeypatch.setattr(server, "db", SimpleNamespace(actors=FakeActors(actor)))
    monkeypatch.setattr(server, "_ensure_content_edits_allowed", lambda user: asyncio.sleep(0))

    async def fake_log_edit(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "log_edit", fake_log_edit)

    result = asyncio.run(server.set_actor_gallery_headshot(
        str(actor_id),
        1,
        {"id": "moderator", "role": "moderator", "effective_role": "moderator"},
    ))

    assert result["photo_url"] == "gallery-two.jpg"
    assert result["gallery"] == ["gallery-one.jpg", "gallery-two.jpg"]


def test_actor_gallery_headshot_rejects_non_moderator():
    with pytest.raises(server.HTTPException) as error:
        asyncio.run(server.get_current_moderator({"role": "user", "effective_role": "user"}))

    assert error.value.status_code == 403