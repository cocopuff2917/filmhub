import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Unlock, Plus, X, Save, ArrowLeft, Keyboard, GripVertical, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";
import CastEditDialog from "@/components/CastEditDialog";
import CollectionsPicker from "@/components/CollectionsPicker";

const SECTIONS = [
  { id: "primary-facts", label: "Primary Facts" },
  { id: "cast", label: "Cast" },
  { id: "crew", label: "Crew" },
  { id: "genres", label: "Genres" },
  { id: "keywords", label: "Keywords" },
  { id: "taglines", label: "Taglines" },
  { id: "videos", label: "Videos" },
  { id: "images", label: "Images" },
];

const STATUSES = ["Released", "In Production", "Post Production", "Rumored", "Canceled"];
const CREW_ROLES = ["Director", "Writer", "Producer", "Cinematographer", "Composer", "Editor"];

// Lock indicator next to a field label. Clickable for moderators.
function LockIcon({ locked, canToggle, onToggle }) {
  const Component = canToggle ? "button" : "span";
  return (
    <Component
      type="button"
      onClick={canToggle ? onToggle : undefined}
      title={locked ? "Field locked by moderators" : canToggle ? "Click to lock this field" : "Field is unlocked"}
      className={`float-right inline-flex items-center justify-center w-6 h-6 rounded-md transition ${locked ? "text-amber-600 hover:bg-amber-50" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"} ${canToggle ? "cursor-pointer" : "cursor-default"}`}
      data-testid={`lock-${locked ? "on" : "off"}`}
    >
      {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
    </Component>
  );
}

// Field wrapper — label + lock + child
function Field({ name, label, locked, canToggleLocks, onToggleLock, disabled, children, hint }) {
  return (
    <div className={`${disabled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between mb-1.5">
        <Label className="text-slate-900 font-semibold text-sm">{label}</Label>
        <LockIcon locked={locked} canToggle={canToggleLocks} onToggle={() => onToggleLock(name)} />
      </div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

// Chip input for arrays of tags
function ChipInput({ value = [], onChange, placeholder, disabled, testid }) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (value.includes(v)) { setText(""); return; }
    onChange([...value, v]);
    setText("");
  };
  return (
    <div className={`rounded-md border border-slate-300 bg-white p-2 flex flex-wrap gap-1.5 min-h-[40px] ${disabled ? "bg-slate-100" : ""}`} data-testid={testid}>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-700">
          {v}
          {!disabled && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-slate-400 hover:text-rose-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
            else if (e.key === "Backspace" && !text && value.length) { onChange(value.slice(0, -1)); }
          }}
          onBlur={add}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
        />
      )}
    </div>
  );
}

export default function MovieEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [actors, setActors] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [autoStatus, setAutoStatus] = useState("idle"); // idle | pending | saving | saved | error
  const [activeSection, setActiveSection] = useState("primary-facts");
  const [stats, setStats] = useState({ content_score: 0 });
  const [locked, setLocked] = useState([]);
  const [castDialog, setCastDialog] = useState({ open: false, index: null });
  const [dragIdx, setDragIdx] = useState(null);
  const sectionRefs = useRef({});
  const savedFormRef = useRef(null);
  const savedAtRef = useRef(null);

  const isMod = user && ["moderator", "admin"].includes(user.effective_role || user.role);
  const perms = (user && user.permissions) || [];
  const canLockCast = isMod || perms.includes("content.lock_cast");
  const canProtectFields = isMod || perms.includes("content.protect_fields");

  useEffect(() => {
    (async () => {
      try {
        const [m, a, s] = await Promise.all([
          api.get(`/movies/${id}`),
          api.get("/actors"),
          api.get(`/movies/${id}/stats`).catch(() => ({ data: { content_score: 0 } })),
        ]);
        setMovie(m.data);
        setActors(a.data);
        setStats(s.data);
        setLocked(m.data.locked_fields || []);
        setForm({
          title: m.data.title || "",
          release_date: m.data.release_date || "",
          runtime: m.data.runtime ?? "",
          synopsis: m.data.synopsis || "",
          tagline: m.data.tagline || "",
          status: m.data.status || "Released",
          original_language: m.data.original_language || "English",
          budget: m.data.budget ?? "",
          revenue: m.data.revenue ?? "",
          awards_wins: m.data.awards_wins ?? "",
          awards_nominations: m.data.awards_nominations ?? "",
          poster_url: m.data.poster_url || "",
          backdrop_url: m.data.backdrop_url || "",
          trailer_url: m.data.trailer_url || "",
          video_urls: m.data.video_urls || [],
          genres: m.data.genres || [],
          keywords: m.data.keywords || [],
          cast: (m.data.cast || []).map((c) => ({ actor_id: c.actor?.id || c.actor_id, character_name: c.character_name })),
          crew: (m.data.crew || []).map((c) => ({ name: c.name, role: c.role })),
          gallery: m.data.gallery || [],
        });
        savedFormRef.current = null; // will be set on first render after mount
      } catch {
        toast.error("Failed to load movie");
      }
    })();
  }, [id]);

  // First-render snapshot: whenever form loads, take its baseline once so auto-save doesn't fire on load.
  useEffect(() => {
    if (form && savedFormRef.current == null) {
      savedFormRef.current = JSON.stringify(form);
    }
  }, [form]);

  // Scroll spy
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
  }, [movie]);

  const isFieldLocked = (name) => locked.includes(name);
  const canEditField = (name) => isMod || !isFieldLocked(name);

  const toggleLock = async (fieldName) => {
    if (!isMod) return;
    const next = locked.includes(fieldName) ? locked.filter((f) => f !== fieldName) : [...locked, fieldName];
    try {
      const r = await api.patch(`/movies/${id}/lock`, { locked_fields: next });
      setLocked(r.data.locked_fields || next);
      toast.success(locked.includes(fieldName) ? "Field unlocked" : "Field locked");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const save = async (overrideForm, opts = {}) => {
    // Guard: onClick handlers may pass a SyntheticEvent. Only accept plain form objects.
    const looksLikeForm = overrideForm && typeof overrideForm === "object"
      && !overrideForm.nativeEvent && !overrideForm.currentTarget && Array.isArray(overrideForm.cast);
    const src = looksLikeForm ? overrideForm : form;
    if (!src) return;
    const silent = !!opts.silent;
    setSaving(true);
    if (silent) setAutoStatus("saving");
    try {
      const payload = {};
      const fields = ["title", "release_date", "runtime", "synopsis", "tagline", "status", "original_language",
        "budget", "revenue", "awards_wins", "awards_nominations", "poster_url", "backdrop_url", "trailer_url",
        "video_urls", "genres", "keywords", "cast", "crew", "gallery"];
      for (const f of fields) {
        // Skip locked fields for non-mods (server would 403 anyway)
        if (!isMod && locked.includes(f)) continue;
        let v = src[f];
        if (["runtime", "budget", "revenue", "awards_wins", "awards_nominations"].includes(f)) {
          v = v === "" || v == null ? null : Number(v);
        }
        payload[f] = v;
      }
      payload.cast = (src.cast || []).filter((c) => c.actor_id && c.character_name);
      payload.crew = (src.crew || []).filter((c) => c.name && c.role);
      const r = await api.patch(`/movies/${id}`, payload);
      // Snapshot the just-saved form so auto-save doesn't re-fire
      savedFormRef.current = JSON.stringify(src);
      savedAtRef.current = Date.now();
      if (silent) {
        setAutoStatus("saved");
        setTimeout(() => setAutoStatus((s) => (s === "saved" ? "idle" : s)), 1600);
      } else {
        toast.success("Changes saved");
      }
      setMovie(r.data);
      try { const s = await api.get(`/movies/${id}/stats`); setStats(s.data); } catch {}
    } catch (e) {
      if (silent) setAutoStatus("error");
      toast.error(e.response?.data?.detail || "Save failed");
    }
    setSaving(false);
  };

  // Debounced auto-save: whenever the form changes, save 900ms after the last change.
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

  const scrollTo = (sid) => {
    const el = sectionRefs.current[sid];
    if (el) window.scrollTo({ top: el.offsetTop - 90, behavior: "smooth" });
  };

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
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

  if (!movie || !form) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;
  if (!user) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Please <Link to="/login" className="text-sky-600">sign in</Link> to edit.</div>;
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const remCast = (i) => setForm((f) => ({ ...f, cast: f.cast.filter((_, x) => x !== i) }));
  const addCast = () => setCastDialog({ open: true, index: null });
  const openCastEdit = (i) => setCastDialog({ open: true, index: i });
  const reorderCast = (from, to) => {
    if (from === to || from == null || to == null) return;
    const list = [...form.cast];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const nextForm = { ...form, cast: list };
    setForm(nextForm);
    save(nextForm);
  };
  const toggleCastLock = async (actorId) => {
    try {
      const r = await api.post(`/movies/${id}/cast-lock`, { actor_id: actorId });
      setMovie((m) => m ? { ...m, locked_cast_actor_ids: r.data.locked_cast_actor_ids } : m);
      const nowLocked = (r.data.locked_cast_actor_ids || []).includes(actorId);
      const actor = actors.find((a) => a.id === actorId);
      toast.success(`${nowLocked ? "Locked" : "Unlocked"} ${actor?.name || "cast member"}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };
  const handleCastSave = (row) => {
    // Prevent duplicates: if adding (index==null) and this actor is already in the list, error out.
    if (castDialog.index == null && (form.cast || []).some((c) => c.actor_id === row.actor_id)) {
      toast.error("This actor is already in the cast.");
      return;
    }
    // When editing, allow the row but block collisions with other rows.
    if (castDialog.index != null && (form.cast || []).some((c, x) => x !== castDialog.index && c.actor_id === row.actor_id)) {
      toast.error("Another cast row is already using this actor.");
      return;
    }
    const nextCast = castDialog.index == null
      ? [...form.cast, row]
      : form.cast.map((c, x) => x === castDialog.index ? row : c);
    const nextForm = { ...form, cast: nextCast };
    setForm(nextForm);
    save(nextForm);
  };
  const handleActorCreated = (actor) => {
    setActors((prev) => [...prev, { id: actor.id, name: actor.name, photo_url: actor.photo_url || "" }]);
  };
  const updCrew = (i, k, v) => setForm((f) => ({ ...f, crew: f.crew.map((c, x) => x === i ? { ...c, [k]: v } : c) }));
  const remCrew = (i) => setForm((f) => ({ ...f, crew: f.crew.filter((_, x) => x !== i) }));
  const addCrew = () => setForm((f) => ({ ...f, crew: [...f.crew, { name: "", role: "Director" }] }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="movie-edit-page">
      {/* Slim top bar */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <button onClick={() => navigate(`/movie/${id}`)} className="flex items-center gap-2 text-slate-200 hover:text-white text-sm" data-testid="back-to-movie">
            <ArrowLeft className="w-4 h-4" /> Back to {movie.title}
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
            <Button onClick={() => save()} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white h-9 font-semibold" data-testid="top-save-btn">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        {/* ============= LEFT SIDEBAR ============= */}
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-4" data-testid="edit-sidebar">
          <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
            <div className="bg-cyan-500 text-white px-4 py-3 font-bold flex items-center justify-between">
              <span>Edit</span>
              <span className="text-xs bg-white/20 rounded-full w-5 h-5 flex items-center justify-center">?</span>
            </div>
            <nav className="py-2">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition ${activeSection === s.id ? "text-cyan-600 font-semibold bg-cyan-50" : "text-slate-700 hover:bg-slate-50"}`}
                  data-testid={`section-link-${s.id}`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 border-l-4 border-l-emerald-500">
            <div className="text-3xl font-bold text-slate-900" data-testid="edit-content-score">{stats.content_score || 0}</div>
            <div className="text-xs text-slate-500 mt-0.5">{scoreLabel}</div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${stats.content_score || 0}%` }} />
            </div>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-1 px-1">
            <Keyboard className="w-3.5 h-3.5" /> Keyboard Shortcuts <span className="ml-auto text-slate-400">Ctrl+S</span>
          </div>
        </aside>

        {/* ============= FORM SECTIONS ============= */}
        <div className="space-y-8 min-w-0">
          {/* ---- Primary Facts ---- */}
          <section id="primary-facts" ref={(el) => (sectionRefs.current["primary-facts"] = el)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="original_language" label="Original Movie Language" locked={isFieldLocked("original_language")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("original_language")}>
                <Input value={form.original_language} onChange={(e) => setField("original_language", e.target.value)} disabled={!canEditField("original_language")} className="bg-white border-slate-300 text-slate-900" data-testid="field-original-language" />
              </Field>
              <Field name="status" label="Movie Status" locked={isFieldLocked("status")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("status")}>
                <Select value={form.status} onValueChange={(v) => setField("status", v)} disabled={!canEditField("status")}>
                  <SelectTrigger className="bg-white border-slate-300 text-slate-900" data-testid="field-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <Field name="title" label="Original Title" locked={isFieldLocked("title")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("title")}>
              <Input value={form.title} onChange={(e) => setField("title", e.target.value)} disabled={!canEditField("title")} className="bg-white border-slate-300 text-slate-900" data-testid="field-title" />
            </Field>

            <Field name="synopsis" label="Overview" locked={isFieldLocked("synopsis")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("synopsis")}>
              <Textarea rows={4} value={form.synopsis} onChange={(e) => setField("synopsis", e.target.value)} disabled={!canEditField("synopsis")} className="bg-white border-slate-300 text-slate-900" data-testid="field-synopsis" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="release_date" label="Release Date" locked={isFieldLocked("release_date")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("release_date")}>
                <Input type="date" value={form.release_date} onChange={(e) => setField("release_date", e.target.value)} disabled={!canEditField("release_date")} className="bg-white border-slate-300 text-slate-900" data-testid="field-release-date" />
              </Field>
              <Field name="runtime" label="Runtime (in minutes)" locked={isFieldLocked("runtime")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("runtime")}>
                <Input type="number" value={form.runtime} onChange={(e) => setField("runtime", e.target.value)} disabled={!canEditField("runtime")} className="bg-white border-slate-300 text-slate-900" data-testid="field-runtime" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="revenue" label="Revenue (US Dollars)" locked={isFieldLocked("revenue")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("revenue")}>
                <Input type="number" value={form.revenue} onChange={(e) => setField("revenue", e.target.value)} disabled={!canEditField("revenue")} className="bg-white border-slate-300 text-slate-900" data-testid="field-revenue" />
              </Field>
              <Field name="budget" label="Budget (US Dollars)" locked={isFieldLocked("budget")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("budget")}>
                <Input type="number" value={form.budget} onChange={(e) => setField("budget", e.target.value)} disabled={!canEditField("budget")} className="bg-white border-slate-300 text-slate-900" data-testid="field-budget" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="awards_wins" label="Awards — Wins" locked={isFieldLocked("awards_wins")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("awards_wins")}>
                <Input type="number" value={form.awards_wins} onChange={(e) => setField("awards_wins", e.target.value)} disabled={!canEditField("awards_wins")} className="bg-white border-slate-300 text-slate-900" data-testid="field-wins" />
              </Field>
              <Field name="awards_nominations" label="Awards — Nominations" locked={isFieldLocked("awards_nominations")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("awards_nominations")}>
                <Input type="number" value={form.awards_nominations} onChange={(e) => setField("awards_nominations", e.target.value)} disabled={!canEditField("awards_nominations")} className="bg-white border-slate-300 text-slate-900" data-testid="field-nominations" />
              </Field>
            </div>
          </section>

          {/* ---- Cast ---- */}
          <section id="cast" ref={(el) => (sectionRefs.current["cast"] = el)} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Cast</h2>
              <LockIcon locked={isFieldLocked("cast")} canToggle={isMod} onToggle={() => toggleLock("cast")} />
            </div>
            {(movie?.locked_cast_actor_ids || []).length > 0 && (
              <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2" data-testid="cast-lock-banner">
                <LockKeyhole className="w-3.5 h-3.5 flex-shrink-0" />
                {(movie.locked_cast_actor_ids || []).length} cast member{(movie.locked_cast_actor_ids || []).length !== 1 && "s"} locked by moderators — these rows can't be removed, edited or reordered by non-mods.
              </div>
            )}
            <div className="space-y-2">
              {form.cast.map((c, i) => {
                const actor = actors.find((a) => a.id === c.actor_id);
                const dragging = dragIdx === i;
                const rowLocked = (movie?.locked_cast_actor_ids || []).includes(c.actor_id);
                const rowEditable = canEditField("cast") && (canLockCast || !rowLocked);
                return (
                  <div
                    key={i}
                    draggable={rowEditable}
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => { e.preventDefault(); if (rowEditable) reorderCast(dragIdx, i); setDragIdx(null); }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`flex items-center gap-3 rounded-md border bg-white px-3 py-2 transition ${dragging ? "opacity-40 border-cyan-400" : rowLocked ? "border-amber-300 bg-amber-50/40" : "border-slate-200 hover:border-slate-300"}`}
                    data-testid={`cast-row-${i}`}
                  >
                    <GripVertical className={`w-4 h-4 text-slate-400 ${rowEditable ? "cursor-grab active:cursor-grabbing" : "opacity-30"}`} data-testid={`cast-drag-${i}`} />
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                      {actor?.photo_url ? <img src={fileUrl(actor.photo_url)} alt="" className="w-full h-full object-cover" /> : (actor?.name?.[0] || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate flex items-center gap-1.5">
                        {actor?.name || "(unknown)"}
                        {rowLocked && <LockKeyhole className="w-3.5 h-3.5 text-amber-500" title="Locked by moderators" />}
                      </div>
                      <div className="text-xs text-slate-500 truncate">as {c.character_name || "—"}</div>
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums w-6 text-right">#{i + 1}</span>
                    {canLockCast && c.actor_id && (
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleCastLock(c.actor_id)} className={`h-8 ${rowLocked ? "border-amber-400 text-amber-700 hover:bg-amber-100" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`} data-testid={`cast-lock-${i}`}>
                        {rowLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => openCastEdit(i)} disabled={!rowEditable} className="border-slate-300 text-slate-700 hover:bg-slate-100 h-8" data-testid={`cast-edit-${i}`}>Edit</Button>
                    {!(rowLocked && !canLockCast) && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => remCast(i)} disabled={!rowEditable} className="text-slate-400 hover:text-rose-500" data-testid={`cast-remove-${i}`}><X className="w-4 h-4" /></Button>
                    )}
                  </div>
                );
              })}
              {form.cast.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-200 py-6 text-center text-slate-400 text-sm">No cast yet. Click "Add cast" to link an actor.</div>
              )}
            </div>
            <Button type="button" variant="outline" onClick={addCast} disabled={!canEditField("cast")} className="border-slate-300 text-slate-700 hover:bg-slate-100 h-8" data-testid="edit-add-cast"><Plus className="w-4 h-4 mr-1" /> Add cast</Button>
          </section>

          {/* ---- Crew ---- */}
          <section id="crew" ref={(el) => (sectionRefs.current["crew"] = el)} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-slate-900">Crew</h2>
              <LockIcon locked={isFieldLocked("crew")} canToggle={isMod} onToggle={() => toggleLock("crew")} />
            </div>
            <div className="space-y-2">
              {form.crew.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Name" value={c.name} onChange={(e) => updCrew(i, "name", e.target.value)} disabled={!canEditField("crew")} className="flex-1 bg-white border-slate-300 text-slate-900" data-testid={`edit-crew-name-${i}`} />
                  <Select value={c.role} onValueChange={(v) => updCrew(i, "role", v)} disabled={!canEditField("crew")}>
                    <SelectTrigger className="w-[180px] bg-white border-slate-300 text-slate-900" data-testid={`edit-crew-role-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{CREW_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" onClick={() => remCrew(i)} disabled={!canEditField("crew")} className="text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={addCrew} disabled={!canEditField("crew")} className="border-slate-300 text-slate-700 hover:bg-slate-100 h-8" data-testid="edit-add-crew"><Plus className="w-4 h-4 mr-1" /> Add crew</Button>
          </section>

          {/* ---- Genres ---- */}
          <section id="genres" ref={(el) => (sectionRefs.current["genres"] = el)}>
            <Field name="genres" label="Genres" locked={isFieldLocked("genres")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("genres")} hint="Press Enter or comma to add a tag">
              <ChipInput value={form.genres} onChange={(v) => setField("genres", v)} placeholder="Drama, Sci-Fi…" disabled={!canEditField("genres")} testid="field-genres" />
            </Field>
          </section>

          {/* ---- Keywords ---- */}
          <section id="keywords" ref={(el) => (sectionRefs.current["keywords"] = el)}>
            <Field name="keywords" label="Keywords" locked={isFieldLocked("keywords")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("keywords")} hint="Short descriptive tags surfaced in the sidebar">
              <ChipInput value={form.keywords} onChange={(v) => setField("keywords", v)} placeholder="chocolate, factory, family…" disabled={!canEditField("keywords")} testid="field-keywords" />
            </Field>
          </section>

          {/* ---- Taglines ---- */}
          <section id="taglines" ref={(el) => (sectionRefs.current["taglines"] = el)}>
            <Field name="tagline" label="Tagline" locked={isFieldLocked("tagline")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("tagline")}>
              <Input value={form.tagline} onChange={(e) => setField("tagline", e.target.value)} disabled={!canEditField("tagline")} placeholder="A short catchy line…" className="bg-white border-slate-300 text-slate-900" data-testid="field-tagline" />
            </Field>
          </section>

          {/* ---- Videos ---- */}
          <section id="videos" ref={(el) => (sectionRefs.current["videos"] = el)} className="space-y-5">
            <Field name="trailer_url" label="Trailer URL" locked={isFieldLocked("trailer_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("trailer_url")}>
              <Input value={form.trailer_url} onChange={(e) => setField("trailer_url", e.target.value)} disabled={!canEditField("trailer_url")} placeholder="https://youtube.com/watch?v=…" className="bg-white border-slate-300 text-slate-900" data-testid="field-trailer" />
            </Field>
            <Field name="video_urls" label="Additional Videos" locked={isFieldLocked("video_urls")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("video_urls")} hint="Add extra YouTube URLs, one per tag">
              <ChipInput value={form.video_urls} onChange={(v) => setField("video_urls", v)} placeholder="https://youtu.be/…" disabled={!canEditField("video_urls")} testid="field-video-urls" />
            </Field>
          </section>

          {/* ---- Images ---- */}
          <section id="images" ref={(el) => (sectionRefs.current["images"] = el)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field name="poster_url" label="Poster" locked={isFieldLocked("poster_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("poster_url")}>
                <ImageUpload value={form.poster_url} onChange={(v) => setField("poster_url", v)} testid="field-poster" />
              </Field>
              <Field name="backdrop_url" label="Backdrop" locked={isFieldLocked("backdrop_url")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("backdrop_url")}>
                <ImageUpload value={form.backdrop_url} onChange={(v) => setField("backdrop_url", v)} testid="field-backdrop" />
              </Field>
            </div>
            <Field name="gallery" label={`Gallery (${form.gallery.length} images)`} locked={isFieldLocked("gallery")} canToggleLocks={isMod} onToggleLock={toggleLock} disabled={!canEditField("gallery")}>
              <GalleryUpload value={form.gallery} onChange={(v) => setField("gallery", v)} testid="field-gallery" />
            </Field>
          </section>

          {isMod && (
            <section className="mt-6">
              <CollectionsPicker
                kind="movie"
                titleId={id}
                value={movie?.collection_ids || (movie?.collections || []).map((c) => c.id)}
                onChange={(next) => setMovie((m) => m ? { ...m, collection_ids: next, collections: (m.collections || []).filter((c) => next.includes(c.id)) } : m)}
              />
            </section>
          )}

          <div className="pt-4 pb-16 flex justify-end gap-2 border-t border-slate-200">
            <Button variant="outline" onClick={() => navigate(`/movie/${id}`)} className="border-slate-300 text-slate-700 hover:bg-slate-100">Cancel</Button>
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
        value={castDialog.index != null ? form.cast[castDialog.index] : null}
        onSave={handleCastSave}
        onActorCreated={handleActorCreated}
      />
    </div>
  );
}
