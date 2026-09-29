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

async def get_current_user(request: Request) -> dict:
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
        # check suspension
        sus = user.get("suspended_until")
        if sus:
            if sus == "permanent":
                raise HTTPException(status_code=403, detail=f"Account suspended: {user.get('suspension_reason','')}")
            try:
                until = datetime.fromisoformat(sus)
                if until > datetime.now(timezone.utc):
                    raise HTTPException(status_code=403, detail=f"Account suspended until {sus}: {user.get('suspension_reason','')}")
                else:
                    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
                    user.pop("suspended_until", None)
                    user.pop("suspension_reason", None)
            except HTTPException:
                raise
            except Exception:
                pass
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        # resolve custom role
        custom_role = None
        crid = user.get("custom_role_id")
        if crid:
            try:
                cr = await db.custom_roles.find_one({"_id": ObjectId(crid)})
                if cr:
                    perms = cr.get("permissions", []) or []
                    custom_role = {
                        "id": str(cr["_id"]),
                        "name": cr.get("name"),
                        "color": cr.get("color", "#f59e0b"),
                        "base": _derive_base(perms),
                        "permissions": perms,
                        "description": cr.get("description", ""),
                    }
            except Exception:
                pass
        user["custom_role"] = custom_role
        # effective role = highest of system role + custom_role base
        rank = {"user": 0, "moderator": 1, "admin": 2}
        eff = user.get("role", "user")
        if custom_role and rank.get(custom_role["base"], 0) > rank.get(eff, 0):
            eff = custom_role["base"]
        user["effective_role"] = eff
        # effective permissions
        eff_perms = set()
        if user.get("role") == "admin" or eff == "admin":
            eff_perms = set(PERMISSIONS_ALL)
        elif user.get("role") == "moderator" or eff == "moderator":
            eff_perms = set(PERMS_MODERATOR)
        if custom_role:
            eff_perms.update(custom_role.get("permissions") or [])
        user["permissions"] = sorted(eff_perms)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
        return await get_current_user(request)
    except HTTPException:
        return None

# ----------- Models -----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class CastMember(BaseModel):
    actor_id: str
    character_name: str

class MovieCreate(BaseModel):
    title: str
    release_date: str  # YYYY-MM-DD
    genres: List[str] = []
    synopsis: str = ""
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    runtime: Optional[int] = None
    gallery: List[str] = []
    cast: List[CastMember] = []
    is_trending: bool = False

class MovieUpdate(BaseModel):
    title: Optional[str] = None
    release_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    runtime: Optional[int] = None
    gallery: Optional[List[str]] = None
    cast: Optional[List[CastMember]] = None
    is_trending: Optional[bool] = None

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
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    status: str = "Ongoing"
    gallery: List[str] = []
    main_cast: List[CastMember] = []
    seasons: List[SeasonItem] = []
    is_trending: bool = False

class SeriesUpdate(BaseModel):
    title: Optional[str] = None
    first_air_date: Optional[str] = None
    last_air_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    status: Optional[str] = None
    gallery: Optional[List[str]] = None
    main_cast: Optional[List[CastMember]] = None
    seasons: Optional[List[SeasonItem]] = None
    is_trending: Optional[bool] = None

# ----------- Moderation Models -----------
class SuspendRequest(BaseModel):
    duration_days: Optional[int] = None  # None = permanent
    reason: str = ""

class RoleUpdate(BaseModel):
    role: str  # user / moderator / admin

class AvatarUpdate(BaseModel):
    avatar_url: str

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

# ----------- Locks -----------
class LockUpdate(BaseModel):
    locked_fields: List[str]

# ----------- Custom Roles -----------
PERMISSIONS_ALL = [
    "content.edit_locked",
    "content.delete",
    "content.lock",
    "user.suspend",
    "user.view_ips",
    "user.assign_role",
    "user.assign_custom_role",
    "thread.moderate",
    "comment.moderate",
    "roles.manage",
]
PERMS_MODERATOR = {"content.delete", "content.lock", "user.suspend", "user.view_ips", "thread.moderate", "comment.moderate", "content.edit_locked"}
PERMS_ADMIN = {"user.assign_role", "user.assign_custom_role", "roles.manage"}

def _derive_base(permissions: List[str]) -> str:
    perms = set(permissions or [])
    if perms & PERMS_ADMIN:
        return "admin"
    if perms & PERMS_MODERATOR:
        return "moderator"
    return "user"

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
    custom_role_id: Optional[str] = None

# ----------- Utility -----------
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
    doc["main_cast"] = enriched_main
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
    doc["episode_count"] = sum(len(s.get("episodes", []) or []) for s in seasons)
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

