from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
import requests
import secrets
import hmac
import re
import ipaddress
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Query, Header
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, BeforeValidator
from bson import ObjectId

# ----------- Config -----------
JWT_ALGORITHM = "HS256"
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "cineverse"
storage_key: Optional[str] = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ----------- Object Storage -----------
def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        init_storage(force=True)
        key = storage_key
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": storage_key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ----------- Email (Emergent Managed) -----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "CineVerse")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    if not EMAIL_KEY:
        logger.error("EMERGENT_EMAIL_KEY not configured")
        raise HTTPException(status_code=500, detail="Email service not configured")
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as client_http:
            resp = await client_http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")

# ----------- Auth Helpers -----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 24), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user_allow_suspended(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # auto-lift expired suspensions
        sus = user.get("suspended_until")
        is_suspended = False
        if sus:
            if sus == "permanent":
                is_suspended = True
            else:
                try:
                    until = datetime.fromisoformat(sus)
                    if until > datetime.now(timezone.utc):
                        is_suspended = True
                    else:
                        await db.users.update_one({"_id": user["_id"]}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
                        user.pop("suspended_until", None)
                        user.pop("suspension_reason", None)
                except Exception:
                    pass
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        user["is_suspended"] = is_suspended
        user["suspension_until"] = user.get("suspended_until")
        # resolve custom roles (new multi-array + legacy single id)
        role_ids = []
        for rid in (user.get("custom_role_ids") or []):
            if rid and rid not in role_ids:
                role_ids.append(rid)
        legacy = user.get("custom_role_id")
        if legacy and legacy not in role_ids:
            role_ids.append(legacy)
        custom_roles_resolved = []
        for crid in role_ids:
            try:
                cr = await db.custom_roles.find_one({"_id": ObjectId(crid)})
            except Exception:
                cr = None
            if not cr:
                continue
            perms = cr.get("permissions", []) or []
            custom_roles_resolved.append({
                "id": str(cr["_id"]),
                "name": cr.get("name"),
                "color": cr.get("color", "#f59e0b"),
                "base": _derive_base(perms),
                "permissions": perms,
                "description": cr.get("description", ""),
            })
        user["custom_roles"] = custom_roles_resolved
        user["custom_role_ids"] = [cr["id"] for cr in custom_roles_resolved]
        # Back-compat: expose the first custom role under the old key too
        user["custom_role"] = custom_roles_resolved[0] if custom_roles_resolved else None
        rank = {"user": 0, "moderator": 1, "admin": 2}
        eff = user.get("role", "user")
        for cr in custom_roles_resolved:
            if rank.get(cr["base"], 0) > rank.get(eff, 0):
                eff = cr["base"]
        user["effective_role"] = eff
        eff_perms = set()
        if user.get("role") == "admin" or eff == "admin":
            eff_perms = set(PERMISSIONS_ALL)
        elif user.get("role") == "moderator" or eff == "moderator":
            eff_perms = set(PERMS_MODERATOR)
        for cr in custom_roles_resolved:
            eff_perms.update(cr.get("permissions") or [])
        user["permissions"] = sorted(eff_perms)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(request: Request) -> dict:
    user = await get_current_user_allow_suspended(request)
    if user.get("is_suspended"):
        reason = user.get("suspension_reason") or ""
        until = user.get("suspension_until")
        when = "permanently" if until == "permanent" else f"until {until}"
        raise HTTPException(status_code=403, detail=f"Account suspended {when}. {reason}".strip())
    return user

async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("effective_role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_current_moderator(user: dict = Depends(get_current_user)) -> dict:
    if user.get("effective_role") not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Moderator access required")
    return user

async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user_allow_suspended(request)
    except HTTPException:
        return None

# ----------- Models -----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2, max_length=40)

class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str

class CastMember(BaseModel):
    actor_id: str
    character_name: str

class CrewMember(BaseModel):
    name: str
    role: str = "Director"  # Director | Writer | Producer, etc.

class MovieCreate(BaseModel):
    title: str
    release_date: str  # YYYY-MM-DD
    genres: List[str] = []
    synopsis: str = ""
    tagline: str = ""
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    video_urls: List[str] = []
    runtime: Optional[int] = None
    gallery: List[str] = []
    cast: List[CastMember] = []
    crew: List[CrewMember] = []
    keywords: List[str] = []
    status: str = "Released"  # Released | In Production | Post Production | Rumored | Canceled
    original_language: str = "English"
    budget: Optional[int] = None
    revenue: Optional[int] = None
    awards_wins: Optional[int] = None
    awards_nominations: Optional[int] = None
    is_trending: bool = False
    collection_ids: List[str] = []
    locked_cast_actor_ids: List[str] = []

class MovieUpdate(BaseModel):
    title: Optional[str] = None
    release_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    tagline: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    video_urls: Optional[List[str]] = None
    runtime: Optional[int] = None
    gallery: Optional[List[str]] = None
    cast: Optional[List[CastMember]] = None
    crew: Optional[List[CrewMember]] = None
    keywords: Optional[List[str]] = None
    status: Optional[str] = None
    original_language: Optional[str] = None
    budget: Optional[int] = None
    revenue: Optional[int] = None
    awards_wins: Optional[int] = None
    awards_nominations: Optional[int] = None
    is_trending: Optional[bool] = None
    collection_ids: Optional[List[str]] = None
    locked_cast_actor_ids: Optional[List[str]] = None

class ActorCreate(BaseModel):
    name: str
    bio: str = ""
    photo_url: str = ""
    birth_date: Optional[str] = None
    death_date: Optional[str] = None
    place_of_birth: str = ""
    place_of_death: str = ""
    gallery: List[str] = []

class ActorUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    birth_date: Optional[str] = None
    death_date: Optional[str] = None
    place_of_birth: Optional[str] = None
    place_of_death: Optional[str] = None
    gallery: Optional[List[str]] = None

class ReviewCreate(BaseModel):
    rating: float = Field(ge=0.5, le=10.0)
    text: str = ""

# ----------- Series Models -----------
class GuestStar(BaseModel):
    actor_id: str
    character_name: str

class EpisodeItem(BaseModel):
    episode_number: int
    name: str = ""
    air_date: Optional[str] = None
    overview: str = ""
    still_url: str = ""
    stills: List[str] = []
    guest_stars: List[GuestStar] = []

class SeasonItem(BaseModel):
    season_number: int
    name: str = ""
    air_date: Optional[str] = None
    overview: str = ""
    poster_url: str = ""
    episodes: List[EpisodeItem] = []

class SeriesCreate(BaseModel):
    title: str
    first_air_date: Optional[str] = None
    last_air_date: Optional[str] = None
    genres: List[str] = []
    synopsis: str = ""
    tagline: str = ""
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    video_urls: List[str] = []
    status: str = "Ongoing"
    gallery: List[str] = []
    main_cast: List[CastMember] = []
    creators: List[CrewMember] = []
    keywords: List[str] = []
    network: str = ""
    network_logo_url: str = ""
    type: str = "Scripted"  # Scripted | Reality | Animated | Documentary | Miniseries | News | Talk Show
    original_language: str = "English"
    awards_wins: Optional[int] = None
    awards_nominations: Optional[int] = None
    seasons: List[SeasonItem] = []
    is_trending: bool = False
    collection_ids: List[str] = []
    locked_cast_actor_ids: List[str] = []
    locked_guest_stars: List[str] = []  # composite keys "{season_number}:{episode_number}:{actor_id}"

class SeriesUpdate(BaseModel):
    title: Optional[str] = None
    first_air_date: Optional[str] = None
    last_air_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    tagline: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    video_urls: Optional[List[str]] = None
    status: Optional[str] = None
    gallery: Optional[List[str]] = None
    main_cast: Optional[List[CastMember]] = None
    creators: Optional[List[CrewMember]] = None
    keywords: Optional[List[str]] = None
    network: Optional[str] = None
    network_logo_url: Optional[str] = None
    type: Optional[str] = None
    original_language: Optional[str] = None
    awards_wins: Optional[int] = None
    awards_nominations: Optional[int] = None
    seasons: Optional[List[SeasonItem]] = None
    is_trending: Optional[bool] = None
    collection_ids: Optional[List[str]] = None
    locked_cast_actor_ids: Optional[List[str]] = None
    locked_guest_stars: Optional[List[str]] = None

# ----------- Moderation Models -----------
class SuspendRequest(BaseModel):
    duration_days: Optional[int] = None  # legacy: days (None = permanent when duration also absent)
    duration: Optional[int] = None       # new numeric value paired with duration_unit
    duration_unit: Optional[str] = None  # "minutes" | "hours" | "days" | "permanent"
    reason: str = ""

class IpBanRequest(BaseModel):
    ip: str
    scope: str = "both"  # "register" | "edit" | "both"
    duration: Optional[int] = None
    duration_unit: Optional[str] = None  # "hours" | "days" | "months" | "years" | "permanent"
    reason: str = ""

# ---------- Homepage customization ----------
class HomepageHero(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    tagline: Optional[str] = None
    featured_type: Optional[str] = None   # "movie" | "series" | None
    featured_id: Optional[str] = None

class HomepageAnnouncement(BaseModel):
    enabled: bool = False
    text: str = ""
    link_url: Optional[str] = None
    link_label: Optional[str] = None

class HomepageSectionItem(BaseModel):
    type: str  # "movie" | "series"
    id: str

class HomepageSection(BaseModel):
    id: str                              # stable identifier
    type: str                            # "built-in" | "custom"
    title: str
    enabled: bool = True
    source: Optional[str] = None         # for built-in: trending_movies | upcoming_movies | trending_series | recent_movies | recent_series
    items: List[HomepageSectionItem] = Field(default_factory=list)  # for custom
    limit: int = 12

class HomepageConfig(BaseModel):
    hero: HomepageHero = Field(default_factory=HomepageHero)
    announcement: HomepageAnnouncement = Field(default_factory=HomepageAnnouncement)
    sections: List[HomepageSection] = Field(default_factory=list)

class RoleUpdate(BaseModel):
    role: str  # user / moderator / admin

class AvatarUpdate(BaseModel):
    avatar_url: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=40)
    bio: Optional[str] = Field(default=None, max_length=500)

class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=200)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=6, max_length=200)

class CommentCreate(BaseModel):
    entity_type: str  # movie | series
    entity_id: str
    text: str = Field(min_length=1, max_length=2000)
    parent_id: Optional[str] = None

# ----------- Threads -----------
class ThreadCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    category: str = "support"  # support | report | general
    entity_type: Optional[str] = None  # movie | series | actor
    entity_id: Optional[str] = None
    entity_title: Optional[str] = None

class ThreadMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)

class ThreadStatusUpdate(BaseModel):
    status: str  # open | closed

# ----------- Direct Threads / Notifications -----------
class DirectThreadCreate(BaseModel):
    target_user_id: str
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=1, max_length=5000)

# ----------- Locks -----------
class LockUpdate(BaseModel):
    locked_fields: List[str]

# ----------- Custom Roles -----------
PERMISSIONS_ALL = [
    "content.edit_locked",
    "content.delete",
    "content.lock",
    "content.protect_fields",
    "content.lock_cast",
    "user.suspend",
    "user.view_ips",
    "user.assign_role",
    "user.assign_custom_role",
    "moderation.messages.read_reply",
    "thread.moderate",
    "comment.moderate",
    "roles.manage",
]
PERMISSION_LABELS = {
    "content.edit_locked": "Edit locked fields",
    "content.delete": "Delete / restore movies, series, actors",
    "content.lock": "Lock entire entity fields (bulk)",
    "content.protect_fields": "Protect fields (toggle per-field locks)",
    "content.lock_cast": "Lock & unlock individual cast / guest-star rows",
    "user.suspend": "Suspend & unsuspend users",
    "user.view_ips": "View user IP addresses and overlap",
    "user.assign_role": "Assign the base role (user / moderator / admin)",
    "user.assign_custom_role": "Assign custom roles to users",
    "moderation.messages.read_reply": "Read & reply in every direct message thread",
    "thread.moderate": "Moderate public forum threads",
    "comment.moderate": "Moderate reviews & comments",
    "roles.manage": "Create / edit / delete custom roles",
}
PERMS_MODERATOR = {
    "content.delete", "content.lock", "content.protect_fields", "content.lock_cast",
    "user.suspend", "user.view_ips", "moderation.messages.read_reply",
    "thread.moderate", "comment.moderate", "content.edit_locked",
}
PERMS_ADMIN = {"user.assign_role", "user.assign_custom_role", "roles.manage"}

def _derive_base(permissions: List[str]) -> str:
    perms = set(permissions or [])
    if perms & PERMS_ADMIN:
        return "admin"
    if perms & PERMS_MODERATOR:
        return "moderator"
    return "user"

def _has_perm(user: Optional[dict], perm: str) -> bool:
    if not user:
        return False
    if user.get("role") == "admin" or user.get("effective_role") == "admin":
        return True
    return perm in (user.get("permissions") or [])

def _require_perm(user: Optional[dict], perm: str, detail: str = "You don't have permission to do this."):
    if not _has_perm(user, perm):
        raise HTTPException(status_code=403, detail=detail)

class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "#f59e0b"
    description: str = ""
    permissions: List[str] = []

class RolePatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

class AssignRole(BaseModel):
    custom_role_id: Optional[str] = None  # legacy single assignment (kept for back-compat)
    custom_role_ids: Optional[List[str]] = None  # new multi-role assignment

# ----------- Utility -----------
def _alive(q: Optional[dict] = None) -> dict:
    """Filter that excludes soft-deleted docs. Merges with an existing query."""
    base = {"deleted": {"$ne": True}}
    if not q:
        return base
    return {"$and": [base, q]}

def _dedupe_cast(rows):
    """Keep the first occurrence of each actor_id in a cast/main_cast/guest_stars list.
    Rejects duplicates so an actor can't appear twice in the same movie/series/episode."""
    if not rows:
        return rows
    seen = set()
    out = []
    for r in rows:
        d = r if isinstance(r, dict) else r.model_dump()
        aid = d.get("actor_id")
        if not aid:
            continue
        if aid in seen:
            continue
        seen.add(aid)
        out.append(d)
    return out

def _enforce_cast_locks(existing_cast, submitted_cast, locked_actor_ids, is_mod):
    """Pin locked cast rows at their original positions and keep their exact row content.
    Mods bypass. Non-mods may edit/remove/reorder every unlocked row freely."""
    if is_mod or not locked_actor_ids:
        return submitted_cast or []
    locked_set = set(locked_actor_ids)
    locked_rows = []  # (original_index, row)
    for i, row in enumerate(existing_cast or []):
        if row.get("actor_id") in locked_set:
            locked_rows.append((i, dict(row)))
    # Keep every submitted row whose actor_id is NOT locked (non-locked actors are free to shuffle/edit/remove)
    unlocked_submitted = [dict(r) for r in (submitted_cast or []) if r.get("actor_id") not in locked_set]
    # Rebuild list by inserting locked rows at their original indices
    result = unlocked_submitted[:]
    for pos, row in sorted(locked_rows, key=lambda x: x[0]):
        pos_clamped = min(pos, len(result))
        result.insert(pos_clamped, row)
    return result

def _enforce_season_episode_integrity(existing_seasons, submitted_seasons, user):
    """Non-mods cannot delete seasons or episodes — silently restore any that have gone missing.
    Users with content.delete (mods, admins, or anyone granted that perm) bypass this check."""
    if _has_perm(user, "content.delete"):
        return submitted_seasons or []
    old = existing_seasons or []
    new = list(submitted_seasons or [])
    new_by_sn = {s.get("season_number"): s for s in new}
    merged: List[dict] = []
    merged_sns = set()
    # Pass 1: for every existing season, keep it (merging in any legit edits to it from submitted)
    for old_s in old:
        sn = old_s.get("season_number")
        if sn in new_by_sn:
            new_s = dict(new_by_sn[sn])
            new_ep_by_en = {e.get("episode_number"): e for e in (new_s.get("episodes") or [])}
            merged_eps: List[dict] = []
            merged_ens = set()
            for old_ep in (old_s.get("episodes") or []):
                en = old_ep.get("episode_number")
                if en in new_ep_by_en:
                    merged_eps.append(dict(new_ep_by_en[en]))
                else:
                    merged_eps.append(dict(old_ep))
                merged_ens.add(en)
            # Append any brand-new episodes the non-mod added
            for new_ep in (new_s.get("episodes") or []):
                en = new_ep.get("episode_number")
                if en not in merged_ens:
                    merged_eps.append(dict(new_ep))
                    merged_ens.add(en)
            new_s["episodes"] = merged_eps
            merged.append(new_s)
        else:
            # Season dropped by non-mod — restore it exactly as it was
            merged.append(dict(old_s))
        merged_sns.add(sn)
    # Pass 2: brand-new seasons the non-mod added
    for new_s in new:
        if new_s.get("season_number") not in merged_sns:
            merged.append(dict(new_s))
    return merged

def _enforce_image_delete_guard(old_doc: dict, update_data: dict, user: dict, single_fields: Optional[List[str]] = None, gallery_fields: Optional[List[str]] = None):
    """Non-mods cannot delete images — silently restore any single-image field that got blanked
    and any gallery items that were removed. Users with content.delete bypass."""
    if _has_perm(user, "content.delete"):
        return
    for f in (single_fields or []):
        if f in update_data:
            old_val = old_doc.get(f) or ""
            new_val = update_data.get(f) or ""
            # Only guard against DELETION (clearing an existing image). Replacing with a new URL is fine.
            if old_val and not new_val:
                update_data[f] = old_val
    for f in (gallery_fields or []):
        if f in update_data:
            old_list = list(old_doc.get(f) or [])
            new_list = list(update_data.get(f) or [])
            missing = [p for p in old_list if p not in new_list]
            if missing:
                # Keep removed items at the end, preserving any new additions.
                update_data[f] = new_list + missing

