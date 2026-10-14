import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, Plus, X, Save, ArrowLeft, Keyboard, ChevronDown, ChevronRight, GripVertical, LockKeyhole, Download } from "lucide-react";
import { toast } from "sonner";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";
import PosterListField from "@/components/PosterListField";
import CastEditDialog from "@/components/CastEditDialog";
import BulkCastAddDialog from "@/components/BulkCastAddDialog";
import CollectionsPicker from "@/components/CollectionsPicker";
import AvailabilityEditor from "@/components/AvailabilityEditor";

const SECTIONS = [
  { id: "primary-facts", label: "Primary Facts" },
  { id: "cast", label: "Main Cast" },
  { id: "creators", label: "Creators" },
  { id: "genres", label: "Genres" },
  { id: "keywords", label: "Keywords" },
  { id: "taglines", label: "Taglines" },
  { id: "videos", label: "Videos" },
  { id: "images", label: "Images" },
  { id: "availability", label: "Where to Watch" },
  { id: "seasons", label: "Seasons" },
];
const STATUSES = ["Ongoing", "Ended", "Cancelled", "In Production", "Returning Series"];
const TYPES = ["Scripted", "Reality", "Animated", "Documentary", "Miniseries", "News", "Talk Show"];
const CREW_ROLES = ["Creator", "Director", "Writer", "Producer", "Showrunner"];