# ----------- Auth Routes -----------
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, request: Request, response: Response):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
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
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # check suspension
    sus = user.get("suspended_until")
    if sus:
        blocked = False
        if sus == "permanent":
            blocked = True
        else:
            try:
                until = datetime.fromisoformat(sus)
                if until > datetime.now(timezone.utc):
                    blocked = True
                else:
                    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"suspended_until": "", "suspension_reason": ""}})
            except Exception:
                pass
        if blocked:
            reason = user.get("suspension_reason") or ""
            when = "permanently" if sus == "permanent" else f"until {sus}"
            raise HTTPException(status_code=403, detail=f"Account suspended {when}. {reason}".strip())
    await record_user_ip(user["_id"], get_client_ip(request))
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"id": user_id, "email": email, "name": user.get("name"), "role": user.get("role", "user"), "avatar_url": user.get("avatar_url", "")}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role", "user"),
        "effective_role": user.get("effective_role", user.get("role", "user")),
        "custom_role": user.get("custom_role"),
        "avatar_url": user.get("avatar_url", ""),
        "created_at": user.get("created_at"),
    }

@api_router.patch("/auth/me/avatar")
async def update_avatar(payload: AvatarUpdate, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"avatar_url": payload.avatar_url}})
    return {"ok": True, "avatar_url": payload.avatar_url}

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

    # Hide suspended profiles from non-mods (and non-self)
    if active_sus and not viewer_is_mod and not viewer_is_self:
        raise HTTPException(status_code=404, detail="User not found")

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
    labels = {
        "content.edit_locked": "Edit fields locked by moderators",
        "content.delete": "Delete movies / series / actors",
        "content.lock": "Lock / unlock fields on content",
        "user.suspend": "Suspend and unsuspend accounts",
        "user.view_ips": "View user IPs and shared accounts",
        "user.assign_role": "Change users' system roles",
        "user.assign_custom_role": "Assign custom roles to users",
        "thread.moderate": "Close / reopen / delete threads",
        "comment.moderate": "Delete any comment on content",
        "roles.manage": "Create, edit and delete custom roles",
    }
    # group by category for UI
    groups = {"Content": [], "Users": [], "Community": [], "Admin": []}
    for k in PERMISSIONS_ALL:
        item = {"key": k, "label": labels.get(k, k), "tier": "admin" if k in PERMS_ADMIN else "moderator" if k in PERMS_MODERATOR else "user"}
        if k.startswith("content."): groups["Content"].append(item)
        elif k.startswith("user."): groups["Users"].append(item)
        elif k.startswith("thread.") or k.startswith("comment."): groups["Community"].append(item)
        else: groups["Admin"].append(item)
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
    if payload.custom_role_id:
        try:
            cr = await db.custom_roles.find_one({"_id": ObjectId(payload.custom_role_id)})
        except Exception:
            cr = None
        if not cr:
            raise HTTPException(status_code=404, detail="Custom role not found")
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"custom_role_id": payload.custom_role_id}})
        label = cr.get("name")
    else:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$unset": {"custom_role_id": ""}})
        label = "(none)"
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    await log_edit(admin, "user", user_id, "role", target.get("name", "") if target else "", f"Custom role: {label}")
    return {"ok": True}

# ----------- Edits Feed -----------
@api_router.get("/edits")
async def list_edits(entity_type: Optional[str] = None, entity_id: Optional[str] = None, limit: int = 50):
    q = {}
    if entity_type:
        q["entity_type"] = entity_type
    if entity_id:
        q["entity_id"] = entity_id
    edits = []
    async for e in db.edits.find(q).sort("created_at", -1).limit(limit):
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
async def suspend_user(user_id: str, payload: SuspendRequest, mod: dict = Depends(get_current_moderator)):
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot suspend admin")
    if payload.duration_days is None:
        until = "permanent"
        duration_label = "permanently"
    else:
        if payload.duration_days <= 0:
            raise HTTPException(status_code=400, detail="Duration must be positive")
        until = (datetime.now(timezone.utc) + timedelta(days=payload.duration_days)).isoformat()
        duration_label = f"for {payload.duration_days} day{'s' if payload.duration_days != 1 else ''}"
    await db.users.update_one({"_id": target["_id"]}, {"$set": {
        "suspended_until": until,
        "suspension_reason": payload.reason or "",
        "suspended_by": mod["id"],
        "suspended_by_name": mod.get("name"),
        "suspended_at": datetime.now(timezone.utc).isoformat(),
    }})
    changes = [
        {"field": "status", "before": "active", "after": "suspended"},
        {"field": "duration", "before": "—", "after": duration_label},
        {"field": "until", "before": "—", "after": "permanent" if until == "permanent" else until[:19].replace("T", " ")},
        {"field": "reason", "before": "—", "after": payload.reason or "(no reason)"},
    ]
    await log_edit(mod, "user", user_id, "suspend", target.get("name", ""), f"Suspended {duration_label}: {payload.reason or '(no reason)'}", changes)
    return {"ok": True, "suspended_until": until}

