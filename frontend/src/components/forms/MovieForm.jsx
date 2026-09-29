import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";

const STATUSES = ["Released", "In Production", "Post Production", "Rumored", "Canceled"];
const CREW_ROLES = ["Director", "Writer", "Producer", "Cinematographer", "Composer", "Editor"];

export default function MovieForm({ movie, onSaved, onCancel }) {
  const [actors, setActors] = useState([]);
  const empty = {
    title: "", release_date: "", genres: "", synopsis: "", tagline: "",
    poster_url: "", backdrop_url: "", trailer_url: "", video_urls: "",
    runtime: "", is_trending: false, cast: [], crew: [], gallery: [],
    keywords: "", status: "Released", original_language: "English",
    budget: "", revenue: "", awards_wins: "", awards_nominations: "",
  };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    api.get("/actors").then((r) => setActors(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (movie) {
      setForm({
        title: movie.title || "",
        release_date: movie.release_date || "",
        genres: (movie.genres || []).join(", "),
        synopsis: movie.synopsis || "",
        tagline: movie.tagline || "",
        poster_url: movie.poster_url || "",
        backdrop_url: movie.backdrop_url || "",
        trailer_url: movie.trailer_url || "",
        video_urls: (movie.video_urls || []).join("\n"),
        runtime: movie.runtime || "",
        is_trending: !!movie.is_trending,
        gallery: movie.gallery || [],
        cast: (movie.cast || []).map((c) => ({ actor_id: c.actor?.id || c.actor_id, character_name: c.character_name })),
        crew: (movie.crew || []).map((c) => ({ name: c.name || "", role: c.role || "Director" })),
        keywords: (movie.keywords || []).join(", "),
        status: movie.status || "Released",
        original_language: movie.original_language || "English",
        budget: movie.budget ?? "",
        revenue: movie.revenue ?? "",
        awards_wins: movie.awards_wins ?? "",
        awards_nominations: movie.awards_nominations ?? "",
      });
    } else {
      setForm(empty);
    }
    // eslint-disable-next-line
  }, [movie]);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
      keywords: form.keywords.split(",").map((g) => g.trim()).filter(Boolean),
      video_urls: form.video_urls.split("\n").map((u) => u.trim()).filter(Boolean),
      runtime: form.runtime ? Number(form.runtime) : null,
      budget: form.budget === "" ? null : Number(form.budget),
      revenue: form.revenue === "" ? null : Number(form.revenue),
      awards_wins: form.awards_wins === "" ? null : Number(form.awards_wins),
      awards_nominations: form.awards_nominations === "" ? null : Number(form.awards_nominations),
      cast: form.cast.filter((c) => c.actor_id && c.character_name),
      crew: form.crew.filter((c) => c.name && c.role),
    };
    try {
      let result;
      if (movie?.id) {
        result = (await api.patch(`/movies/${movie.id}`, payload)).data;
        toast.success("Movie updated");
      } else {
        result = (await api.post("/movies", payload)).data;
        toast.success("Movie created");
      }
      onSaved && onSaved(result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    }
  };

  const addCast = () => setForm({ ...form, cast: [...form.cast, { actor_id: "", character_name: "" }] });
  const updCast = (i, k, v) => { const n = [...form.cast]; n[i] = { ...n[i], [k]: v }; setForm({ ...form, cast: n }); };
  const remCast = (i) => setForm({ ...form, cast: form.cast.filter((_, x) => x !== i) });

  const addCrew = () => setForm({ ...form, crew: [...form.crew, { name: "", role: "Director" }] });
  const updCrew = (i, k, v) => { const n = [...form.crew]; n[i] = { ...n[i], [k]: v }; setForm({ ...form, crew: n }); };
  const remCrew = (i) => setForm({ ...form, crew: form.crew.filter((_, x) => x !== i) });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="text-slate-300">Title</Label>
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-title-input" />
      </div>
      <div>
        <Label className="text-slate-300">Tagline</Label>
        <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="They're back with a twist!" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-tagline-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Release date</Label>
          <Input required type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-release-input" />
        </div>
        <div>
          <Label className="text-slate-300">Runtime (min)</Label>
          <Input type="number" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-status-select"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#14181f] text-white border-white/10">
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300">Original Language</Label>
          <Input value={form.original_language} onChange={(e) => setForm({ ...form, original_language: e.target.value })} placeholder="English" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Budget (USD)</Label>
          <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="150000000" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-budget-input" />
        </div>
        <div>
          <Label className="text-slate-300">Revenue (USD)</Label>
          <Input type="number" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} placeholder="1868208796" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-revenue-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300">Awards — Wins</Label>
          <Input type="number" value={form.awards_wins} onChange={(e) => setForm({ ...form, awards_wins: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-wins-input" />
        </div>
        <div>
          <Label className="text-slate-300">Awards — Nominations</Label>
          <Input type="number" value={form.awards_nominations} onChange={(e) => setForm({ ...form, awards_nominations: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-noms-input" />
        </div>
      </div>
      <div>
        <Label className="text-slate-300">Genres (comma separated)</Label>
        <Input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Drama, Sci-Fi" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-genres-input" />
      </div>
      <div>
        <Label className="text-slate-300">Keywords (comma separated)</Label>
        <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="snake, fox, bunny, cop" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-keywords-input" />
      </div>
      <div>
        <Label className="text-slate-300">Synopsis</Label>
        <Textarea rows={4} value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="movie-synopsis-input" />
      </div>
      <div>
        <Label className="text-slate-300">Trailer URL</Label>
        <Input value={form.trailer_url} onChange={(e) => setForm({ ...form, trailer_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
      </div>
      <div>
        <Label className="text-slate-300">Additional Video URLs (one per line)</Label>
        <Textarea rows={2} value={form.video_urls} onChange={(e) => setForm({ ...form, video_urls: e.target.value })} placeholder="https://youtube.com/watch?v=xxx" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300 block mb-2">Poster</Label>
          <ImageUpload value={form.poster_url} onChange={(v) => setForm({ ...form, poster_url: v })} testid="movie-poster-upload" />
        </div>
        <div>
          <Label className="text-slate-300 block mb-2">Backdrop</Label>
          <ImageUpload value={form.backdrop_url} onChange={(v) => setForm({ ...form, backdrop_url: v })} />
        </div>
      </div>
      <div>
        <Label className="text-slate-300 block mb-2">Gallery ({form.gallery.length} images)</Label>
        <GalleryUpload value={form.gallery} onChange={(v) => setForm({ ...form, gallery: v })} testid="movie-gallery-upload" />
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 px-4 py-3">
        <Switch checked={form.is_trending} onCheckedChange={(v) => setForm({ ...form, is_trending: v })} data-testid="movie-trending-switch" />
        <Label className="text-slate-300 cursor-pointer">Mark as trending</Label>
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-slate-300">Crew (Directors, Writers, etc.)</Label>
          <Button type="button" variant="outline" onClick={addCrew} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-8" data-testid="add-crew-btn">
            <Plus className="w-4 h-4 mr-1" /> Add crew
          </Button>
        </div>
        <div className="space-y-2">
          {form.crew.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input placeholder="Name" value={c.name} onChange={(e) => updCrew(i, "name", e.target.value)} className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`crew-name-${i}`} />
              <Select value={c.role} onValueChange={(v) => updCrew(i, "role", v)}>
                <SelectTrigger className="w-[180px] bg-[#0d0f12] border-white/10 text-white" data-testid={`crew-role-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#14181f] text-white border-white/10">
                  {CREW_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" onClick={() => remCrew(i)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
            </div>
          ))}
          {form.crew.length === 0 && <div className="text-xs text-slate-500">Add directors, writers, and other crew here.</div>}
        </div>
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-slate-300">Cast</Label>
          <Button type="button" variant="outline" onClick={addCast} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-8" data-testid="add-cast-btn">
            <Plus className="w-4 h-4 mr-1" /> Add cast
          </Button>
        </div>
        <div className="space-y-2">
          {form.cast.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={c.actor_id} onValueChange={(v) => updCast(i, "actor_id", v)}>
                <SelectTrigger className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`cast-actor-${i}`}>
                  <SelectValue placeholder="Select actor" />
                </SelectTrigger>
                <SelectContent className="bg-[#14181f] text-white border-white/10 max-h-64">
                  {actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Character" value={c.character_name} onChange={(e) => updCast(i, "character_name", e.target.value)} className="flex-1 bg-[#0d0f12] border-white/10 text-white" data-testid={`cast-character-${i}`} />
              <Button type="button" variant="ghost" onClick={() => remCast(i)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
            </div>
          ))}
          {form.cast.length === 0 && <div className="text-xs text-slate-500">Add actors first, then link them here.</div>}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-white/10">
        <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="movie-submit-btn">
          {movie ? "Update Movie" : "Create Movie"}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
      </div>
    </form>
  );
}
