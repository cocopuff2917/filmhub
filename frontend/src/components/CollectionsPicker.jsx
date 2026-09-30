import { useEffect, useMemo, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Plus, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Mod-only inline widget to manage the collections a movie/series belongs to.
 * Uses /collections list + /collections/{id}/add & /remove endpoints.
 * Props:
 *  - kind: "movie" | "series"
 *  - titleId: entity id
 *  - value: current collection_ids array
 *  - onChange: called with the new list after each change (kept in sync via server)
 */
export default function CollectionsPicker({ kind, titleId, value = [], onChange }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/collections"); setCollections(r.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => {
    const m = {};
    collections.forEach((c) => { m[c.id] = c; });
    return m;
  }, [collections]);

  const current = (value || []).map((id) => byId[id]).filter(Boolean);
  const available = collections.filter((c) => !(value || []).includes(c.id) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));

  const add = async (c) => {
    if (busyId || !titleId) return;
    setBusyId(c.id);
    try {
      await api.post(`/collections/${c.id}/add`, { title_type: kind, title_id: titleId });
      const next = [...(value || []), c.id];
      onChange && onChange(next);
      toast.success(`Added to "${c.name}"`);
      setQ(""); setShowAdd(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusyId("");
  };

  const remove = async (c) => {
    if (busyId || !titleId) return;
    setBusyId(c.id);
    try {
      await api.post(`/collections/${c.id}/remove`, { title_type: kind, title_id: titleId });
      const next = (value || []).filter((id) => id !== c.id);
      onChange && onChange(next);
      toast.success(`Removed from "${c.name}"`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusyId("");
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0f12] p-4" data-testid="collections-picker">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-amber-400 font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4" /> Collections {current.length > 0 && <span className="text-slate-500">· {current.length}</span>}
        </div>
        {!showAdd && (
          <Button type="button" size="sm" onClick={() => setShowAdd(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="collections-picker-add">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {current.length === 0 && !showAdd ? (
        <div className="text-sm text-slate-500">Not part of any collection.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {current.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/40 pl-1 pr-2 py-1" data-testid={`collections-picker-chip-${c.id}`}>
              {c.poster_url ? <img src={fileUrl(c.poster_url)} alt="" className="w-6 h-9 rounded object-cover" /> : <div className="w-6 h-9 rounded bg-[#1e2430]" />}
              <span className="text-sm text-amber-100">{c.name}</span>
              <button type="button" disabled={busyId === c.id} onClick={() => remove(c)} className="text-amber-200/70 hover:text-rose-300 disabled:opacity-40" title="Remove">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#14181f] p-3">
          <div className="flex gap-2 items-center">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="bg-[#0d0f12] border-white/10 text-white" placeholder="Filter collections…" data-testid="collections-picker-search" />
            <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setQ(""); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Done</Button>
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
            {loading ? (
              <div className="text-slate-500 text-sm p-2">Loading…</div>
            ) : available.length === 0 ? (
              <div className="text-slate-500 text-sm p-2">No matching collections.</div>
            ) : (
              available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => add(c)}
                  disabled={busyId === c.id}
                  className="w-full flex items-center gap-2 rounded-lg border border-white/10 bg-[#0d0f12] hover:border-amber-500/40 hover:bg-amber-500/5 p-2 text-left disabled:opacity-40"
                  data-testid={`collections-picker-add-${c.id}`}
                >
                  {c.poster_url ? <img src={fileUrl(c.poster_url)} alt="" className="w-6 h-9 rounded object-cover" /> : <div className="w-6 h-9 rounded bg-[#1e2430]" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.total_count} title{c.total_count !== 1 && "s"}</div>
                  </div>
                  <Plus className="w-4 h-4 text-amber-400" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