@api_router.post("/moderation/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, mod: dict = Depends(get_current_moderator)):
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
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
def _serialize_thread(t: dict) -> dict:
    t["id"] = str(t.pop("_id"))
    return t

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
        "created_at": now,
        "last_activity_at": now,
        "message_count": 0,
    }
    result = await db.threads.insert_one(doc)
    return _serialize_thread(doc)

@api_router.get("/threads")
async def list_threads(
    category: Optional[str] = None,
    status: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
):
    q = {}
    if category: q["category"] = category
    if status: q["status"] = status
    if entity_type: q["entity_type"] = entity_type
    if entity_id: q["entity_id"] = entity_id
    docs = []
    async for t in db.threads.find(q).sort("last_activity_at", -1).limit(limit):
        docs.append(_serialize_thread(t))
    return docs

@api_router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    t = _serialize_thread(t)
    messages = []
    async for m in db.thread_messages.find({"thread_id": thread_id}).sort("created_at", 1):
        m["id"] = str(m.pop("_id"))
        messages.append(m)
    t["messages"] = messages
    return t

@api_router.post("/threads/{thread_id}/messages")
async def post_thread_message(thread_id: str, payload: ThreadMessageCreate, user: dict = Depends(get_current_user)):
    try:
        t = await db.threads.find_one({"_id": ObjectId(thread_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Thread not found")
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    if t.get("status") == "closed" and user.get("role") not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Thread is closed")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "thread_id": thread_id,
        "text": payload.text.strip(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar_url", ""),
        "user_role": user.get("role", "user"),
        "created_at": now,
    }
    result = await db.thread_messages.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    await db.threads.update_one(
        {"_id": ObjectId(thread_id)},
        {"$set": {"last_activity_at": now}, "$inc": {"message_count": 1}},
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
    # also log system message
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
    return {"ok": True}

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
    doc["cast"] = [c if isinstance(c, dict) else c.model_dump() for c in doc.get("cast", [])]
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
    limit: int = 60,
):
    filter_query: dict = {}
    if q:
        # search title/genre/actor names
        actor_ids = []
        actor_cursor = db.actors.find({"name": {"$regex": q, "$options": "i"}}, {"_id": 1})
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
    cursor = db.movies.find(filter_query).limit(limit)
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
    cursor = db.movies.find({"is_trending": True}).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    if not docs:
        # fallback: top rated
        all_cursor = db.movies.find({}).limit(30)
        async for d in all_cursor:
            docs.append(await enrich_movie(d))
        docs.sort(key=lambda x: (x.get("avg_rating") or 0), reverse=True)
        docs = docs[:limit]
    return docs

@api_router.get("/movies/recent")
async def recent_movies(limit: int = 12):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cursor = db.movies.find({"release_date": {"$lte": today}}).sort("created_at", -1).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    return docs

@api_router.get("/movies/upcoming")
async def upcoming_movies(limit: int = 12):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cursor = db.movies.find({"release_date": {"$gt": today}}).sort("release_date", 1).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    return docs

@api_router.get("/movies/{movie_id}")
async def get_movie(movie_id: str):
    try:
        doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")
    return await enrich_movie(doc)

def _year_from(s: Optional[str]) -> Optional[int]:
    if not s or not isinstance(s, str) or len(s) < 4:
        return None
    try:
        return int(s[:4])
    except Exception:
        return None

def _score_related(base_genres: set, base_actors: set, base_year: Optional[int],
                   d_genres: set, d_actors: set, d_year: Optional[int]) -> int:
    score = len(d_genres & base_genres) * 2 + len(d_actors & base_actors) * 3
    if base_year is not None and d_year is not None:
        diff = abs(base_year - d_year)
        if diff == 0:
            score += 3
        elif diff <= 2:
            score += 2
        elif diff <= 5:
            score += 1
    return score

async def _collect_related(base_genres: list, base_actors: list, base_year: Optional[int],
                           exclude_movie_id=None, exclude_series_id=None):
    """Search both movies and series for items sharing genres/actors, score and return sorted list."""
    genre_set = set(base_genres or [])
    actor_set = set(base_actors or [])
    if not genre_set and not actor_set:
        return []

    # Movies candidates
    m_or = []
    if genre_set:
        m_or.append({"genres": {"$in": list(genre_set)}})
    if actor_set:
        m_or.append({"cast.actor_id": {"$in": list(actor_set)}})
    m_filter = {"$or": m_or}
    if exclude_movie_id is not None:
        m_filter = {"$and": [{"_id": {"$ne": exclude_movie_id}}, m_filter]}

    # Series candidates
    s_or = []
    if genre_set:
        s_or.append({"genres": {"$in": list(genre_set)}})
    if actor_set:
        s_or.append({"main_cast.actor_id": {"$in": list(actor_set)}})
        s_or.append({"seasons.episodes.guest_stars.actor_id": {"$in": list(actor_set)}})
    s_filter = {"$or": s_or}
    if exclude_series_id is not None:
        s_filter = {"$and": [{"_id": {"$ne": exclude_series_id}}, s_filter]}

    scored = []
    async for d in db.movies.find(m_filter).limit(80):
        d_genres = set(d.get("genres") or [])
        d_actors = {c.get("actor_id") for c in (d.get("cast") or []) if c.get("actor_id")}
        d_year = _year_from(d.get("release_date"))
        score = _score_related(genre_set, actor_set, base_year, d_genres, d_actors, d_year)
        if score > 0:
            scored.append((score, "movie", d))
    async for d in db.series.find(s_filter).limit(80):
        d_genres = set(d.get("genres") or [])
        d_actors = {c.get("actor_id") for c in (d.get("main_cast") or []) if c.get("actor_id")}
        for season in (d.get("seasons") or []):
            for ep in (season.get("episodes") or []):
                for g in (ep.get("guest_stars") or []):
                    if g.get("actor_id"):
                        d_actors.add(g.get("actor_id"))
        d_year = _year_from(d.get("first_air_date"))
        score = _score_related(genre_set, actor_set, base_year, d_genres, d_actors, d_year)
        if score > 0:
            scored.append((score, "series", d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored

@api_router.get("/movies/{movie_id}/similar")
async def similar_movies(movie_id: str, limit: int = 12):
    try:
        base = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not base:
        raise HTTPException(status_code=404, detail="Movie not found")
    genres = base.get("genres") or []
    cast_actor_ids = [c.get("actor_id") for c in (base.get("cast") or []) if c.get("actor_id")]
    base_year = _year_from(base.get("release_date"))
    scored = await _collect_related(genres, cast_actor_ids, base_year, exclude_movie_id=base["_id"])
    out = []
    for _s, kind, d in scored[:limit]:
        if kind == "movie":
            item = await enrich_movie(d)
            item["type"] = "movie"
        else:
            item = await enrich_series(d, deep=False)
            item["type"] = "series"
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
    if "cast" in update_data:
        update_data["cast"] = [c if isinstance(c, dict) else c.model_dump() for c in update_data["cast"]]
    old_doc = await db.movies.find_one({"_id": ObjectId(movie_id)}) or {}
    _check_locks(old_doc, update_data, user)
    await db.movies.update_one({"_id": ObjectId(movie_id)}, {"$set": update_data})
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    enriched = await enrich_movie(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "movie", movie_id, "update", enriched["title"], f"Updated {changed_names}", changes)
    return enriched

@api_router.patch("/movies/{movie_id}/lock")
async def lock_movie_fields(movie_id: str, payload: LockUpdate, mod: dict = Depends(get_current_moderator)):
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
    title = doc.get("title", "") if doc else ""
    await db.movies.delete_one({"_id": ObjectId(movie_id)})
    await db.reviews.delete_many({"movie_id": movie_id})
    await log_edit(user, "movie", movie_id, "delete", title, f"Deleted movie \"{title}\"")
    return {"ok": True}

# ----------- Series -----------
def _serialize_series_payload(data: dict) -> dict:
    if "main_cast" in data and data["main_cast"] is not None:
        data["main_cast"] = [c if isinstance(c, dict) else c.model_dump() for c in data["main_cast"]]
    if "seasons" in data and data["seasons"] is not None:
        out_seasons = []
        for s in data["seasons"]:
            s = s if isinstance(s, dict) else s.model_dump()
            eps = []
            for ep in s.get("episodes", []) or []:
                ep = ep if isinstance(ep, dict) else ep.model_dump()
                gs = [(g if isinstance(g, dict) else g.model_dump()) for g in ep.get("guest_stars", []) or []]
                ep["guest_stars"] = gs
                eps.append(ep)
            s["episodes"] = eps
            out_seasons.append(s)
        data["seasons"] = out_seasons
    return data

@api_router.post("/series")
async def create_series(payload: SeriesCreate, user: dict = Depends(get_current_user)):
    doc = _serialize_series_payload(payload.model_dump())
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
    limit: int = 60,
):
    filter_query: dict = {}
    if q:
        actor_ids = []
        async for a in db.actors.find({"name": {"$regex": q, "$options": "i"}}, {"_id": 1}):
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
    cursor = db.series.find(filter_query).limit(limit)
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
    async for d in db.series.find({"is_trending": True}).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    if not docs:
        async for d in db.series.find({}).sort("created_at", -1).limit(limit):
            docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/recent")
async def recent_series(limit: int = 12):
    docs = []
    async for d in db.series.find({}).sort("created_at", -1).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/{series_id}")
async def get_series(series_id: str):
    try:
        doc = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    return await enrich_series(doc)

@api_router.get("/series/{series_id}/similar")
async def similar_series(series_id: str, limit: int = 12):
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
    scored = await _collect_related(genres, main_cast_ids, base_year, exclude_series_id=base["_id"])
    out = []
    for _s, kind, d in scored[:limit]:
        if kind == "movie":
            item = await enrich_movie(d)
            item["type"] = "movie"
        else:
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
    await db.series.update_one({"_id": ObjectId(series_id)}, {"$set": update_data})
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    enriched = await enrich_series(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "series", series_id, "update", enriched["title"], f"Updated {changed_names}", changes)
    return enriched

@api_router.patch("/series/{series_id}/lock")
async def lock_series_fields(series_id: str, payload: LockUpdate, mod: dict = Depends(get_current_moderator)):
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
    title = doc.get("title", "") if doc else ""
    await db.series.delete_one({"_id": ObjectId(series_id)})
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
    async for a in db.actors.find({"name": {"$regex": q, "$options": "i"}}).limit(limit):
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
    async for d in db.movies.find({"$or": m_or}).limit(limit):
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
    async for d in db.series.find({"$or": s_or}).limit(limit):
        series_docs.append(await enrich_series(d, deep=False))
    return {"movies": movies, "series": series_docs, "actors": actor_docs}


# ----------- Actors -----------
@api_router.post("/actors")
async def create_actor(payload: ActorCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["created_by"] = user["id"]
    result = await db.actors.insert_one(doc)
    fetched = await db.actors.find_one({"_id": result.inserted_id})
    dd = doc_to_dict(fetched)
    await log_edit(user, "actor", dd["id"], "create", dd["name"], f"Created actor \"{dd['name']}\"")
    return dd

@api_router.get("/actors")
async def list_actors(q: Optional[str] = None, limit: int = 100):
    filter_query = {}
    if q:
        filter_query["name"] = {"$regex": q, "$options": "i"}
    cursor = db.actors.find(filter_query).limit(limit)
    return [doc_to_dict(d) async for d in cursor]

@api_router.get("/actors/{actor_id}")
async def get_actor(actor_id: str):
    try:
        doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Actor not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Actor not found")
    actor = doc_to_dict(doc)
    # find movies with this actor in cast
    movies_cursor = db.movies.find({"cast.actor_id": actor_id})
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
    async for s in db.series.find({"main_cast.actor_id": actor_id}):
        s_dict = await enrich_series(s, deep=False)
        for c in s_dict.get("main_cast", []):
            if c.get("actor_id") == actor_id:
                s_dict["character_name"] = c.get("character_name")
                break
        series_main.append(s_dict)
    actor["series"] = series_main

    # find guest star episodes
    guest_episodes = []
    async for s in db.series.find({"seasons.episodes.guest_stars.actor_id": actor_id}):
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
    _check_locks(old_doc, update_data, user)
    await db.actors.update_one({"_id": ObjectId(actor_id)}, {"$set": update_data})
    doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    dd = doc_to_dict(doc)
    changes = compute_field_changes(old_doc, update_data)
    changed_names = ", ".join([c["field"] for c in changes]) or "no changes"
    await log_edit(user, "actor", actor_id, "update", dd["name"], f"Updated {changed_names}", changes)
    return dd

@api_router.patch("/actors/{actor_id}/lock")
async def lock_actor_fields(actor_id: str, payload: LockUpdate, mod: dict = Depends(get_current_moderator)):
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
    name = doc.get("name", "") if doc else ""
    await db.actors.delete_one({"_id": ObjectId(actor_id)})
    await log_edit(user, "actor", actor_id, "delete", name, f"Deleted actor \"{name}\"")
    return {"ok": True}

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
    cur = db.movies.find({"_id": {"$in": object_ids}})
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
    await db.reviews.create_index([("movie_id", 1), ("user_id", 1)], unique=True)

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

app.include_router(api_router)

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
