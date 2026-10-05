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
class TestMovies:
    def test_create_movie_by_user_and_edit_logged(self, user_session):
        payload = {"title": "TEST_UserMovie", "release_date": "2023-01-01", "genres": ["Drama"]}
        r = user_session.post(f"{API}/movies", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
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


# ---------------- Moderation / Suspension ----------------
class TestModeration:
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
