"""Backend tests: moderation privacy (masking mod identities to suspended users) + suspended profile hiding."""
import os
import pytest
import requests
from datetime import datetime, timezone

def _read_env(key, path="/app/frontend/.env"):
    try:
        with open(path) as f:
            for line in f:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PW = "Admin@123"
SUS_EMAIL = "targetuser@test.com"
SUS_PW = "Test@123"

MASK_NAME = "Support"
MASK_ROLE = "support"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def sus_session_and_ids(admin_session):
    """Ensure target user is currently suspended; log in as them; return session + ids."""
    # find target user id via admin listing
    r = admin_session.get(f"{API}/moderation/users", params={"q": "targetuser@test.com"}, timeout=15)
    assert r.status_code == 200, r.text
    users = r.json()
    target = None
    for u in users if isinstance(users, list) else users.get("items", []):
        if u.get("email") == SUS_EMAIL:
            target = u
            break
    assert target, f"target user not found in mod list: {users}"
    tid = target.get("id") or target.get("_id")

    # Suspend (idempotent) 7 days
    admin_session.post(
        f"{API}/moderation/users/{tid}/suspend",
        json={"duration_days": 7, "reason": "test suspension for masking"},
        timeout=15,
    )

    # login as suspended user
    sus = _login(SUS_EMAIL, SUS_PW)
    me = sus.get(f"{API}/auth/me", timeout=15).json()
    sus_id = me["id"]
    assert me.get("is_suspended") is True, f"suspended flag not set: {me}"
    return sus, sus_id, tid


