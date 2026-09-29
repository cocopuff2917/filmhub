import { useEffect, useMemo, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Save, Ban, UserPlus, HelpCircle } from "lucide-react";
import { toast } from "sonner";

// Props:
//   open, onOpenChange
//   actors: list of {id, name, photo_url}
//   value: {actor_id?, character_name?} — the row being edited (empty for new)
//   onSave(nextRow)  — called with {actor_id, character_name}
//   onActorCreated(actor) — optional: when a new actor is created, parent can refresh its actors list
export default function CastEditDialog({ open, onOpenChange, actors = [], value, onSave, onActorCreated }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // {id, name, photo_url}
  const [character, setCharacter] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const characterRef = useRef(null);
  const characterValRef = useRef("");

  useEffect(() => { characterValRef.current = character; }, [character]);

  useEffect(() => {
    if (!open) return;
    if (value?.actor_id) {
      const a = actors.find((x) => x.id === value.actor_id) || null;
      setSelected(a);
      setQuery(a?.name || "");
    } else {
      setSelected(null);
      setQuery("");
    }
    setCharacter(value?.character_name || "");
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, value, actors]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actors.slice(0, 10);
    return actors.filter((a) => (a.name || "").toLowerCase().includes(q)).slice(0, 10);
  }, [actors, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return actors.find((a) => (a.name || "").toLowerCase() === q) || null;
  }, [actors, query]);

  const focusCharacter = () => setTimeout(() => characterRef.current?.focus(), 30);

  const pick = (a) => {
    setSelected(a);
    setQuery(a.name);
    if (!character.trim()) focusCharacter();
  };

  const createActor = async ({ autoSaveIfCharacter = false } = {}) => {
    const name = query.trim();
    if (!name || creating) return null;
    setCreating(true);
    try {
      const r = await api.post("/actors", { name });
      const newActor = { id: r.data.id, name: r.data.name, photo_url: r.data.photo_url || "" };
      toast.success(`Created "${name}"`);
      onActorCreated?.(r.data);
      setSelected(newActor);
      setQuery(newActor.name);
      setCreating(false);
      if (autoSaveIfCharacter && (characterValRef.current || "").trim()) {
        onSave?.({ actor_id: newActor.id, character_name: characterValRef.current.trim() });
        onOpenChange(false);
      } else {
        focusCharacter();
      }
      return newActor;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create actor");
      setCreating(false);
      return null;
    }
  };

  const clearActor = () => {
    setSelected(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const onSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const q = query.trim();
    if (!q) return;
    e.preventDefault();
    if (exactMatch) {
      pick(exactMatch);
      return;
    }
    if (suggestions.length === 1) {
      pick(suggestions[0]);
      return;
    }
    // No match -> create (and auto-save if character already filled)
    createActor({ autoSaveIfCharacter: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    // If user typed a name but never clicked "Create", auto-create on submit.
    let actor = selected;
    if (!actor?.id) {
      if (exactMatch) {
        actor = exactMatch;
        setSelected(exactMatch);
      } else if (query.trim()) {
        actor = await createActor({ autoSaveIfCharacter: false });
      }
    }
    if (!actor?.id) {
      toast.error("Pick an actor or type a name to create one");
      return;
    }
    if (!character.trim()) {
      toast.error("Character name is required");
      characterRef.current?.focus();
      return;
    }
    setSaving(true);
    onSave?.({ actor_id: actor.id, character_name: character.trim() });
    setSaving(false);
    onOpenChange(false);
  };

  const showCreate = query.trim() && !exactMatch && !selected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-slate-900 border-slate-200 max-w-xl p-0 gap-0 overflow-hidden" data-testid="cast-edit-dialog">
        <DialogHeader className="px-6 py-4 border-b border-slate-200">
          <DialogTitle className="font-heading text-xl">Edit</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <Label className="text-slate-900 font-semibold text-sm">Person</Label>
            <div className="relative mt-1.5">
              {selected ? (
                <div className="flex items-center gap-2 rounded border border-cyan-400 bg-cyan-50/50 pl-2 pr-1 py-1.5" data-testid="selected-person">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                    {selected.photo_url ? <img src={fileUrl(selected.photo_url)} alt="" className="w-full h-full object-cover" /> : (selected.name?.[0] || "?")}
                  </div>
                  <span className="flex-1 text-sm">{selected.name}</span>
                  <button type="button" onClick={clearActor} className="text-slate-400 hover:text-slate-700 p-1" data-testid="clear-person"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <>
                  <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Type a name and press Enter to pick or create…"
                    className="bg-white border-slate-300 pr-8 focus-visible:ring-cyan-400 focus-visible:border-cyan-400"
                    data-testid="person-search-input"
                    autoComplete="off"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" data-testid="clear-search">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {(suggestions.length > 0 || showCreate) && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto" data-testid="person-suggestions">
                      {suggestions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => pick(a)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                          data-testid={`person-suggest-${a.id}`}
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                            {a.photo_url ? <img src={fileUrl(a.photo_url)} alt="" className="w-full h-full object-cover" /> : (a.name?.[0] || "?")}
                          </div>
                          <span className="text-sm">{a.name}</span>
                        </button>
                      ))}
                      {showCreate && (
                        <button
                          type="button"
                          onClick={() => createActor({ autoSaveIfCharacter: true })}
                          disabled={creating}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-50 text-emerald-700 border-t border-slate-100 text-left font-medium"
                          data-testid="create-person-btn"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span className="text-sm">{creating ? "Creating…" : `Create new actor "${query.trim()}" (Enter)`}</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Tip: type a full name, hit <kbd className="px-1 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono">Enter</kbd> to create and save in one step.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <Label className="text-slate-900 font-semibold text-sm">Character</Label>
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <Input
              ref={characterRef}
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              placeholder="Character name"
              className="mt-1.5 bg-white border-slate-300 focus-visible:ring-cyan-400 focus-visible:border-cyan-400"
              data-testid="character-input"
              required
            />
          </div>

          <DialogFooter className="pt-2 -mx-6 -mb-5 px-6 py-3 bg-slate-50 border-t border-slate-200 gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-slate-300 text-slate-700 hover:bg-white" data-testid="cast-cancel-btn">
              <Ban className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button type="submit" disabled={saving || creating} className="bg-cyan-500 hover:bg-cyan-600 text-white" data-testid="cast-save-btn">
              <Save className="w-4 h-4 mr-2" /> {creating ? "Creating…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
