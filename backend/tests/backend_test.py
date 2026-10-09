"""CineVerse backend tests - new feature bundle."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://filmhub-918.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASS = "Admin@123"


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def _register(s, email, password, name):
    return s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name})


@pytest.fixture(scope="module")
def admin_session():
    s = _session()
    r = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def user_session():
    s = _session()
    email = f"testuser_{uuid.uuid4().hex[:10]}@test.com"
    r = _register(s, email, "Test@1234", "Test User")
    assert r.status_code == 200, r.text
    s.user_email = email
    s.user_password = "Test@1234"
    s.user_id = r.json()["id"]
    return s


class TestLoginLockout:
    def test_five_failed_attempts_lock_login_for_five_minutes(self):
        session = _session()
        email = f"login_lockout_{uuid.uuid4().hex[:12]}@test.com"
        password = "Test@1234"
        registered = _register(session, email, password, f"Lockout_{uuid.uuid4().hex[:8]}")
        assert registered.status_code == 200, registered.text

        for _ in range(4):
            failed = _login(session, email, "Wrong@1234")
            assert failed.status_code == 401, failed.text

        locked = _login(session, email, "Wrong@1234")
        assert locked.status_code == 429, locked.text
        assert locked.headers.get("Retry-After") == "300"

        still_locked = _login(session, email, password)
        assert still_locked.status_code == 429, still_locked.text
        assert int(still_locked.headers["Retry-After"]) <= 300


class TestAPIKeys:
    def test_key_lifecycle_and_catalog_access(self, user_session):
        created = user_session.post(f"{API}/api-keys", json={"name": "integration test"})
        assert created.status_code == 200, created.text
        key_data = created.json()
        api_key = key_data["api_key"]
        assert api_key.startswith("cv_live_")

        listed = user_session.get(f"{API}/api-keys")
        assert listed.status_code == 200, listed.text
        assert any(item["id"] == key_data["id"] for item in listed.json())
        assert api_key not in listed.text

        assert user_session.get(f"{API}/v1/movies", headers={"X-API-Key": api_key}).status_code == 200
        assert user_session.get(f"{API}/v1/series", headers={"X-API-Key": api_key}).status_code == 200
        assert user_session.get(f"{API}/v1/movies", headers={"X-API-Key": "invalid"}).status_code == 401

        revoked = user_session.delete(f"{API}/api-keys/{key_data['id']}")
        assert revoked.status_code == 200, revoked.text
        assert user_session.get(f"{API}/v1/movies", headers={"X-API-Key": api_key}).status_code == 401


class TestBlockedUsers:
    def test_block_hides_comments_and_thread_replies_until_unblocked(self, user_session, admin_session):
        admin_id = admin_session.get(f"{API}/auth/me").json()["id"]
        entity_id = f"block-test-{uuid.uuid4().hex}"
        thread = user_session.post(f"{API}/threads", json={
            "title": f"Block test {uuid.uuid4().hex[:8]}",
            "body": "A thread used to test blocked replies.",
            "category": "general",
        })
        assert thread.status_code == 200, thread.text
        thread_id = thread.json()["id"]
        author_thread = admin_session.post(f"{API}/threads", json={
            "title": f"Blocked discussion {uuid.uuid4().hex[:8]}",
            "body": "This discussion should disappear when its author is blocked.",
            "category": "general",
        })
        assert author_thread.status_code == 200, author_thread.text
        author_thread_id = author_thread.json()["id"]
        reply = admin_session.post(f"{API}/threads/{thread_id}/messages", json={"text": "A reply from the blocked user."})
        assert reply.status_code == 200, reply.text
        comment = admin_session.post(f"{API}/comments", json={
            "entity_type": "movie",
            "entity_id": entity_id,
            "text": "A comment from the blocked user.",
        })
        assert comment.status_code == 200, comment.text

        blocked = user_session.post(f"{API}/users/blocked", json={"user_id": admin_id})
        assert blocked.status_code == 200, blocked.text
        assert user_session.post(f"{API}/users/blocked", json={"user_id": user_session.user_id}).status_code == 400
        assert any(item["id"] == admin_id for item in user_session.get(f"{API}/users/blocked").json())
        assert not any(item["id"] == admin_id for item in admin_session.get(f"{API}/users/blocked").json())

        listed_threads = user_session.get(f"{API}/threads")
        assert listed_threads.status_code == 200, listed_threads.text
        assert all(item["id"] != author_thread_id for item in listed_threads.json())
        assert user_session.get(f"{API}/threads/{author_thread_id}").status_code == 404
        comments = user_session.get(f"{API}/comments", params={"entity_type": "movie", "entity_id": entity_id})
        assert comments.status_code == 200 and comments.json() == []
        detail = user_session.get(f"{API}/threads/{thread_id}")
        assert detail.status_code == 200, detail.text
        assert all(message["user_id"] != admin_id for message in detail.json()["messages"])

        unblocked = user_session.delete(f"{API}/users/blocked/{admin_id}")
        assert unblocked.status_code == 200, unblocked.text
        comments_after = user_session.get(f"{API}/comments", params={"entity_type": "movie", "entity_id": entity_id})
        assert any(item["id"] == comment.json()["id"] for item in comments_after.json())
        detail_after = user_session.get(f"{API}/threads/{thread_id}")
        assert any(message["user_id"] == admin_id for message in detail_after.json()["messages"])
        assert user_session.get(f"{API}/threads/{author_thread_id}").status_code == 200


class TestCineverseBotActions:
    def test_bot_action_dispatcher_is_admin_only(self, user_session):
        response = user_session.post(f"{API}/admin/cineverse-bot/run", json={"action": "actor_birth_details"})
        assert response.status_code == 403, response.text


# ---------------- Actors ----------------
class TestActors:
    def test_create_actor_with_death_fields(self, user_session):
        payload = {
            "name": "TEST_Actor_Death",
            "bio": "test",
            "birth_date": "1940-01-01",
            "death_date": "2020-05-10",
            "place_of_birth": "NYC",
            "place_of_death": "LA",
        }
        r = user_session.post(f"{API}/actors", json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        pytest.actor_id = a["id"]
        g = user_session.get(f"{API}/actors/{a['id']}")
        assert g.status_code == 200
        d = g.json()
        assert d["death_date"] == "2020-05-10"
        assert d["place_of_birth"] == "NYC"
        assert d["place_of_death"] == "LA"

    def test_patch_actor_add_death_by_user(self, user_session):
        r = user_session.post(f"{API}/actors", json={"name": "TEST_Alive_Actor", "birth_date": "1970-01-01"})
        assert r.status_code == 200
        aid = r.json()["id"]
        p = user_session.patch(f"{API}/actors/{aid}", json={"death_date": "2024-06-15", "place_of_death": "Paris"})
        assert p.status_code == 200, p.text
        g = user_session.get(f"{API}/actors/{aid}").json()
        assert g["death_date"] == "2024-06-15"
        assert g["place_of_death"] == "Paris"

    def test_delete_actor_forbidden_for_user(self, user_session, admin_session):
        r = user_session.post(f"{API}/actors", json={"name": "TEST_ToDelete_Actor"})
        aid = r.json()["id"]
        d = user_session.delete(f"{API}/actors/{aid}")
        assert d.status_code == 403
        d2 = admin_session.delete(f"{API}/actors/{aid}")
        assert d2.status_code == 200


# ---------------- Movies ----------------
class TestHomepage:
    def test_featured_hero_items_resolve_as_ordered_slideshow(self, admin_session):
        original_config = admin_session.get(f"{API}/homepage/config")
        assert original_config.status_code == 200, original_config.text
        original_config = original_config.json()
        created = []

        movie = admin_session.post(f"{API}/movies", json={
            "title": f"TEST_HeroMovie_{uuid.uuid4().hex[:8]}",
            "release_date": "2025-01-01",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        })
        assert movie.status_code == 200, movie.text
        created.append(("movies", movie.json()["id"]))
        series = admin_session.post(f"{API}/series", json={
            "title": f"TEST_HeroSeries_{uuid.uuid4().hex[:8]}",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        })
        assert series.status_code == 200, series.text
        created.append(("series", series.json()["id"]))

        try:
            hero = original_config.get("hero") or {}
            update = {
                "hero": {
                    "title": hero.get("title"),
                    "subtitle": hero.get("subtitle"),
                    "tagline": hero.get("tagline"),
                    "featured_items": [
                        {"type": "series", "id": created[1][1]},
                        {"type": "movie", "id": created[0][1]},
                    ],
                },
                "announcement": original_config.get("announcement") or {},
                "sections": original_config.get("sections") or [],
            }
            saved = admin_session.put(f"{API}/homepage/config", json=update)
            assert saved.status_code == 200, saved.text
            resolved = admin_session.get(f"{API}/homepage/config").json()["hero"]["featured_items"]
            assert [(item["type"], item["id"]) for item in resolved] == [
                ("series", created[1][1]),
                ("movie", created[0][1]),
            ]
        finally:
            admin_session.put(f"{API}/homepage/config", json=original_config)
            for kind, entity_id in created:
                admin_session.delete(f"{API}/{kind}/{entity_id}")


class TestMovies:
    def test_permission_catalog_has_individual_panel_and_content_actions(self, admin_session):
        response = admin_session.get(f"{API}/roles/permissions")
        assert response.status_code == 200, response.text
        keys = {permission["key"] for group in response.json().values() for permission in group}
        assert {
            "moderation.dashboard.view", "moderation.reports.view", "user.suspend", "user.unsuspend",
            "content.media.poster.delete", "content.media.poster.reorder", "content.media.poster.primary",
            "content.media.backdrop.delete", "content.media.gallery.delete", "content.fields.lock",
            "moderation.edits.view", "admin.movies.access", "admin.series.access", "admin.actors.access",
            "user.message", "user.view_ips", "moderation.ip_overlap.view", "moderation.ip_bans.create",
            "moderation.ip_bans.delete", "content.trash.view", "content.restore", "content.purge",
            "collections.create", "collections.delete", "collections.update", "crew_jobs.create",
            "user.account.modify",
        } <= keys

    @pytest.mark.parametrize("kind", ["movies", "series"])
    def test_create_imdb_id_is_admin_only(self, kind, user_session, admin_session):
        imdb_id = f"tt{uuid.uuid4().int % 10**7:07d}"
        payload = {"title": f"TEST_CreateIMDb_{uuid.uuid4().hex[:8]}", "imdb_id": imdb_id}
        if kind == "movies":
            payload["release_date"] = "2025-01-01"
        denied = user_session.post(f"{API}/{kind}", json=payload)
        assert denied.status_code == 403, denied.text

        missing_id = admin_session.post(f"{API}/{kind}", json={key: value for key, value in payload.items() if key != "imdb_id"})
        assert missing_id.status_code == 422, missing_id.text

        created = admin_session.post(f"{API}/{kind}", json=payload)
        assert created.status_code == 200, created.text
        entity_id = created.json()["id"]
        try:
            assert created.json()["imdb_id"] == imdb_id
        finally:
            admin_session.delete(f"{API}/{kind}/{entity_id}")

    def test_custom_delete_permission_is_scoped_and_can_delete_restore(self, user_session, admin_session):
        role = admin_session.post(f"{API}/roles", json={
            "name": f"TEST_DeleteOnly_{uuid.uuid4().hex[:8]}",
            "permissions": ["content.delete"],
        })
        assert role.status_code == 200, role.text
        role_id = role.json()["id"]
        assigned = admin_session.patch(
            f"{API}/moderation/users/{user_session.user_id}/custom-role",
            json={"custom_role_ids": [role_id]},
        )
        assert assigned.status_code == 200, assigned.text
        actor = admin_session.post(f"{API}/actors", json={"name": f"TEST_DeletePerm_{uuid.uuid4().hex[:8]}"})
        assert actor.status_code == 200, actor.text
        actor_id = actor.json()["id"]
        freeze_path = f"{API}/moderation/content-edit-freeze"
        previous_frozen = admin_session.get(freeze_path).json()["frozen"]

        try:
            admin_session.put(freeze_path, json={"frozen": False})
            user_info = user_session.get(f"{API}/auth/me").json()
            assert user_info["effective_role"] == "user"
            assert user_info["permissions"] == ["content.delete"]
            assert user_session.get(f"{API}/moderation/trash").status_code == 403
            assert user_session.get(f"{API}/moderation/stats").status_code == 403

            deleted = user_session.delete(f"{API}/actors/{actor_id}")
            assert deleted.status_code == 200, deleted.text
            denied_restore = user_session.post(f"{API}/moderation/actor/{actor_id}/restore")
            assert denied_restore.status_code == 403
            updated_role = admin_session.patch(f"{API}/roles/{role_id}", json={
                "permissions": ["content.delete", "content.trash.view", "content.restore"],
            })
            assert updated_role.status_code == 200, updated_role.text
            assert user_session.get(f"{API}/moderation/trash").status_code == 200
            restored = user_session.post(f"{API}/moderation/actor/{actor_id}/restore")
            assert restored.status_code == 200, restored.text
            assert user_session.get(f"{API}/actors/{actor_id}").status_code == 200
        finally:
            admin_session.put(freeze_path, json={"frozen": False})
            admin_session.post(f"{API}/moderation/actor/{actor_id}/restore")
            admin_session.delete(f"{API}/actors/{actor_id}")
            admin_session.delete(f"{API}/moderation/actor/{actor_id}/purge")
            admin_session.put(freeze_path, json={"frozen": previous_frozen})
            admin_session.patch(
                f"{API}/moderation/users/{user_session.user_id}/custom-role",
                json={"custom_role_ids": []},
            )
            admin_session.delete(f"{API}/roles/{role_id}")

    def test_custom_suspend_permission_is_scoped_and_supports_suspend_and_unsuspend(self, user_session, admin_session):
        role = admin_session.post(f"{API}/roles", json={
            "name": f"TEST_SuspendOnly_{uuid.uuid4().hex[:8]}",
            "permissions": ["user.suspend"],
        })
        assert role.status_code == 200, role.text
        role_id = role.json()["id"]
        target = _session()
        registered = _register(
            target,
            f"suspend_target_{uuid.uuid4().hex[:10]}@test.com",
            "Test@1234",
            "Suspension Target",
        )
        assert registered.status_code == 200, registered.text
        target_id = registered.json()["id"]
        assigned = admin_session.patch(
            f"{API}/moderation/users/{user_session.user_id}/custom-role",
            json={"custom_role_ids": [role_id]},
        )
        assert assigned.status_code == 200, assigned.text

        try:
            user_info = user_session.get(f"{API}/auth/me").json()
            assert user_info["effective_role"] == "user"
            assert user_info["permissions"] == ["user.suspend"]
            assert user_session.get(f"{API}/moderation/users").status_code == 200
            assert user_session.get(f"{API}/moderation/stats").status_code == 403

            suspended = user_session.post(
                f"{API}/moderation/users/{target_id}/suspend",
                json={"duration": 1, "duration_unit": "days", "reason": "Permission test"},
            )
            assert suspended.status_code == 200, suspended.text
            denied_unsuspend = user_session.post(f"{API}/moderation/users/{target_id}/unsuspend")
            assert denied_unsuspend.status_code == 403
            updated_role = admin_session.patch(f"{API}/roles/{role_id}", json={
                "permissions": ["user.unsuspend"],
            })
            assert updated_role.status_code == 200, updated_role.text
            assert user_session.get(f"{API}/moderation/users").status_code == 200
            denied_suspend = user_session.post(
                f"{API}/moderation/users/{target_id}/suspend",
                json={"duration": 1, "duration_unit": "days", "reason": "Permission test"},
            )
            assert denied_suspend.status_code == 403
            unsuspended = user_session.post(f"{API}/moderation/users/{target_id}/unsuspend")
            assert unsuspended.status_code == 200, unsuspended.text
        finally:
            admin_session.post(f"{API}/moderation/users/{target_id}/unsuspend")
            admin_session.patch(
                f"{API}/moderation/users/{user_session.user_id}/custom-role",
                json={"custom_role_ids": []},
            )
            admin_session.delete(f"{API}/roles/{role_id}")

    def test_custom_permissions_allow_imdb_creation_during_catalog_pause(self, user_session, admin_session):
        role = admin_session.post(f"{API}/roles", json={
            "name": f"TEST_CustomCatalog_{uuid.uuid4().hex[:8]}",
            "permissions": ["content.edit_imdb_id", "content.bypass_edit_freeze"],
        })
        assert role.status_code == 200, role.text
        role_id = role.json()["id"]
        assigned = admin_session.patch(
            f"{API}/moderation/users/{user_session.user_id}/custom-role",
            json={"custom_role_ids": [role_id]},
        )
        assert assigned.status_code == 200, assigned.text

        freeze_path = f"{API}/moderation/content-edit-freeze"
        previous_frozen = admin_session.get(freeze_path).json()["frozen"]
        created_ids = []
        try:
            permissions = user_session.get(f"{API}/auth/me").json()["permissions"]
            assert "content.edit_imdb_id" in permissions
            assert "content.bypass_edit_freeze" in permissions
            paused = admin_session.put(freeze_path, json={"frozen": True})
            assert paused.status_code == 200, paused.text

            movie = user_session.post(f"{API}/movies", json={
                "title": f"TEST_CustomIMDbMovie_{uuid.uuid4().hex[:8]}",
                "release_date": "2025-01-01",
                "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            })
            assert movie.status_code == 200, movie.text
            created_ids.append(("movies", movie.json()["id"]))

            series = user_session.post(f"{API}/series", json={
                "title": f"TEST_CustomIMDbSeries_{uuid.uuid4().hex[:8]}",
                "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            })
            assert series.status_code == 200, series.text
            created_ids.append(("series", series.json()["id"]))
        finally:
            admin_session.put(freeze_path, json={"frozen": previous_frozen})
            for kind, entity_id in created_ids:
                admin_session.delete(f"{API}/{kind}/{entity_id}")
            admin_session.patch(
                f"{API}/moderation/users/{user_session.user_id}/custom-role",
                json={"custom_role_ids": []},
            )
            admin_session.delete(f"{API}/roles/{role_id}")

    def test_duplicate_imdb_id_recommends_existing_page(self, user_session, admin_session):
        imdb_id = f"tt{uuid.uuid4().int % 10**7:07d}"
        created = admin_session.post(f"{API}/movies", json={
            "title": f"TEST_IMDbDuplicate_{uuid.uuid4().hex[:8]}",
            "imdb_id": imdb_id,
            "release_date": "2025-01-01",
        })
        assert created.status_code == 200, created.text
        movie_id = created.json()["id"]
        try:
            duplicate = admin_session.post(f"{API}/series", json={
                "title": f"TEST_IMDbDuplicateSeries_{uuid.uuid4().hex[:8]}",
                "imdb_id": imdb_id,
            })
            assert duplicate.status_code == 409, duplicate.text
            detail = duplicate.json()["detail"]
            assert detail["entity_id"] == movie_id
            assert detail["url"] == f"/movie/{movie_id}"
            assert "edit the existing page" in detail["message"].lower()
        finally:
            admin_session.delete(f"{API}/movies/{movie_id}")

    def test_only_moderators_can_change_movie_imdb_id(self, user_session, admin_session):
        created = user_session.post(f"{API}/movies", json={
            "title": f"TEST_ImdbPermission_{uuid.uuid4().hex[:8]}",
            "release_date": "2025-01-01",
        })
        assert created.status_code == 200, created.text
        movie_id = created.json()["id"]
        try:
            replacement = f"tt{uuid.uuid4().int % 10**7:07d}"
            assigned = admin_session.patch(f"{API}/movies/{movie_id}", json={"imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}"})
            assert assigned.status_code == 200, assigned.text
            denied = user_session.patch(f"{API}/movies/{movie_id}", json={"imdb_id": replacement})
            assert denied.status_code == 403, denied.text
            allowed = admin_session.patch(f"{API}/movies/{movie_id}", json={"imdb_id": replacement})
            assert allowed.status_code == 200, allowed.text
            assert allowed.json()["imdb_id"] == replacement
        finally:
            admin_session.delete(f"{API}/movies/{movie_id}")

    def test_create_movie_by_user_and_edit_logged(self, user_session):
        payload = {"title": "TEST_UserMovie", "release_date": "2023-01-01", "genres": ["Drama"]}
        r = user_session.post(f"{API}/movies", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m.get("imdb_id") is None
        pytest.movie_id = m["id"]
        # edit log
        e = user_session.get(f"{API}/edits", params={"entity_type": "movie", "entity_id": m["id"]})
        assert e.status_code == 200
        edits = e.json()
        assert any(x["action"] == "create" for x in edits)

    def test_patch_movie_by_user(self, user_session):
        r = user_session.patch(f"{API}/movies/{pytest.movie_id}", json={"synopsis": "updated"})
        assert r.status_code == 200
        assert r.json()["synopsis"] == "updated"
        e = user_session.get(f"{API}/edits", params={"entity_type": "movie", "entity_id": pytest.movie_id}).json()
        assert any(x["action"] == "update" for x in e)

    def test_delete_movie_user_forbidden_admin_ok(self, user_session, admin_session):
        d = user_session.delete(f"{API}/movies/{pytest.movie_id}")
        assert d.status_code == 403
        d2 = admin_session.delete(f"{API}/movies/{pytest.movie_id}")
        assert d2.status_code == 200

    def test_upcoming_and_recent(self, user_session):
        future = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        past = "2020-01-01"
        rf = user_session.post(f"{API}/movies", json={"title": "TEST_Upcoming", "release_date": future})
        rp = user_session.post(f"{API}/movies", json={"title": "TEST_Past", "release_date": past})
        assert rf.status_code == 200 and rp.status_code == 200
        up = requests.get(f"{API}/movies/upcoming").json()
        rec = requests.get(f"{API}/movies/recent").json()
        assert any(m["title"] == "TEST_Upcoming" for m in up)
        assert all(m["release_date"] > datetime.now(timezone.utc).strftime("%Y-%m-%d") for m in up)
        assert all(m["release_date"] <= datetime.now(timezone.utc).strftime("%Y-%m-%d") for m in rec)


# ---------------- Series ----------------
class TestSeries:
    def test_only_moderators_can_change_series_imdb_id(self, user_session, admin_session):
        created = user_session.post(f"{API}/series", json={
            "title": f"TEST_ImdbPermissionSeries_{uuid.uuid4().hex[:8]}",
        })
        assert created.status_code == 200, created.text
        series_id = created.json()["id"]
        try:
            replacement = f"tt{uuid.uuid4().int % 10**7:07d}"
            assigned = admin_session.patch(f"{API}/series/{series_id}", json={"imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}"})
            assert assigned.status_code == 200, assigned.text
            denied = user_session.patch(f"{API}/series/{series_id}", json={"imdb_id": replacement})
            assert denied.status_code == 403, denied.text
            allowed = admin_session.patch(f"{API}/series/{series_id}", json={"imdb_id": replacement})
            assert allowed.status_code == 200, allowed.text
            assert allowed.json()["imdb_id"] == replacement
        finally:
            admin_session.delete(f"{API}/series/{series_id}")

    def test_create_series_full(self, user_session):
        payload = {
            "title": "TEST_Series",
            "first_air_date": "2020-01-01",
            "genres": ["Drama"],
            "gallery": ["http://x/g1.jpg", "http://x/g2.jpg"],
            "seasons": [{
                "season_number": 1,
                "name": "S1",
                "poster_url": "http://x/s1.jpg",
                "episodes": [
                    {"episode_number": 1, "name": "Ep1", "still_url": "http://x/e1.jpg"},
                    {"episode_number": 2, "name": "Ep2", "still_url": "http://x/e2.jpg"},
                ],
            }],
        }
        r = user_session.post(f"{API}/series", json=payload)
        assert r.status_code == 200, r.text
        s = r.json()
        pytest.series_id = s["id"]
        g = requests.get(f"{API}/series/{s['id']}").json()
        assert g["gallery"] == ["http://x/g1.jpg", "http://x/g2.jpg"]
        assert g["seasons"][0]["poster_url"] == "http://x/s1.jpg"
        assert g["seasons"][0]["episodes"][0]["still_url"] == "http://x/e1.jpg"

    def test_delete_series_user_forbidden_admin_ok(self, user_session, admin_session):
        d = user_session.delete(f"{API}/series/{pytest.series_id}")
        assert d.status_code == 403
        d2 = admin_session.delete(f"{API}/series/{pytest.series_id}")
        assert d2.status_code == 200


# ---------------- User Profile & Avatar ----------------
class TestUserProfile:
    def test_public_user_profile(self, user_session):
        r = requests.get(f"{API}/users/{user_session.user_id}")
        assert r.status_code == 200
        d = r.json()
        assert "edits" in d and isinstance(d["edits"], list)
        assert "reviews" in d and isinstance(d["reviews"], list)
        assert d["is_suspended"] is False

    def test_avatar_patch(self, user_session):
        r = user_session.patch(f"{API}/auth/me/avatar", json={"avatar_url": "http://x/a.jpg"})
        assert r.status_code == 200
        me = user_session.get(f"{API}/auth/me").json()
        assert me["avatar_url"] == "http://x/a.jpg"

    def test_update_email(self, user_session):
        new_email = f"profile_{uuid.uuid4().hex[:10]}@test.com"
        r = user_session.patch(f"{API}/auth/me", json={"email": new_email.upper()})
        assert r.status_code == 200, r.text
        assert r.json()["email"] == new_email
        assert user_session.get(f"{API}/auth/me").json()["email"] == new_email

        duplicate = user_session.patch(f"{API}/auth/me", json={"email": ADMIN_EMAIL.upper()})
        assert duplicate.status_code == 400

        login = _login(_session(), new_email, user_session.user_password)
        assert login.status_code == 200, login.text

    def test_username_update_updates_existing_comment(self, user_session):
        entity_id = f"username-update-{uuid.uuid4().hex[:8]}"
        comment = user_session.post(f"{API}/comments", json={
            "entity_type": "movie",
            "entity_id": entity_id,
            "text": "Username propagation test",
        })
        assert comment.status_code == 200, comment.text

        new_name = f"updated_{uuid.uuid4().hex[:8]}"
        update = user_session.patch(f"{API}/auth/me", json={"name": new_name})
        assert update.status_code == 200, update.text

        comments = user_session.get(f"{API}/comments", params={
            "entity_type": "movie",
            "entity_id": entity_id,
        }).json()
        assert comments[0]["user_name"] == new_name

    def test_user_edit_history_paginates(self, user_session):
        actor = user_session.post(f"{API}/actors", json={"name": f"TEST_History_{uuid.uuid4().hex[:8]}"})
        assert actor.status_code == 200, actor.text
        actor_id = actor.json()["id"]
        update = user_session.patch(f"{API}/actors/{actor_id}", json={"bio": "History pagination test"})
        assert update.status_code == 200, update.text

        first = requests.get(f"{API}/users/{user_session.user_id}/edits", params={"skip": 0, "limit": 1})
        assert first.status_code == 200, first.text
        first_page = first.json()
        assert len(first_page["items"]) == 1
        assert first_page["has_more"] is True

        second = requests.get(f"{API}/users/{user_session.user_id}/edits", params={"skip": 1, "limit": 1})
        assert second.status_code == 200, second.text
        second_page = second.json()
        assert len(second_page["items"]) == 1
        assert first_page["items"][0]["id"] != second_page["items"][0]["id"]


class TestSitemap:
    def test_sitemap_includes_new_catalog_pages(self, admin_session):
        created = admin_session.post(f"{API}/movies", json={
            "title": f"TEST_Sitemap_{uuid.uuid4().hex[:8]}",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            "release_date": "2024-01-01",
        })
        assert created.status_code == 200, created.text
        movie_id = created.json()["id"]
        created_series = admin_session.post(f"{API}/series", json={
            "title": f"TEST_Sitemap_Series_{uuid.uuid4().hex[:8]}",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            "first_air_date": "2024-02-01",
        })
        assert created_series.status_code == 200, created_series.text
        series_id = created_series.json()["id"]
        created_actor = admin_session.post(f"{API}/actors", json={
            "name": f"TEST_Sitemap_Actor_{uuid.uuid4().hex[:8]}",
        })
        assert created_actor.status_code == 200, created_actor.text
        actor_id = created_actor.json()["id"]

        sitemap = requests.get(f"{API}/sitemap.xml", timeout=15)
        assert sitemap.status_code == 200, sitemap.text
        assert "application/xml" in sitemap.headers.get("content-type", "")
        assert "max-age=300" in sitemap.headers.get("cache-control", "")
        assert f"/movie/{movie_id}</loc>" in sitemap.text
        assert f"/movie/{movie_id}/credits</loc>" in sitemap.text
        assert f"/series/{series_id}</loc>" in sitemap.text
        assert f"/series/{series_id}/credits</loc>" in sitemap.text
        assert f"/actor/{actor_id}</loc>" in sitemap.text
        assert "/threads</loc>" in sitemap.text
        assert "/contributor-guidelines</loc>" in sitemap.text

        deleted = admin_session.delete(f"{API}/movies/{movie_id}")
        assert deleted.status_code == 200, deleted.text
        deleted_series = admin_session.delete(f"{API}/series/{series_id}")
        assert deleted_series.status_code == 200, deleted_series.text
        deleted_actor = admin_session.delete(f"{API}/actors/{actor_id}")
        assert deleted_actor.status_code == 200, deleted_actor.text


class TestContributorGuidelines:
    def test_public_read_and_admin_edit(self, admin_session, user_session):
        original = requests.get(f"{API}/contributor-guidelines", timeout=15)
        assert original.status_code == 200, original.text
        original_content = original.json()["content"]

        forbidden = user_session.put(f"{API}/contributor-guidelines", json={"content": "Unauthorized change"})
        assert forbidden.status_code == 403

        updated_content = f"TEST guideline update {uuid.uuid4().hex}"
        updated = admin_session.put(f"{API}/contributor-guidelines", json={"content": updated_content})
        assert updated.status_code == 200, updated.text
        assert requests.get(f"{API}/contributor-guidelines", timeout=15).json()["content"] == updated_content

        restored = admin_session.put(f"{API}/contributor-guidelines", json={"content": original_content})
        assert restored.status_code == 200, restored.text


# ---------------- Moderation / Suspension ----------------
class TestModeration:
    def test_admin_can_make_forum_thread_private(self, admin_session):
        owner = _session()
        owner_email = f"private_owner_{uuid.uuid4().hex[:8]}@test.com"
        owner_password = "Test@1234"
        registration = _register(owner, owner_email, owner_password, "Private Thread Owner")
        assert registration.status_code == 200, registration.text
        owner_id = registration.json()["id"]

        outsider = _session()
        outsider_email = f"private_outsider_{uuid.uuid4().hex[:8]}@test.com"
        outsider_registration = _register(outsider, outsider_email, owner_password, "Private Thread Outsider")
        assert outsider_registration.status_code == 200, outsider_registration.text

        created = owner.post(f"{API}/threads", json={
            "title": "Privacy test thread",
            "body": "This should become private.",
            "category": "general",
        })
        assert created.status_code == 200, created.text
        thread_id = created.json()["id"]
        path = f"{API}/threads/{thread_id}/privacy"

        denied = owner.patch(path, json={"is_private": True})
        assert denied.status_code == 403

        private = admin_session.patch(path, json={"is_private": True})
        assert private.status_code == 200, private.text
        assert private.json()["is_private"] is True
        assert requests.get(f"{API}/threads/{thread_id}").status_code == 404
        assert outsider.get(f"{API}/threads/{thread_id}").status_code == 404
        assert owner.get(f"{API}/threads/{thread_id}").status_code == 200
        assert admin_session.get(f"{API}/threads/{thread_id}").status_code == 200
        assert all(t["id"] != thread_id for t in outsider.get(f"{API}/threads").json())
        assert any(t["id"] == thread_id for t in owner.get(f"{API}/threads").json())
        assert outsider.post(f"{API}/threads/{thread_id}/messages", json={"text": "not allowed"}).status_code == 404

        public = admin_session.patch(path, json={"is_private": False})
        assert public.status_code == 200
        assert requests.get(f"{API}/threads/{thread_id}").status_code == 200

    def test_admin_can_edit_user_profile(self, admin_session, user_session):
        user_id = user_session.user_id
        path = f"{API}/moderation/users/{user_id}/profile"
        changes = {
            "name": f"admin_edit_{uuid.uuid4().hex[:8]}",
            "bio": "Updated by an administrator",
            "avatar_url": "https://example.com/admin-updated-avatar.jpg",
        }

        forbidden = user_session.patch(path, json=changes)
        assert forbidden.status_code == 403

        updated = admin_session.patch(path, json=changes)
        assert updated.status_code == 200, updated.text
        profile = requests.get(f"{API}/users/{user_id}").json()
        assert profile["name"] == changes["name"]
        assert profile["bio"] == changes["bio"]
        assert profile["avatar_url"] == changes["avatar_url"]

        duplicate = admin_session.patch(path, json={"email": ADMIN_EMAIL})
        assert duplicate.status_code == 400

    def test_suspend_and_login_blocked(self, admin_session):
        s = _session()
        email = f"suspendtest_{int(time.time())}@test.com"
        pw = "Test@1234"
        rr = _register(s, email, pw, "Suspend Target")
        assert rr.status_code == 200
        target_id = rr.json()["id"]
        # suspend permanently
        r = admin_session.post(f"{API}/moderation/users/{target_id}/suspend", json={"reason": "spam"})
        assert r.status_code == 200, r.text
        assert r.json()["suspended_until"] == "permanent"
        inbox = s.get(f"{API}/inbox/threads").json()
        suspension_threads = [t for t in inbox if t.get("is_suspension_notice")]
        assert len(suspension_threads) == 1
        suspension_thread = suspension_threads[0]
        assert suspension_thread["title"] == "Account suspension"
        assert suspension_thread["target_user_id"] == target_id
        assert suspension_thread["user_name"] == "Support"
        assert "Your account has been suspended permanently" in suspension_thread["body"]

        updated_suspension = admin_session.post(
            f"{API}/moderation/users/{target_id}/suspend",
            json={"reason": "updated reason", "duration": 1, "duration_unit": "days"},
        )
        assert updated_suspension.status_code == 200
        updated_inbox = s.get(f"{API}/inbox/threads").json()
        assert len([t for t in updated_inbox if t.get("is_suspension_notice")]) == 1

        # login should now be 403
        s2 = _session()
        lr = _login(s2, email, pw)
        assert lr.status_code == 403
        assert "suspend" in lr.text.lower()
        # profile shows suspended
        p = requests.get(f"{API}/users/{target_id}").json()
        assert p["is_suspended"] is True
        # unsuspend
        u = admin_session.post(f"{API}/moderation/users/{target_id}/unsuspend")
        assert u.status_code == 200
        lr2 = _login(_session(), email, pw)
        assert lr2.status_code == 200

    def test_cannot_suspend_admin(self, admin_session):
        # find admin user id
        users = admin_session.get(f"{API}/moderation/users").json()
        admin_user = next(u for u in users if u["email"] == ADMIN_EMAIL)
        r = admin_session.post(f"{API}/moderation/users/{admin_user['id']}/suspend", json={"reason": "x"})
        assert r.status_code == 403

    def test_role_change_admin_only(self, admin_session, user_session):
        # user tries to promote self -> 403
        r = user_session.patch(f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "moderator"})
        assert r.status_code == 403
        # admin promotes then demotes
        r2 = admin_session.patch(f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "moderator"})
        assert r2.status_code == 200
        # now user (as moderator after re-login) still can't change roles; but easier: verify a moderator can't change role
        # Create a moderator session
        s = _session()
        email = f"modtest_{int(time.time())}@test.com"
        pw = "Test@1234"
        rr = _register(s, email, pw, "Mod")
        mid = rr.json()["id"]
        admin_session.patch(f"{API}/moderation/users/{mid}/role", json={"role": "moderator"})
        # re-login to get fresh token with new role
        s3 = _session()
        _login(s3, email, pw)
        r3 = s3.patch(f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "user"})
        assert r3.status_code == 403
        # cleanup: demote user_session back to 'user'
        admin_session.patch(f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "user"})


class TestPersonalFeatures:
    def test_catalog_duplicate_suggestions_find_existing_title(self, user_session, admin_session):
        created = admin_session.post(f"{API}/movies", json={
            "title": f"TEST_DuplicateAssistant_{uuid.uuid4().hex[:8]}",
            "release_date": "2025-01-01",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        })
        assert created.status_code == 200, created.text
        movie_id = created.json()["id"]
        try:
            matches = user_session.post(f"{API}/catalog/duplicates", json={
                "kind": "movie", "title": created.json()["title"], "date": "2025-01-01",
            })
            assert matches.status_code == 200, matches.text
            assert any(match["id"] == movie_id for match in matches.json())
        finally:
            admin_session.delete(f"{API}/movies/{movie_id}")

    def test_upcoming_episodes_omits_aired_episodes(self, admin_session):
        future_date = (datetime.now(timezone.utc).date() + timedelta(days=14)).isoformat()
        created = admin_session.post(f"{API}/series", json={
            "title": f"TEST_UpcomingEpisode_{uuid.uuid4().hex[:8]}",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            "seasons": [{"season_number": 1, "episodes": [{"episode_number": 1, "name": "Future Episode", "air_date": future_date}]}],
        })
        assert created.status_code == 200, created.text
        series_id = created.json()["id"]
        try:
            future = admin_session.get(f"{API}/series/upcoming-episodes", params={"limit": 10000})
            assert future.status_code == 200, future.text
            listed = next(item for item in future.json() if item["id"] == series_id)
            assert listed["next_episode"]["air_date"] == future_date

            updated = admin_session.patch(f"{API}/series/{series_id}", json={
                "seasons": [{"season_number": 1, "episodes": [{"episode_number": 1, "name": "Future Episode", "air_date": "2000-01-01"}]}],
            })
            assert updated.status_code == 200, updated.text
            aired = admin_session.get(f"{API}/series/upcoming-episodes", params={"limit": 10000})
            assert aired.status_code == 200, aired.text
            assert all(item["id"] != series_id for item in aired.json())
        finally:
            admin_session.delete(f"{API}/series/{series_id}")

    def test_series_watchlist_progress_and_follow(self, user_session, admin_session):
        created = admin_session.post(f"{API}/series", json={
            "title": f"TEST_UserFeatures_{uuid.uuid4().hex[:8]}",
            "purchase_options": [{"provider": "Example Stream", "url": "https://example.com/show", "availability_type": "stream"}],
        })
        assert created.status_code == 200, created.text
        series_id = created.json()["id"]
        try:
            assert created.json()["purchase_options"][0]["availability_type"] == "stream"
            assert user_session.post(f"{API}/watchlist/series/{series_id}").status_code == 200
            saved = user_session.get(f"{API}/watchlist").json()
            assert any(item["id"] == series_id and item["type"] == "series" for item in saved)

            progress = user_session.put(f"{API}/watch-progress/series/{series_id}", json={
                "status": "watching", "season_number": 2, "episode_number": 4,
            })
            assert progress.status_code == 200, progress.text
            loaded_progress = user_session.get(f"{API}/watch-progress/series/{series_id}").json()
            assert loaded_progress["status"] == "watching"
            assert loaded_progress["season_number"] == 2
            assert loaded_progress["episode_number"] == 4

            assert user_session.post(f"{API}/series/{series_id}/follow").json()["following"] is True
            assert user_session.get(f"{API}/series/{series_id}/follow").json()["following"] is True
        finally:
            user_session.delete(f"{API}/series/{series_id}/follow")
            user_session.delete(f"{API}/watchlist/series/{series_id}")
            user_session.delete(f"{API}/watch-progress/series/{series_id}")
            admin_session.delete(f"{API}/series/{series_id}")

    def test_recommendations_and_spoiler_flags(self, user_session, admin_session):
        movie = admin_session.post(f"{API}/movies", json={
            "title": f"TEST_SpoilerReview_{uuid.uuid4().hex[:8]}",
            "release_date": "2025-01-01",
            "genres": ["Mystery"],
        })
        assert movie.status_code == 200, movie.text
        movie_id = movie.json()["id"]
        try:
            recommendation_response = user_session.get(f"{API}/recommendations")
            assert recommendation_response.status_code == 200, recommendation_response.text
            assert isinstance(recommendation_response.json(), list)

            review = user_session.post(f"{API}/movies/{movie_id}/reviews", json={
                "rating": 8, "text": "The ending reveals everything.", "contains_spoilers": True,
            })
            assert review.status_code == 200, review.text
            reviews = user_session.get(f"{API}/movies/{movie_id}/reviews").json()
            assert reviews[0]["contains_spoilers"] is True

            comment = user_session.post(f"{API}/comments", json={
                "entity_type": "movie", "entity_id": movie_id,
                "text": "The final scene changes the story.", "contains_spoilers": True,
            })
            assert comment.status_code == 200, comment.text
            comment_id = comment.json()["id"]
            comments = user_session.get(f"{API}/comments", params={"entity_type": "movie", "entity_id": movie_id}).json()
            assert next(item for item in comments if item["id"] == comment_id)["contains_spoilers"] is True
            user_session.delete(f"{API}/comments/{comment_id}")
        finally:
            admin_session.delete(f"{API}/movies/{movie_id}")


# ---------------- Upload ----------------
class TestUpload:
    def test_upload_by_regular_user(self, user_session):
        files = {"file": ("test.txt", b"hello world", "text/plain")}
        # requests session already has cookies; drop Content-Type for multipart
        headers = {k: v for k, v in user_session.headers.items() if k.lower() != "content-type"}
        r = requests.post(f"{API}/upload", files=files, cookies=user_session.cookies, headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "path" in d


def test_username_cooldown_override_is_per_user_and_resettable(admin_session):
    session = _session()
    email = f"cooldown_{uuid.uuid4().hex[:12]}@test.com"
    registered = _register(session, email, "Test@1234", "Cooldown Test")
    assert registered.status_code == 200, registered.text
    user_id = registered.json()["id"]

    other_session = _session()
    other_email = f"cooldown_other_{uuid.uuid4().hex[:12]}@test.com"
    other_registered = _register(other_session, other_email, "Test@1234", "Other Cooldown Test")
    assert other_registered.status_code == 200, other_registered.text

    try:
        saved = admin_session.put(f"{API}/admin/username-cooldown", json={
            "user_id": user_id,
            "amount": 5,
            "unit": "hours",
        })
        assert saved.status_code == 200, saved.text

        changed_profile = session.get(f"{API}/auth/me").json()
        unchanged_profile = other_session.get(f"{API}/auth/me").json()
        assert changed_profile["username_cooldown_amount"] == 5
        assert changed_profile["username_cooldown_unit"] == "hours"
        assert changed_profile["username_cooldown_override"] is True
        assert unchanged_profile["username_cooldown_amount"] == 30
        assert unchanged_profile["username_cooldown_unit"] == "days"
        assert unchanged_profile["username_cooldown_override"] is False
    finally:
        reset = admin_session.delete(f"{API}/admin/username-cooldown/{user_id}")
        assert reset.status_code == 200, reset.text

    restored_profile = session.get(f"{API}/auth/me").json()
    assert restored_profile["username_cooldown_amount"] == 30
    assert restored_profile["username_cooldown_unit"] == "days"
    assert restored_profile["username_cooldown_override"] is False


def test_deleted_account_keeps_contributions_and_admin_can_restore(admin_session, user_session):
    session = _session()
    email = f"deleted_{uuid.uuid4().hex[:12]}@test.com"
    password = "Test@1234"
    name = f"Deleted_{uuid.uuid4().hex[:8]}"
    registered = _register(session, email, password, name)
    assert registered.status_code == 200, registered.text
    user_id = registered.json()["id"]
    access_token = registered.json()["access_token"]
    refresh_token = registered.json()["refresh_token"]
    promoted = admin_session.patch(f"{API}/moderation/users/{user_id}/role", json={"role": "moderator"})
    assert promoted.status_code == 200, promoted.text

    created = session.post(f"{API}/movies", json={"title": f"TEST_Kept_{uuid.uuid4().hex[:8]}", "release_date": "2023-01-01"})
    assert created.status_code == 200, created.text
    movie_id = created.json()["id"]
    edited = session.patch(f"{API}/movies/{movie_id}", json={"synopsis": "Moderator contribution kept after account deletion"})
    assert edited.status_code == 200, edited.text
    comment = session.post(f"{API}/comments", json={
        "entity_type": "movie",
        "entity_id": movie_id,
        "text": "Moderator forum contribution stays attributed after deletion.",
    })
    assert comment.status_code == 200, comment.text
    assert comment.json()["user_role"] == "moderator"
    contribution = requests.get(f"{API}/edits", params={"entity_type": "movie", "entity_id": movie_id}).json()
    assert any(edit.get("user_id") == user_id for edit in contribution)

    wrong_password = session.delete(f"{API}/auth/me", json={"current_password": "not-the-password"})
    assert wrong_password.status_code == 400
    deleted = session.delete(f"{API}/auth/me", json={"current_password": password})
    assert deleted.status_code == 200, deleted.text

    assert session.get(f"{API}/auth/me").status_code == 401
    restore_offer = _login(_session(), email, password)
    assert restore_offer.status_code == 409
    assert restore_offer.json()["detail"]["code"] == "account_deleted"
    old_access = _session()
    old_access.headers["Authorization"] = f"Bearer {access_token}"
    assert old_access.get(f"{API}/auth/me").status_code == 401
    old_refresh = _session()
    old_refresh.headers["Authorization"] = f"Bearer {refresh_token}"
    assert old_refresh.post(f"{API}/auth/refresh").status_code == 401

    deleted_users = admin_session.get(f"{API}/moderation/users", params={"q": email}).json()
    deleted_user = next(user for user in deleted_users if user["id"] == user_id)
    assert deleted_user["is_deleted"] is True
    assert deleted_user["role"] == "user"
    assert requests.get(f"{API}/users/{user_id}").status_code == 404
    assert user_session.get(f"{API}/users/{user_id}").status_code == 404
    promoted = admin_session.patch(
        f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "moderator"}
    )
    assert promoted.status_code == 200, promoted.text
    try:
        assert user_session.get(f"{API}/users/{user_id}").status_code == 404
    finally:
        demoted = admin_session.patch(
            f"{API}/moderation/users/{user_session.user_id}/role", json={"role": "user"}
        )
        assert demoted.status_code == 200, demoted.text

    tombstone = admin_session.get(f"{API}/users/{user_id}").json()
    assert tombstone["is_deleted"] is True
    assert tombstone["name"] == "Deleted account"
    assert any(edit.get("user_id") == user_id for edit in tombstone["edits"])
    assert all(edit.get("user_role") != "moderator" for edit in tombstone["edits"] if edit.get("user_id") == user_id)
    saved_comments = requests.get(
        f"{API}/comments", params={"entity_type": "movie", "entity_id": movie_id}
    ).json()
    saved_comment = next(item for item in saved_comments if item["id"] == comment.json()["id"])
    assert saved_comment["user_role"] == "user"
    assert requests.get(f"{API}/movies/{movie_id}").status_code == 200
    assert any(
        edit.get("user_id") == user_id
        for edit in requests.get(f"{API}/edits", params={"entity_type": "movie", "entity_id": movie_id}).json()
    )
    assert user_session.post(f"{API}/moderation/users/{user_id}/restore").status_code == 403

    restored = admin_session.post(f"{API}/moderation/users/{user_id}/restore")
    assert restored.status_code == 200, restored.text
    restored_login = _session()
    assert _login(restored_login, email, password).status_code == 200
    restored_profile = requests.get(f"{API}/users/{user_id}").json()
    assert restored_profile["name"] == name
    assert not restored_profile.get("is_deleted", False)

    deleted_again = restored_login.delete(f"{API}/auth/me", json={"current_password": password})
    assert deleted_again.status_code == 429

    self_restore_email = f"self_restore_{uuid.uuid4().hex[:12]}@test.com"
    self_restore = _session()
    self_restore_registration = _register(self_restore, self_restore_email, password, f"Restore_{uuid.uuid4().hex[:8]}")
    assert self_restore_registration.status_code == 200, self_restore_registration.text
    self_restore_delete = self_restore.delete(f"{API}/auth/me", json={"current_password": password})
    assert self_restore_delete.status_code == 200, self_restore_delete.text
    self_restore_attempt = _login(_session(), self_restore_email, password)
    assert self_restore_attempt.status_code == 409
    self_restored_login = _session()
    self_restored = self_restored_login.post(
        f"{API}/auth/restore-deleted", json={"identifier": self_restore_email, "password": password}
    )
    assert self_restored.status_code == 200, self_restored.text
    assert self_restored_login.get(f"{API}/auth/me").status_code == 200


def test_rapid_cast_removal_permanently_suspends_for_vandalism(admin_session):
    session = _session()
    email = f"vandalism_{uuid.uuid4().hex[:12]}@test.com"
    password = "Test@1234"
    registered = _register(session, email, password, "Vandalism Test")
    assert registered.status_code == 200, registered.text
    user_id = registered.json()["id"]

    cast = [
        {"actor_id": uuid.uuid4().hex[:24], "character_name": f"Role {index}"}
        for index in range(6)
    ]
    created = session.post(f"{API}/movies", json={
        "title": f"TEST_RapidRemoval_{uuid.uuid4().hex}",
        "release_date": "2025-01-01",
        "cast": cast,
    })
    assert created.status_code == 200, created.text
    movie_id = created.json()["id"]

    try:
        update = session.patch(f"{API}/movies/{movie_id}", json={"cast": []})
        assert update.status_code == 403, update.text
        profile = session.get(f"{API}/auth/me").json()
        assert profile["is_suspended"] is True
        assert profile["suspension_reason"] == "vandalism"
        assert profile["suspension_until"] == "permanent"
        notices = session.get(f"{API}/inbox/threads").json()
        assert any(
            thread.get("is_suspension_notice")
            and thread.get("target_user_id") == user_id
            and "permanently" in thread.get("body", "")
            for thread in notices
        )
    finally:
        admin_session.delete(f"{API}/movies/{movie_id}")


def test_movie_purchase_options_require_valid_links_and_round_trip(admin_session):
    session = _session()
    email = f"purchase_options_{uuid.uuid4().hex[:12]}@test.com"
    registered = _register(session, email, "Test@1234", "Purchase Options Test")
    assert registered.status_code == 200, registered.text

    created = session.post(f"{API}/movies", json={
        "title": f"TEST_PurchaseOptions_{uuid.uuid4().hex}",
        "release_date": "2025-01-01",
        "purchase_options": [
            {"provider": "Amazon", "url": "https://amazon.example/movie"},
            {"provider": "Apple TV", "url": "https://tv.apple.example/movie"},
        ],
    })
    assert created.status_code == 200, created.text
    movie_id = created.json()["id"]

    try:
        movie = session.get(f"{API}/movies/{movie_id}").json()
        assert movie["purchase_options"] == [
            {"provider": "Amazon", "url": "https://amazon.example/movie"},
            {"provider": "Apple TV", "url": "https://tv.apple.example/movie"},
        ]
        invalid = session.patch(f"{API}/movies/{movie_id}", json={
            "purchase_options": [{"provider": "YouTube", "url": "javascript:alert(1)"}],
        })
        assert invalid.status_code == 400, invalid.text
    finally:
        admin_session.delete(f"{API}/movies/{movie_id}")
