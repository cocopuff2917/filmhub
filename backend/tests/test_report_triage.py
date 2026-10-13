import asyncio
from types import SimpleNamespace

import httpx
import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend import server


class FakeThreads:
    async def find_one(self, query):
        return {"_id": query["_id"], "category": "report", "title": "Example", "body": "Example report"}


class QuotaExceededClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, *_args, **_kwargs):
        request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        response = httpx.Response(429, json={"error": {"code": "insufficient_quota"}}, request=request)
        raise httpx.HTTPStatusError("quota exceeded", request=request, response=response)


def test_triage_reports_provider_quota_exhaustion(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(server, "db", SimpleNamespace(threads=FakeThreads()))
    monkeypatch.setattr(server, "_require_perm", lambda *_args: None)
    monkeypatch.setattr(server.httpx, "AsyncClient", QuotaExceededClient)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.triage_report(str(ObjectId()), {"id": "moderator"}))

    assert error.value.status_code == 503
    assert "no available provider credits" in error.value.detail