def _enforce_series_episode_image_guard(old_doc: dict, update_data: dict, user: dict):
    """Guard poster_url (season) and still_url + stills (episode) images from non-mod deletion."""
    if _has_perm(user, "content.delete") or "seasons" not in update_data:
        return
    old_seasons = old_doc.get("seasons") or []
    old_by_sn = {s.get("season_number"): s for s in old_seasons}
    for sn_entry in update_data["seasons"]:
        sn_num = sn_entry.get("season_number")
        old_sn = old_by_sn.get(sn_num) or {}
        # Season poster
        if old_sn.get("poster_url") and not (sn_entry.get("poster_url") or ""):
            sn_entry["poster_url"] = old_sn.get("poster_url")
        old_eps = {e.get("episode_number"): e for e in (old_sn.get("episodes") or [])}
        for ep in (sn_entry.get("episodes") or []):
            en = ep.get("episode_number")
            old_ep = old_eps.get(en) or {}
            if old_ep.get("still_url") and not (ep.get("still_url") or ""):
                ep["still_url"] = old_ep.get("still_url")
            # Episode stills gallery
            old_stills = list(old_ep.get("stills") or [])
            new_stills = list(ep.get("stills") or [])
            missing = [p for p in old_stills if p not in new_stills]
            if missing:
                ep["stills"] = new_stills + missing

def _norm_title(s: str) -> str:
    return (s or "").strip().lower()

def doc_to_dict(doc, id_key="id"):
    if not doc:
        return doc
    doc[id_key] = str(doc.pop("_id"))
    return doc

