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


def test_aws_upload_uses_private_s3_object(monkeypatch):
    monkeypatch.setattr(server, "STORAGE_PROVIDER", "aws")
    monkeypatch.setattr(server, "S3_BUCKET", "cineverse-media")
    monkeypatch.setattr(server, "S3_REGION", "us-east-1")
    monkeypatch.setattr(server, "_s3_client", None)
    calls = {}

    class FakeS3Client:
        def put_object(self, **kwargs):
            calls.update(kwargs)

    monkeypatch.setattr(server.boto3, "client", lambda service, **kwargs: FakeS3Client())

    result = server.put_object("cineverse/uploads/poster.jpg", b"image-bytes", "image/jpeg")

    assert result == {"path": "cineverse/uploads/poster.jpg", "size": 11}
    assert calls == {
        "Bucket": "cineverse-media",
        "Key": "cineverse/uploads/poster.jpg",
        "Body": b"image-bytes",
        "ContentType": "image/jpeg",
    }


def test_aws_download_returns_bytes_and_content_type(monkeypatch):
    monkeypatch.setattr(server, "STORAGE_PROVIDER", "aws")
    monkeypatch.setattr(server, "S3_BUCKET", "cineverse-media")
    monkeypatch.setattr(server, "S3_REGION", "us-east-1")
    monkeypatch.setattr(server, "_s3_client", None)
    calls = {}

    class FakeS3Client:
        def get_object(self, **kwargs):
            calls.update(kwargs)
            return {
                "Body": BytesBody(b"image-bytes"),
                "ContentType": "image/jpeg",
            }

    class BytesBody:
        def __init__(self, content):
            self.content = content

        def read(self):
            return self.content

    monkeypatch.setattr(server.boto3, "client", lambda service, **kwargs: FakeS3Client())

    result = server.get_object("cineverse/uploads/poster.jpg")

    assert result == (b"image-bytes", "image/jpeg")
    assert calls == {"Bucket": "cineverse-media", "Key": "cineverse/uploads/poster.jpg"}