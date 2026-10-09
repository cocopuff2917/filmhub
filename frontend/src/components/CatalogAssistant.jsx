import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CatalogAssistant({ kind, title, date, synopsis, genres, onApply }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const response = await api.post("/catalog/assistant/suggest", {
        kind,
        title: title.trim(),
        date: date || "",
        synopsis: synopsis || "",
        genres: Array.isArray(genres) ? genres : String(genres || "").split(",").map((value) => value.trim()).filter(Boolean),
      });
      setSuggestions(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Catalog suggestions are unavailable");
    } finally {
      setLoading(false);
    }
  };

  const hasSuggestions = suggestions && (suggestions.synopsis || suggestions.tagline || suggestions.genres?.length || suggestions.keywords?.length);

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3" data-testid="catalog-assistant">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">Catalog assistant</div>
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={loading || title.trim().length < 2} className="h-8 border-amber-500/40 text-amber-200 hover:bg-amber-500/10 hover:text-white" data-testid="catalog-assistant-generate">
          <Sparkles className="mr-2 h-4 w-4" /> {loading ? "Generating…" : "Suggest details"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Draft suggestions from the supplied details only. Review before applying or saving.</p>
      {suggestions && !hasSuggestions && <p className="mt-3 text-sm text-slate-400">Not enough information to suggest additional catalog details.</p>}
      {hasSuggestions && (
        <div className="mt-3 space-y-2" data-testid="catalog-assistant-suggestions">
          {suggestions.reference && <p className="text-xs text-slate-400">Reference match: {suggestions.reference.title}{suggestions.reference.date ? ` (${suggestions.reference.date.slice(0, 4)})` : ""} · TMDB. Verify it is the right title.</p>}
          {suggestions.synopsis && <p className="text-sm text-slate-200"><span className="text-slate-400">Synopsis:</span> {suggestions.synopsis}</p>}
          {suggestions.tagline && <p className="text-sm text-slate-200"><span className="text-slate-400">Tagline:</span> {suggestions.tagline}</p>}
          {suggestions.genres?.length > 0 && <p className="text-sm text-slate-200"><span className="text-slate-400">Genres:</span> {suggestions.genres.join(", ")}</p>}
          {suggestions.keywords?.length > 0 && <p className="text-sm text-slate-200"><span className="text-slate-400">Keywords:</span> {suggestions.keywords.join(", ")}</p>}
          <Button type="button" size="sm" onClick={() => onApply(suggestions)} className="mt-1 h-8 bg-amber-500 text-black hover:bg-amber-600" data-testid="catalog-assistant-apply">Apply suggestions</Button>
        </div>
      )}
    </div>
  );
}
