import { useEffect, useMemo, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { toast } from "sonner";

const MAX_BATCH_SIZE = 10;

export default function BulkCastAddDialog({ open, onOpenChange, actors = [], excludedActorIds = [], onSave, onActorCreated }) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRemoteMatches([]);
    setSelected([]);
  }, [open]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!open || !trimmedQuery) {
      setRemoteMatches([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await api.get(`/actors?q=${encodeURIComponent(trimmedQuery)}&limit=15`);
        if (!cancelled) setRemoteMatches(response.data || []);
      } catch {
        if (!cancelled) setRemoteMatches([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query, open]);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const excluded = new Set([...excludedActorIds, ...selected.map((actor) => actor.id)]);
    const seen = new Set();
    return [...remoteMatches, ...actors].filter((actor) => {
      if (!actor?.id || excluded.has(actor.id) || seen.has(actor.id)) return false;
      if (normalizedQuery && !(actor.name || "").toLowerCase().includes(normalizedQuery)) return false;
      seen.add(actor.id);
      return true;
    }).slice(0, 8);
  }, [actors, excludedActorIds, query, remoteMatches, selected]);

  const exactMatch = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return null;
    return [...remoteMatches, ...actors].find((actor) => (actor.name || "").toLowerCase() === normalizedQuery) || null;
  }, [actors, query, remoteMatches]);

  const addActor = (actor) => {
    if (selected.length >= MAX_BATCH_SIZE) {
      toast.error(`You can add up to ${MAX_BATCH_SIZE} cast members at a time.`);
      return;
    }
    setSelected((current) => [...current, { ...actor, character_name: "" }]);
    setQuery("");
  };

  const createActor = async () => {
    const name = query.trim();
    if (!name || creating) return;
    if (selected.length >= MAX_BATCH_SIZE) {
      toast.error(`You can add up to ${MAX_BATCH_SIZE} cast members at a time.`);
      return;
    }
    if (exactMatch) {
      if (excludedActorIds.includes(exactMatch.id) || selected.some((actor) => actor.id === exactMatch.id)) {
        toast.error("This actor is already in the cast selection.");
      } else {
        addActor(exactMatch);
      }
      return;
    }
    setCreating(true);
    try {
      const response = await api.post("/actors", { name });
      const actor = { id: response.data.id, name: response.data.name, photo_url: response.data.photo_url || "" };
      onActorCreated?.(actor);
      addActor(actor);
      toast.success(`Created "${actor.name}"`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not create actor");
    } finally {
      setCreating(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (selected.length === 0) {
      toast.error("Select at least one cast member.");
      return;
    }
    if (selected.length > MAX_BATCH_SIZE) {
      toast.error(`You can add up to ${MAX_BATCH_SIZE} cast members at a time.`);
      return;
    }
    if (selected.some((actor) => !actor.character_name.trim())) {
      toast.error("Enter a character name for every cast member.");
      return;
    }
    setSaving(true);
    try {
      const accepted = await onSave(selected.map(({ id, character_name }) => ({ actor_id: id, character_name: character_name.trim() })));
      if (accepted === false) return;
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-slate-900 border-slate-200 max-w-2xl p-0 gap-0 overflow-hidden" data-testid="bulk-cast-dialog">
        <DialogHeader className="px-6 py-4 border-b border-slate-200">
          <DialogTitle className="font-heading text-xl">Add multiple cast members</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <Label htmlFor="bulk-cast-search" className="text-slate-900 font-semibold text-sm">Find actors</Label>
            <Input
              id="bulk-cast-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actors by name"
              className="mt-1.5 bg-white border-slate-300 focus-visible:ring-cyan-400 focus-visible:border-cyan-400"
              autoComplete="off"
              data-testid="bulk-cast-search"
            />
            {query.trim() && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded border border-slate-200 bg-white" data-testid="bulk-cast-suggestions">
                {suggestions.map((actor) => (
                  <button key={actor.id} type="button" onClick={() => addActor(actor)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                    <span className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                      {actor.photo_url ? <img src={fileUrl(actor.photo_url)} alt="" className="w-full h-full object-cover" /> : (actor.name?.[0] || "?")}
                    </span>
                    <span className="text-sm">{actor.name}</span>
                  </button>
                ))}
                {!searching && suggestions.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No matching actors available.</div>}
                {searching && <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>}
                {!searching && !exactMatch && query.trim() && (
                  <button type="button" onClick={createActor} disabled={creating || selected.length >= MAX_BATCH_SIZE} className="w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50" data-testid="bulk-cast-create-actor">
                    {creating ? "Creating actor…" : `Create actor “${query.trim()}” and add`}
                  </button>
                )}
                {!searching && exactMatch && excludedActorIds.includes(exactMatch.id) && (
                  <div className="px-3 py-2 text-sm text-slate-500">This actor is already in the cast.</div>
                )}
              </div>
            )}
            <div className="mt-1 text-xs text-slate-500">{selected.length} of {MAX_BATCH_SIZE} selected</div>
          </div>

          {selected.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto" data-testid="bulk-cast-selected">
              {selected.map((actor, index) => (
                <div key={actor.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium text-slate-800 truncate">{actor.name}</div>
                  <Input
                    value={actor.character_name}
                    onChange={(event) => setSelected((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, character_name: event.target.value } : item))}
                    placeholder="Character name"
                    aria-label={`${actor.name} character name`}
                    className="max-w-xs bg-white border-slate-300"
                    data-testid={`bulk-cast-character-${index}`}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${actor.name}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || selected.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="bulk-cast-submit">
              {saving ? "Adding…" : `Add ${selected.length} cast member${selected.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}