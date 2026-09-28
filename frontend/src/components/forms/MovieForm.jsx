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

export default function MovieForm({ movie, onSaved, onCancel }) {
  const [actors, setActors] = useState([]);
  const empty = { title: "", release_date: "", genres: "", synopsis: "", poster_url: "", backdrop_url: "", trailer_url: "", runtime: "", is_trending: false, cast: [], gallery: [] };
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
        poster_url: movie.poster_url || "",
        backdrop_url: movie.backdrop_url || "",
        trailer_url: movie.trailer_url || "",
        runtime: movie.runtime || "",
        is_trending: !!movie.is_trending,
        gallery: movie.gallery || [],
        cast: (movie.cast || []).map((c) => ({ actor_id: c.actor?.id || c.actor_id, character_name: c.character_name })),
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
      runtime: form.runtime ? Number(form.runtime) : null,
      cast: form.cast.filter((c) => c.actor_id && c.character_name),
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

  return (
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
          <Input type="number" value={form.runtime} onChange={(e) => setForm({ ...form, runtime: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
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
        <Input value={form.trailer_url} onChange={(e) => setForm({ ...form, trailer_url: e.target.value })} placeholder="https://youtube.com/..." className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
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
