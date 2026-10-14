import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException

from backend import server


def _webp_bytes():
    image = BytesIO()
    server.Image.new("RGB", (8, 8), "blue").save(image, format="WEBP")
    return image.getvalue()


def test_external_actor_image_is_copied_to_object_storage(monkeypatch):
    image_bytes = _webp_bytes()
    stored = {}

    class FakeResponse:
        status_code = 200
        headers = {"content-length": str(len(image_bytes)), "content-type": "image/webp"}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def raise_for_status(self):
            return None

        async def aiter_bytes(self):
            yield image_bytes

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        def stream(self, method, url, headers):
            assert method == "GET"
            assert url == "https://image.tmdb.org/t/p/original/person.webp"
            return FakeResponse()

    def fake_put_object(path, body, content_type):
        stored.update(path=path, body=body, content_type=content_type)
        return {"path": path}

    monkeypatch.setattr(server.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    monkeypatch.setattr(server, "put_object", fake_put_object)

    result = asyncio.run(server._store_actor_image_url("https://image.tmdb.org/t/p/original/person.webp"))

    assert result == stored["path"]
    assert result.startswith("cineverse/uploads/admin/")
    assert result.endswith(".webp")
    assert stored["body"] == image_bytes
    assert stored["content_type"] == "image/webp"


def test_actor_image_url_rejects_untrusted_hosts():
    with pytest.raises(HTTPException) as error:
        asyncio.run(server._store_actor_image_url("https://example.com/person.jpg"))

    assert error.value.status_code == 400


def test_actor_image_storage_keeps_existing_object_keys():
    path = "cineverse/uploads/admin/existing.jpg"

    assert asyncio.run(server._store_actor_image_url(path)) == path