@pytest.fixture(scope="module")
def direct_thread_id(admin_session, sus_session_and_ids):
    _, sus_id, _ = sus_session_and_ids
    # find existing direct thread from admin to sus user
    sus, _, _ = sus_session_and_ids
    r = sus.get(f"{API}/inbox/threads", timeout=15)
    assert r.status_code == 200
    threads = r.json()
    items = threads if isinstance(threads, list) else threads.get("items", [])
    if items:
        return items[0]["id"]
    # else create one via mod
    r = admin_session.post(
        f"{API}/moderation/threads",
        json={"target_user_id": sus_id, "title": "Warning: incorrect edits", "body": "please stop"},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ---------- Masking on /api/inbox/threads ----------

def test_inbox_threads_masks_mod_sender(sus_session_and_ids, direct_thread_id):
    sus, _, _ = sus_session_and_ids
    r = sus.get(f"{API}/inbox/threads", timeout=15)
    assert r.status_code == 200
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert items, "expected at least one direct thread"
    t = next((x for x in items if x["id"] == direct_thread_id), items[0])
    assert t["user_name"] == MASK_NAME, f"user_name not masked: {t}"
    assert t["user_role"] == MASK_ROLE
    assert t["user_avatar"] == ""
    assert t["user_id"] == ""


# ---------- Masking on /api/threads/{id}/inbox ----------

def test_thread_inbox_masks_op_and_mod_replies(admin_session, sus_session_and_ids, direct_thread_id):
    sus, sus_id, _ = sus_session_and_ids
    # admin reply
    admin_session.post(
        f"{API}/threads/{direct_thread_id}/messages",
        json={"text": "another admin reply for masking test"},
        timeout=15,
    )
    r = sus.get(f"{API}/threads/{direct_thread_id}/inbox", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # OP masked
    assert data["user_name"] == MASK_NAME
    assert data["user_role"] == MASK_ROLE
    assert data["user_id"] == ""
    # messages: any mod reply masked, user own reply unmasked
    msgs = data.get("messages", [])
    found_masked_mod = False
    for m in msgs:
        if m["user_role"] == MASK_ROLE:
            assert m["user_name"] == MASK_NAME
            assert m["user_id"] == ""
            found_masked_mod = True
        if m["user_id"] == sus_id:
            # own message unmasked
            assert m["user_name"] and m["user_name"] != MASK_NAME
            assert m["user_role"] == "user"
    assert found_masked_mod, f"no masked mod reply found among {msgs}"


# ---------- Masking on /api/notifications ----------

def test_notifications_masked_for_suspended_user(admin_session, sus_session_and_ids, direct_thread_id):
    sus, _, _ = sus_session_and_ids
    # ensure a fresh notification exists
    admin_session.post(
        f"{API}/threads/{direct_thread_id}/messages",
        json={"text": "notification trigger msg"},
        timeout=15,
    )
    r = sus.get(f"{API}/notifications", timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    mod_related = [n for n in items if (n.get("from_user_role") or "").lower() in (MASK_ROLE, "moderator", "admin")]
    assert items, "expected notifications for suspended user"
    # after masking, from_user_role should now be "support" only
    for n in items:
        if n.get("from_user_id") == "" or n.get("from_user_role") == MASK_ROLE:
            assert n["from_user_name"] == MASK_NAME
            assert n["from_user_avatar"] == ""
            assert n["from_user_id"] == ""
            t = n.get("title") or ""
            if "from " in t:
                assert t.rstrip().endswith("from Support"), f"title not rewritten: {t}"
    # no mod/admin role should leak
    assert not any((n.get("from_user_role") or "").lower() in ("moderator", "admin") for n in items), \
        f"leaked mod role in notifications: {items}"


# ---------- Admin view is NOT masked ----------

def test_admin_view_thread_not_masked(admin_session, direct_thread_id):
    r = admin_session.get(f"{API}/threads/{direct_thread_id}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user_role"] in ("moderator", "admin"), f"expected real mod role, got {data}"
    assert data["user_name"] != MASK_NAME
    assert data["user_id"] != ""
    # check mod replies unmasked too
    for m in data.get("messages", []):
        if (m.get("user_role") or "").lower() in ("moderator", "admin"):
            assert m["user_name"] != MASK_NAME
            assert m["user_id"] != ""


# ---------- Suspended profile visibility ----------

def test_suspended_user_profile_404_for_self(sus_session_and_ids):
    sus, sus_id, _ = sus_session_and_ids
    r = sus.get(f"{API}/users/{sus_id}", timeout=15)
    assert r.status_code == 404, f"expected 404 for self, got {r.status_code}: {r.text}"


def test_suspended_user_profile_404_unauthed(sus_session_and_ids):
    _, sus_id, _ = sus_session_and_ids
    r = requests.get(f"{API}/users/{sus_id}", timeout=15)
    assert r.status_code == 404


def test_suspended_user_profile_200_for_admin(admin_session, sus_session_and_ids):
    _, sus_id, _ = sus_session_and_ids
    r = admin_session.get(f"{API}/users/{sus_id}", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("is_suspended") is True


# ---------- Reply permissions ----------

def test_suspended_user_can_reply_own_direct_thread(sus_session_and_ids, direct_thread_id):
    sus, _, _ = sus_session_and_ids
    r = sus.post(f"{API}/threads/{direct_thread_id}/messages", json={"text": "my reply from suspended"}, timeout=15)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"


def test_suspended_user_cannot_post_on_public_thread(sus_session_and_ids, admin_session):
    sus, _, _ = sus_session_and_ids
    # find a public (non-direct) thread; use forum listing
    r = admin_session.get(f"{API}/threads", timeout=15)
    assert r.status_code == 200
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    pub = next((t for t in items if not t.get("is_direct")), None)
    if not pub:
        pytest.skip("no public thread available")
    r = sus.post(f"{API}/threads/{pub['id']}/messages", json={"text": "should be blocked"}, timeout=15)
    assert r.status_code == 403, f"expected 403 on public thread, got {r.status_code}: {r.text}"


# ---------- Regression ----------

def test_regression_admin_login_me():
    s = _login(ADMIN_EMAIL, ADMIN_PW)
    r = s.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_regression_public_lists():
    for path in ("/movies", "/series", "/actors"):
        r = requests.get(f"{API}{path}", timeout=15)
        assert r.status_code == 200, f"{path}: {r.status_code}"
