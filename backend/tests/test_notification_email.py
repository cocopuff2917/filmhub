import asyncio
from types import SimpleNamespace

from bson import ObjectId

from backend import server


class FakeNotifications:
    def __init__(self):
        self.documents = []

    async def insert_one(self, document):
        self.documents.append(document)


class FakeUsers:
    def __init__(self, user):
        self.user = user

    async def find_one(self, query, projection=None):
        return self.user if query["_id"] == self.user["_id"] else None


def test_notification_sends_generic_email_without_private_content(monkeypatch):
    user_id = ObjectId()
    notifications = FakeNotifications()
    sent_emails = []
    monkeypatch.setattr(server, "db", SimpleNamespace(
        notifications=notifications,
        users=FakeUsers({"_id": user_id, "email": "reader@example.com", "name": "Reader"}),
    ))
    monkeypatch.setattr(server, "_notification_email_tasks", set())
    monkeypatch.setattr(server, "_frontend_url", lambda: "https://cineverse.example")

    async def fake_send_email(**email):
        sent_emails.append(email)

    monkeypatch.setattr(server, "send_email", fake_send_email)

    async def create_and_send():
        await server._create_notification(
            user_id=str(user_id),
            ntype="direct_message",
            title="Private notification title",
            body="Private message content",
            link="/inbox",
        )
        await asyncio.gather(*list(server._notification_email_tasks))

    asyncio.run(create_and_send())

    assert len(notifications.documents) == 1
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "reader@example.com"
    assert "Open your inbox" in sent_emails[0]["html"]
    assert "https://cineverse.example/inbox" in sent_emails[0]["html"]
    assert "Private notification title" not in sent_emails[0]["html"]
    assert "Private message content" not in sent_emails[0]["html"]