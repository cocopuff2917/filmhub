import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";

export default function KeywordDetail() {
  const { keyword } = useParams();
  const { user } = useAuth();
  const [movies, setMovies] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setMovies(null);
    setMetadata(null);
    api.get("/movies", { params: { keyword } })
      .then((response) => { if (active) setMovies(response.data || []); })
      .catch(() => { if (active) setMovies([]); });
    api.get(`/movies/keywords/${encodeURIComponent(keyword)}`)
      .then((response) => { if (active) setMetadata(response.data); })
      .catch(() => { if (active) setMetadata({ keyword, description: "" }); });
    return () => { active = false; };
  }, [keyword]);

  const title = metadata?.keyword || keyword;

  const openEditor = () => {
    setDraftDescription(metadata?.description || "");
    setEditOpen(true);
  };

  const saveDescription = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.patch(`/movies/keywords/${encodeURIComponent(keyword)}`, { description: draftDescription });
      setMetadata(response.data);
      setEditOpen(false);
      toast.success("Keyword description updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not update keyword description");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0a0d14]" data-testid="keyword-detail-page">
      <section className="border-b border-white/10 bg-[#10151d]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link to="/browse?tab=movies" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" data-testid="keyword-back-to-browse">
            <ArrowLeft className="h-4 w-4" /> Browse Movies
          </Link>
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Tag className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Movie keyword</div>
              <h1 className="mt-1 font-heading text-3xl font-bold text-white" data-testid="keyword-title">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {movies === null ? "Loading movies…" : `${movies.length} movie${movies.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            {user && (
              <Button type="button" variant="outline" onClick={openEditor} className="ml-auto border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-keyword-btn">
                <Pencil className="mr-2 h-4 w-4" /> Edit description
              </Button>
            )}
          </div>
          <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-300" data-testid="keyword-description">
            {metadata?.description || "No description yet."}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-label={`Movies tagged ${keyword}`}>
        {movies === null ? (
          <div className="text-sm text-slate-500">Loading movies…</div>
        ) : movies.length === 0 ? (
          <div className="border-t border-white/10 py-12 text-center text-sm text-slate-500" data-testid="keyword-movies-empty">
            No movies are tagged with this keyword yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-6" data-testid="keyword-movies-grid">
            {movies.map((movie) => <MovieCard key={movie.id} movie={movie} />)}
          </div>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-white/10 bg-[#14181f] text-white sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit {title} description</DialogTitle></DialogHeader>
          <form onSubmit={saveDescription} className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              Description
              <Textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                maxLength={2000}
                rows={5}
                className="mt-2 resize-y border-white/10 bg-[#0d0f12] text-white"
                data-testid="keyword-description-input"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="save-keyword-description-btn">
                {saving ? "Saving…" : "Save description"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}