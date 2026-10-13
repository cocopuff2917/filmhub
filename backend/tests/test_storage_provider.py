from types import SimpleNamespace

from backend import server


def test_supabase_upload_uses_private_bucket_rest_api(monkeypatch):
    monkeypatch.setattr(server, "STORAGE_PROVIDER", "supabase")
    monkeypatch.setattr(server, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(server, "SUPABASE_SERVICE_ROLE_KEY", "service-role")
    monkeypatch.setattr(server, "SUPABASE_STORAGE_BUCKET", "media")
    calls = {}

    def fake_post(url, **kwargs):
        calls.update(url=url, **kwargs)
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(server.requests, "post", fake_post)

    result = server.put_object("cineverse/uploads/test image.jpg", b"image-bytes", "image/jpeg")

    assert result == {"path": "cineverse/uploads/test image.jpg", "size": 11}
    assert calls["url"] == "https://project.supabase.co/storage/v1/object/media/cineverse/uploads/test%20image.jpg"
    assert calls["headers"]["Authorization"] == "Bearer service-role"
    assert calls["headers"]["x-upsert"] == "true"
    assert calls["data"] == b"image-bytes"


def test_supabase_download_returns_bytes_and_content_type(monkeypatch):
    monkeypatch.setattr(server, "STORAGE_PROVIDER", "supabase")
    monkeypatch.setattr(server, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(server, "SUPABASE_SERVICE_ROLE_KEY", "service-role")
    monkeypatch.setattr(server, "SUPABASE_STORAGE_BUCKET", "media")
    calls = {}

    def fake_get(url, **kwargs):
        calls.update(url=url, **kwargs)
        return SimpleNamespace(
            raise_for_status=lambda: None,
            content=b"image-bytes",
            headers={"Content-Type": "image/jpeg"},
        )

    monkeypatch.setattr(server.requests, "get", fake_get)

    result = server.get_object("cineverse/uploads/poster.jpg")

    assert result == (b"image-bytes", "image/jpeg")
    assert calls["url"] == "https://project.supabase.co/storage/v1/object/media/cineverse/uploads/poster.jpg"
    assert calls["headers"]["apikey"] == "service-role"