async def enrich_movie(doc):
    doc_to_dict(doc)
    # attach actors data
    cast = doc.get("cast", []) or []
    actor_ids = [c["actor_id"] for c in cast if c.get("actor_id")]
    actors_map = {}
    if actor_ids:
        object_ids = []
        for aid in actor_ids:
            try:
                object_ids.append(ObjectId(aid))
            except Exception:
                pass
        cursor = db.actors.find({"_id": {"$in": object_ids}})
        async for a in cursor:
            a_id = str(a["_id"])
            actors_map[a_id] = {"id": a_id, "name": a.get("name"), "photo_url": a.get("photo_url", "")}
    enriched_cast = []
    for c in cast:
        actor = actors_map.get(c.get("actor_id"))
        if actor:
            enriched_cast.append({**c, "actor": actor})
    doc["cast"] = enriched_cast
    # rating aggregation
    agg = await db.reviews.aggregate([
        {"$match": {"movie_id": doc["id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    if agg:
        doc["avg_rating"] = round(agg[0]["avg"], 1)
        doc["rating_count"] = agg[0]["count"]
    else:
        doc["avg_rating"] = None
        doc["rating_count"] = 0
    doc["collections"] = await _collections_for_ids(doc.get("collection_ids") or [])
    return doc

async def enrich_series(doc, deep: bool = True):
    """Enrich a series doc with actor data on main_cast and, if deep, on episode guest_stars."""
    doc_to_dict(doc)
    # gather all actor ids used
    actor_ids = set()
    for c in doc.get("main_cast", []) or []:
        if c.get("actor_id"):
            actor_ids.add(c["actor_id"])
    if deep:
        for season in doc.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                for gs in ep.get("guest_stars", []) or []:
                    if gs.get("actor_id"):
                        actor_ids.add(gs["actor_id"])
    actors_map = {}
    if actor_ids:
        object_ids = []
        for aid in actor_ids:
            try:
                object_ids.append(ObjectId(aid))
            except Exception:
                pass
        async for a in db.actors.find({"_id": {"$in": object_ids}}):
            aid = str(a["_id"])
            actors_map[aid] = {"id": aid, "name": a.get("name"), "photo_url": a.get("photo_url", "")}
    enriched_main = []
    for c in doc.get("main_cast", []) or []:
        actor = actors_map.get(c.get("actor_id"))
        if actor:
            enriched_main.append({**c, "actor": actor})
    if deep:
        for season in doc.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                enriched_gs = []
                for gs in ep.get("guest_stars", []) or []:
                    actor = actors_map.get(gs.get("actor_id"))
                    if actor:
                        enriched_gs.append({**gs, "actor": actor})
                ep["guest_stars"] = enriched_gs
    # episode / season counts
    seasons = doc.get("seasons", []) or []
    doc["season_count"] = len(seasons)
    total_episodes = sum(len(s.get("episodes", []) or []) for s in seasons)
    doc["episode_count"] = total_episodes

    # Count how many episodes each guest-star appeared in across the whole series.
    gs_counts: dict = {}
    gs_character: dict = {}
    for season in seasons:
        for ep in season.get("episodes", []) or []:
            for gs in ep.get("guest_stars", []) or []:
                aid = gs.get("actor_id")
                if not aid:
                    continue
                gs_counts[aid] = gs_counts.get(aid, 0) + 1
                if aid not in gs_character and gs.get("character_name"):
                    gs_character[aid] = gs.get("character_name")

    # Main cast appear across the whole series by convention; attach kind.
    main_actor_ids = set()
    for c in enriched_main:
        c["kind"] = "main"
        main_actor_ids.add(c.get("actor_id"))

    # Count guest-star appearances for analytics only — guests are NOT shown in Series Cast.
    doc["main_cast"] = enriched_main
    # rating aggregation (series-scoped reviews)
    agg = await db.reviews.aggregate([
        {"$match": {"series_id": doc["id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    if agg:
        doc["avg_rating"] = round(agg[0]["avg"], 1)
        doc["rating_count"] = agg[0]["count"]
    else:
        doc["avg_rating"] = None
        doc["rating_count"] = 0
    doc["collections"] = await _collections_for_ids(doc.get("collection_ids") or [])
    doc["collection_ids"] = doc.get("collection_ids") or []
    return doc

# ----------- Edit Log Helper -----------
def _summarize_value(v):
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, list):
        if not v:
            return "empty"
        if isinstance(v[0], dict):
            return f"{len(v)} item{'s' if len(v)!=1 else ''}"
        return ", ".join(str(x) for x in v[:5]) + ("…" if len(v) > 5 else "")
    if isinstance(v, str):
        if len(v) > 80:
            return v[:80] + "…"
        return v or "—"
    return str(v)

def _values_equal(a, b):
    if a is None and b == "": return True
    if b is None and a == "": return True
    return a == b

def compute_field_changes(old: dict, new: dict) -> list:
    """Return list of {field, before, after, before_raw, after_raw} for fields that actually differ."""
    changes = []
    for k, new_val in new.items():
        old_val = old.get(k) if old else None
        if _values_equal(old_val, new_val):
            continue
        changes.append({
            "field": k,
            "before": _summarize_value(old_val),
            "after": _summarize_value(new_val),
            "before_raw": old_val,
            "after_raw": new_val,
        })
    return changes

async def log_edit(user: dict, entity_type: str, entity_id: str, action: str, entity_title: str = "", summary: str = "", changes: Optional[list] = None):
    """Record an edit event with detailed field-level changes."""
    await db.edits.insert_one({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_title": entity_title,
        "action": action,
        "summary": summary,
        "changes": changes or [],
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar_url", ""),
        "user_role": user.get("role", "user"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

def get_client_ip(request: Request) -> str:
    # honor x-forwarded-for from ingress
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    xrip = request.headers.get("x-real-ip") or request.headers.get("X-Real-IP")
    if xrip:
        return xrip.strip()
    return request.client.host if request.client else "unknown"

async def record_user_ip(user_id: ObjectId, ip: str):
    if not ip or ip == "unknown":
        return
    now = datetime.now(timezone.utc).isoformat()
    # try to update existing entry
    result = await db.users.update_one(
        {"_id": user_id, "ips.ip": ip},
        {"$set": {"ips.$.last_seen": now}, "$inc": {"ips.$.count": 1}},
    )
    if result.matched_count == 0:
        await db.users.update_one(
            {"_id": user_id},
            {"$push": {"ips": {"ip": ip, "first_seen": now, "last_seen": now, "count": 1}}},
        )

import re
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{2,40}$")

async def _username_taken(username: str, exclude_user_id: Optional[str] = None) -> bool:
    """Case-insensitive username uniqueness check."""
    q = {"name": {"$regex": f"^{re.escape(username)}$", "$options": "i"}}
    if exclude_user_id:
        try:
            q["_id"] = {"$ne": ObjectId(exclude_user_id)}
        except Exception:
            pass
    existing = await db.users.find_one(q)
    return existing is not None

# ----------- Auth Routes -----------
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, request: Request, response: Response):
    # IP ban check — block registration from banned IPs
    reg_ip = get_client_ip(request)
    ban = await _active_ip_ban(reg_ip, ("register", "both"))
    if ban:
        msg = f"Your IP ({reg_ip}) is banned from creating accounts."
        if ban.get("reason"):
            msg += f" Reason: {ban['reason']}."
        raise HTTPException(status_code=403, detail=msg)
    email = payload.email.lower()
    username = payload.name.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="Username must be 2–40 characters: letters, numbers, dots, underscores, or hyphens only.")
    if "@" in username:
        raise HTTPException(status_code=400, detail="Username cannot contain '@'.")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if await _username_taken(username):
        raise HTTPException(status_code=400, detail="Username is already taken")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": username,
        "role": "user",
        "avatar_url": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ips": [],
    }
    result = await db.users.insert_one(doc)
    user_id = result.inserted_id
    await record_user_ip(user_id, get_client_ip(request))
    access = create_access_token(str(user_id), email)
    refresh = create_refresh_token(str(user_id))
    set_auth_cookies(response, access, refresh)
    return {"id": str(user_id), "email": email, "name": payload.name, "role": "user", "avatar_url": ""}

@api_router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    identifier = (payload.identifier or payload.email or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or username is required")
    # If identifier looks like an email, match by email (lowercase).
    # Otherwise, treat it as a username (case-insensitive exact match).
    if "@" in identifier:
        user = await db.users.find_one({"email": identifier.lower()})
    else:
        user = await db.users.find_one({"name": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    email = user.get("email", "")
    # Suspension: DO NOT block login anymore; suspended users can log in to access their inbox.
    # Auto-lift expired suspensions.
    sus = user.get("suspended_until")
    is_suspended = False
    if sus:
        if sus == "permanent":
            is_suspended = True
        else:
            try:
                until = datetime.fromisoformat(sus)
                if until > datetime.now(timezone.utc):
                    is_suspended = True
                else:
                    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
                    user.pop("suspended_until", None)
                    user.pop("suspension_reason", None)
                    sus = None
            except Exception:
                pass
    await record_user_ip(user["_id"], get_client_ip(request))
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {
        "id": user_id,
        "email": email,
        "name": user.get("name"),
        "role": user.get("role", "user"),
        "avatar_url": user.get("avatar_url", ""),
        "is_suspended": is_suspended,
        "suspension_reason": user.get("suspension_reason") if is_suspended else None,
        "suspension_until": sus if is_suspended else None,
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user_allow_suspended)):
    # username change cooldown
    name_last_changed_at = user.get("name_last_changed_at")
    name_change_available_at = None
    if name_last_changed_at:
        try:
            name_change_available_at = (datetime.fromisoformat(name_last_changed_at) + timedelta(days=30)).isoformat()
        except Exception:
            pass
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "bio": user.get("bio", ""),
        "role": user.get("role", "user"),
        "effective_role": user.get("effective_role", user.get("role", "user")),
        "custom_role": user.get("custom_role"),
        "custom_roles": user.get("custom_roles", []),
        "custom_role_ids": user.get("custom_role_ids", []),
        "permissions": user.get("permissions", []),
        "avatar_url": user.get("avatar_url", ""),
        "created_at": user.get("created_at"),
        "name_last_changed_at": name_last_changed_at,
        "name_change_available_at": name_change_available_at,
        "is_suspended": user.get("is_suspended", False),
        "suspension_reason": user.get("suspension_reason") if user.get("is_suspended") else None,
        "suspension_until": user.get("suspension_until") if user.get("is_suspended") else None,
    }

@api_router.patch("/auth/me/avatar")
async def update_avatar(payload: AvatarUpdate, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"avatar_url": payload.avatar_url}})
    return {"ok": True, "avatar_url": payload.avatar_url}

@api_router.patch("/auth/me")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        # Only validate if the username actually changed (case-insensitive compare)
        current_name = (user.get("name") or "").strip()
        if new_name.lower() != current_name.lower():
            if not USERNAME_RE.match(new_name):
                raise HTTPException(status_code=400, detail="Username must be 2–40 characters: letters, numbers, dots, underscores, or hyphens only.")
            if "@" in new_name:
                raise HTTPException(status_code=400, detail="Username cannot contain '@'.")
            # 30-day cooldown on username changes
            fresh = await db.users.find_one({"_id": ObjectId(user["id"])})
            last_changed = (fresh or {}).get("name_last_changed_at")
            if last_changed:
                try:
                    last_dt = datetime.fromisoformat(last_changed)
                    next_eligible = last_dt + timedelta(days=30)
                    now = datetime.now(timezone.utc)
                    if next_eligible > now:
                        days_left = (next_eligible - now).days + 1
                        raise HTTPException(
                            status_code=400,
                            detail=f"You can change your username again in {days_left} day{'s' if days_left != 1 else ''} (on {next_eligible.strftime('%b %d, %Y')}).",
                        )
                except HTTPException:
                    raise
                except Exception:
                    pass
            if await _username_taken(new_name, exclude_user_id=user["id"]):
                raise HTTPException(status_code=400, detail="Username is already taken")
            update["name"] = new_name
            update["name_last_changed_at"] = datetime.now(timezone.utc).isoformat()
        else:
            # Not an actual change — ignore
            pass
    if payload.bio is not None:
        update["bio"] = payload.bio.strip()
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": update})
    return {"ok": True, **update}

@api_router.post("/auth/me/password")
async def change_password(payload: PasswordChange, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not doc or not verify_password(payload.current_password, doc.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True}

# ----------- Password Reset (Email) -----------
def _reset_email_html(name: str, reset_url: str) -> str:
    safe_name = escape(name or "there")
    safe_url = escape(reset_url, quote=True)
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:#0d0f12;padding:0;margin:0"><tr><td align="center" '
        f'style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" '
        f'cellspacing="0" style="max-width:560px;background:#14181f;border:1px solid #2a2f3a;'
        f'border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb">'
        f'<tr><td style="padding:28px 32px;background:linear-gradient(135deg,#f59e0b,#d97706);'
        f'color:#111;font-weight:700;font-size:20px;letter-spacing:2px">{escape(EMAIL_FROM_NAME).upper()}</td></tr>'
        f'<tr><td style="padding:32px">'
        f'<h1 style="margin:0 0 12px;font-size:22px;color:#fff">Reset your password</h1>'
        f'<p style="margin:0 0 16px;line-height:1.6;color:#cbd5e1">Hi {safe_name}, we received a request to reset the password for your {escape(EMAIL_FROM_NAME)} account.</p>'
        f'<p style="margin:0 0 24px;line-height:1.6;color:#cbd5e1">Click the button below to choose a new password. This link expires in 60 minutes and can only be used once.</p>'
        f'<p style="margin:0 0 24px"><a href="{safe_url}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#111;font-weight:700;text-decoration:none;border-radius:8px">Reset password</a></p>'
        f'<p style="margin:0 0 8px;line-height:1.6;color:#94a3b8;font-size:13px">If the button does not work, open this link in your browser:</p>'
        f'<p style="margin:0 0 24px;line-height:1.6;color:#94a3b8;font-size:13px;word-break:break-all"><a href="{safe_url}" style="color:#f59e0b;text-decoration:underline">{safe_url}</a></p>'
        f'<p style="margin:0;line-height:1.6;color:#64748b;font-size:12px">If you did not ask to reset your password, you can safely ignore this email. Your current password will keep working. {escape(EMAIL_FROM_NAME)} will never ask you for your password by email.</p>'
        f'</td></tr>'
        f'<tr><td style="padding:16px 32px;background:#0d0f12;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:center">Sent by {escape(EMAIL_FROM_NAME)}</td></tr>'
        f'</table></td></tr></table>'
    )

def _frontend_url() -> str:
    url = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")
    if not url or not url.startswith("https://"):
        raise HTTPException(status_code=500, detail="Frontend URL not configured")
    return url

@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    generic = {"ok": True, "message": "If an account exists for that email, a reset link has been sent."}
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        # Silent to prevent email enumeration
        return generic
    # Invalidate any existing tokens for this user
    await db.password_resets.update_many(
        {"user_id": user["_id"], "used": False},
        {"$set": {"used": True, "invalidated_at": datetime.now(timezone.utc).isoformat()}},
    )
    token = secrets.token_urlsafe(32)
    token_hash = hash_password(token)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=60)
    await db.password_resets.insert_one({
        "user_id": user["_id"],
        "token_hash": token_hash,
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "used": False,
    })
    reset_url = f"{_frontend_url()}/reset-password?token={token}"
    try:
        await send_email(
            to=email,
            subject=f"Reset your {EMAIL_FROM_NAME} password",
            html=_reset_email_html(user.get("name", ""), reset_url),
        )
    except HTTPException:
        # Do not leak email delivery status to the caller
        logger.exception("Password reset email delivery failed")
    return generic

@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    now = datetime.now(timezone.utc)
    # We can't look up by token (only hashes stored), so scan unused, unexpired entries
    cursor = db.password_resets.find({"used": False})
    match = None
    async for entry in cursor:
        try:
            expires = datetime.fromisoformat(entry.get("expires_at"))
        except Exception:
            continue
        if expires <= now:
            continue
        if verify_password(payload.token, entry.get("token_hash", "")):
            match = entry
            break
    if not match:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new one.")
    user = await db.users.find_one({"_id": match["user_id"]})
    if not user:
        raise HTTPException(status_code=400, detail="Account no longer exists")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.password_resets.update_one(
        {"_id": match["_id"]},
        {"$set": {"used": True, "used_at": now.isoformat()}},
    )
    # Invalidate any other outstanding tokens for this user
    await db.password_resets.update_many(
        {"user_id": user["_id"], "used": False},
        {"$set": {"used": True, "invalidated_at": now.isoformat()}},
    )
    return {"ok": True, "message": "Password has been reset. You can now sign in."}

# ----------- Users (Public) -----------
@api_router.get("/users/{user_id}")
async def get_user_profile(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    # Determine active suspension
    sus = u.get("suspended_until")
    active_sus = False
    if sus == "permanent":
        active_sus = True
    elif sus:
        try:
            if datetime.fromisoformat(sus) > datetime.now(timezone.utc):
                active_sus = True
        except Exception:
            pass

    viewer_is_mod = bool(viewer and viewer.get("effective_role") in ("moderator", "admin"))
    viewer_is_self = bool(viewer and viewer.get("id") == str(u["_id"]))

    # Hide suspended profiles site-wide. For non-mod viewers, return a minimal
    # placeholder so the UI can render "This user is currently suspended"
    # instead of a 404. Mods/admins still get the full profile.
    if active_sus and not viewer_is_mod and not viewer_is_self:
        return {
            "id": str(u["_id"]),
            "name": u.get("name"),
            "avatar_url": "",
            "bio": "",
            "role": "user",
            "custom_role": None,
            "created_at": u.get("created_at"),
            "is_suspended": True,
            "suspended_placeholder": True,
        }

    # resolve custom role
    custom_role = None
    crid = u.get("custom_role_id")
    if crid:
        try:
            cr = await db.custom_roles.find_one({"_id": ObjectId(crid)})
            if cr:
                _perms = cr.get("permissions", []) or []
                custom_role = {"id": str(cr["_id"]), "name": cr.get("name"), "color": cr.get("color", "#f59e0b"), "base": _derive_base(_perms)}
        except Exception:
            pass
    profile = {
        "id": str(u["_id"]),
        "name": u.get("name"),
        "avatar_url": u.get("avatar_url", ""),
        "bio": u.get("bio", ""),
        "role": u.get("role", "user"),
        "custom_role": custom_role,
        "created_at": u.get("created_at"),
        "is_suspended": False,
    }
    # Only expose suspension details to moderators (or self)
    if active_sus and (viewer_is_mod or viewer_is_self):
        profile["is_suspended"] = True
        profile["suspended_until"] = sus
        profile["suspension_reason"] = u.get("suspension_reason", "")

    # Suspension history — mods/admins only
    if viewer_is_mod:
        sus_history = []
        async for e in db.edits.find({
            "entity_type": "user",
            "entity_id": str(u["_id"]),
            "action": {"$in": ["suspend", "suspend-update", "unsuspend"]},
        }).sort("created_at", -1):
            e_id = str(e.pop("_id"))
            e["id"] = e_id
            sus_history.append(e)
        profile["suspension_history"] = sus_history

    # recent edits (last 30)
    edits = []
    async for e in db.edits.find({"user_id": str(u["_id"])}).sort("created_at", -1).limit(30):
        e_id = str(e.pop("_id"))
        e["id"] = e_id
        edits.append(e)
    profile["edits"] = edits

    # reviews by user
    reviews = []
    async for r in db.reviews.find({"user_id": str(u["_id"])}).sort("created_at", -1).limit(30):
        rid = str(r.pop("_id"))
        r["id"] = rid
        # attach movie title/poster
        try:
            m = await db.movies.find_one({"_id": ObjectId(r["movie_id"])})
            if m:
                r["movie_title"] = m.get("title")
                r["movie_poster_url"] = m.get("poster_url", "")
        except Exception:
            pass
        reviews.append(r)
    profile["reviews"] = reviews

    # edit stats
    total = await db.edits.count_documents({"user_id": str(u["_id"])})
    profile["edit_count"] = total
    # by action
    breakdown = {}
    async for row in db.edits.aggregate([
        {"$match": {"user_id": str(u["_id"])}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
    ]):
        breakdown[row["_id"]] = row["count"]
    profile["edit_breakdown"] = breakdown
    # by entity type
    by_type = {}
    async for row in db.edits.aggregate([
        {"$match": {"user_id": str(u["_id"])}},
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
    ]):
        by_type[row["_id"]] = row["count"]
    profile["edit_by_type"] = by_type
    # weekly (current week Monday 00:00 UTC)
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    profile["weekly_edit_count"] = await db.edits.count_documents({
        "user_id": str(u["_id"]),
        "created_at": {"$gte": week_start.isoformat()},
    })
    profile["week_starts_at"] = week_start.isoformat()

    # ---------- rating stats ----------
    uid_str = str(u["_id"])
    # Movies
    movie_agg = await db.reviews.aggregate([
        {"$match": {"user_id": uid_str, "movie_id": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    if movie_agg:
        profile["total_movie_ratings"] = movie_agg[0]["count"]
        profile["avg_movie_rating"] = round(movie_agg[0]["avg"] * 10)  # % out of 100
    else:
        profile["total_movie_ratings"] = 0
        profile["avg_movie_rating"] = None
    # Series
    series_agg = await db.reviews.aggregate([
        {"$match": {"user_id": uid_str, "series_id": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    if series_agg:
        profile["total_series_ratings"] = series_agg[0]["count"]
        profile["avg_series_rating"] = round(series_agg[0]["avg"] * 10)
    else:
        profile["total_series_ratings"] = 0
        profile["avg_series_rating"] = None
    profile["total_ratings"] = profile["total_movie_ratings"] + profile["total_series_ratings"]
    # rating distribution buckets 1..10 (floor) across everything the user rated
    dist = [0] * 10
    async for r in db.reviews.find({"user_id": uid_str}, {"rating": 1}):
        b = max(1, min(10, int(round(r.get("rating", 0)))))
        dist[b - 1] += 1
    profile["rating_distribution"] = dist

    # ---------- top genres from rated movies ----------
    genre_counts = {}
    async for r in db.reviews.find({"user_id": uid_str}, {"movie_id": 1}):
        try:
            m = await db.movies.find_one({"_id": ObjectId(r["movie_id"])}, {"genres": 1})
        except Exception:
            m = None
        for g in (m.get("genres") if m else []) or []:
            genre_counts[g] = genre_counts.get(g, 0) + 1
    profile["top_genres"] = sorted(
        [{"name": g, "count": c} for g, c in genre_counts.items()],
        key=lambda x: x["count"], reverse=True,
    )[:5]

    # ---------- recent edited entities (grouped) ----------
    seen = {}
    order = []
    async for e in db.edits.find({"user_id": uid_str}).sort("created_at", -1).limit(80):
        key = f"{e.get('entity_type')}::{e.get('entity_id')}"
        if key not in seen:
            seen[key] = {
                "entity_type": e.get("entity_type"),
                "entity_id": e.get("entity_id"),
                "entity_title": e.get("entity_title"),
                "last_at": e.get("created_at"),
                "edit_count": 1,
                "poster_url": "",
            }
            order.append(key)
        else:
            seen[key]["edit_count"] += 1
    # fetch posters for movies/series
    recent_entities = []
    for key in order[:8]:
        item = seen[key]
        try:
            if item["entity_type"] == "movie":
                doc = await db.movies.find_one({"_id": ObjectId(item["entity_id"])}, {"backdrop_url": 1, "poster_url": 1})
                if doc:
                    item["poster_url"] = doc.get("backdrop_url") or doc.get("poster_url") or ""
            elif item["entity_type"] == "series":
                doc = await db.series.find_one({"_id": ObjectId(item["entity_id"])}, {"backdrop_url": 1, "poster_url": 1})
                if doc:
                    item["poster_url"] = doc.get("backdrop_url") or doc.get("poster_url") or ""
            elif item["entity_type"] == "actor":
                doc = await db.actors.find_one({"_id": ObjectId(item["entity_id"])}, {"photo_url": 1})
                if doc:
                    item["poster_url"] = doc.get("photo_url") or ""
        except Exception:
            pass
        recent_entities.append(item)
    profile["recent_entities"] = recent_entities

    # ---------- 30-day activity by entity type ----------
    day_start = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
    days = [(day_start + timedelta(days=i)).date().isoformat() for i in range(30)]
    daily = {d: {"movie": 0, "series": 0, "actor": 0} for d in days}
    async for e in db.edits.find({
        "user_id": uid_str,
        "created_at": {"$gte": day_start.isoformat()},
    }, {"created_at": 1, "entity_type": 1}):
        try:
            d = e["created_at"][:10]
            if d in daily:
                et = e.get("entity_type") or "movie"
                if et in daily[d]:
                    daily[d][et] += 1
        except Exception:
            pass
    profile["daily_activity_30d"] = [{"date": d, **daily[d]} for d in days]

    return profile

# ----------- Leaderboard -----------
@api_router.get("/leaderboard")
async def leaderboard(limit: int = 10):
    """Top contributors this week (Monday 00:00 UTC to now)."""
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"created_at": {"$gte": week_start.isoformat()}}},
        {"$group": {
            "_id": "$user_id",
            "count": {"$sum": 1},
            "user_name": {"$last": "$user_name"},
            "user_avatar": {"$last": "$user_avatar"},
            "user_role": {"$last": "$user_role"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    top = []
    async for row in db.edits.aggregate(pipeline):
        top.append({
            "user_id": row["_id"],
            "user_name": row.get("user_name"),
            "user_avatar": row.get("user_avatar", ""),
            "user_role": row.get("user_role", "user"),
            "count": row["count"],
        })
    # attach custom_role for each user and filter out suspended
    now_dt = datetime.now(timezone.utc)
    def _is_active_sus(u):
        s = u.get("suspended_until")
        if not s: return False
        if s == "permanent": return True
        try: return datetime.fromisoformat(s) > now_dt
        except Exception: return False
    if top:
        ids = []
        for t in top:
            if t["user_id"]:
                try: ids.append(ObjectId(t["user_id"]))
                except Exception: pass
        users_map = {}
        async for u in db.users.find({"_id": {"$in": ids}}):
            users_map[str(u["_id"])] = u
        filtered = []
        for t in top:
            u = users_map.get(t["user_id"])
            if u and _is_active_sus(u):
                continue  # hide suspended users from public leaderboard
            if u and u.get("custom_role_id"):
                try:
                    cr = await db.custom_roles.find_one({"_id": ObjectId(u["custom_role_id"])})
                    if cr:
                        t["custom_role"] = {"name": cr.get("name"), "color": cr.get("color", "#f59e0b")}
                except Exception:
                    pass
            filtered.append(t)
        top = filtered
    return {
        "week_starts_at": week_start.isoformat(),
        "next_reset_at": (week_start + timedelta(days=7)).isoformat(),
        "top": top,
    }

# ----------- Custom Roles -----------
@api_router.get("/roles/permissions")
async def list_permissions():
    """Return available permission keys with human labels."""
    labels = PERMISSION_LABELS
    # group by category for UI
    groups = {"Content": [], "Users": [], "Moderation": [], "Community": [], "Admin": []}
    for k in PERMISSIONS_ALL:
        item = {"key": k, "label": labels.get(k, k), "tier": "admin" if k in PERMS_ADMIN else "moderator" if k in PERMS_MODERATOR else "user"}
        if k.startswith("content."):
            groups["Content"].append(item)
        elif k.startswith("moderation."):
            groups["Moderation"].append(item)
        elif k.startswith("user."):
            groups["Users"].append(item)
        elif k.startswith("thread.") or k.startswith("comment."):
            groups["Community"].append(item)
        else:
            groups["Admin"].append(item)
    return groups

@api_router.get("/roles")
async def list_roles():
    roles = []
    async for r in db.custom_roles.find({}).sort("name", 1):
        perms = r.get("permissions", []) or []
        roles.append({
            "id": str(r["_id"]),
            "name": r.get("name"),
            "base": _derive_base(perms),
            "permissions": perms,
            "color": r.get("color", "#f59e0b"),
            "description": r.get("description", ""),
        })
    return roles

@api_router.post("/roles")
async def create_role(payload: RoleCreate, admin: dict = Depends(get_current_admin)):
    perms = [p for p in payload.permissions if p in PERMISSIONS_ALL]
    doc = {"name": payload.name, "permissions": perms, "color": payload.color, "description": payload.description, "created_at": datetime.now(timezone.utc).isoformat()}
    r = await db.custom_roles.insert_one(doc)
    return {"id": str(r.inserted_id), "name": payload.name, "permissions": perms, "base": _derive_base(perms), "color": payload.color, "description": payload.description}

@api_router.patch("/roles/{role_id}")
async def update_role(role_id: str, payload: RolePatch, admin: dict = Depends(get_current_admin)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "permissions" in data:
        data["permissions"] = [p for p in data["permissions"] if p in PERMISSIONS_ALL]
    await db.custom_roles.update_one({"_id": ObjectId(role_id)}, {"$set": data})
    r = await db.custom_roles.find_one({"_id": ObjectId(role_id)})
    perms = r.get("permissions", []) or []
    return {"id": str(r["_id"]), "name": r.get("name"), "permissions": perms, "base": _derive_base(perms), "color": r.get("color"), "description": r.get("description", "")}

@api_router.delete("/roles/{role_id}")
async def delete_role(role_id: str, admin: dict = Depends(get_current_admin)):
    await db.custom_roles.delete_one({"_id": ObjectId(role_id)})
    await db.users.update_many({"custom_role_id": role_id}, {"$unset": {"custom_role_id": ""}})
    return {"ok": True}

@api_router.patch("/moderation/users/{user_id}/custom-role")
async def assign_custom_role(user_id: str, payload: AssignRole, admin: dict = Depends(get_current_admin)):
    # Accept new array (preferred) or legacy single id and persist to array
    role_ids: List[str] = []
    if payload.custom_role_ids is not None:
        role_ids = list(payload.custom_role_ids)
    elif payload.custom_role_id:
        role_ids = [payload.custom_role_id]
    # dedupe + validate
    cleaned: List[str] = []
    labels: List[str] = []
    for rid in role_ids:
        if not rid or rid in cleaned:
            continue
        try:
            cr = await db.custom_roles.find_one({"_id": ObjectId(rid)})
        except Exception:
            cr = None
        if not cr:
            raise HTTPException(status_code=404, detail=f"Custom role {rid} not found")
        cleaned.append(rid)
        labels.append(cr.get("name") or "")
    update = {"$set": {"custom_role_ids": cleaned}}
    # mirror the first id into the legacy single-field for back-compat reads
    if cleaned:
        update["$set"]["custom_role_id"] = cleaned[0]
    else:
        update["$unset"] = {"custom_role_id": ""}
    await db.users.update_one({"_id": ObjectId(user_id)}, update)
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    label = ", ".join(labels) if labels else "(none)"
    await log_edit(admin, "user", user_id, "role", target.get("name", "") if target else "", f"Custom roles: {label}")
    return {"ok": True, "custom_role_ids": cleaned}

# ----------- Edits Feed -----------
@api_router.get("/edits")
async def list_edits(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
):
    query: dict = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if action:
        query["action"] = action
    if user_id:
        query["user_id"] = user_id
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"entity_title": rx},
            {"summary": rx},
            {"user_name": rx},
        ]
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["created_at"] = rng
    edits = []
    async for e in db.edits.find(query).sort("created_at", -1).limit(limit):
        e_id = str(e.pop("_id"))
        e["id"] = e_id
        # strip raw values from listing (used only for revert)
        stripped_changes = []
        for c in e.get("changes", []) or []:
            stripped_changes.append({k: v for k, v in c.items() if k not in ("before_raw", "after_raw")})
        e["changes"] = stripped_changes
        e["revertible"] = (
            e.get("action") == "update"
            and e.get("entity_type") in ("movie", "series", "actor")
            and bool(e.get("changes"))
        )
        edits.append(e)
    return edits


# ----- Revert an edit -----
_ENTITY_COLLECTIONS = {"movie": "movies", "series": "series", "actor": "actors"}

async def _entity_title(entity_type: str, doc: dict) -> str:
    if entity_type == "actor":
        return doc.get("name", "")
    return doc.get("title", "")

@api_router.post("/edits/{edit_id}/revert")
async def revert_edit(edit_id: str, mod: dict = Depends(get_current_moderator)):
    try:
        edit = await db.edits.find_one({"_id": ObjectId(edit_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Edit not found")
    if not edit:
        raise HTTPException(status_code=404, detail="Edit not found")
    if edit.get("action") != "update":
        raise HTTPException(status_code=400, detail="Only update edits can be reverted")
    entity_type = edit.get("entity_type")
    coll_name = _ENTITY_COLLECTIONS.get(entity_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail="This edit is not revertible")
    coll = db[coll_name]
    try:
        target = await coll.find_one({"_id": ObjectId(edit["entity_id"])})
    except Exception:
        target = None
    if not target:
        raise HTTPException(status_code=404, detail="Target no longer exists")

    changes = edit.get("changes", []) or []
    revertible_changes = [c for c in changes if "before_raw" in c]
    if not revertible_changes:
        raise HTTPException(status_code=400, detail="This edit has no raw snapshot to revert to")

    # Build $set with the raw before values
    revert_set = {c["field"]: c.get("before_raw") for c in revertible_changes}
    await coll.update_one({"_id": target["_id"]}, {"$set": revert_set})
    new_doc = await coll.find_one({"_id": target["_id"]})

    # Log a new edit describing the revert (with raw snapshots so it too can be reverted)
    revert_changes = compute_field_changes(target, revert_set)
    title = await _entity_title(entity_type, new_doc or target)
    field_names = ", ".join(c["field"] for c in revertible_changes)
    await log_edit(
        mod,
        entity_type,
        edit["entity_id"],
        "revert",
        title,
        f"Reverted edit by {edit.get('user_name','?')} — restored {field_names}",
        revert_changes,
    )
    # Return the fresh entity, enriched
    if entity_type == "movie":
        return await enrich_movie(new_doc)
    if entity_type == "series":
        return await enrich_series(new_doc)
    if entity_type == "actor":
        return doc_to_dict(new_doc)
    return {"ok": True}

# ----------- Moderation -----------
@api_router.post("/moderation/users/{user_id}/suspend")
async def suspend_user(user_id: str, payload: SuspendRequest, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "user.suspend", "You don't have permission to suspend users.")
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot suspend admin")
    # Moderators cannot suspend other moderators — only admins can.
    if target.get("role") == "moderator" and not _is_admin_role(mod):
        raise HTTPException(status_code=403, detail="Only admins can suspend moderators")
    if str(target["_id"]) == str(mod.get("id")):
        raise HTTPException(status_code=400, detail="You cannot suspend yourself")

    # Normalize into (unit, amount)
    unit = (payload.duration_unit or "").lower() or None
    amount = payload.duration
    if unit is None and amount is None and payload.duration_days is not None:
        unit = "days"
        amount = payload.duration_days

    if unit == "permanent" or (unit is None and amount is None):
        until = "permanent"
        duration_label = "permanently"
    else:
        if amount is None or amount <= 0:
            raise HTTPException(status_code=400, detail="Duration must be a positive number")
        if unit == "minutes":
            delta = timedelta(minutes=amount)
            duration_label = f"for {amount} minute{'s' if amount != 1 else ''}"
        elif unit == "hours":
            delta = timedelta(hours=amount)
            duration_label = f"for {amount} hour{'s' if amount != 1 else ''}"
        else:  # default to days
            delta = timedelta(days=amount)
            duration_label = f"for {amount} day{'s' if amount != 1 else ''}"
        until = (datetime.now(timezone.utc) + delta).isoformat()

    # Detect whether we are MODIFYING an existing suspension vs. creating a new one.
    now_iso = datetime.now(timezone.utc).isoformat()
    prev = target.get("suspended_until")
    was_suspended = bool(prev) and (prev == "permanent" or prev > now_iso)
    action = "suspend-update" if was_suspended else "suspend"

    await db.users.update_one({"_id": target["_id"]}, {"$set": {
        "suspended_until": until,
        "suspension_reason": payload.reason or "",
        "suspended_by": mod["id"],
        "suspended_by_name": mod.get("name"),
        "suspended_at": now_iso,
    }})
    changes = [
        {"field": "duration", "before": prev if was_suspended else "—", "after": duration_label},
        {"field": "until", "before": prev if was_suspended else "—", "after": "permanent" if until == "permanent" else until[:19].replace("T", " ")},
        {"field": "reason", "before": target.get("suspension_reason") or "—", "after": payload.reason or "(no reason)"},
    ]
    verb = "Updated suspension" if was_suspended else "Suspended"
    await log_edit(mod, "user", user_id, action, target.get("name", ""), f"{verb} {duration_label}: {payload.reason or '(no reason)'}", changes)
    title = f"Your suspension has been updated — now {duration_label}" if was_suspended else f"Your account has been suspended {duration_label}"
    await _create_notification(
        user_id=str(target["_id"]),
        ntype="suspension",
        title=title,
        body=payload.reason or "",
        link="/inbox",
        from_user=mod,
    )
    return {"ok": True, "suspended_until": until, "updated": was_suspended}

@api_router.post("/moderation/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "user.suspend", "You don't have permission to suspend/unsuspend users.")
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Moderators cannot unsuspend other moderators — only admins can.
    if target.get("role") == "moderator" and not _is_admin_role(mod):
        raise HTTPException(status_code=403, detail="Only admins can unsuspend moderators")
    await db.users.update_one({"_id": target["_id"]}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
    await log_edit(mod, "user", user_id, "unsuspend", target.get("name", ""), "Suspension lifted")
    return {"ok": True}

@api_router.patch("/moderation/users/{user_id}/role")
async def set_user_role(user_id: str, payload: RoleUpdate, admin: dict = Depends(get_current_admin)):
    if payload.role not in ("user", "moderator", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": payload.role}})
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    await log_edit(admin, "user", user_id, "role", target.get("name", "") if target else "", f"Role set to {payload.role}")
    return {"ok": True, "role": payload.role}

# ============================================================================
# IP Ban (moderator/admin tool)
# ============================================================================
_IP_BAN_SCOPES = ("register", "edit", "both")

async def _active_ip_ban(ip: str, scope_matches: tuple) -> Optional[dict]:
    if not ip:
        return None
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = await db.ip_bans.find_one({
        "ip": ip,
        "scope": {"$in": list(scope_matches)},
        "$or": [{"until": "permanent"}, {"until": {"$gt": now_iso}}],
    }, sort=[("created_at", -1)])
    return doc

@api_router.get("/moderation/ip-bans")
async def list_ip_bans(mod: dict = Depends(get_current_moderator), include_expired: bool = False, q: Optional[str] = None, limit: int = 200):
    now_iso = datetime.now(timezone.utc).isoformat()
    base: dict = {}
    if not include_expired:
        base = {"$or": [{"until": "permanent"}, {"until": {"$gt": now_iso}}]}
    if q:
        rx = {"$regex": q, "$options": "i"}
        f = {"$or": [{"ip": rx}, {"reason": rx}, {"created_by_name": rx}]}
        base = {"$and": [base, f]} if base else f
    out = []
    async for d in db.ip_bans.find(base).sort("created_at", -1).limit(limit):
        is_active = d.get("until") == "permanent" or (d.get("until") and d["until"] > now_iso)
        out.append({
            "id": str(d["_id"]),
            "ip": d.get("ip"),
            "scope": d.get("scope", "both"),
            "reason": d.get("reason", ""),
            "created_by_name": d.get("created_by_name"),
            "created_at": d.get("created_at"),
            "until": d.get("until"),
            "is_active": bool(is_active),
        })
    return out

@api_router.post("/moderation/ip-bans")
async def create_ip_ban(payload: IpBanRequest, mod: dict = Depends(get_current_moderator)):
    ip = (payload.ip or "").strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP address is required")
    if payload.scope not in _IP_BAN_SCOPES:
        raise HTTPException(status_code=400, detail="scope must be one of register | edit | both")

    unit = (payload.duration_unit or "").lower() or None
    amount = payload.duration
    if unit == "permanent" or (unit is None and amount is None):
        until = "permanent"
        duration_label = "permanently"
    else:
        if amount is None or amount <= 0:
            raise HTTPException(status_code=400, detail="Duration must be a positive number")
        if unit == "hours":
            delta = timedelta(hours=amount); duration_label = f"for {amount} hour{'s' if amount != 1 else ''}"
        elif unit == "days":
            delta = timedelta(days=amount); duration_label = f"for {amount} day{'s' if amount != 1 else ''}"
        elif unit == "months":
            delta = timedelta(days=30 * amount); duration_label = f"for {amount} month{'s' if amount != 1 else ''}"
        elif unit == "years":
            delta = timedelta(days=365 * amount); duration_label = f"for {amount} year{'s' if amount != 1 else ''}"
        else:
            raise HTTPException(status_code=400, detail="duration_unit must be hours | days | months | years | permanent")
        until = (datetime.now(timezone.utc) + delta).isoformat()

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "ip": ip,
        "scope": payload.scope,
        "reason": payload.reason or "",
        "created_by": mod["id"],
        "created_by_name": mod.get("name"),
        "created_at": now_iso,
        "until": until,
    }
    r = await db.ip_bans.insert_one(doc)
    await log_edit(mod, "ip-ban", str(r.inserted_id), "create", ip,
                   f"IP {ip} banned ({payload.scope}) {duration_label}: {payload.reason or '(no reason)'}")
    return {"ok": True, "id": str(r.inserted_id), "until": until}

@api_router.delete("/moderation/ip-bans/{ban_id}")
async def lift_ip_ban(ban_id: str, mod: dict = Depends(get_current_moderator)):
    try:
        doc = await db.ip_bans.find_one({"_id": ObjectId(ban_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Ban not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Ban not found")
    await db.ip_bans.delete_one({"_id": doc["_id"]})
    await log_edit(mod, "ip-ban", ban_id, "delete", doc.get("ip", ""),
                   f"Lifted ban on {doc.get('ip', '')}")
    return {"ok": True}

# ============================================================================
# Homepage customization (admin-managed)
# ============================================================================
_DEFAULT_HOMEPAGE = {
    "hero": {
        "title": "A new home for movie & TV lovers",
        "subtitle": "Discover, rate, and discuss everything from blockbusters to hidden gems.",
        "tagline": "Community-driven. Fast. Free forever.",
        "featured_type": None,
        "featured_id": None,
    },
    "announcement": {
        "enabled": False,
        "text": "",
        "link_url": None,
        "link_label": None,
    },
    "sections": [
        {"id": "trending-movies", "type": "built-in", "title": "Trending Movies", "enabled": True, "source": "trending_movies", "items": [], "limit": 12},
        {"id": "upcoming-movies", "type": "built-in", "title": "Upcoming Movies", "enabled": True, "source": "upcoming_movies", "items": [], "limit": 12},
        {"id": "trending-series", "type": "built-in", "title": "Trending TV Series", "enabled": True, "source": "trending_series", "items": [], "limit": 12},
        {"id": "recent-movies", "type": "built-in", "title": "Recently Added Movies", "enabled": True, "source": "recent_movies", "items": [], "limit": 12},
        {"id": "recent-series", "type": "built-in", "title": "Recently Added TV Series", "enabled": True, "source": "recent_series", "items": [], "limit": 12},
    ],
}

async def _get_homepage_config() -> dict:
    doc = await db.site_config.find_one({"_id": "homepage"})
    if not doc:
        return _DEFAULT_HOMEPAGE
    doc.pop("_id", None)
    # Deep-merge with defaults so new fields always exist
    merged = {**_DEFAULT_HOMEPAGE, **doc}
    merged["hero"] = {**_DEFAULT_HOMEPAGE["hero"], **(doc.get("hero") or {})}
    merged["announcement"] = {**_DEFAULT_HOMEPAGE["announcement"], **(doc.get("announcement") or {})}
    if not doc.get("sections"):
        merged["sections"] = _DEFAULT_HOMEPAGE["sections"]
    return merged

async def _enrich_homepage_items(sections: list) -> list:
    """Expand custom-section item references into enriched movie/series objects."""
    out = []
    for s in sections:
        s = dict(s)
        if s.get("type") == "custom":
            resolved = []
            for ref in s.get("items", []) or []:
                try:
                    if ref.get("type") == "movie":
                        d = await db.movies.find_one({"_id": ObjectId(ref["id"])})
                        if d and not d.get("deleted"):
                            item = await enrich_movie(d)
                            item["type"] = "movie"
                            resolved.append(item)
                    elif ref.get("type") == "series":
                        d = await db.series.find_one({"_id": ObjectId(ref["id"])})
                        if d and not d.get("deleted"):
                            item = await enrich_series(d, deep=False)
                            item["type"] = "series"
                            resolved.append(item)
                except Exception:
                    continue
            s["resolved_items"] = resolved[: s.get("limit", 12)]
        out.append(s)
    return out

async def _resolve_featured(hero: dict) -> dict:
    """Attach the full featured item (if any) to the hero block."""
    hero = dict(hero or {})
    ft, fid = hero.get("featured_type"), hero.get("featured_id")
    if ft and fid:
        try:
            if ft == "movie":
                d = await db.movies.find_one({"_id": ObjectId(fid)})
                if d and not d.get("deleted"):
                    item = await enrich_movie(d)
                    item["type"] = "movie"
                    hero["featured"] = item
            elif ft == "series":
                d = await db.series.find_one({"_id": ObjectId(fid)})
                if d and not d.get("deleted"):
                    item = await enrich_series(d, deep=False)
                    item["type"] = "series"
                    hero["featured"] = item
        except Exception:
            pass
    return hero

@api_router.get("/homepage/config")
async def get_homepage_config():
    """Public — returns the live homepage config with featured item + custom-section items resolved."""
    cfg = await _get_homepage_config()
    cfg["hero"] = await _resolve_featured(cfg.get("hero") or {})
    cfg["sections"] = await _enrich_homepage_items(cfg.get("sections") or [])
    return cfg

@api_router.put("/homepage/config")
async def update_homepage_config(payload: HomepageConfig, admin: dict = Depends(get_current_admin)):
    doc = payload.dict()
    # Enforce uniqueness of section ids
    seen = set()
    cleaned_sections = []
    for s in doc.get("sections", []):
        sid = (s.get("id") or "").strip()
        if not sid or sid in seen:
            # auto-generate unique id if missing or dup
            sid = f"section-{len(cleaned_sections)+1}-{int(datetime.now(timezone.utc).timestamp()*1000)%100000}"
        seen.add(sid)
        s["id"] = sid
        cleaned_sections.append(s)
    doc["sections"] = cleaned_sections
    await db.site_config.update_one(
        {"_id": "homepage"},
        {"$set": doc},
        upsert=True,
    )
    await log_edit(admin, "homepage", "homepage", "update", "Homepage", f"Updated homepage config ({len(cleaned_sections)} sections)")
    return {"ok": True}

@api_router.get("/moderation/users/{user_id}/ips")
async def get_user_ips(user_id: str, mod: dict = Depends(get_current_moderator)):
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    ips = target.get("ips", []) or []
    # find other users sharing any of these IPs
    result = []
    for entry in ips:
        ip = entry.get("ip")
        if not ip:
            continue
        shared = []
        async for u in db.users.find({"ips.ip": ip, "_id": {"$ne": target["_id"]}}):
            shared.append({
                "id": str(u["_id"]),
                "name": u.get("name"),
                "email": u.get("email"),
                "role": u.get("role", "user"),
                "avatar_url": u.get("avatar_url", ""),
                "suspended_until": u.get("suspended_until"),
            })
        result.append({
            "ip": ip,
            "first_seen": entry.get("first_seen"),
            "last_seen": entry.get("last_seen"),
            "count": entry.get("count", 1),
            "shared_with": shared,
        })
    # sort by last_seen desc
    result.sort(key=lambda x: x.get("last_seen") or "", reverse=True)
    return {"user_id": user_id, "user_name": target.get("name"), "ips": result}

@api_router.get("/moderation/users")
async def list_all_users(mod: dict = Depends(get_current_moderator), limit: int = 200):
    users = []
    async for u in db.users.find({}).sort("created_at", -1).limit(limit):
        cr = None
        if u.get("custom_role_id"):
            try:
                _cr = await db.custom_roles.find_one({"_id": ObjectId(u["custom_role_id"])})
                if _cr:
                    _perms = _cr.get("permissions", []) or []
                    cr = {"id": str(_cr["_id"]), "name": _cr.get("name"), "color": _cr.get("color", "#f59e0b"), "base": _derive_base(_perms), "permissions": _perms}
            except Exception:
                pass
        users.append({
            "id": str(u["_id"]),
            "email": u.get("email"),
            "name": u.get("name"),
            "role": u.get("role", "user"),
            "custom_role": cr,
            "avatar_url": u.get("avatar_url", ""),
            "created_at": u.get("created_at"),
            "suspended_until": u.get("suspended_until"),
            "suspension_reason": u.get("suspension_reason", ""),
            "ip_count": len(u.get("ips", []) or []),
        })
    return users

@api_router.get("/moderation/stats")
async def moderation_stats(mod: dict = Depends(get_current_moderator)):
    """Dashboard stats for the moderator/admin console."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    day_ago = (now - timedelta(hours=24)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    # Content totals (alive)
    total_movies = await db.movies.count_documents(_alive())
    total_series = await db.series.count_documents(_alive())
    total_actors = await db.actors.count_documents(_alive())
    total_collections = await db.collections.count_documents(_alive())
    trash_movies = await db.movies.count_documents({"deleted": True})
    trash_series = await db.series.count_documents({"deleted": True})
    trash_actors = await db.actors.count_documents({"deleted": True})

    # User totals
    total_users = await db.users.count_documents({})
    total_mods = await db.users.count_documents({"role": {"$in": ["moderator", "admin"]}})
    active_sus = await db.users.count_documents({
        "$or": [{"suspended_until": "permanent"}, {"suspended_until": {"$gt": now_iso}}]
    })

    # Reports (threads with category="report", status="open")
    open_reports = await db.threads.count_documents({"category": "report", "status": "open"})

    # Edit activity
    edits_24h = await db.edits.count_documents({"created_at": {"$gte": day_ago}})
    edits_7d = await db.edits.count_documents({"created_at": {"$gte": week_ago}})
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": week_ago}})

    # Recent edits feed
    recent_edits = []
    async for e in db.edits.find({}).sort("created_at", -1).limit(10):
        recent_edits.append({
            "id": str(e["_id"]),
            "entity_type": e.get("entity_type"),
            "entity_id": e.get("entity_id"),
            "entity_title": e.get("entity_title"),
            "action": e.get("action"),
            "summary": e.get("summary"),
            "user_name": e.get("user_name"),
            "user_role": e.get("user_role"),
            "created_at": e.get("created_at"),
        })

    # Active suspensions sample
    active_suspensions = []
    async for u in db.users.find(
        {"$or": [{"suspended_until": "permanent"}, {"suspended_until": {"$gt": now_iso}}]}
    ).sort("suspended_at", -1).limit(10):
        active_suspensions.append({
            "id": str(u["_id"]),
            "name": u.get("name"),
            "avatar_url": u.get("avatar_url", ""),
            "suspended_until": u.get("suspended_until"),
            "suspension_reason": u.get("suspension_reason", ""),
            "suspended_by_name": u.get("suspended_by_name", ""),
            "suspended_at": u.get("suspended_at"),
        })

    return {
        "content": {
            "movies": total_movies,
            "series": total_series,
            "actors": total_actors,
            "collections": total_collections,
            "trash": trash_movies + trash_series + trash_actors,
        },
        "users": {
            "total": total_users,
            "moderators": total_mods,
            "active_suspensions": active_sus,
            "new_7d": new_users_7d,
        },
        "reports": {
            "open": open_reports,
        },
        "activity": {
            "edits_24h": edits_24h,
            "edits_7d": edits_7d,
        },
        "recent_edits": recent_edits,
        "active_suspensions": active_suspensions,
    }

@api_router.get("/moderation/suspensions")
async def list_suspensions(mod: dict = Depends(get_current_moderator), q: Optional[str] = None, include_expired: bool = False, limit: int = 200):
    """List currently active suspensions (and optionally expired ones for history)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    if include_expired:
        base = {"suspended_until": {"$exists": True, "$ne": None}}
    else:
        base = {"$or": [{"suspended_until": "permanent"}, {"suspended_until": {"$gt": now_iso}}]}
    if q:
        name_rx = {"$regex": q, "$options": "i"}
        base = {"$and": [base, {"$or": [{"name": name_rx}, {"email": name_rx}]}]}
    out = []
    async for u in db.users.find(base).sort("suspended_at", -1).limit(limit):
        sus = u.get("suspended_until")
        is_active = sus == "permanent" or (sus and sus > now_iso)
        out.append({
            "id": str(u["_id"]),
            "name": u.get("name"),
            "email": u.get("email"),
            "avatar_url": u.get("avatar_url", ""),
            "role": u.get("role", "user"),
            "suspended_until": sus,
            "suspension_reason": u.get("suspension_reason", ""),
            "suspended_by_name": u.get("suspended_by_name", ""),
            "suspended_at": u.get("suspended_at"),
            "is_active": bool(is_active),
        })
    return out

# ----------- Comments (Discussion) -----------
@api_router.post("/comments")
async def create_comment(payload: CommentCreate, user: dict = Depends(get_current_user)):
    if payload.entity_type not in ("movie", "series"):
        raise HTTPException(status_code=400, detail="Invalid entity_type")
    doc = {
        "entity_type": payload.entity_type,
        "entity_id": payload.entity_id,
        "text": payload.text.strip(),
        "parent_id": payload.parent_id,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar_url", ""),
        "user_role": user.get("role", "user"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.comments.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/comments")
async def list_comments(entity_type: str, entity_id: str, limit: int = 200):
    docs = []
    async for c in db.comments.find({"entity_type": entity_type, "entity_id": entity_id}).sort("created_at", 1).limit(limit):
        c["id"] = str(c.pop("_id"))
        docs.append(c)
    return docs

@api_router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(get_current_user)):
    try:
        c = await db.comments.find_one({"_id": ObjectId(comment_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.get("user_id") != user["id"] and user.get("role") not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.comments.delete_one({"_id": ObjectId(comment_id)})
    return {"ok": True}

# ----------- Threads -----------
MOD_MASK_NAME = "Support"
MOD_MASK_ROLE = "support"

def _serialize_thread(t: dict) -> dict:
    t["id"] = str(t.pop("_id"))
    return t

def _is_mod_role(user: dict) -> bool:
    if not user:
        return False
    if user.get("effective_role") in ("moderator", "admin"):
        return True
    # A granular-permission user with read_reply can view every direct thread like a mod.
    return "moderation.messages.read_reply" in (user.get("permissions") or [])

def _is_admin_role(user: dict) -> bool:
    if not user:
        return False
    return user.get("effective_role") == "admin" or user.get("role") == "admin"

async def _get_suspended_user_ids() -> list:
    """Return string ids of users whose suspension is currently active."""
    now_iso = datetime.now(timezone.utc).isoformat()
    ids: list = []
    cursor = db.users.find(
        {"$or": [{"suspended_until": "permanent"}, {"suspended_until": {"$gt": now_iso}}]},
        {"_id": 1},
    )
    async for u in cursor:
        ids.append(str(u["_id"]))
    return ids

def _can_view_direct_thread(t: dict, user: Optional[dict]) -> bool:
    if not user:
        return False
    if _is_mod_role(user):
        return True
    uid = user["id"]
    return uid == t.get("user_id") or uid == t.get("target_user_id")

def _should_mask_for(viewer: Optional[dict]) -> bool:
    """Non-mods (including suspended users) receive masked mod identities in direct threads / notifications."""
    if not viewer:
        return True
    return not _is_mod_role(viewer)

def _mask_direct_thread(t: dict, viewer: Optional[dict]) -> dict:
    """If viewer is not a mod and thread was opened by a mod, hide mod identity."""
    if not t.get("is_direct"):
        return t
    if not _should_mask_for(viewer):
        return t
    author_role = (t.get("user_role") or "").lower()
    if author_role in ("moderator", "admin"):
        t = dict(t)
        t["user_name"] = MOD_MASK_NAME
        t["user_avatar"] = ""
        t["user_role"] = MOD_MASK_ROLE
        t["user_id"] = ""
    # target_user_name should not leak either (it identifies the recipient the mod picked)
    if viewer and viewer.get("id") == t.get("target_user_id"):
        # It's the recipient viewing; leave their own name intact.
        pass
    return t

def _mask_thread_message(m: dict, viewer: Optional[dict]) -> dict:
    if not _should_mask_for(viewer):
        return m
    role = (m.get("user_role") or "").lower()
    if role in ("moderator", "admin"):
        m = dict(m)
        m["user_name"] = MOD_MASK_NAME
        m["user_avatar"] = ""
        m["user_role"] = MOD_MASK_ROLE
        m["user_id"] = ""
    return m

def _mask_notification(n: dict, viewer: Optional[dict]) -> dict:
    if not _should_mask_for(viewer):
        return n
    role = (n.get("from_user_role") or "").lower()
    if role in ("moderator", "admin"):
        n = dict(n)
        n["from_user_name"] = MOD_MASK_NAME
        n["from_user_avatar"] = ""
        n["from_user_role"] = MOD_MASK_ROLE
        n["from_user_id"] = ""
        # Rewrite common title patterns that embed the mod's real name.
        t = n.get("title") or ""
        if "from " in t:
            head, _sep, _tail = t.partition("from ")
            n["title"] = f"{head}from {MOD_MASK_NAME}"
        elif "by " in t and t.startswith("Your account has been suspended"):
            n["title"] = t  # already generic
    return n

async def _create_notification(*, user_id: str, ntype: str, title: str, body: str = "",
                                link: str = "", thread_id: Optional[str] = None,
                                from_user: Optional[dict] = None):
    if not user_id:
        return
    doc = {
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body,
        "link": link,
        "thread_id": thread_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if from_user:
        doc["from_user_id"] = from_user.get("id")
        doc["from_user_name"] = from_user.get("name")
        doc["from_user_avatar"] = from_user.get("avatar_url", "")
        doc["from_user_role"] = from_user.get("effective_role", from_user.get("role", "user"))
    await db.notifications.insert_one(doc)

@api_router.post("/threads")
async def create_thread(payload: ThreadCreate, user: dict = Depends(get_current_user)):
    if payload.category not in ("support", "report", "general"):
        raise HTTPException(status_code=400, detail="Invalid category")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "title": payload.title.strip(),
        "body": payload.body.strip(),
        "category": payload.category,
        "status": "open",
        "entity_type": payload.entity_type,
        "entity_id": payload.entity_id,
        "entity_title": payload.entity_title,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar_url", ""),
        "user_role": user.get("role", "user"),
        "is_direct": False,
        "created_at": now,
        "last_activity_at": now,
        "message_count": 0,
    }
    await db.threads.insert_one(doc)
    return _serialize_thread(doc)

@api_router.post("/moderation/threads")
async def create_direct_thread(payload: DirectThreadCreate, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "moderation.messages.read_reply", "You don't have permission to send moderation messages.")
    try:
        target = await db.users.find_one({"_id": ObjectId(payload.target_user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target["_id"]) == mod["id"]:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    now = datetime.now(timezone.utc).isoformat()
    # Always stamp mod-style role on the stored thread so suspended user sees "Support"
    author_role = mod.get("effective_role", mod.get("role", "user"))
    if author_role not in ("moderator", "admin"):
        author_role = "moderator"
    doc = {
        "title": payload.title.strip(),
        "body": payload.body.strip(),
        "category": "direct",
        "status": "open",
        "entity_type": None,
        "entity_id": None,
        "entity_title": None,
        "user_id": mod["id"],
        "user_name": mod.get("name"),
        "user_avatar": mod.get("avatar_url", ""),
        "user_role": author_role,
        "target_user_id": str(target["_id"]),
        "target_user_name": target.get("name"),
        "is_direct": True,
        "created_at": now,
        "last_activity_at": now,
        "message_count": 0,
    }
    result = await db.threads.insert_one(doc)
    thread_id = str(result.inserted_id)
    await _create_notification(
        user_id=str(target["_id"]),
        ntype="direct_thread",
        title=f"New message from {mod.get('name')}",
        body=payload.title.strip(),
        link=f"/threads/{thread_id}",
        thread_id=thread_id,
        from_user=mod,
    )
    doc["_id"] = result.inserted_id
    return _serialize_thread(doc)

@api_router.get("/threads")
async def list_threads(
    category: Optional[str] = None,
    status: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    viewer: Optional[dict] = Depends(get_optional_user),
):
    q: dict = {}
    if category:
        q["category"] = category
    if status:
        q["status"] = status
    if entity_type:
        q["entity_type"] = entity_type
    if entity_id:
        q["entity_id"] = entity_id
    # Hide direct threads from public listing unless viewer is a participant / mod
    if category == "direct":
        if not viewer:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if not _is_mod_role(viewer):
            q = {"$and": [q, {"$or": [{"user_id": viewer["id"]}, {"target_user_id": viewer["id"]}]}]}
    else:
        # exclude direct threads from generic listings
        base_exclude = {"$or": [{"is_direct": {"$ne": True}}, {"is_direct": {"$exists": False}}]}
        q = {"$and": [q, base_exclude]} if q else base_exclude
    # Hide threads created by currently-suspended users from non-mod viewers
    if not _is_mod_role(viewer):
        suspended_ids = await _get_suspended_user_ids()
        if suspended_ids:
            q = {"$and": [q, {"user_id": {"$nin": suspended_ids}}]}
    docs = []
    async for t in db.threads.find(q).sort("last_activity_at", -1).limit(limit):
        docs.append(_serialize_thread(t))
    return docs

@api_router.get("/inbox/threads")
async def inbox_threads(user: dict = Depends(get_current_user_allow_suspended), limit: int = 100):
    """List direct threads visible to the current user (participant or mod)."""
    if _is_mod_role(user):
        q = {"is_direct": True}
    else:
        q = {"is_direct": True, "$or": [{"user_id": user["id"]}, {"target_user_id": user["id"]}]}
    docs = []
    async for t in db.threads.find(q).sort("last_activity_at", -1).limit(limit):
        docs.append(_mask_direct_thread(_serialize_thread(t), user))
    return docs

@api_router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    if t.get("is_direct"):
        if not _can_view_direct_thread(t, viewer):
            raise HTTPException(status_code=404, detail="Thread not found")
    # Hide forum threads authored by currently-suspended users from non-mod viewers
    if not t.get("is_direct") and not _is_mod_role(viewer):
        author_id = t.get("user_id")
        if author_id and author_id in await _get_suspended_user_ids():
            raise HTTPException(status_code=404, detail="Thread not found")
    t = _serialize_thread(t)
    t = _mask_direct_thread(t, viewer)
    messages = []
    async for m in db.thread_messages.find({"thread_id": thread_id}).sort("created_at", 1):
        m["id"] = str(m.pop("_id"))
        messages.append(_mask_thread_message(m, viewer))
    t["messages"] = messages
    return t

@api_router.get("/threads/{thread_id}/inbox")
async def get_thread_inbox(thread_id: str, user: dict = Depends(get_current_user_allow_suspended)):
    """Suspended-safe fetch of a direct thread the user participates in."""
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t.get("is_direct"):
        raise HTTPException(status_code=404, detail="Thread not found")
    if not _can_view_direct_thread(t, user):
        raise HTTPException(status_code=404, detail="Thread not found")
    t = _serialize_thread(t)
    t = _mask_direct_thread(t, user)
    messages = []
    async for m in db.thread_messages.find({"thread_id": thread_id}).sort("created_at", 1):
        m["id"] = str(m.pop("_id"))
        messages.append(_mask_thread_message(m, user))
    t["messages"] = messages
    return t

@api_router.post("/threads/{thread_id}/messages")
async def post_thread_message(thread_id: str, payload: ThreadMessageCreate, user: dict = Depends(get_current_user_allow_suspended)):
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    is_direct = bool(t.get("is_direct"))
    if is_direct:
        if not _can_view_direct_thread(t, user):
            raise HTTPException(status_code=404, detail="Thread not found")
    else:
        # public threads: suspended users cannot reply
        if user.get("is_suspended"):
            raise HTTPException(status_code=403, detail="Your account is suspended. You can only reply to moderator messages.")
    if t.get("status") == "closed" and not _is_mod_role(user):
        raise HTTPException(status_code=403, detail="Thread is closed")
    now = datetime.now(timezone.utc).isoformat()
    # If a mod-perm user is posting into a direct thread they're not a participant in,
    # mark the message with role=moderator so masking kicks in for the suspended recipient.
    posting_role = user.get("effective_role", user.get("role", "user"))
    if is_direct:
        is_participant = user["id"] in (t.get("user_id"), t.get("target_user_id"))
        if not is_participant and _is_mod_role(user) and posting_role not in ("moderator", "admin"):
            posting_role = "moderator"
    doc = {
        "thread_id": thread_id,
        "text": payload.text.strip(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar_url", ""),
        "user_role": posting_role,
        "created_at": now,
    }
    result = await db.thread_messages.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    await db.threads.update_one(
        {"_id": ObjectId(thread_id)},
        {"$set": {"last_activity_at": now}, "$inc": {"message_count": 1}},
    )
    # Notifications: to the other party
    recipients = set()
    if is_direct:
        for uid in (t.get("user_id"), t.get("target_user_id")):
            if uid and uid != user["id"]:
                recipients.add(uid)
        n_title = f"New reply from {user.get('name')}"
        n_type = "direct_thread_reply"
    else:
        owner_id = t.get("user_id")
        if owner_id and owner_id != user["id"]:
            recipients.add(owner_id)
        n_title = f"{user.get('name')} replied to your thread"
        n_type = "thread_reply"
    for uid in recipients:
        await _create_notification(
            user_id=uid,
            ntype=n_type,
            title=n_title,
            body=t.get("title", ""),
            link=f"/threads/{thread_id}",
            thread_id=thread_id,
            from_user=user,
        )
    return doc

@api_router.patch("/threads/{thread_id}/status")
async def set_thread_status(thread_id: str, payload: ThreadStatusUpdate, mod: dict = Depends(get_current_moderator)):
    if payload.status not in ("open", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.threads.update_one({"_id": ObjectId(thread_id)}, {"$set": {
        "status": payload.status,
        "status_changed_by": mod["id"],
        "status_changed_by_name": mod.get("name"),
        "status_changed_at": datetime.now(timezone.utc).isoformat(),
    }})
    await db.thread_messages.insert_one({
        "thread_id": thread_id,
        "text": f"Thread {payload.status} by {mod.get('name')}",
        "user_id": mod["id"],
        "user_name": mod.get("name"),
        "user_role": mod.get("role"),
        "user_avatar": mod.get("avatar_url", ""),
        "system": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    return _serialize_thread(t)

@api_router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user: dict = Depends(get_current_user)):
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    if user.get("role") not in ("moderator", "admin") and t.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.threads.delete_one({"_id": ObjectId(thread_id)})
    await db.thread_messages.delete_many({"thread_id": thread_id})
    await db.notifications.delete_many({"thread_id": thread_id})
    return {"ok": True}

# ----------- Notifications -----------
def _serialize_notification(n: dict) -> dict:
    n["id"] = str(n.pop("_id"))
    return n

@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user_allow_suspended), limit: int = 50):
    docs = []
    async for n in db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).limit(limit):
        docs.append(_mask_notification(_serialize_notification(n), user))
    return docs

@api_router.get("/notifications/unread-count")
async def unread_notification_count(user: dict = Depends(get_current_user_allow_suspended)):
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": count}

@api_router.patch("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: dict = Depends(get_current_user_allow_suspended)):
    try:
        res = await db.notifications.update_one(
            {"_id": ObjectId(nid), "user_id": user["id"]},
            {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Notification not found")
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}

@api_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(user: dict = Depends(get_current_user_allow_suspended)):
    now = datetime.now(timezone.utc).isoformat()
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True, "read_at": now}},
    )
    return {"ok": True, "updated": res.modified_count}


# ----------- IP overlap groups -----------
@api_router.get("/moderation/ip-groups")
async def ip_overlap_groups(mod: dict = Depends(get_current_moderator)):
    """Return IP addresses with 2+ accounts using them."""
    pipeline = [
        {"$unwind": {"path": "$ips", "preserveNullAndEmptyArrays": False}},
        {"$group": {
            "_id": "$ips.ip",
            "users": {"$push": {
                "id": {"$toString": "$_id"},
                "name": "$name",
                "email": "$email",
                "role": "$role",
                "avatar_url": "$avatar_url",
                "suspended_until": "$suspended_until",
                "last_seen": "$ips.last_seen",
            }},
            "count": {"$sum": 1},
        }},
        {"$match": {"count": {"$gte": 2}}},
        {"$sort": {"count": -1}},
    ]
    result = []
    async for row in db.users.aggregate(pipeline):
        result.append({"ip": row["_id"], "users": row["users"], "count": row["count"]})
    return result

# ----------- Movies -----------
@api_router.post("/movies")
async def create_movie(payload: MovieCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    # Duplicate guard: same normalized title + same release date (case + whitespace insensitive)
    title_clean = (doc.get("title") or "").strip()
    if title_clean:
        existing = await db.movies.find_one(_alive({
            "title": {"$regex": f"^\\s*{re.escape(title_clean)}\\s*$", "$options": "i"},
            "release_date": doc.get("release_date") or "",
        }))
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A movie with the same title and release date already exists (id={str(existing['_id'])}).",
            )
    doc["title"] = title_clean
    doc["cast"] = _dedupe_cast(doc.get("cast", []))
    doc["crew"] = [c if isinstance(c, dict) else c.model_dump() for c in doc.get("crew", [])]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user["id"]
    result = await db.movies.insert_one(doc)
    fetched = await db.movies.find_one({"_id": result.inserted_id})
    enriched = await enrich_movie(fetched)
    await log_edit(user, "movie", enriched["id"], "create", enriched["title"], f"Created movie \"{enriched['title']}\"")
    return enriched

@api_router.get("/movies")
async def list_movies(
    q: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: Optional[int] = None,
):
    filter_query: dict = {}
    if q:
        # search title/genre/actor names
        actor_ids = []
        actor_cursor = db.actors.find(_alive({"name": {"$regex": q, "$options": "i"}}), {"_id": 1})
        async for a in actor_cursor:
            actor_ids.append(str(a["_id"]))
        or_filters = [
            {"title": {"$regex": q, "$options": "i"}},
            {"genres": {"$regex": q, "$options": "i"}},
        ]
        if actor_ids:
            or_filters.append({"cast.actor_id": {"$in": actor_ids}})
        filter_query["$or"] = or_filters
    if genre:
        filter_query["genres"] = {"$regex": f"^{genre}$", "$options": "i"}
    if year:
        filter_query["release_date"] = {"$regex": f"^{year}"}
    cursor = db.movies.find(_alive(filter_query))
    if limit:
        cursor = cursor.limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    if sort == "rating":
        docs.sort(key=lambda x: (x.get("avg_rating") or 0), reverse=True)
    elif sort == "year":
        docs.sort(key=lambda x: x.get("release_date", ""), reverse=True)
    else:
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return docs

@api_router.get("/movies/trending")
async def trending_movies(limit: int = 12):
    cursor = db.movies.find(_alive({"is_trending": True})).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    if not docs:
        # fallback: top rated
        all_cursor = db.movies.find(_alive()).limit(30)
        async for d in all_cursor:
            docs.append(await enrich_movie(d))
        docs.sort(key=lambda x: (x.get("avg_rating") or 0), reverse=True)
        docs = docs[:limit]
    return docs

@api_router.get("/movies/recent")
async def recent_movies(limit: int = 12):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cursor = db.movies.find(_alive({"release_date": {"$lte": today}})).sort("created_at", -1).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    return docs

@api_router.get("/movies/upcoming")
async def upcoming_movies(limit: int = 12):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cursor = db.movies.find(_alive({"release_date": {"$gt": today}})).sort("release_date", 1).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    return docs

@api_router.get("/movies/{movie_id}")
async def get_movie(movie_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")
    if doc.get("deleted") and not (viewer and viewer.get("effective_role") in ("moderator", "admin")):
        raise HTTPException(status_code=404, detail="Movie not found")
    # Track a view (bucketed by UTC date)
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        await db.movie_views.update_one(
            {"movie_id": movie_id, "date": today},
            {"$inc": {"count": 1}},
            upsert=True,
        )
    except Exception:
        pass
    return await enrich_movie(doc)


# ----------- Movie stats: 7-day trend, contributors, content score -----------
_CONTENT_SCORE_FIELDS = [
    "title", "release_date", "synopsis", "tagline", "poster_url", "backdrop_url",
    "trailer_url", "runtime", "genres", "cast", "crew", "keywords",
    "status", "original_language", "budget", "revenue",
]

def _field_filled(v) -> bool:
    if v is None:
        return False
    if isinstance(v, (list, str)):
        return len(v) > 0
    if isinstance(v, (int, float)):
        return v > 0
    return True

@api_router.get("/movies/{movie_id}/stats")
async def movie_stats(movie_id: str):
    try:
        doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")

    # 7-day view trend (oldest → newest)
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    counts_map = {}
    async for row in db.movie_views.find({"movie_id": movie_id, "date": {"$in": days}}):
        counts_map[row["date"]] = row.get("count", 0)
    trend = [{"date": d, "count": counts_map.get(d, 0)} for d in days]
    total_views = 0
    async for v in db.movie_views.find({"movie_id": movie_id}):
        total_views += v.get("count", 0)

    # Top contributors from edits collection
    pipeline = [
        {"$match": {"entity_type": "movie", "entity_id": movie_id,
                    "action": {"$in": ["create", "update", "revert"]}}},
        {"$group": {"_id": "$user_id",
                    "count": {"$sum": 1},
                    "name": {"$last": "$user_name"},
                    "avatar": {"$last": "$user_avatar"}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    contributors = []
    async for row in db.edits.aggregate(pipeline):
        contributors.append({
            "user_id": row["_id"],
            "name": row.get("name"),
            "avatar_url": row.get("avatar"),
            "count": row.get("count", 0),
        })

    # Content score (percent of key fields filled)
    filled = sum(1 for f in _CONTENT_SCORE_FIELDS if _field_filled(doc.get(f)))
    content_score = round(100 * filled / len(_CONTENT_SCORE_FIELDS))

    return {
        "trend": trend,
        "total_views": total_views,
        "contributors": contributors,
        "content_score": content_score,
    }

def _year_from(s: Optional[str]) -> Optional[int]:
    if not s or not isinstance(s, str) or len(s) < 4:
        return None
    try:
        return int(s[:4])
    except Exception:
        return None

def _score_related(base_genres: set, base_actors: set, base_year: Optional[int], base_collections: set,
                   d_genres: set, d_actors: set, d_year: Optional[int], d_collections: set) -> int:
    # Case-insensitive genre comparison
    bg_lc = {g.lower() for g in base_genres if g}
    dg_lc = {g.lower() for g in d_genres if g}
    score = len(dg_lc & bg_lc) * 2 + len(d_actors & base_actors) * 3
    if base_collections and d_collections and (base_collections & d_collections):
        # Collection mates get a big boost so they bubble to the top.
        score += 10
    if base_year is not None and d_year is not None:
        diff = abs(base_year - d_year)
        if diff == 0:
            score += 3
        elif diff <= 2:
            score += 2
        elif diff <= 5:
            score += 1
    return score

def _ci_genre_or(genre_set: set) -> list:
    """Return a list of case-insensitive regex filters for the given genre names."""
    out = []
    for g in genre_set:
        if g:
            out.append({"genres": {"$regex": f"^{re.escape(g)}$", "$options": "i"}})
    return out

async def _collect_related_movies(base_genres: list, base_actors: list, base_year: Optional[int],
                                  base_collections: list, exclude_movie_id=None):
    """Return a list of scored movies sharing genres/actors/collection with the base."""
    genre_set = set(base_genres or [])
    actor_set = set(base_actors or [])
    coll_set = set(base_collections or [])

    or_filters = []
    if genre_set:
        or_filters.extend(_ci_genre_or(genre_set))
    if actor_set:
        or_filters.append({"cast.actor_id": {"$in": list(actor_set)}})
    if coll_set:
        or_filters.append({"collection_ids": {"$in": list(coll_set)}})
    if not or_filters:
        return []

    m_filter = {"$or": or_filters}
    if exclude_movie_id is not None:
        m_filter = {"$and": [{"_id": {"$ne": exclude_movie_id}}, m_filter]}

    scored = []
    async for d in db.movies.find(_alive(m_filter)).limit(120):
        d_genres = set(d.get("genres") or [])
        d_actors = {c.get("actor_id") for c in (d.get("cast") or []) if c.get("actor_id")}
        d_colls = set(d.get("collection_ids") or [])
        d_year = _year_from(d.get("release_date"))
        score = _score_related(genre_set, actor_set, base_year, coll_set, d_genres, d_actors, d_year, d_colls)
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored

async def _collect_related_series(base_genres: list, base_actors: list, base_year: Optional[int],
                                  base_collections: list, exclude_series_id=None):
    """Return a list of scored TV series sharing genres/actors/collection with the base."""
    genre_set = set(base_genres or [])
    actor_set = set(base_actors or [])
    coll_set = set(base_collections or [])

    or_filters = []
    if genre_set:
        or_filters.extend(_ci_genre_or(genre_set))
    if actor_set:
        or_filters.append({"main_cast.actor_id": {"$in": list(actor_set)}})
        or_filters.append({"seasons.episodes.guest_stars.actor_id": {"$in": list(actor_set)}})
    if coll_set:
        or_filters.append({"collection_ids": {"$in": list(coll_set)}})
    if not or_filters:
        return []

    s_filter = {"$or": or_filters}
    if exclude_series_id is not None:
        s_filter = {"$and": [{"_id": {"$ne": exclude_series_id}}, s_filter]}

    scored = []
    async for d in db.series.find(_alive(s_filter)).limit(120):
        d_genres = set(d.get("genres") or [])
        d_actors = {c.get("actor_id") for c in (d.get("main_cast") or []) if c.get("actor_id")}
        for season in (d.get("seasons") or []):
            for ep in (season.get("episodes") or []):
                for g in (ep.get("guest_stars") or []):
                    if g.get("actor_id"):
                        d_actors.add(g.get("actor_id"))
        d_colls = set(d.get("collection_ids") or [])
        d_year = _year_from(d.get("first_air_date"))
        score = _score_related(genre_set, actor_set, base_year, coll_set, d_genres, d_actors, d_year, d_colls)
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored

@api_router.get("/movies/{movie_id}/similar")
async def similar_movies(movie_id: str, limit: int = 10):
    try:
        base = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not base:
        raise HTTPException(status_code=404, detail="Movie not found")
    genres = base.get("genres") or []
    cast_actor_ids = [c.get("actor_id") for c in (base.get("cast") or []) if c.get("actor_id")]
    base_year = _year_from(base.get("release_date"))
    base_collections = base.get("collection_ids") or []
    scored = await _collect_related_movies(genres, cast_actor_ids, base_year, base_collections, exclude_movie_id=base["_id"])
    out = []
    for _s, d in scored[:limit]:
        item = await enrich_movie(d)
        item["type"] = "movie"
        out.append(item)
    return out

def _check_locks(old_doc: dict, update_data: dict, user: dict, action: str = "edit"):
    """Raise 403 if any locked field is being modified by a non-moderator."""
    if user.get("role") in ("moderator", "admin"):
        return
    locked = old_doc.get("locked_fields", []) or []
    violated = [f for f in locked if f in update_data]
    if violated:
        raise HTTPException(status_code=403, detail=f"These fields are locked by moderators: {', '.join(violated)}")

@api_router.patch("/movies/{movie_id}")
async def update_movie(movie_id: str, payload: MovieUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    old_doc = await db.movies.find_one({"_id": ObjectId(movie_id)}) or {}
    is_mod = user.get("role") in ("moderator", "admin") or user.get("effective_role") in ("moderator", "admin")
    # Non-mods cannot change locked_cast_actor_ids
    if "locked_cast_actor_ids" in update_data and not is_mod:
        update_data.pop("locked_cast_actor_ids", None)
    if "cast" in update_data:
        update_data["cast"] = _enforce_cast_locks(
            old_doc.get("cast") or [],
            update_data["cast"],
            old_doc.get("locked_cast_actor_ids") or [],
            is_mod,
        )
        update_data["cast"] = _dedupe_cast(update_data["cast"])
    if "crew" in update_data:
        update_data["crew"] = [c if isinstance(c, dict) else c.model_dump() for c in update_data["crew"]]
    _enforce_image_delete_guard(old_doc, update_data, user, single_fields=["poster_url", "backdrop_url"], gallery_fields=["gallery"])
    _check_locks(old_doc, update_data, user)
    await db.movies.update_one({"_id": ObjectId(movie_id)}, {"$set": update_data})
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    enriched = await enrich_movie(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "movie", movie_id, "update", enriched["title"], f"Updated {changed_names}", changes)
    return enriched

@api_router.post("/movies/{movie_id}/cast-lock")
async def toggle_movie_cast_lock(movie_id: str, payload: dict, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.lock_cast", "You don't have permission to lock cast members.")
    actor_id = (payload or {}).get("actor_id")
    if not actor_id:
        raise HTTPException(status_code=400, detail="actor_id required")
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")
    current = list(doc.get("locked_cast_actor_ids") or [])
    if actor_id in current:
        current.remove(actor_id)
        action = "unlock"
    else:
        current.append(actor_id)
        action = "lock"
    await db.movies.update_one({"_id": doc["_id"]}, {"$set": {"locked_cast_actor_ids": current}})
    await log_edit(mod, "movie", movie_id, "cast-lock", doc.get("title", ""), f"{action} cast actor {actor_id}")
    return {"ok": True, "locked_cast_actor_ids": current}

@api_router.patch("/movies/{movie_id}/lock")
async def lock_movie_fields(movie_id: str, payload: LockUpdate, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.protect_fields", "You don't have permission to protect fields.")
    old = await db.movies.find_one({"_id": ObjectId(movie_id)}) or {}
    prev = old.get("locked_fields", []) or []
    await db.movies.update_one({"_id": ObjectId(movie_id)}, {"$set": {"locked_fields": payload.locked_fields}})
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    enriched = await enrich_movie(doc)
    added = [f for f in payload.locked_fields if f not in prev]
    removed = [f for f in prev if f not in payload.locked_fields]
    parts = []
    if added: parts.append(f"locked: {', '.join(added)}")
    if removed: parts.append(f"unlocked: {', '.join(removed)}")
    changes = [{"field": "locked_fields", "before": ", ".join(prev) or "—", "after": ", ".join(payload.locked_fields) or "—"}]
    await log_edit(mod, "movie", movie_id, "lock", enriched["title"], "; ".join(parts) or "No change", changes)
    return enriched

@api_router.delete("/movies/{movie_id}")
async def delete_movie(movie_id: str, user: dict = Depends(get_current_moderator)):
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")
    title = doc.get("title", "")
    if doc.get("deleted"):
        return {"ok": True, "already_deleted": True}
    await db.movies.update_one(
        {"_id": ObjectId(movie_id)},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user["id"],
            "deleted_by_name": user.get("name"),
        }},
    )
    await log_edit(user, "movie", movie_id, "delete", title, f"Deleted movie \"{title}\"")
    return {"ok": True}

# ----------- Series -----------
def _serialize_series_payload(data: dict) -> dict:
    if "main_cast" in data and data["main_cast"] is not None:
        data["main_cast"] = _dedupe_cast(data["main_cast"])
    if "creators" in data and data["creators"] is not None:
        data["creators"] = [c if isinstance(c, dict) else c.model_dump() for c in data["creators"]]
    if "seasons" in data and data["seasons"] is not None:
        out_seasons = []
        for s in data["seasons"]:
            s = s if isinstance(s, dict) else s.model_dump()
            eps = []
            for ep in s.get("episodes", []) or []:
                ep = ep if isinstance(ep, dict) else ep.model_dump()
                ep["guest_stars"] = _dedupe_cast(ep.get("guest_stars", []) or [])
                eps.append(ep)
            s["episodes"] = eps
            out_seasons.append(s)
        data["seasons"] = out_seasons
    return data

@api_router.post("/series")
async def create_series(payload: SeriesCreate, user: dict = Depends(get_current_user)):
    doc = _serialize_series_payload(payload.model_dump())
    # Duplicate guard: same normalized title + same first_air_date (case + whitespace insensitive)
    title_clean = (doc.get("title") or "").strip()
    if title_clean:
        existing = await db.series.find_one(_alive({
            "title": {"$regex": f"^\\s*{re.escape(title_clean)}\\s*$", "$options": "i"},
            "first_air_date": doc.get("first_air_date") or "",
        }))
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A TV series with the same title and first-air date already exists (id={str(existing['_id'])}).",
            )
    doc["title"] = title_clean
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user["id"]
    result = await db.series.insert_one(doc)
    fetched = await db.series.find_one({"_id": result.inserted_id})
    enriched = await enrich_series(fetched)
    await log_edit(user, "series", enriched["id"], "create", enriched["title"], f"Created series \"{enriched['title']}\"")
    return enriched

@api_router.get("/series")
async def list_series(
    q: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: Optional[int] = None,
):
    filter_query: dict = {}
    if q:
        actor_ids = []
        async for a in db.actors.find(_alive({"name": {"$regex": q, "$options": "i"}}), {"_id": 1}):
            actor_ids.append(str(a["_id"]))
        or_filters = [
            {"title": {"$regex": q, "$options": "i"}},
            {"genres": {"$regex": q, "$options": "i"}},
        ]
        if actor_ids:
            or_filters.append({"main_cast.actor_id": {"$in": actor_ids}})
            or_filters.append({"seasons.episodes.guest_stars.actor_id": {"$in": actor_ids}})
        filter_query["$or"] = or_filters
    if genre:
        filter_query["genres"] = {"$regex": f"^{genre}$", "$options": "i"}
    if year:
        filter_query["first_air_date"] = {"$regex": f"^{year}"}
    cursor = db.series.find(_alive(filter_query))
    if limit:
        cursor = cursor.limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_series(d, deep=False))
    if sort == "year":
        docs.sort(key=lambda x: x.get("first_air_date", ""), reverse=True)
    else:
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return docs

@api_router.get("/series/trending")
async def trending_series(limit: int = 12):
    docs = []
    async for d in db.series.find(_alive({"is_trending": True})).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    if not docs:
        async for d in db.series.find(_alive()).sort("created_at", -1).limit(limit):
            docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/recent")
async def recent_series(limit: int = 12):
    docs = []
    async for d in db.series.find(_alive()).sort("created_at", -1).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/upcoming-episodes")
async def upcoming_episodes(limit: int = 12):
    """Return series that have at least one future-dated episode, with the next upcoming episode preview."""
    today = datetime.now(timezone.utc).date().isoformat()
    results = []
    async for d in db.series.find(_alive()):
        next_ep = None
        for sn in (d.get("seasons") or []):
            for ep in (sn.get("episodes") or []):
                ad = ep.get("air_date")
                if not ad or ad < today:
                    continue
                candidate = {
                    "season_number": sn.get("season_number"),
                    "episode_number": ep.get("episode_number"),
                    "name": ep.get("name"),
                    "air_date": ad,
                    "still_url": ep.get("still_url", ""),
                    "synopsis": ep.get("synopsis", ""),
                }
                if next_ep is None or candidate["air_date"] < next_ep["air_date"]:
                    next_ep = candidate
        if next_ep:
            enriched = await enrich_series(d, deep=False)
            enriched["next_episode"] = next_ep
            results.append(enriched)
    results.sort(key=lambda x: x["next_episode"]["air_date"])
    return results[:limit]

@api_router.get("/series/top-rated")
async def top_rated_series(limit: int = 12):
    docs = []
    async for d in db.series.find(_alive()):
        docs.append(await enrich_series(d, deep=False))
    rated = [d for d in docs if d.get("rating_count") and d.get("avg_rating") is not None]
    rated.sort(key=lambda x: (-(x.get("avg_rating") or 0), -(x.get("rating_count") or 0)))
    return rated[:limit]

@api_router.get("/series/{series_id}")
async def get_series(series_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        doc = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    if doc.get("deleted") and not (viewer and viewer.get("effective_role") in ("moderator", "admin")):
        raise HTTPException(status_code=404, detail="Series not found")
    # Track view
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        await db.series_views.update_one(
            {"series_id": series_id, "date": today},
            {"$inc": {"count": 1}},
            upsert=True,
        )
    except Exception:
        pass
    return await enrich_series(doc)

_SERIES_SCORE_FIELDS = [
    "title", "first_air_date", "synopsis", "tagline", "poster_url", "backdrop_url",
    "trailer_url", "genres", "main_cast", "creators", "keywords",
    "status", "original_language", "network", "type", "seasons",
]

@api_router.get("/series/{series_id}/stats")
async def series_stats(series_id: str):
    try:
        doc = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")

    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    counts_map = {}
    async for row in db.series_views.find({"series_id": series_id, "date": {"$in": days}}):
        counts_map[row["date"]] = row.get("count", 0)
    trend = [{"date": d, "count": counts_map.get(d, 0)} for d in days]
    total_views = 0
    async for v in db.series_views.find({"series_id": series_id}):
        total_views += v.get("count", 0)

    pipeline = [
        {"$match": {"entity_type": "series", "entity_id": series_id,
                    "action": {"$in": ["create", "update", "revert"]}}},
        {"$group": {"_id": "$user_id",
                    "count": {"$sum": 1},
                    "name": {"$last": "$user_name"},
                    "avatar": {"$last": "$user_avatar"}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    contributors = []
    async for row in db.edits.aggregate(pipeline):
        contributors.append({
            "user_id": row["_id"],
            "name": row.get("name"),
            "avatar_url": row.get("avatar"),
            "count": row.get("count", 0),
        })

    filled = sum(1 for f in _SERIES_SCORE_FIELDS if _field_filled(doc.get(f)))
    content_score = round(100 * filled / len(_SERIES_SCORE_FIELDS))

    return {
        "trend": trend,
        "total_views": total_views,
        "contributors": contributors,
        "content_score": content_score,
    }

@api_router.get("/series/{series_id}/similar")
async def similar_series(series_id: str, limit: int = 10):
    try:
        base = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not base:
        raise HTTPException(status_code=404, detail="Series not found")
    genres = base.get("genres") or []
    main_cast_ids = [c.get("actor_id") for c in (base.get("main_cast") or []) if c.get("actor_id")]
    # also include guest stars from all episodes
    for season in (base.get("seasons") or []):
        for ep in (season.get("episodes") or []):
            for g in (ep.get("guest_stars") or []):
                if g.get("actor_id"):
                    main_cast_ids.append(g.get("actor_id"))
    base_year = _year_from(base.get("first_air_date"))
    base_collections = base.get("collection_ids") or []
    scored = await _collect_related_series(genres, main_cast_ids, base_year, base_collections, exclude_series_id=base["_id"])
    out = []
    for _s, d in scored[:limit]:
        item = await enrich_series(d, deep=False)
        item["type"] = "series"
        out.append(item)
    return out

@api_router.patch("/series/{series_id}")
async def update_series(series_id: str, payload: SeriesUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data = _serialize_series_payload(update_data)
    old_doc = await db.series.find_one({"_id": ObjectId(series_id)}) or {}
    _check_locks(old_doc, update_data, user)
    is_mod = user.get("role") in ("moderator", "admin") or user.get("effective_role") in ("moderator", "admin")
    if "locked_cast_actor_ids" in update_data and not is_mod:
        update_data.pop("locked_cast_actor_ids", None)
    if "locked_guest_stars" in update_data and not is_mod:
        update_data.pop("locked_guest_stars", None)
    # Enforce main_cast locks
    if "main_cast" in update_data:
        update_data["main_cast"] = _enforce_cast_locks(
            old_doc.get("main_cast") or [],
            update_data["main_cast"],
            old_doc.get("locked_cast_actor_ids") or [],
            is_mod,
        )
    # Episodes & seasons cannot be deleted by non-mods — restore any that went missing BEFORE enforcing guest locks.
    if "seasons" in update_data:
        update_data["seasons"] = _enforce_season_episode_integrity(
            old_doc.get("seasons") or [],
            update_data["seasons"],
            user,
        )
    _enforce_image_delete_guard(old_doc, update_data, user, single_fields=["poster_url", "backdrop_url", "network_logo_url"], gallery_fields=["gallery"])
    _enforce_series_episode_image_guard(old_doc, update_data, user)
    # Enforce per-episode guest_star locks
    if "seasons" in update_data and not is_mod:
        locked_gs = set(old_doc.get("locked_guest_stars") or [])
        if locked_gs:
            # Build quick lookup: season_number -> episode_number -> old guest_stars list
            old_lookup = {}
            for sn in old_doc.get("seasons") or []:
                sn_num = sn.get("season_number")
                for ep in sn.get("episodes") or []:
                    ep_num = ep.get("episode_number")
                    old_lookup[(sn_num, ep_num)] = ep.get("guest_stars") or []
            for sn in update_data["seasons"]:
                sn_num = sn.get("season_number")
                for ep in sn.get("episodes") or []:
                    ep_num = ep.get("episode_number")
                    old_guests = old_lookup.get((sn_num, ep_num), [])
                    locked_for_ep = [og for og in old_guests if f"{sn_num}:{ep_num}:{og.get('actor_id')}" in locked_gs]
                    locked_ids = {og.get("actor_id") for og in locked_for_ep}
                    ep["guest_stars"] = _enforce_cast_locks(
                        old_guests,
                        ep.get("guest_stars") or [],
                        list(locked_ids),
                        is_mod,
                    )
    await db.series.update_one({"_id": ObjectId(series_id)}, {"$set": update_data})
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    enriched = await enrich_series(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "series", series_id, "update", enriched["title"], f"Updated {changed_names}", changes)
    return enriched

@api_router.post("/series/{series_id}/cast-lock")
async def toggle_series_cast_lock(series_id: str, payload: dict, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.lock_cast", "You don't have permission to lock cast members.")
    actor_id = (payload or {}).get("actor_id")
    if not actor_id:
        raise HTTPException(status_code=400, detail="actor_id required")
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    current = list(doc.get("locked_cast_actor_ids") or [])
    if actor_id in current:
        current.remove(actor_id); action = "unlock"
    else:
        current.append(actor_id); action = "lock"
    await db.series.update_one({"_id": doc["_id"]}, {"$set": {"locked_cast_actor_ids": current}})
    await log_edit(mod, "series", series_id, "cast-lock", doc.get("title", ""), f"{action} main cast actor {actor_id}")
    return {"ok": True, "locked_cast_actor_ids": current}

@api_router.post("/series/{series_id}/guest-star-lock")
async def toggle_series_guest_lock(series_id: str, payload: dict, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.lock_cast", "You don't have permission to lock guest stars.")
    sn = (payload or {}).get("season_number")
    ep = (payload or {}).get("episode_number")
    actor_id = (payload or {}).get("actor_id")
    if sn is None or ep is None or not actor_id:
        raise HTTPException(status_code=400, detail="season_number, episode_number and actor_id required")
    key = f"{sn}:{ep}:{actor_id}"
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    current = list(doc.get("locked_guest_stars") or [])
    if key in current:
        current.remove(key); action = "unlock"
    else:
        current.append(key); action = "lock"
    await db.series.update_one({"_id": doc["_id"]}, {"$set": {"locked_guest_stars": current}})
    await log_edit(mod, "series", series_id, "guest-lock", doc.get("title", ""), f"{action} guest star {key}")
    return {"ok": True, "locked_guest_stars": current}

@api_router.patch("/series/{series_id}/lock")
async def lock_series_fields(series_id: str, payload: LockUpdate, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.protect_fields", "You don't have permission to protect fields.")
    old = await db.series.find_one({"_id": ObjectId(series_id)}) or {}
    prev = old.get("locked_fields", []) or []
    await db.series.update_one({"_id": ObjectId(series_id)}, {"$set": {"locked_fields": payload.locked_fields}})
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    enriched = await enrich_series(doc)
    changes = [{"field": "locked_fields", "before": ", ".join(prev) or "—", "after": ", ".join(payload.locked_fields) or "—"}]
    await log_edit(mod, "series", series_id, "lock", enriched["title"], "Updated field locks", changes)
    return enriched

@api_router.delete("/series/{series_id}")
async def delete_series(series_id: str, user: dict = Depends(get_current_moderator)):
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    title = doc.get("title", "")
    if doc.get("deleted"):
        return {"ok": True, "already_deleted": True}
    await db.series.update_one(
        {"_id": ObjectId(series_id)},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user["id"],
            "deleted_by_name": user.get("name"),
        }},
    )
    await log_edit(user, "series", series_id, "delete", title, f"Deleted series \"{title}\"")
    return {"ok": True}

# ----------- Global Search -----------
@api_router.get("/search")
async def global_search(q: str, limit: int = 20):
    q = q.strip()
    if not q:
        return {"movies": [], "series": [], "actors": []}
    # actors
    actor_docs = []
    actor_ids_str = []
    async for a in db.actors.find(_alive({"name": {"$regex": q, "$options": "i"}})).limit(limit):
        actor_ids_str.append(str(a["_id"]))
        actor_docs.append(doc_to_dict(a))
    # movies: title, genre, or cast actor
    m_or = [
        {"title": {"$regex": q, "$options": "i"}},
        {"genres": {"$regex": q, "$options": "i"}},
    ]
    if actor_ids_str:
        m_or.append({"cast.actor_id": {"$in": actor_ids_str}})
    movies = []
    async for d in db.movies.find(_alive({"$or": m_or})).limit(limit):
        movies.append(await enrich_movie(d))
    # series
    s_or = [
        {"title": {"$regex": q, "$options": "i"}},
        {"genres": {"$regex": q, "$options": "i"}},
    ]
    if actor_ids_str:
        s_or.append({"main_cast.actor_id": {"$in": actor_ids_str}})
        s_or.append({"seasons.episodes.guest_stars.actor_id": {"$in": actor_ids_str}})
    series_docs = []
    async for d in db.series.find(_alive({"$or": s_or})).limit(limit):
        series_docs.append(await enrich_series(d, deep=False))
    return {"movies": movies, "series": series_docs, "actors": actor_docs}


@api_router.get("/search/suggest")
async def search_suggest(q: str, limit: int = 6):
    """Lightweight typeahead: returns compact rows (id, title/name, kind, poster/photo, year). Title-prefix bias."""
    q = q.strip()
    if not q or len(q) < 1:
        return {"movies": [], "series": [], "actors": []}
    # Escape regex special chars, then anchor with case-insensitive contains
    esc = re.escape(q)
    rx = {"$regex": esc, "$options": "i"}
    # Movies (title only for speed)
    movies = []
    async for d in db.movies.find(
        _alive({"title": rx}),
        {"title": 1, "poster_url": 1, "release_date": 1},
    ).limit(limit):
        movies.append({
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "poster_url": d.get("poster_url", ""),
            "year": (d.get("release_date") or "")[:4],
            "kind": "movie",
        })
    # Series
    series_out = []
    async for d in db.series.find(
        _alive({"title": rx}),
        {"title": 1, "poster_url": 1, "first_air_date": 1},
    ).limit(limit):
        series_out.append({
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "poster_url": d.get("poster_url", ""),
            "year": (d.get("first_air_date") or "")[:4],
            "kind": "series",
        })
    # Actors
    actors_out = []
    async for a in db.actors.find(
        _alive({"name": rx}),
        {"name": 1, "photo_url": 1},
    ).limit(limit):
        actors_out.append({
            "id": str(a["_id"]),
            "title": a.get("name", ""),
            "poster_url": a.get("photo_url", ""),
            "year": "",
            "kind": "actor",
        })
    # Simple prefix bias: items whose title starts with the query float to the top of each list
    def bias(items):
        low = q.lower()
        starts = [x for x in items if x["title"].lower().startswith(low)]
        rest = [x for x in items if not x["title"].lower().startswith(low)]
        return starts + rest
    return {"movies": bias(movies), "series": bias(series_out), "actors": bias(actors_out)}


# ----------- Actors -----------
@api_router.post("/actors")
async def create_actor(payload: ActorCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    name = (doc.get("name") or "").strip()
    if name:
        existing = await db.actors.find_one(_alive({
            "name": {"$regex": f"^\\s*{re.escape(name)}\\s*$", "$options": "i"},
        }))
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"An actor named \"{existing.get('name')}\" already exists (id={str(existing['_id'])}).",
            )
    doc["name"] = name
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user["id"]
    result = await db.actors.insert_one(doc)
    doc["_id"] = result.inserted_id
    dd = doc_to_dict(doc)
    await log_edit(user, "actor", dd["id"], "create", dd["name"], f"Created actor \"{dd['name']}\"")
    return dd

@api_router.get("/actors")
async def list_actors(q: Optional[str] = None, limit: Optional[int] = None):
    filter_query = {}
    if q:
        filter_query["name"] = {"$regex": q, "$options": "i"}
    cursor = db.actors.find(_alive(filter_query))
    if limit:
        cursor = cursor.limit(limit)
    return [doc_to_dict(d) async for d in cursor]

@api_router.get("/actors/{actor_id}")
async def get_actor(actor_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Actor not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Actor not found")
    if doc.get("deleted") and not (viewer and viewer.get("effective_role") in ("moderator", "admin")):
        raise HTTPException(status_code=404, detail="Actor not found")
    actor = doc_to_dict(doc)
    # find movies with this actor in cast
    movies_cursor = db.movies.find(_alive({"cast.actor_id": actor_id}))
    movies = []
    async for m in movies_cursor:
        m_dict = await enrich_movie(m)
        for c in m_dict.get("cast", []):
            if c.get("actor_id") == actor_id:
                m_dict["character_name"] = c.get("character_name")
                break
        movies.append(m_dict)
    actor["movies"] = movies

    # find series where actor is in main_cast
    series_main = []
    async for s in db.series.find(_alive({"main_cast.actor_id": actor_id})):
        s_dict = await enrich_series(s, deep=False)
        for c in s_dict.get("main_cast", []):
            if c.get("actor_id") == actor_id:
                s_dict["character_name"] = c.get("character_name")
                break
        series_main.append(s_dict)
    actor["series"] = series_main

    # find guest star episodes
    guest_episodes = []
    async for s in db.series.find(_alive({"seasons.episodes.guest_stars.actor_id": actor_id})):
        sid = str(s["_id"])
        for season in s.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                for gs in ep.get("guest_stars", []) or []:
                    if gs.get("actor_id") == actor_id:
                        guest_episodes.append({
                            "series_id": sid,
                            "series_title": s.get("title"),
                            "series_poster_url": s.get("poster_url", ""),
                            "season_number": season.get("season_number"),
                            "episode_number": ep.get("episode_number"),
                            "episode_name": ep.get("name"),
                            "air_date": ep.get("air_date"),
                            "character_name": gs.get("character_name"),
                        })
    # sort by season/episode
    guest_episodes.sort(key=lambda x: (x.get("season_number") or 0, x.get("episode_number") or 0))
    actor["guest_episodes"] = guest_episodes
    return actor

@api_router.patch("/actors/{actor_id}")
async def update_actor(actor_id: str, payload: ActorUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    old_doc = await db.actors.find_one({"_id": ObjectId(actor_id)}) or {}
    _enforce_image_delete_guard(old_doc, update_data, user, single_fields=["photo_url"], gallery_fields=["gallery"])
    _check_locks(old_doc, update_data, user)
    await db.actors.update_one({"_id": ObjectId(actor_id)}, {"$set": update_data})
    doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    dd = doc_to_dict(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "actor", actor_id, "update", dd["name"], f"Updated {changed_names}", changes)
    return dd

@api_router.patch("/actors/{actor_id}/lock")
async def lock_actor_fields(actor_id: str, payload: LockUpdate, mod: dict = Depends(get_current_user)):
    _require_perm(mod, "content.protect_fields", "You don't have permission to protect fields.")
    old = await db.actors.find_one({"_id": ObjectId(actor_id)}) or {}
    prev = old.get("locked_fields", []) or []
    await db.actors.update_one({"_id": ObjectId(actor_id)}, {"$set": {"locked_fields": payload.locked_fields}})
    doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    dd = doc_to_dict(doc)
    changes = [{"field": "locked_fields", "before": ", ".join(prev) or "—", "after": ", ".join(payload.locked_fields) or "—"}]
    await log_edit(mod, "actor", actor_id, "lock", dd["name"], "Updated field locks", changes)
    return dd

@api_router.delete("/actors/{actor_id}")
async def delete_actor(actor_id: str, user: dict = Depends(get_current_moderator)):
    doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Actor not found")
    name = doc.get("name", "")
    if doc.get("deleted"):
        return {"ok": True, "already_deleted": True}
    await db.actors.update_one(
        {"_id": ObjectId(actor_id)},
        {"$set": {
            "deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": user["id"],
            "deleted_by_name": user.get("name"),
        }},
    )
    await log_edit(user, "actor", actor_id, "delete", name, f"Deleted actor \"{name}\"")
    return {"ok": True}

# ----------- Trash / Restore (Moderator) -----------
def _serialize_deleted(kind: str, d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "type": kind,
        "title": d.get("title") or d.get("name") or "",
        "poster_url": d.get("poster_url") or d.get("photo_url") or "",
        "deleted_at": d.get("deleted_at"),
        "deleted_by": d.get("deleted_by"),
        "deleted_by_name": d.get("deleted_by_name"),
        "release_date": d.get("release_date") or d.get("first_air_date"),
    }

@api_router.get("/moderation/trash")
async def list_trash(mod: dict = Depends(get_current_moderator)):
    movies = [_serialize_deleted("movie", d) async for d in db.movies.find({"deleted": True}).sort("deleted_at", -1)]
    series = [_serialize_deleted("series", d) async for d in db.series.find({"deleted": True}).sort("deleted_at", -1)]
    actors = [_serialize_deleted("actor", d) async for d in db.actors.find({"deleted": True}).sort("deleted_at", -1)]
    return {"movies": movies, "series": series, "actors": actors}

@api_router.post("/moderation/{kind}/{entity_id}/restore")
async def restore_entity(kind: str, entity_id: str, mod: dict = Depends(get_current_moderator)):
    coll = {"movie": db.movies, "series": db.series, "actor": db.actors}.get(kind)
    if coll is None:
        raise HTTPException(status_code=400, detail="Invalid entity kind")
    try:
        doc = await coll.find_one({"_id": ObjectId(entity_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if not doc.get("deleted"):
        return {"ok": True, "already_restored": True}
    await coll.update_one(
        {"_id": ObjectId(entity_id)},
        {
            "$set": {"deleted": False, "restored_at": datetime.now(timezone.utc).isoformat(), "restored_by": mod["id"], "restored_by_name": mod.get("name")},
            "$unset": {"deleted_at": "", "deleted_by": "", "deleted_by_name": ""},
        },
    )
    label = doc.get("title") or doc.get("name") or ""
    await log_edit(mod, kind, entity_id, "restore", label, f"Restored {kind} \"{label}\"")
    return {"ok": True}

@api_router.delete("/moderation/{kind}/{entity_id}/purge")
async def purge_entity(kind: str, entity_id: str, admin: dict = Depends(get_current_admin)):
    """Permanently delete a soft-deleted entity. Admin only."""
    coll = {"movie": db.movies, "series": db.series, "actor": db.actors}.get(kind)
    if coll is None:
        raise HTTPException(status_code=400, detail="Invalid entity kind")
    try:
        doc = await coll.find_one({"_id": ObjectId(entity_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if not doc.get("deleted"):
        raise HTTPException(status_code=400, detail="Entity is not in trash. Delete it first.")
    label = doc.get("title") or doc.get("name") or ""
    await coll.delete_one({"_id": ObjectId(entity_id)})
    if kind == "movie":
        await db.reviews.delete_many({"movie_id": entity_id})
    elif kind == "series":
        await db.reviews.delete_many({"series_id": entity_id})
    await log_edit(admin, kind, entity_id, "purge", label, f"Permanently deleted {kind} \"{label}\"")
    return {"ok": True}

# ----------- Scheduled: auto-lift expired suspensions -----------
async def _lift_expired_suspensions() -> int:
    """Unset suspension fields for any user whose temporary suspension has elapsed."""
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.users.update_many(
        {
            "suspended_until": {"$exists": True, "$ne": "permanent", "$lt": now_iso},
        },
        {"$unset": {"suspended_until": "", "suspension_reason": "", "suspended_by": "", "suspended_by_name": "", "suspended_at": ""}},
    )
    return res.modified_count

def _verify_cron_auth(authorization: Optional[str]) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET") or ""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")

@api_router.post("/cron/lift-suspensions")
async def cron_lift_suspensions(request: Request, authorization: Optional[str] = Header(default=None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _verify_cron_auth(authorization)
    run_id = request.headers.get("X-Webhook-Id") or ""
    if run_id:
        try:
            already = await db.cron_runs.find_one({"run_id": run_id, "job": "lift-suspensions"})
        except Exception:
            already = None
        if already:
            return {"ok": True, "duplicate": True}
        try:
            await db.cron_runs.insert_one({
                "run_id": run_id,
                "job": "lift-suspensions",
                "at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass
    import asyncio
    asyncio.create_task(_lift_expired_suspensions())
    return {"ok": True, "queued": True}

# ----------- Reviews -----------
@api_router.post("/movies/{movie_id}/reviews")
async def create_review(movie_id: str, payload: ReviewCreate, user: dict = Depends(get_current_user)):
    doc = {
        "movie_id": movie_id,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "rating": payload.rating,
        "text": payload.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # upsert per user per movie
    await db.reviews.update_one(
        {"movie_id": movie_id, "user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/movies/{movie_id}/reviews")
async def list_reviews(movie_id: str):
    cursor = db.reviews.find({"movie_id": movie_id}).sort("created_at", -1)
    return [doc_to_dict(d) async for d in cursor]

@api_router.post("/series/{series_id}/reviews")
async def create_series_review(series_id: str, payload: ReviewCreate, user: dict = Depends(get_current_user)):
    try:
        exists = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not exists or exists.get("deleted"):
        raise HTTPException(status_code=404, detail="Series not found")
    doc = {
        "series_id": series_id,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "rating": payload.rating,
        "text": payload.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.update_one(
        {"series_id": series_id, "user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/series/{series_id}/reviews")
async def list_series_reviews(series_id: str):
    cursor = db.reviews.find({"series_id": series_id}).sort("created_at", -1)
    return [doc_to_dict(d) async for d in cursor]

# ----------- Watchlist -----------
@api_router.post("/watchlist/{movie_id}")
async def add_watchlist(movie_id: str, user: dict = Depends(get_current_user)):
    await db.watchlist.update_one(
        {"user_id": user["id"], "movie_id": movie_id},
        {"$set": {"user_id": user["id"], "movie_id": movie_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/watchlist/{movie_id}")
async def remove_watchlist(movie_id: str, user: dict = Depends(get_current_user)):
    await db.watchlist.delete_one({"user_id": user["id"], "movie_id": movie_id})
    return {"ok": True}

@api_router.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    cursor = db.watchlist.find({"user_id": user["id"]}).sort("created_at", -1)
    movie_ids = []
    async for w in cursor:
        movie_ids.append(w["movie_id"])
    if not movie_ids:
        return []
    object_ids = []
    for mid in movie_ids:
        try:
            object_ids.append(ObjectId(mid))
        except Exception:
            pass
    movies = []
    cur = db.movies.find(_alive({"_id": {"$in": object_ids}}))
    async for m in cur:
        movies.append(await enrich_movie(m))
    return movies

# ----------- Genres -----------
@api_router.get("/genres")
async def genres():
    result = await db.movies.distinct("genres")
    return sorted([g for g in result if g])

# ----------- Uploads -----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), _user: dict = Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] or "bin").lower()
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/admin/{file_id}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    backend_url = os.environ.get("FRONTEND_URL", "").replace("http://localhost:3000", "")
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api_router.get("/files/{path:path}")
async def download_file(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return FastAPIResponse(content=data, media_type=content_type)

# ----------- Startup -----------
@app.on_event("startup")
async def startup():
    # ensure indexes
    await db.users.create_index("email", unique=True)
    await db.movies.create_index("title")
    await db.actors.create_index("name")
    await db.series.create_index("title")
    await db.watchlist.create_index([("user_id", 1), ("movie_id", 1)], unique=True)
    # Movie reviews unique per (movie_id, user_id) — only when movie_id is set (allows series reviews)
    try:
        await db.reviews.drop_index("movie_id_1_user_id_1")
    except Exception:
        pass
    await db.reviews.create_index(
        [("movie_id", 1), ("user_id", 1)],
        unique=True,
        partialFilterExpression={"movie_id": {"$exists": True}},
        name="movie_id_1_user_id_1",
    )
    await db.reviews.create_index(
        [("series_id", 1), ("user_id", 1)],
        unique=True,
        partialFilterExpression={"series_id": {"$exists": True}},
        name="series_id_1_user_id_1",
    )

    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@cineverse.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}})
        logger.info(f"Updated admin password: {admin_email}")

    # init storage
    init_storage()

# ----------- Collections (Franchises) -----------
class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    poster_url: str = ""
    backdrop_url: str = ""

class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None

def _year_key(d: dict) -> str:
    return (d.get("release_date") or d.get("first_air_date") or "9999") or "9999"

async def _collections_for_ids(ids: List[str]) -> List[dict]:
    if not ids:
        return []
    oids = []
    for i in ids:
        try:
            oids.append(ObjectId(i))
        except Exception:
            pass
    out = []
    async for c in db.collections.find({"_id": {"$in": oids}}):
        out.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "description": c.get("description", ""),
            "poster_url": c.get("poster_url", ""),
            "backdrop_url": c.get("backdrop_url", ""),
        })
    # preserve caller order
    order = {i: idx for idx, i in enumerate(ids)}
    out.sort(key=lambda x: order.get(x["id"], 9999))
    return out

@api_router.get("/collections")
async def list_collections(q: Optional[str] = None, limit: int = 200):
    query: dict = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    result = []
    async for c in db.collections.find(query).sort("name", 1).limit(limit):
        cid = str(c["_id"])
        movie_count = await db.movies.count_documents(_alive({"collection_ids": cid}))
        series_count = await db.series.count_documents(_alive({"collection_ids": cid}))
        result.append({
            "id": cid,
            "name": c.get("name", ""),
            "description": c.get("description", ""),
            "poster_url": c.get("poster_url", ""),
            "backdrop_url": c.get("backdrop_url", ""),
            "movie_count": movie_count,
            "series_count": series_count,
            "total_count": movie_count + series_count,
        })
    return result

@api_router.get("/collections/{collection_id}")
async def get_collection(collection_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    try:
        c = await db.collections.find_one({"_id": ObjectId(collection_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Collection not found")
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    include_deleted = bool(viewer and viewer.get("effective_role") in ("moderator", "admin"))
    alive = {} if include_deleted else {"$or": [{"deleted": {"$exists": False}}, {"deleted": False}]}

    titles = []
    async for m in db.movies.find({**alive, "collection_ids": collection_id}):
        titles.append({
            "kind": "movie",
            "id": str(m["_id"]),
            "title": m.get("title", ""),
            "year": (m.get("release_date") or "")[:4],
            "release_date": m.get("release_date") or "",
            "poster_url": m.get("poster_url", ""),
            "backdrop_url": m.get("backdrop_url", ""),
            "synopsis": m.get("synopsis", ""),
        })
    async for s in db.series.find({**alive, "collection_ids": collection_id}):
        titles.append({
            "kind": "series",
            "id": str(s["_id"]),
            "title": s.get("title", ""),
            "year": (s.get("first_air_date") or "")[:4],
            "first_air_date": s.get("first_air_date") or "",
            "poster_url": s.get("poster_url", ""),
            "backdrop_url": s.get("backdrop_url", ""),
            "synopsis": s.get("synopsis", ""),
        })
    titles.sort(key=lambda t: (t.get("release_date") or t.get("first_air_date") or "9999", t.get("title", "")))
    return {
        "id": str(c["_id"]),
        "name": c.get("name", ""),
        "description": c.get("description", ""),
        "poster_url": c.get("poster_url", ""),
        "backdrop_url": c.get("backdrop_url", ""),
        "titles": titles,
    }

@api_router.post("/collections")
async def create_collection(payload: CollectionCreate, mod: dict = Depends(get_current_moderator)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.collections.find_one({"name": {"$regex": f"^\\s*{re.escape(name)}\\s*$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="A collection with that name already exists.")
    doc = {
        "name": name,
        "description": payload.description or "",
        "poster_url": payload.poster_url or "",
        "backdrop_url": payload.backdrop_url or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": mod["id"],
    }
    result = await db.collections.insert_one(doc)
    cid = str(result.inserted_id)
    await log_edit(mod, "collection", cid, "create", name, f"Created collection \"{name}\"")
    return {"id": cid, **{k: doc[k] for k in ("name", "description", "poster_url", "backdrop_url")}}

@api_router.patch("/collections/{collection_id}")
async def update_collection(collection_id: str, payload: CollectionUpdate, mod: dict = Depends(get_current_moderator)):
    try:
        c = await db.collections.find_one({"_id": ObjectId(collection_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Collection not found")
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(status_code=400, detail="Name required")
    if updates:
        await db.collections.update_one({"_id": c["_id"]}, {"$set": updates})
    fresh = await db.collections.find_one({"_id": c["_id"]})
    await log_edit(mod, "collection", collection_id, "update", fresh.get("name", ""), "Updated collection", compute_field_changes(c, updates))
    return {"id": collection_id, **{k: fresh.get(k, "") for k in ("name", "description", "poster_url", "backdrop_url")}}

@api_router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, mod: dict = Depends(get_current_moderator)):
    try:
        c = await db.collections.find_one({"_id": ObjectId(collection_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Collection not found")
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    # Detach all titles first
    await db.movies.update_many({"collection_ids": collection_id}, {"$pull": {"collection_ids": collection_id}})
    await db.series.update_many({"collection_ids": collection_id}, {"$pull": {"collection_ids": collection_id}})
    await db.collections.delete_one({"_id": c["_id"]})
    await log_edit(mod, "collection", collection_id, "delete", c.get("name", ""), "Deleted collection")
    return {"ok": True}

class CollectionMembership(BaseModel):
    title_type: str  # "movie" | "series"
    title_id: str

@api_router.post("/collections/{collection_id}/add")
async def add_to_collection(collection_id: str, payload: CollectionMembership, mod: dict = Depends(get_current_moderator)):
    if payload.title_type not in ("movie", "series"):
        raise HTTPException(status_code=400, detail="Invalid title_type")
    try:
        c = await db.collections.find_one({"_id": ObjectId(collection_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Collection not found")
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    coll = db.movies if payload.title_type == "movie" else db.series
    try:
        target_oid = ObjectId(payload.title_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Title not found")
    target = await coll.find_one({"_id": target_oid})
    if not target:
        raise HTTPException(status_code=404, detail="Title not found")
    await coll.update_one({"_id": target_oid}, {"$addToSet": {"collection_ids": collection_id}})
    return {"ok": True}

@api_router.post("/collections/{collection_id}/remove")
async def remove_from_collection(collection_id: str, payload: CollectionMembership, mod: dict = Depends(get_current_moderator)):
    if payload.title_type not in ("movie", "series"):
        raise HTTPException(status_code=400, detail="Invalid title_type")
    coll = db.movies if payload.title_type == "movie" else db.series
    try:
        target_oid = ObjectId(payload.title_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Title not found")
    await coll.update_one({"_id": target_oid}, {"$pull": {"collection_ids": collection_id}})
    return {"ok": True}

@api_router.get("/sitemap.xml")
async def sitemap():
    """XML sitemap listing every public movie, series, actor and collection."""
    base = os.environ.get("PUBLIC_SITE_URL", "").rstrip("/")
    urls: List[str] = []
    # Static pages
    for path in ["/", "/browse", "/forums"]:
        urls.append(path)
    async for d in db.movies.find(_alive(), {"_id": 1, "updated_at": 1, "created_at": 1}):
        urls.append(f"/movie/{str(d['_id'])}")
    async for d in db.series.find(_alive(), {"_id": 1}):
        urls.append(f"/series/{str(d['_id'])}")
    async for d in db.actors.find(_alive(), {"_id": 1}):
        urls.append(f"/actor/{str(d['_id'])}")
    async for d in db.collections.find({}, {"_id": 1}):
        urls.append(f"/collection/{str(d['_id'])}")
    today = datetime.now(timezone.utc).date().isoformat()
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        loc = f"{base}{u}" if base else u
        parts.append(f"  <url><loc>{loc}</loc><lastmod>{today}</lastmod></url>")
    parts.append("</urlset>")
    xml = "\n".join(parts)
    return FastAPIResponse(content=xml, media_type="application/xml")

app.include_router(api_router)

# ----------- IP Edit-Ban Middleware -----------
# Blocks write operations (POST/PATCH/PUT/DELETE) from IPs with an active edit-scope ban.
# Login/logout and password-reset endpoints are exempt so a user doesn't get locked out of
# their own account due to a shared-network ban. Register has its own ban check inline.
_IP_EDIT_BAN_EXEMPT_PREFIXES = (
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/refresh",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/change-password",
    "/api/auth/register",  # handled inline
)

@app.middleware("http")
async def ip_edit_ban_middleware(request: Request, call_next):
    try:
        method = request.method.upper()
        path = request.url.path or ""
        if method in ("GET", "HEAD", "OPTIONS") or not path.startswith("/api/"):
            return await call_next(request)
        if any(path.startswith(p) for p in _IP_EDIT_BAN_EXEMPT_PREFIXES):
            return await call_next(request)
        ip = get_client_ip(request)
        ban = await _active_ip_ban(ip, ("edit", "both"))
        if ban:
            from fastapi.responses import JSONResponse
            msg = f"Your IP ({ip}) is banned from making changes."
            if ban.get("reason"):
                msg += f" Reason: {ban['reason']}."
            if ban.get("until") and ban.get("until") != "permanent":
                msg += f" Expires: {ban['until'][:19].replace('T', ' ')} UTC."
            return JSONResponse(status_code=403, content={"detail": msg})
    except Exception:
        # Never block requests due to middleware errors — fall through
        pass
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
