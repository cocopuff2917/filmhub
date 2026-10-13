"""Integration coverage for personal lists and recommendation preferences."""
import os
import time

import pytest
import requests


def _backend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    try:
        with open("/app/frontend/.env") as env_file:
            for line in env_file:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
    return ""


BASE_URL = _backend_url()
pytestmark = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL is not configured")
API = f"{BASE_URL}/api"
USER = {"email": "user@test.com", "password": "Test@123"}


@pytest.fixture(scope="module")
def user():
    session = requests.Session()
    response = session.post(f"{API}/auth/login", json=USER, timeout=15)
    if response.status_code != 200:
        session.post(f"{API}/auth/register", json={**USER, "name": "Regular User"}, timeout=15)
        response = session.post(f"{API}/auth/login", json=USER, timeout=15)
    assert response.status_code == 200, response.text
    return session


def test_personal_list_sharing_and_owner_controls(user):
    name = f"TEST_User_List_{int(time.time())}"
    created = user.post(f"{API}/user-lists", json={"name": name, "description": "Shareable picks", "is_public": True}, timeout=15)
    assert created.status_code == 200, created.text
    list_id = created.json()["id"]
    try:
        movie_response = requests.get(f"{API}/movies?limit=1", timeout=15)
        assert movie_response.status_code == 200 and movie_response.json()
        movie_id = movie_response.json()[0]["id"]
        added = user.post(f"{API}/user-lists/{list_id}/items", json={"kind": "movie", "title_id": movie_id}, timeout=15)
        assert added.status_code == 200, added.text

        detail = requests.get(f"{API}/user-lists/{list_id}", timeout=15)
        assert detail.status_code == 200
        assert detail.json()["items"][0]["id"] == movie_id
        assert detail.json()["can_edit"] is False

        denied = requests.patch(f"{API}/user-lists/{list_id}", json={"name": "Changed by stranger"}, timeout=15)
        assert denied.status_code == 404

        private_update = user.patch(f"{API}/user-lists/{list_id}", json={"is_public": False}, timeout=15)
        assert private_update.status_code == 200
        assert requests.get(f"{API}/user-lists/{list_id}", timeout=15).status_code == 404
        assert user.get(f"{API}/user-lists/{list_id}", timeout=15).json()["can_edit"] is True

        removed = user.delete(f"{API}/user-lists/{list_id}/items/movie/{movie_id}", timeout=15)
        assert removed.status_code == 200
        assert user.get(f"{API}/user-lists/{list_id}", timeout=15).json()["items"] == []
    finally:
        user.delete(f"{API}/user-lists/{list_id}", timeout=15)


def test_recommendation_preferences_persist_and_validate(user):
    updated = user.put(f"{API}/recommendation-preferences", json={
        "preferred_genres": ["Drama"],
        "excluded_genres": ["Horror", " drama "],
        "content_types": ["series"],
    }, timeout=15)
    assert updated.status_code == 200, updated.text
    assert updated.json() == {"preferred_genres": [], "excluded_genres": ["Horror", "drama"], "content_types": ["series"]}
    fetched = user.get(f"{API}/recommendation-preferences", timeout=15)
    assert fetched.status_code == 200
    assert fetched.json() == updated.json()

    invalid = user.put(f"{API}/recommendation-preferences", json={"content_types": ["actor"]}, timeout=15)
    assert invalid.status_code == 400

    user.put(f"{API}/recommendation-preferences", json={
        "preferred_genres": [], "excluded_genres": [], "content_types": ["movie", "series"],
    }, timeout=15)