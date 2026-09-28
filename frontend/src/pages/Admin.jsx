import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, X, Trash2, Edit, Shield } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (initializing) return;
    if (!user) { navigate("/login"); return; }
    if (user.role !== "admin") { navigate("/"); }
  }, [user, initializing, navigate]);

  if (initializing || !user || user.role !== "admin") return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <Shield className="w-4 h-4" /> Admin Console
      </div>
      <h1 className="mt-2 font-heading text-4xl font-bold text-white">Manage Catalog</h1>

      <Tabs defaultValue="movies" className="mt-8">
        <TabsList className="bg-[#14181f] border border-white/10">
          <TabsTrigger value="movies" data-testid="tab-movies">Movies</TabsTrigger>
          <TabsTrigger value="actors" data-testid="tab-actors">Actors</TabsTrigger>
        </TabsList>
        <TabsContent value="movies" className="mt-6"><MoviesTab /></TabsContent>
        <TabsContent value="actors" className="mt-6"><ActorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useUpload() {
  const upload = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return r.data.path;
  };
  return upload;
}

function ImageUpload({ value, onChange, testid }) {
  const upload = useUpload();
  const ref = useRef();
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { const p = await upload(f); onChange(p); toast.success("Uploaded"); }
    catch { toast.error("Upload failed"); }
    setBusy(false);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-[#1e2430] border border-white/10">
          <img src={fileUrl(value)} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-16 h-16 rounded-lg bg-[#1e2430] border border-white/10 flex items-center justify-center text-slate-600">
          <Upload className="w-5 h-5" />
        </div>
      )}
      <input type="file" accept="image/*" ref={ref} onChange={handle} className="hidden" />
      <Button
        type="button"
        variant="outline"
        onClick={() => ref.current.click()}
        disabled={busy}
        className="border-white/20 text-white hover:bg-white/10 hover:text-white"
        data-testid={testid}
      >
        {busy ? "Uploading..." : value ? "Replace" : "Upload"}
      </Button>
      {value && (
        <Button type="button" variant="ghost" onClick={() => onChange("")} className="text-slate-400 hover:text-white hover:bg-white/5">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

function MoviesTab() {
  const [movies, setMovies] = useState([]);
  const [actors, setActors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const empty = { title: "", release_date: "", genres: "", synopsis: "", poster_url: "", backdrop_url: "", trailer_url: "", runtime: "", is_trending: false, cast: [] };
  const [form, setForm] = useState(empty);

  const load = async () => {
    const [m, a] = await Promise.all([api.get("/movies"), api.get("/actors")]);
    setMovies(m.data); setActors(a.data);
  };
  useEffect(() => { load(); }, []);

  const startEdit = (m) => {
    setEditingId(m.id);
    setForm({
      title: m.title, release_date: m.release_date || "", genres: (m.genres || []).join(", "),
      synopsis: m.synopsis || "", poster_url: m.poster_url || "", backdrop_url: m.backdrop_url || "",
      trailer_url: m.trailer_url || "", runtime: m.runtime || "", is_trending: !!m.is_trending,
      cast: (m.cast || []).map((c) => ({ actor_id: c.actor?.id || c.actor_id, character_name: c.character_name })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => { setEditingId(null); setForm(empty); };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
      runtime: form.runtime ? Number(form.runtime) : null,
      cast: form.cast.filter((c) => c.actor_id && c.character_name),
    };
    try {
      if (editingId) { await api.patch(`/movies/${editingId}`, payload); toast.success("Movie updated"); }
      else { await api.post("/movies", payload); toast.success("Movie created"); }
      reset(); load();
    } catch (e) { toast.error("Failed to save"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this movie?")) return;
    await api.delete(`/movies/${id}`); toast.success("Deleted"); load();
  };

  const addCastRow = () => setForm({ ...form, cast: [...form.cast, { actor_id: "", character_name: "" }] });
  const updateCastRow = (i, key, val) => {
    const next = [...form.cast]; next[i] = { ...next[i], [key]: val }; setForm({ ...form, cast: next });
  };
  const removeCastRow = (i) => setForm({ ...form, cast: form.cast.filter((_, idx) => idx !== i) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>{editingId ? "Edit Movie" : "New Movie"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-slate-300">Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-title-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-slate-300">Release date</Label>
                <Input required type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-release-input" />
              </div>
              <div>
                <Label className="text-slate-300">Runtime (min)</Label>
                <Input type="number" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-runtime-input" />
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Genres (comma separated)</Label>
              <Input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Drama, Sci-Fi" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-genres-input" />
            </div>
            <div>
              <Label className="text-slate-300">Synopsis</Label>
              <Textarea rows={4} value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-synopsis-input" />
            </div>
            <div>
              <Label className="text-slate-300">Trailer URL</Label>
              <Input value={form.trailer_url} onChange={(e) => setForm({ ...form, trailer_url: e.target.value })} placeholder="https://youtube.com/..." className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-trailer-input" />
            </div>
            <div>
              <Label className="text-slate-300 block mb-2">Poster</Label>
              <ImageUpload value={form.poster_url} onChange={(v) => setForm({ ...form, poster_url: v })} testid="movie-poster-upload" />
            </div>
            <div>
              <Label className="text-slate-300 block mb-2">Backdrop</Label>
              <ImageUpload value={form.backdrop_url} onChange={(v) => setForm({ ...form, backdrop_url: v })} testid="movie-backdrop-upload" />
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 px-4 py-3">
              <Switch checked={form.is_trending} onCheckedChange={(v) => setForm({ ...form, is_trending: v })} data-testid="movie-trending-switch" />
              <Label className="text-slate-300 cursor-pointer">Mark as trending</Label>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-300">Cast</Label>
                <Button type="button" variant="outline" onClick={addCastRow} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-8" data-testid="add-cast-btn">
                  <Plus className="w-4 h-4 mr-1" /> Add cast
                </Button>
              </div>
              <div className="space-y-2">
                {form.cast.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={c.actor_id} onValueChange={(v) => updateCastRow(i, "actor_id", v)}>
                      <SelectTrigger className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`cast-actor-${i}`}>
                        <SelectValue placeholder="Select actor" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#14181f] text-white border-white/10 max-h-64">
                        {actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Character" value={c.character_name} onChange={(e) => updateCastRow(i, "character_name", e.target.value)} className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`cast-character-${i}`} />
                    <Button type="button" variant="ghost" onClick={() => removeCastRow(i)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                  </div>
                ))}
                {form.cast.length === 0 && <div className="text-xs text-slate-500">Add actors first, then link them here.</div>}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="movie-submit-btn">
                {editingId ? "Update Movie" : "Create Movie"}
              </Button>
              {editingId && <Button type="button" variant="outline" onClick={reset} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>All Movies ({movies.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            {movies.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3" data-testid={`admin-movie-row-${m.id}`}>
                <div className="w-14 h-20 rounded bg-[#1e2430] overflow-hidden flex-shrink-0">
                  {m.poster_url && <img src={fileUrl(m.poster_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{m.title}</div>
                  <div className="text-xs text-slate-400">{m.release_date || "—"} • {(m.genres || []).slice(0, 2).join(", ")}</div>
                  {m.is_trending && <Badge className="mt-1 bg-amber-500/15 text-amber-300 border-amber-500/40">Trending</Badge>}
                </div>
                <Button size="sm" variant="outline" onClick={() => startEdit(m)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`edit-movie-${m.id}`}><Edit className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => del(m.id)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10" data-testid={`delete-movie-${m.id}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {movies.length === 0 && <div className="text-slate-500 text-sm">No movies yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActorsTab() {
  const [actors, setActors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const empty = { name: "", bio: "", photo_url: "", birth_date: "" };
  const [form, setForm] = useState(empty);

  const load = async () => { const r = await api.get("/actors"); setActors(r.data); };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setForm(empty); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) { await api.patch(`/actors/${editingId}`, form); toast.success("Actor updated"); }
      else { await api.post("/actors", form); toast.success("Actor created"); }
      reset(); load();
    } catch { toast.error("Failed to save"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this actor?")) return;
    await api.delete(`/actors/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>{editingId ? "Edit Actor" : "New Actor"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-slate-300">Full name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-name-input" />
            </div>
            <div>
              <Label className="text-slate-300">Birth date</Label>
              <Input type="date" value={form.birth_date || ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-birthdate-input" />
            </div>
            <div>
              <Label className="text-slate-300">Bio</Label>
              <Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="actor-bio-input" />
            </div>
            <div>
              <Label className="text-slate-300 block mb-2">Headshot</Label>
              <ImageUpload value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} testid="actor-photo-upload" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="actor-submit-btn">
                {editingId ? "Update Actor" : "Create Actor"}
              </Button>
              {editingId && <Button type="button" variant="outline" onClick={reset} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>All Actors ({actors.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            {actors.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3" data-testid={`admin-actor-row-${a.id}`}>
                <div className="w-14 h-14 rounded-full bg-[#1e2430] overflow-hidden flex-shrink-0">
                  {a.photo_url && <img src={fileUrl(a.photo_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.birth_date || "—"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setEditingId(a.id); setForm({ name: a.name, bio: a.bio || "", photo_url: a.photo_url || "", birth_date: a.birth_date || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`edit-actor-${a.id}`}><Edit className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => del(a.id)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10" data-testid={`delete-actor-${a.id}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {actors.length === 0 && <div className="text-slate-500 text-sm">No actors yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