function LockIcon({ locked, canToggle, onToggle }) {
  const Component = canToggle ? "button" : "span";
  return (
    <Component type="button" onClick={canToggle ? onToggle : undefined}
      title={locked ? "Field locked" : canToggle ? "Click to lock" : "Field is unlocked"}
      className={`float-right inline-flex items-center justify-center w-6 h-6 rounded-md transition ${locked ? "text-amber-400 hover:bg-amber-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"} ${canToggle ? "cursor-pointer" : "cursor-default"}`}
      data-testid={`lock-${locked ? "on" : "off"}`}>
      {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
    </Component>
  );
}

function Field({ name, label, locked, canToggleLocks, onToggleLock, disabled, children, hint }) {
  return (
    <div className={`${disabled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between mb-1.5">
        <Label className="text-slate-200 font-semibold text-sm">{label}</Label>
        <LockIcon locked={locked} canToggle={canToggleLocks} onToggle={() => onToggleLock(name)} />
      </div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function ChipInput({ value = [], onChange, placeholder, disabled, testid }) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim(); if (!v) return;
    if (value.includes(v)) { setText(""); return; }
    onChange([...value, v]); setText("");
  };
  return (
    <div className={`rounded-xl border border-white/10 bg-[#0f1318] p-2 flex flex-wrap gap-1.5 min-h-[40px] ${disabled ? "bg-[#111827]" : ""}`} data-testid={testid}>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100">
          {v}
          {!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-amber-200 transition hover:text-rose-300"><X className="w-3 h-3" /></button>}
        </span>
      ))}
      {!disabled && (
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder:text-slate-500 outline-none" />
      )}
    </div>
  );
}

export default function SeriesEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [actors, setActors] = useState([]);
  const [networkOptions, setNetworkOptions] = useState([]);
  const [customNetwork, setCustomNetwork] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [autoStatus, setAutoStatus] = useState("idle");
  const [activeSection, setActiveSection] = useState("primary-facts");
  const [stats, setStats] = useState({ content_score: 0 });
  const [locked, setLocked] = useState([]);
  const [contentEditsFrozen, setContentEditsFrozen] = useState(false);
  const [castDialog, setCastDialog] = useState({ open: false, index: null });
  const [bulkCastOpen, setBulkCastOpen] = useState(false);
  const [guestDialog, setGuestDialog] = useState({ open: false, sIdx: null, eIdx: null, gIdx: null });
  const [dragIdx, setDragIdx] = useState(null);
  const [openSeason, setOpenSeason] = useState(null);
  const [openEpisode, setOpenEpisode] = useState(null);
  const [importingTmdbSeasons, setImportingTmdbSeasons] = useState(false);
  const sectionRefs = useRef({});
  const savedFormRef = useRef(null);

  const isMod = user && ["moderator", "admin"].includes(user.effective_role || user.role);
  const isAdmin = user && (user.effective_role || user.role) === "admin";
  const perms = (user && user.permissions) || [];
  const canBypassCatalogFreeze = isAdmin || perms.includes("content.bypass_edit_freeze");
  const canEditImdbId = isMod || perms.includes("content.edit_imdb_id");
  const canLockCast = isMod || perms.includes("content.lock_cast");
  const canProtectFields = isMod || perms.includes("content.fields.lock") || perms.includes("content.protect_fields");
  const canDelete = isMod || perms.includes("content.delete");

  useEffect(() => {
    (async () => {
      try {
        const [s, a, st, networkResponse, freeze] = await Promise.all([
          api.get(`/series/${id}`),
          api.get("/actors"),
          api.get(`/series/${id}/stats`).catch(() => ({ data: { content_score: 0 } })),
          api.get("/series/networks").catch(() => ({ data: [] })),
          api.get("/moderation/content-edit-freeze").catch(() => ({ data: { frozen: false } })),
        ]);
        const availableNetworks = networkResponse.data || [];
        setSeries(s.data);
        setActors(a.data);
        setNetworkOptions(availableNetworks);
        setCustomNetwork(!!s.data.network && !availableNetworks.some((network) => network.toLowerCase() === s.data.network.toLowerCase()));
        setStats(st.data);
        setLocked(s.data.locked_fields || []);
        setContentEditsFrozen(!!freeze.data.frozen);
        setForm({
          title: s.data.title || "",
          imdb_id: s.data.imdb_id || "",
          first_air_date: s.data.first_air_date || "",
          last_air_date: s.data.last_air_date || "",
          synopsis: s.data.synopsis || "",
          tagline: s.data.tagline || "",
          status: s.data.status || "Ongoing",
          type: s.data.type || "Scripted",
          original_language: s.data.original_language || "English",
          network: s.data.network || "",
          network_logo_url: s.data.network_logo_url || "",
          awards_wins: s.data.awards_wins ?? "",
          awards_nominations: s.data.awards_nominations ?? "",
          poster_url: s.data.poster_url || "",
          poster_urls: s.data.poster_urls || (s.data.poster_url ? [s.data.poster_url] : []),
          backdrop_url: s.data.backdrop_url || "",
          backdrop_urls: s.data.backdrop_urls || (s.data.backdrop_url ? [s.data.backdrop_url] : []),
          trailer_url: s.data.trailer_url || "",
          video_urls: s.data.video_urls || [],
          purchase_options: (s.data.purchase_options || []).map((option) => ({ ...option, availability_type: option.availability_type || "buy" })),
          genres: s.data.genres || [],
          keywords: s.data.keywords || [],
          main_cast: (s.data.main_cast || []).map((c) => ({
            actor_id: c.actor?.id || c.actor_id,
            character_name: c.character_name,
          })),
          creators: (s.data.creators || []).map((c) => ({ name: c.name || "", role: c.role || "Creator" })),
          gallery: s.data.gallery || [],
          seasons: (s.data.seasons || []).map((sn) => ({
            season_number: sn.season_number,
            name: sn.name || "",
            air_date: sn.air_date || "",
            overview: sn.overview || "",
            poster_url: sn.poster_url || "",
            is_last_season: !!sn.is_last_season,
            episodes: (sn.episodes || []).map((ep) => ({
              episode_number: ep.episode_number,
              title: ep.name || "",
              air_date: ep.air_date || "",
              overview: ep.overview || "",
              still_url: ep.still_url || "",
              stills: ep.stills || [],
              main_cast_actor_ids: ep.main_cast_actor_ids || [],
              guest_stars: (ep.guest_stars || []).map((g) => ({
                actor_id: g.actor?.id || g.actor_id,
                character_name: g.character_name || "",
              })),
            })),
          })),
        });
      } catch { toast.error("Failed to load series"); }
    })();
  }, [id]);

  // First-render snapshot: mark baseline once so auto-save doesn't fire on load.
  useEffect(() => {
    if (form && savedFormRef.current == null) {
      savedFormRef.current = JSON.stringify(form);
    }
  }, [form]);

  useEffect(() => {
    const onScroll = () => {
      let current = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el && el.getBoundingClientRect().top < 140) current = s.id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [series]);

  const isFieldLocked = (n) => locked.includes(n);
  const canEditField = (n) => isMod || !isFieldLocked(n);
  const canMarkFinalSeason = isMod;

  const toggleLock = async (fieldName) => {
    if (!isMod) return;
    const next = locked.includes(fieldName) ? locked.filter((f) => f !== fieldName) : [...locked, fieldName];
    try {
      const r = await api.patch(`/series/${id}/lock`, { locked_fields: next });
      setLocked(r.data.locked_fields || next);
      toast.success(locked.includes(fieldName) ? "Field unlocked" : "Field locked");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const save = async (overrideForm, opts = {}) => {
    const looksLikeForm = overrideForm && typeof overrideForm === "object"
      && !overrideForm.nativeEvent && !overrideForm.currentTarget && Array.isArray(overrideForm.main_cast);
    const src = looksLikeForm ? overrideForm : form;
    if (!src) return;
    const silent = !!opts.silent;
    setSaving(true);
    if (silent) setAutoStatus("saving");
    try {
      const payload = {};
      const fields = ["title", ...(canEditImdbId && src.imdb_id ? ["imdb_id"] : []), "first_air_date", "last_air_date", "synopsis", "tagline", "status",
        "type", "original_language", "network", "network_logo_url",
        "awards_wins", "awards_nominations", "poster_url", "poster_urls", "backdrop_url", "backdrop_urls", "trailer_url", "video_urls",
        "purchase_options", "genres", "keywords", "main_cast", "creators", "gallery", "seasons"];
      for (const f of fields) {
        if (!isMod && locked.includes(f)) continue;
        let v = src[f];
        if (["awards_wins", "awards_nominations"].includes(f)) v = v === "" || v == null ? null : Number(v);
        payload[f] = v;
      }
      payload.main_cast = (src.main_cast || []).filter((c) => c.actor_id && c.character_name);
      payload.creators = (src.creators || []).filter((c) => c.name && c.role);
      payload.purchase_options = (src.purchase_options || []).filter((option) => option.provider?.trim() && option.url?.trim());
      payload.seasons = (src.seasons || []).map((sn) => ({
        ...sn,
        episodes: (sn.episodes || []).map((ep) => ({
          episode_number: ep.episode_number,
          name: ep.title || "",  // backend model uses `name`
          air_date: ep.air_date || null,
          overview: ep.overview || "",
          still_url: ep.still_url || "",
          stills: ep.stills || [],
          main_cast_actor_ids: ep.main_cast_actor_ids || [],
          guest_stars: (ep.guest_stars || []).filter((g) => g.actor_id && g.character_name),
        })),
      }));
      const r = await api.patch(`/series/${id}`, payload);
      savedFormRef.current = JSON.stringify(src);
      if (silent) {
        setAutoStatus("saved");
        setTimeout(() => setAutoStatus((s) => (s === "saved" ? "idle" : s)), 1600);
      } else {
        toast.success("Changes saved");
      }
      setSeries(r.data);
      try { const st = await api.get(`/series/${id}/stats`); setStats(st.data); } catch {}
      return true;
    } catch (e) {
      if (silent) setAutoStatus("error");
      toast.error(e.response?.data?.detail || "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!form || savedFormRef.current == null) return;
    if (JSON.stringify(form) === savedFormRef.current) return;
    setAutoStatus("pending");
    const t = setTimeout(() => {
      if (!saving) save(form, { silent: true });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [form]);

  const scrollTo = (sid) => { const el = sectionRefs.current[sid]; if (el) window.scrollTo({ top: el.offsetTop - 90, behavior: "smooth" }); };

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [form, locked]);

  const scoreLabel = useMemo(() => {
    const s = stats.content_score || 0;
    if (s >= 80) return "Yes! Looking good!";
    if (s >= 50) return "Almost there — a few fields missing.";
    return "Needs more info to be complete.";
  }, [stats]);

  if (!series || !form) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;
  if (!user) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Please <Link to="/login" className="text-sky-600">sign in</Link> to edit.</div>;
  if (contentEditsFrozen && !canBypassCatalogFreeze) {
    return (
      <main className="min-h-screen bg-[#0d0f12] px-4 py-20 text-white" data-testid="content-edit-frozen">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Editing paused</p>
          <h1 className="text-2xl font-bold">Catalog editing and creation are temporarily paused</h1>
          <p className="text-sm text-slate-400">An administrator will resume catalog changes when maintenance is complete.</p>
          <Link to={`/series/${id}`} className="inline-flex text-sm text-amber-300 hover:text-amber-200">Back to {series.title}</Link>
        </div>
      </main>
    );
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const remCast = async (i) => {
    const nextForm = { ...form, main_cast: form.main_cast.filter((_, x) => x !== i) };
    if (await save(nextForm, { silent: true })) setForm(nextForm);
  };
  const openCastEdit = (i) => setCastDialog({ open: true, index: i });
  const reorderCast = (from, to) => {
    if (from === to || from == null || to == null) return;
    const list = [...form.main_cast];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const nextForm = { ...form, main_cast: list };
    setForm(nextForm);
    save(nextForm);
  };
  const handleCastSave = (row) => {
    if (castDialog.index == null && (form.main_cast || []).some((c) => c.actor_id === row.actor_id)) {
      toast.error("This actor is already in the main cast.");
      return;
    }
    if (castDialog.index != null && (form.main_cast || []).some((c, x) => x !== castDialog.index && c.actor_id === row.actor_id)) {
      toast.error("Another main-cast row is already using this actor.");
      return;
    }
    const castRow = { actor_id: row.actor_id, character_name: row.character_name || "" };
    const nextCast = castDialog.index == null
      ? [...form.main_cast, castRow]
      : form.main_cast.map((c, x) => x === castDialog.index ? castRow : c);
    const nextForm = { ...form, main_cast: nextCast };
    setForm(nextForm);
    save(nextForm);
  };
  const handleBulkCastSave = (rows) => {
    const currentCast = form.main_cast || [];
    const existingIds = new Set(currentCast.map((row) => row.actor_id));
    if (rows.length > 10 || rows.some((row) => existingIds.has(row.actor_id))) {
      toast.error(rows.length > 10 ? "You can add up to 10 cast members at a time." : "One or more selected actors are already in the main cast.");
      return false;
    }
    const nextForm = {
      ...form,
      main_cast: [...currentCast, ...rows.map((row) => ({ actor_id: row.actor_id, character_name: row.character_name || "" }))],
    };
    setForm(nextForm);
    save(nextForm);
    return true;
  };
  const handleActorCreated = (a) => setActors((prev) => [...prev, { id: a.id, name: a.name, photo_url: a.photo_url || "" }]);
  const toggleMainCastLock = async (actorId) => {
    try {
      const r = await api.post(`/series/${id}/cast-lock`, { actor_id: actorId });
      setSeries((s) => s ? { ...s, locked_cast_actor_ids: r.data.locked_cast_actor_ids } : s);
      const nowLocked = (r.data.locked_cast_actor_ids || []).includes(actorId);
      const actor = actors.find((a) => a.id === actorId);
      toast.success(`${nowLocked ? "Locked" : "Unlocked"} ${actor?.name || "cast member"}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const toggleGuestLock = async (seasonNum, episodeNum, actorId) => {
    try {
      const r = await api.post(`/series/${id}/guest-star-lock`, { season_number: seasonNum, episode_number: episodeNum, actor_id: actorId });
      setSeries((s) => s ? { ...s, locked_guest_stars: r.data.locked_guest_stars } : s);
      const key = `${seasonNum}:${episodeNum}:${actorId}`;
      const nowLocked = (r.data.locked_guest_stars || []).includes(key);
      const actor = actors.find((a) => a.id === actorId);
      toast.success(`${nowLocked ? "Locked" : "Unlocked"} ${actor?.name || "guest"} on S${seasonNum}E${episodeNum}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const toggleEpisodeMainCastLock = async (seasonNum, episodeNum) => {
    try {
      const r = await api.post(`/series/${id}/main-cast-episode-lock`, { season_number: seasonNum, episode_number: episodeNum });
      setSeries((current) => current ? { ...current, locked_main_cast_episodes: r.data.locked_main_cast_episodes } : current);
      const key = `${seasonNum}:${episodeNum}`;
      const lockedNow = (r.data.locked_main_cast_episodes || []).includes(key);
      toast.success(`${lockedNow ? "Locked" : "Unlocked"} main cast for S${seasonNum}E${episodeNum}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to update episode cast lock"); }
  };
  const updCreator = (i, k, v) => setForm((f) => ({ ...f, creators: f.creators.map((c, x) => x === i ? { ...c, [k]: v } : c) }));
  const remCreator = (i) => setForm((f) => ({ ...f, creators: f.creators.filter((_, x) => x !== i) }));
  const addCreator = () => setForm((f) => ({ ...f, creators: [...f.creators, { name: "", role: "Creator" }] }));

  // Season / episode helpers
  const addSeason = () => setForm((f) => ({
    ...f,
    seasons: [...f.seasons, { season_number: (f.seasons.length ? Math.max(...f.seasons.map((s) => s.season_number || 0)) : 0) + 1, name: "", air_date: "", overview: "", poster_url: "", episodes: [] }],
  }));
  const remSeason = (idx) => setForm((f) => ({ ...f, seasons: f.seasons.filter((_, x) => x !== idx) }));
  const updSeason = (idx, k, v) => setForm((f) => ({ ...f, seasons: f.seasons.map((s, x) => x === idx ? { ...s, [k]: v } : s) }));
  const setLastSeason = (seasonIndex, checked) => {
    if (!canMarkFinalSeason) return;
    setForm((current) => ({
      ...current,
      seasons: current.seasons.map((season, index) => ({ ...season, is_last_season: checked && index === seasonIndex })),
    }));
  };
  const addEpisode = (sIdx) => {
    const newEpisodeIndex = form.seasons[sIdx]?.episodes?.length || 0;
    setOpenEpisode(`${sIdx}:${newEpisodeIndex}`);
    setForm((f) => ({
      ...f,
      seasons: f.seasons.map((s, x) => x === sIdx ? { ...s, episodes: [...s.episodes, { episode_number: (s.episodes.length ? Math.max(...s.episodes.map((e) => e.episode_number || 0)) : 0) + 1, title: "", air_date: "", overview: "", still_url: "", stills: [], main_cast_actor_ids: [], guest_stars: [] }] } : s),
    }));
  };
  const importTmdbSeasons = async () => {
    setImportingTmdbSeasons(true);
    try {
      const { data: job } = await api.post(`/series/${id}/tmdb-seasons/import`);
      const startedAt = Date.now();
      let importResult;
      while (!importResult) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const { data: status } = await api.get(`/series/${id}/tmdb-seasons/import/${job.job_id}`);
        if (status.status === "completed") {
          importResult = status.result || {};
        } else if (status.status === "failed") {
          throw new Error(status.error || "Failed to import seasons from TMDB");
        } else if (Date.now() - startedAt > 15 * 60 * 1000) {
          throw new Error("The import is still processing. Check back before starting another import.");
        }
      }
      const importedSeasons = importResult.seasons || [];
      let addedSeasonCount = 0;
      let addedEpisodeCount = 0;
      const existingBySeason = new Map((form.seasons || []).map((season) => [Number(season.season_number), season]));
      for (const importedSeason of importedSeasons) {
        const existingSeason = existingBySeason.get(Number(importedSeason.season_number));
        if (!existingSeason) {
          addedSeasonCount += 1;
          addedEpisodeCount += (importedSeason.episodes || []).length;
        } else {
          const existingEpisodeNumbers = new Set((existingSeason.episodes || []).map((episode) => Number(episode.episode_number)));
          addedEpisodeCount += (importedSeason.episodes || []).filter((episode) => !existingEpisodeNumbers.has(Number(episode.episode_number))).length;
        }
      }

      setForm((current) => {
        const seasons = [...(current.seasons || [])];
        for (const importedSeason of importedSeasons) {
          const seasonIndex = seasons.findIndex((season) => Number(season.season_number) === Number(importedSeason.season_number));
          const importedEpisodes = importedSeason.episodes || [];
          if (seasonIndex < 0) {
            seasons.push({
              season_number: importedSeason.season_number,
              name: importedSeason.name || "",
              air_date: importedSeason.air_date || "",
              overview: "",
              poster_url: "",
              is_last_season: false,
              episodes: importedEpisodes.map((episode) => ({
                ...episode,
                overview: "",
                still_url: "",
                stills: [],
              })),
            });
            continue;
          }

          const season = seasons[seasonIndex];
          const episodes = [...(season.episodes || [])];
          for (const importedEpisode of importedEpisodes) {
            const episodeIndex = episodes.findIndex((episode) => Number(episode.episode_number) === Number(importedEpisode.episode_number));
            if (episodeIndex < 0) {
              episodes.push({
                ...importedEpisode,
                overview: "",
                still_url: "",
                stills: [],
              });
              continue;
            }
            const episode = episodes[episodeIndex];
            episodes[episodeIndex] = {
              ...episode,
              title: episode.title || importedEpisode.title || "",
              air_date: episode.air_date || importedEpisode.air_date || "",
              main_cast_actor_ids: episode.main_cast_actor_ids?.length ? episode.main_cast_actor_ids : importedEpisode.main_cast_actor_ids || [],
              guest_stars: episode.guest_stars?.length ? episode.guest_stars : importedEpisode.guest_stars || [],
            };
          }
          seasons[seasonIndex] = {
            ...season,
            name: season.name || importedSeason.name || "",
            air_date: season.air_date || importedSeason.air_date || "",
            episodes: episodes.sort((left, right) => Number(left.episode_number) - Number(right.episode_number)),
          };
        }
        return { ...current, seasons: seasons.sort((left, right) => Number(left.season_number) - Number(right.season_number)) };
      });
      if (importResult.actors?.length) {
        setActors((current) => {
          const knownIds = new Set(current.map((actor) => actor.id));
          return [...current, ...importResult.actors.filter((actor) => !knownIds.has(actor.id))];
        });
      }
      toast.success(`Imported ${addedSeasonCount} seasons and ${addedEpisodeCount} new episodes from TMDB. Saving automatically.`);
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Failed to import seasons from TMDB");
    } finally {
      setImportingTmdbSeasons(false);
    }
  };
  const remEpisode = (sIdx, eIdx) => setForm((f) => ({
    ...f,
    seasons: f.seasons.map((s, x) => x === sIdx ? { ...s, episodes: s.episodes.filter((_, y) => y !== eIdx) } : s),
  }));
  const updEpisode = (sIdx, eIdx, k, v) => setForm((f) => ({
    ...f,
    seasons: f.seasons.map((s, x) => x === sIdx ? { ...s, episodes: s.episodes.map((e, y) => y === eIdx ? { ...e, [k]: v } : e) } : s),
  }));

  // Guest star helpers
  const openGuestAdd = (sIdx, eIdx) => setGuestDialog({ open: true, sIdx, eIdx, gIdx: null });
  const openGuestEdit = (sIdx, eIdx, gIdx) => setGuestDialog({ open: true, sIdx, eIdx, gIdx });
  const remGuest = (sIdx, eIdx, gIdx) => setForm((f) => ({
    ...f,
    seasons: f.seasons.map((s, x) => x === sIdx ? {
      ...s,
      episodes: s.episodes.map((e, y) => y === eIdx ? {
        ...e,
        guest_stars: (e.guest_stars || []).filter((_, z) => z !== gIdx),
      } : e),
    } : s),
  }));
  const handleGuestSave = (row) => {
    const { sIdx, eIdx, gIdx } = guestDialog;
    const currentGuests = form?.seasons?.[sIdx]?.episodes?.[eIdx]?.guest_stars || [];
    if (gIdx == null && currentGuests.some((g) => g.actor_id === row.actor_id)) {
      toast.error("This actor is already a guest star on this episode.");
      return;
    }
    if (gIdx != null && currentGuests.some((g, z) => z !== gIdx && g.actor_id === row.actor_id)) {
      toast.error("Another guest-star row is already using this actor on this episode.");
      return;
    }
    const nextForm = {
      ...form,
      seasons: form.seasons.map((s, x) => x === sIdx ? {
        ...s,
        episodes: s.episodes.map((e, y) => y === eIdx ? {
          ...e,
          guest_stars: gIdx == null
            ? [...(e.guest_stars || []), row]
            : (e.guest_stars || []).map((g, z) => z === gIdx ? row : g),
        } : e),
      } : s),
    };
    setForm(nextForm);
    save(nextForm);
  };
  const currentGuestValue = guestDialog.gIdx != null && form?.seasons?.[guestDialog.sIdx]?.episodes?.[guestDialog.eIdx]?.guest_stars?.[guestDialog.gIdx];

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white" data-testid="series-edit-page">
      <div className="border-b border-white/10 bg-[#111827] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <button onClick={() => navigate(`/series/${id}`)} className="flex items-center gap-2 text-slate-200 hover:text-white text-sm" data-testid="back-to-series">
            <ArrowLeft className="w-4 h-4" /> Back to {series.title}
          </button>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium ${
                autoStatus === "saving" ? "text-amber-300" :
                autoStatus === "saved" ? "text-emerald-300" :
                autoStatus === "pending" ? "text-slate-400" :
                autoStatus === "error" ? "text-rose-300" : "text-transparent"
              }`}
              data-testid="autosave-status"
            >
              {autoStatus === "saving" ? "Saving…" :
                autoStatus === "saved" ? "All changes saved" :
                autoStatus === "pending" ? "Unsaved changes…" :
                autoStatus === "error" ? "Save failed" : "\u00A0"}
            </span>
            <Button onClick={() => save()} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-black h-9 font-semibold" data-testid="top-save-btn">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-4" data-testid="edit-sidebar">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#14181f]/80 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-bold text-black">
              <span>CineVerse Editor</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[10px]">?</span>
            </div>
            <nav className="py-2">
              {SECTIONS.map((s) => (
                <button key={s.id} type="button" onClick={() => scrollTo(s.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition ${activeSection === s.id ? "bg-amber-500/10 font-semibold text-amber-200" : "text-slate-300 hover:bg-white/5"}`}
                  data-testid={`section-link-${s.id}`}>{s.label}</button>
              ))}
            </nav>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-[#14181f]/80 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="text-3xl font-bold text-white" data-testid="edit-content-score">{stats.content_score || 0}</div>
            <div className="text-xs text-slate-400 mt-0.5">{scoreLabel}</div>
            <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${stats.content_score || 0}%` }} />
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1 px-1">
            <Keyboard className="w-3.5 h-3.5" /> Keyboard shortcuts <span className="ml-auto text-slate-500">Ctrl+S</span>
          </div>
        </aside>

        <div className="space-y-8 min-w-0">
          {/* Primary Facts */}
          <section id="primary-facts" ref={(el) => (sectionRefs.current["primary-facts"] = el)} className="space-y-5 rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-400">Primary facts</div>
            <div>
              <Label className="text-slate-200 font-semibold text-sm">IMDb ID</Label>
              <Input value={form.imdb_id} onChange={(e) => setField("imdb_id", e.target.value.trim())} disabled={!canEditImdbId} required={canEditImdbId} pattern="tt[0-9]{7,10}" title="Enter an IMDb ID such as tt1234567" placeholder="tt1234567" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white disabled:opacity-70" data-testid="field-imdb-id" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="original_language" label="Original Language" locked={isFieldLocked("original_language")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("original_language")}>
                <Input value={form.original_language} onChange={(e) => setField("original_language", e.target.value)} disabled={!canEditField("original_language")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-original-language" />
              </Field>
              <Field name="status" label="Status" locked={isFieldLocked("status")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("status")}>
                <Select value={form.status} onValueChange={(v) => setField("status", v)} disabled={!canEditField("status")}>
                  <SelectTrigger className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <Field name="title" label="Original Title" locked={isFieldLocked("title")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("title")}>
              <Input value={form.title} onChange={(e) => setField("title", e.target.value)} disabled={!canEditField("title")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-title" />
            </Field>

            <Field name="synopsis" label="Overview" locked={isFieldLocked("synopsis")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("synopsis")}>
              <Textarea rows={4} value={form.synopsis} onChange={(e) => setField("synopsis", e.target.value)} disabled={!canEditField("synopsis")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-synopsis" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="first_air_date" label="First Air Date" locked={isFieldLocked("first_air_date")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("first_air_date")}>
                <Input type="date" value={form.first_air_date} onChange={(e) => setField("first_air_date", e.target.value)} disabled={!canEditField("first_air_date")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-first-air" />
              </Field>
              <Field name="last_air_date" label="Last Air Date" locked={isFieldLocked("last_air_date")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("last_air_date")}>
                <Input type="date" value={form.last_air_date} onChange={(e) => setField("last_air_date", e.target.value)} disabled={!canEditField("last_air_date")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-last-air" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="type" label="Type" locked={isFieldLocked("type")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("type")}>
                <Select value={form.type} onValueChange={(v) => setField("type", v)} disabled={!canEditField("type")}>
                  <SelectTrigger className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field name="network" label="Network" locked={isFieldLocked("network")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("network")}>
                <Select
                  value={customNetwork ? "__custom__" : (networkOptions.find((network) => network.toLowerCase() === form.network.toLowerCase()) || (form.network ? "__custom__" : "__none__"))}
                  onValueChange={(value) => {
                    if (value === "__custom__") {
                      if (!customNetwork) setField("network", "");
                      setCustomNetwork(true);
                    } else {
                      setCustomNetwork(false);
                      setField("network", value === "__none__" ? "" : value);
                    }
                  }}
                  disabled={!canEditField("network")}
                >
                  <SelectTrigger className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-network"><SelectValue placeholder="Select a network" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No network</SelectItem>
                    {networkOptions.map((network) => <SelectItem key={network} value={network}>{network}</SelectItem>)}
                    <SelectItem value="__custom__">Add another network...</SelectItem>
                  </SelectContent>
                </Select>
                {customNetwork && (
                  <Input value={form.network} onChange={(e) => setField("network", e.target.value)} disabled={!canEditField("network")} placeholder="Enter a network name" className="mt-2 bg-[#0d0f12] border-white/10 text-white" data-testid="field-network-custom" />
                )}
              </Field>
            </div>

            <Field name="network_logo_url" label="Network Logo" locked={isFieldLocked("network_logo_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("network_logo_url")}>
              <ImageUpload value={form.network_logo_url} onChange={(v) => setField("network_logo_url", v)} testid="field-network-logo" canDelete={canDelete} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="awards_wins" label="Awards — Wins" locked={isFieldLocked("awards_wins")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("awards_wins")}>
                <Input type="number" value={form.awards_wins} onChange={(e) => setField("awards_wins", e.target.value)} disabled={!canEditField("awards_wins")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-wins" />
              </Field>
              <Field name="awards_nominations" label="Awards — Nominations" locked={isFieldLocked("awards_nominations")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("awards_nominations")}>
                <Input type="number" value={form.awards_nominations} onChange={(e) => setField("awards_nominations", e.target.value)} disabled={!canEditField("awards_nominations")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-nominations" />
              </Field>
            </div>
          </section>

          {/* Main Cast */}
          <section id="cast" ref={(el) => (sectionRefs.current["cast"] = el)} className="space-y-3 rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-white">Main Cast</h2>
              <LockIcon locked={isFieldLocked("main_cast")} canToggle={isMod} onToggle={() => toggleLock("main_cast")} />
            </div>
            {(series?.locked_cast_actor_ids || []).length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2" data-testid="cast-lock-banner">
                <LockKeyhole className="w-3.5 h-3.5 flex-shrink-0" />
                {(series.locked_cast_actor_ids || []).length} main cast member{(series.locked_cast_actor_ids || []).length !== 1 && "s"} locked by moderators — these rows can't be removed, edited or reordered by non-mods.
              </div>
            )}
            <div className="space-y-2">
              {form.main_cast.map((c, i) => {
                const actor = actors.find((a) => a.id === c.actor_id) || c.actor || null;
                const dragging = dragIdx === i;
                const rowLocked = (series?.locked_cast_actor_ids || []).includes(c.actor_id);
                const rowEditable = canEditField("main_cast") && (canLockCast || !rowLocked);
                return (
                  <div
                    key={i}
                    draggable={rowEditable}
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => { e.preventDefault(); if (rowEditable) reorderCast(dragIdx, i); setDragIdx(null); }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 transition ${dragging ? "opacity-40 border-cyan-400 bg-[#0d0f12]" : rowLocked ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-[#0d0f12] hover:border-white/20"}`}
                    data-testid={`cast-row-${i}`}
                  >
                    <GripVertical className={`w-4 h-4 text-slate-400 ${rowEditable ? "cursor-grab active:cursor-grabbing" : "opacity-30"}`} data-testid={`cast-drag-${i}`} />
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1e2430] flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                      {actor?.photo_url ? <img src={fileUrl(actor.photo_url)} alt="" className="w-full h-full object-cover" /> : (actor?.name?.[0] || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
                        {actor?.name || "(unknown)"}
                        {rowLocked && <LockKeyhole className="w-3.5 h-3.5 text-amber-400" title="Locked by moderators" />}
                      </div>
                      <div className="text-xs text-slate-400 truncate">as {c.character_name || "—"}</div>
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-6 text-right">#{i + 1}</span>
                    {canLockCast && c.actor_id && (
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleMainCastLock(c.actor_id)} className={`h-8 ${rowLocked ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10" : "border-white/15 text-slate-200 hover:bg-white/5"}`} data-testid={`cast-lock-${i}`}>
                        {rowLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => openCastEdit(i)} disabled={!rowEditable} className="border-white/15 text-slate-200 hover:bg-white/5 h-8" data-testid={`cast-edit-${i}`}>Edit</Button>
                    {!(rowLocked && !canLockCast) && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => remCast(i)} disabled={saving || !rowEditable} className="text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></Button>
                    )}
                  </div>
                );
              })}
              {form.main_cast.length === 0 && <div className="rounded-md border border-dashed border-white/10 py-6 text-center text-slate-500 text-sm">No cast yet.</div>}
            </div>
            <Button type="button" variant="outline" onClick={() => setCastDialog({ open: true, index: null })} disabled={!canEditField("main_cast")} className="border-white/15 text-slate-200 hover:bg-white/5 h-8" data-testid="add-cast-btn">
              <Plus className="w-4 h-4 mr-1" /> Add cast
            </Button>
            {isMod && <Button type="button" variant="outline" onClick={() => setBulkCastOpen(true)} disabled={!canEditField("main_cast")} className="border-white/15 text-slate-200 hover:bg-white/5 h-8" data-testid="bulk-add-cast-btn">
              <Plus className="w-4 h-4 mr-1" /> Add multiple
            </Button>}
          </section>

          {/* Creators */}
          <section id="creators" ref={(el) => (sectionRefs.current["creators"] = el)} className="space-y-3 rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-white">Creators</h2>
              <LockIcon locked={isFieldLocked("creators")} canToggle={isMod} onToggle={() => toggleLock("creators")} />
            </div>
            <div className="space-y-2">
              {form.creators.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Name" value={c.name} onChange={(e) => updCreator(i, "name", e.target.value)} disabled={!canEditField("creators")} className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`creator-name-${i}`} />
                  <Select value={c.role} onValueChange={(v) => updCreator(i, "role", v)} disabled={!canEditField("creators")}>
                    <SelectTrigger className="w-[180px] bg-[#0d0f12] border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{CREW_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" onClick={() => remCreator(i)} disabled={!canEditField("creators")} className="text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={addCreator} disabled={!canEditField("creators")} className="border-white/15 text-slate-200 hover:bg-white/5 h-8"><Plus className="w-4 h-4 mr-1" /> Add creator</Button>
          </section>

          {/* Genres */}
          <section id="genres" ref={(el) => (sectionRefs.current["genres"] = el)} className="rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <Field name="genres" label="Genres" locked={isFieldLocked("genres")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("genres")} hint="Press Enter or comma to add a tag">
              <ChipInput value={form.genres} onChange={(v) => setField("genres", v)} placeholder="Drama, Sci-Fi…" disabled={!canEditField("genres")} testid="field-genres" />
            </Field>
          </section>
          {/* Keywords */}
          <section id="keywords" ref={(el) => (sectionRefs.current["keywords"] = el)} className="rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <Field name="keywords" label="Keywords" locked={isFieldLocked("keywords")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("keywords")} hint="Short descriptive tags">
              <ChipInput value={form.keywords} onChange={(v) => setField("keywords", v)} placeholder="1980s, supernatural…" disabled={!canEditField("keywords")} testid="field-keywords" />
            </Field>
          </section>
          {/* Taglines */}
          <section id="taglines" ref={(el) => (sectionRefs.current["taglines"] = el)} className="rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <Field name="tagline" label="Tagline" locked={isFieldLocked("tagline")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("tagline")}>
              <Input value={form.tagline} onChange={(e) => setField("tagline", e.target.value)} disabled={!canEditField("tagline")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-tagline" />
            </Field>
          </section>
          {/* Videos */}
          <section id="videos" ref={(el) => (sectionRefs.current["videos"] = el)} className="space-y-5 rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <Field name="trailer_url" label="Trailer URL" locked={isFieldLocked("trailer_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("trailer_url")}>
              <Input value={form.trailer_url} onChange={(e) => setField("trailer_url", e.target.value)} disabled={!canEditField("trailer_url")} className="bg-[#0d0f12] border-white/10 text-white" data-testid="field-trailer" />
            </Field>
            <Field name="video_urls" label="Additional Videos" locked={isFieldLocked("video_urls")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("video_urls")}>
              <ChipInput value={form.video_urls} onChange={(v) => setField("video_urls", v)} placeholder="https://youtu.be/…" disabled={!canEditField("video_urls")} testid="field-video-urls" />
            </Field>
          </section>
          {/* Images */}
          <section id="images" ref={(el) => (sectionRefs.current["images"] = el)} className="space-y-5 rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="poster_url" label={`Posters (${(form.poster_urls || []).length})`} locked={isFieldLocked("poster_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("poster_url")}>
                <PosterListField
                  urls={form.poster_urls || []}
                  primary={form.poster_url}
                  aspect="2/3"
                  canMod={isMod}
                  disabled={!canEditField("poster_url")}
                  testIdPrefix="edit-poster-list"
                  onChange={({ urls, primary }) => { setField("poster_urls", urls); setField("poster_url", primary); }}
                />
              </Field>
              <Field name="backdrop_url" label={`Backdrops (${(form.backdrop_urls || []).length})`} locked={isFieldLocked("backdrop_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("backdrop_url")}>
                <PosterListField
                  urls={form.backdrop_urls || []}
                  primary={form.backdrop_url}
                  aspect="16/9"
                  canMod={isMod}
                  disabled={!canEditField("backdrop_url")}
                  testIdPrefix="edit-backdrop-list"
                  onChange={({ urls, primary }) => { setField("backdrop_urls", urls); setField("backdrop_url", primary); }}
                />
              </Field>
            </div>
          </section>

          <section id="availability" ref={(el) => (sectionRefs.current["availability"] = el)} className="rounded-2xl border border-white/10 bg-[#14181f]/80 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)]" data-testid="series-availability-editor">
            <Field name="purchase_options" label="Where to Watch" locked={isFieldLocked("purchase_options")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("purchase_options")}>
              <AvailabilityEditor value={form.purchase_options || []} onChange={(value) => setField("purchase_options", value)} disabled={!canEditField("purchase_options")} />
            </Field>
          </section>

          {/* Seasons & Episodes */}
          <section id="seasons" ref={(el) => (sectionRefs.current["seasons"] = el)} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-white">Seasons &amp; Episodes</h2>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={importTmdbSeasons} disabled={!canEditField("seasons") || importingTmdbSeasons || saving} className="border-white/15 text-slate-200 hover:bg-white/5" data-testid="import-tmdb-seasons-btn">
                  <Download className="mr-1.5 h-4 w-4" />
                  {importingTmdbSeasons ? "Importing…" : "Import Seasons & Episodes"}
                </Button>
                <LockIcon locked={isFieldLocked("seasons")} canToggle={isMod} onToggle={() => toggleLock("seasons")} />
              </div>
            </div>

            <div className="space-y-3">
              {form.seasons.map((sn, sIdx) => {
                const opened = openSeason === sIdx;
                return (
                  <div key={sIdx} className="rounded-lg border border-white/10 bg-[#14181f]" data-testid={`season-${sIdx}`}>
                    <button type="button" onClick={() => setOpenSeason(opened ? null : sIdx)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
                      {opened ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <div className="flex-1">
                        <div className="font-semibold text-white">Season {sn.season_number}{sn.name ? ` — ${sn.name}` : ""}</div>
                        <div className="text-xs text-slate-400">{(sn.episodes || []).length} episodes · {sn.air_date ? new Date(sn.air_date).getFullYear() : "no air date"}{sn.is_last_season ? " · Final season" : ""}</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remSeason(sIdx); }} disabled={!canEditField("seasons") || !canDelete} className={`text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 ${canDelete ? "" : "hidden"}`}><X className="w-4 h-4" /></Button>
                    </button>
                    {opened && (
                      <div className="border-t border-white/10 p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div><Label className="text-xs text-slate-400">Season #</Label><Input type="number" value={sn.season_number} onChange={(e) => updSeason(sIdx, "season_number", Number(e.target.value))} disabled={!canEditField("seasons")} className="mt-1 bg-[#0d0f12] border-white/10 text-white" /></div>
                          <div><Label className="text-xs text-slate-400">Name</Label><Input value={sn.name} onChange={(e) => updSeason(sIdx, "name", e.target.value)} disabled={!canEditField("seasons")} className="mt-1 bg-[#0d0f12] border-white/10 text-white" /></div>
                          <div><Label className="text-xs text-slate-400">Air date</Label><Input type="date" value={sn.air_date} onChange={(e) => updSeason(sIdx, "air_date", e.target.value)} disabled={!canEditField("seasons")} className="mt-1 bg-[#0d0f12] border-white/10 text-white" /></div>
                        </div>
                        <div><Label className="text-xs text-slate-400">Overview</Label><Textarea rows={2} value={sn.overview} onChange={(e) => updSeason(sIdx, "overview", e.target.value)} disabled={!canEditField("seasons")} className="mt-1 bg-[#0d0f12] border-white/10 text-white" /></div>
                        <div><Label className="text-xs text-slate-400 block mb-1">Poster</Label><ImageUpload value={sn.poster_url} onChange={(v) => updSeason(sIdx, "poster_url", v)} canDelete={canDelete} /></div>
                        {canMarkFinalSeason && (
                          <label className="flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-slate-300" data-testid={`last-season-toggle-${sIdx}`}>
                            <input type="checkbox" className="accent-amber-400" checked={!!sn.is_last_season} onChange={(event) => setLastSeason(sIdx, event.target.checked)} disabled={!canEditField("seasons") || saving} />
                            Mark as final season
                          </label>
                        )}

                        <div className="pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-slate-200 font-semibold">Episodes ({sn.episodes.length})</Label>
                            <Button type="button" size="sm" variant="outline" onClick={() => addEpisode(sIdx)} disabled={!canEditField("seasons")} className="border-white/15 text-slate-200 hover:bg-white/5 h-7"><Plus className="w-3 h-3 mr-1" /> Add episode</Button>
                          </div>
                          <div className="space-y-2">
                            {sn.episodes.map((ep, eIdx) => {
                              const episodeKey = `${sIdx}:${eIdx}`;
                              const episodeLockKey = `${sn.season_number}:${ep.episode_number}`;
                              const episodeCastLocked = (series?.locked_main_cast_episodes || []).includes(episodeLockKey);
                              const episodeOpen = openEpisode === episodeKey;
                              return (
                              <div key={eIdx} className="rounded-md border border-white/10 bg-[#0d0f12] p-3" data-testid={`episode-${sIdx}-${eIdx}`}>
                                <div className="mb-3 flex items-center gap-2">
                                  <button type="button" onClick={() => setOpenEpisode(episodeOpen ? null : episodeKey)} aria-expanded={episodeOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                    {episodeOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-amber-400" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />}
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">E{ep.episode_number} · {ep.title || "Untitled episode"}</span>
                                    <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">{ep.air_date || "No air date"} · {(ep.main_cast_actor_ids || []).length} cast · {(ep.guest_stars || []).length} guests</span>
                                  </button>
                                  {episodeCastLocked && <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" title="Episode main cast is locked" />}
                                  {canLockCast && (
                                    <button type="button" onClick={() => toggleEpisodeMainCastLock(sn.season_number, ep.episode_number)} className={`rounded p-1 ${episodeCastLocked ? "text-amber-300 hover:bg-amber-500/10" : "text-slate-400 hover:bg-white/5 hover:text-amber-300"}`} title={episodeCastLocked ? "Unlock episode main cast" : "Lock episode main cast"} aria-label={episodeCastLocked ? "Unlock episode main cast" : "Lock episode main cast"} data-testid={`episode-main-cast-lock-${sIdx}-${eIdx}`}>
                                      {episodeCastLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                    </button>
                                  )}
                                  <Button type="button" variant="ghost" size="sm" onClick={() => remEpisode(sIdx, eIdx)} disabled={!canEditField("seasons") || !canDelete} className={`text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 ${canDelete ? "" : "hidden"}`} aria-label="Delete episode"><X className="w-4 h-4" /></Button>
                                </div>
                                {episodeOpen && <div>
                                <div className="grid grid-cols-1 md:grid-cols-[80px_1fr_180px_40px] gap-2 items-start">
                                  <Input type="number" placeholder="#" value={ep.episode_number} onChange={(e) => updEpisode(sIdx, eIdx, "episode_number", Number(e.target.value))} disabled={!canEditField("seasons")} className="bg-[#14181f] border-white/10 text-white" />
                                  <Input placeholder="Episode title" value={ep.title} onChange={(e) => updEpisode(sIdx, eIdx, "title", e.target.value)} disabled={!canEditField("seasons")} className="bg-[#14181f] border-white/10 text-white" data-testid={`episode-title-${sIdx}-${eIdx}`} />
                                  <Input type="date" value={ep.air_date} onChange={(e) => updEpisode(sIdx, eIdx, "air_date", e.target.value)} disabled={!canEditField("seasons")} className="bg-[#14181f] border-white/10 text-white" />
                                  <div />
                                </div>
                                <Textarea placeholder="Overview" rows={2} value={ep.overview} onChange={(e) => updEpisode(sIdx, eIdx, "overview", e.target.value)} disabled={!canEditField("seasons")} className="mt-2 bg-[#14181f] border-white/10 text-white text-sm" />
                                <div className="mt-2"><Label className="text-xs text-slate-400 block mb-1">Still image</Label><ImageUpload value={ep.still_url} onChange={(v) => updEpisode(sIdx, eIdx, "still_url", v)} canDelete={canDelete} /></div>

                                <div className="mt-3 pt-3 border-t border-white/10">
                                  <div className="mb-2">
                                    <Label className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Main Cast in This Episode ({(ep.main_cast_actor_ids || []).length})</Label>
                                  </div>
                                  {(form.main_cast || []).length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">Add main cast members to the series before assigning them to episodes.</div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                      {(form.main_cast || []).map((member) => {
                                        const actorId = String(member.actor_id);
                                        const actor = actors.find((item) => item.id === actorId);
                                        const included = (ep.main_cast_actor_ids || []).includes(actorId);
                                        const episodeCastEditable = canEditField("seasons") && (!episodeCastLocked || isMod || perms.includes("content.edit_locked"));
                                        return (
                                          <label key={actorId} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${included ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-white/10 bg-[#14181f] text-slate-300"}`}>
                                            <input
                                              type="checkbox"
                                              checked={included}
                                              disabled={!episodeCastEditable}
                                              onChange={() => updEpisode(
                                                sIdx,
                                                eIdx,
                                                "main_cast_actor_ids",
                                                included
                                                  ? (ep.main_cast_actor_ids || []).filter((id) => id !== actorId)
                                                  : [...(ep.main_cast_actor_ids || []), actorId],
                                              )}
                                              className="accent-amber-400"
                                            />
                                            <span className="truncate">{actor?.name || "Unknown actor"}{member.character_name ? ` as ${member.character_name}` : ""}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                <div className="mt-3 pt-3 border-t border-white/10">
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Guest Stars ({(ep.guest_stars || []).length})</Label>
                                    <Button type="button" size="sm" variant="outline" onClick={() => openGuestAdd(sIdx, eIdx)} disabled={!canEditField("seasons")} className="border-white/15 text-slate-200 hover:bg-white/5 h-7 text-xs" data-testid={`add-guest-${sIdx}-${eIdx}`}>
                                      <Plus className="w-3 h-3 mr-1" /> Add guest star
                                    </Button>
                                  </div>
                                  {(ep.guest_stars || []).length === 0 ? (
                                    <div className="text-xs text-slate-500 italic">No guest stars yet.</div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {(ep.guest_stars || []).map((g, gIdx) => {
                                        const actor = actors.find((a) => a.id === g.actor_id) || g.actor || null;
                                        const gKey = `${sn.season_number}:${ep.episode_number}:${g.actor_id}`;
                                        const gLocked = (series?.locked_guest_stars || []).includes(gKey);
                                        const gEditable = canEditField("seasons") && (canLockCast || !gLocked);
                                        return (
                                          <div key={gIdx} className={`flex items-center gap-1.5 rounded-full border pl-1 pr-1 py-0.5 text-xs ${gLocked ? "bg-amber-500/10 border-amber-500/40" : "bg-[#14181f] border-white/10"}`} data-testid={`guest-chip-${sIdx}-${eIdx}-${gIdx}`}>
                                            <div className="w-5 h-5 rounded-full overflow-hidden bg-[#0d0f12] flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
                                              {actor?.photo_url ? <img src={fileUrl(actor.photo_url)} alt="" className="w-full h-full object-cover" /> : (actor?.name?.[0] || "?")}
                                            </div>
                                            <button type="button" onClick={() => openGuestEdit(sIdx, eIdx, gIdx)} disabled={!gEditable} className="text-slate-200 hover:text-amber-300 font-medium disabled:opacity-70">
                                              {actor?.name || "(unknown)"}
                                            </button>
                                            {g.character_name && <span className="text-slate-400">as {g.character_name}</span>}
                                            {gLocked && <LockKeyhole className="w-3 h-3 text-amber-400" title="Locked by moderators" />}
                                            {canLockCast && g.actor_id && (
                                              <button type="button" onClick={() => toggleGuestLock(sn.season_number, ep.episode_number, g.actor_id)} className={`ml-0.5 ${gLocked ? "text-amber-300 hover:text-amber-200" : "text-slate-400 hover:text-amber-300"}`} data-testid={`guest-lock-${sIdx}-${eIdx}-${gIdx}`} title={gLocked ? "Unlock guest" : "Lock guest"}>
                                                {gLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                              </button>
                                            )}
                                            {!(gLocked && !canLockCast) && (
                                              <button type="button" onClick={() => remGuest(sIdx, eIdx, gIdx)} disabled={!gEditable} className="text-slate-400 hover:text-rose-300 ml-0.5 disabled:opacity-40" data-testid={`remove-guest-${sIdx}-${eIdx}-${gIdx}`}>
                                                <X className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                </div>}
                              </div>
                              );
                            })}
                            {sn.episodes.length === 0 && <div className="text-xs text-slate-500 italic">No episodes yet.</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {form.seasons.length === 0 && <div className="rounded-md border border-dashed border-white/10 py-8 text-center text-slate-500 text-sm">No seasons yet.</div>}
            </div>

            <Button type="button" variant="outline" onClick={addSeason} disabled={!canEditField("seasons")} className="border-white/15 text-slate-200 hover:bg-white/5 h-8" data-testid="add-season-btn">
              <Plus className="w-4 h-4 mr-1" /> Add season
            </Button>
          </section>

          {isMod && (
            <section className="mt-6">
              <CollectionsPicker
                kind="series"
                titleId={id}
                value={series?.collection_ids || (series?.collections || []).map((c) => c.id)}
                onChange={(next) => setSeries((s) => s ? { ...s, collection_ids: next, collections: (s.collections || []).filter((c) => next.includes(c.id)) } : s)}
              />
            </section>
          )}

          <div className="pt-4 pb-16 flex justify-end gap-2 border-t border-white/10">
            <Button variant="outline" onClick={() => navigate(`/series/${id}`)} className="border-white/15 text-slate-200 hover:bg-white/5">Cancel</Button>
            <Button onClick={() => save()} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold" data-testid="bottom-save-btn">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <CastEditDialog
        open={castDialog.open}
        onOpenChange={(v) => setCastDialog((s) => ({ ...s, open: v }))}
        actors={actors}
        value={castDialog.index != null ? form.main_cast[castDialog.index] : null}
        onSave={handleCastSave}
        onActorCreated={handleActorCreated}
      />
      {isMod && <BulkCastAddDialog
        open={bulkCastOpen}
        onOpenChange={setBulkCastOpen}
        actors={actors}
        excludedActorIds={(form.main_cast || []).map((row) => row.actor_id)}
        onSave={handleBulkCastSave}
        onActorCreated={handleActorCreated}
      />}
      <CastEditDialog
        open={guestDialog.open}
        onOpenChange={(v) => setGuestDialog((s) => ({ ...s, open: v }))}
        actors={actors}
        value={currentGuestValue || null}
        onSave={handleGuestSave}
        onActorCreated={handleActorCreated}
      />
    </div>
  );
}
