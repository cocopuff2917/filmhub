import { useEffect, useMemo, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical, Trash2, Plus, Search, ChevronUp, ChevronDown,
  Save, Eye, Layout, Megaphone, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const BUILTIN_SOURCES = [
  { v: "trending_movies", label: "Trending Movies" },
  { v: "upcoming_movies", label: "Upcoming Movies" },
  { v: "trending_series", label: "Trending TV Series" },
  { v: "recent_movies", label: "Recently Added Movies" },
  { v: "recent_series", label: "Recently Added TV Series" },
];

export default function HomepageTab() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const r = await api.get("/homepage/config"); setCfg(stripResolved(r.data)); }
    catch { toast.error("Failed to load homepage config"); }
  };
  useEffect(() => { load(); }, []);

  // Strip server-only enriched fields before editing
  function stripResolved(c) {
    const copy = JSON.parse(JSON.stringify(c));
    delete (copy.hero || {}).featured;
    (copy.sections || []).forEach((s) => { delete s.resolved_items; });
    return copy;
  }

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/homepage/config", cfg);
      toast.success("Homepage updated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    setSaving(false);
  };

  if (!cfg) return <div className="text-slate-400 py-8">Loading homepage editor…</div>;

  const setHero = (k, v) => setCfg({ ...cfg, hero: { ...cfg.hero, [k]: v } });
  const setAnn = (k, v) => setCfg({ ...cfg, announcement: { ...cfg.announcement, [k]: v } });
  const setSections = (sections) => setCfg({ ...cfg, sections });
  const updateSection = (idx, patch) => {
    const arr = [...cfg.sections];
    arr[idx] = { ...arr[idx], ...patch };
    setSections(arr);
  };
  const removeSection = (idx) => {
    if (!window.confirm("Remove this section?")) return;
    const arr = [...cfg.sections]; arr.splice(idx, 1); setSections(arr);
  };
  const move = (idx, delta) => {
    const next = idx + delta;
    if (next < 0 || next >= cfg.sections.length) return;
    const arr = [...cfg.sections];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setSections(arr);
  };
  const addBuiltin = () => {
    const used = new Set(cfg.sections.filter((s) => s.type === "built-in").map((s) => s.source));
    const next = BUILTIN_SOURCES.find((b) => !used.has(b.v));
    if (!next) { toast("All built-in sections are already added."); return; }
    setSections([...cfg.sections, { id: `builtin-${next.v}-${Date.now()}`, type: "built-in", title: next.label, enabled: true, source: next.v, items: [], limit: 12 }]);
  };
  const addCustom = () => {
    setSections([...cfg.sections, { id: `custom-${Date.now()}`, type: "custom", title: "New section", enabled: true, items: [], limit: 12 }]);
  };

  return (
    <div className="space-y-6" data-testid="homepage-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-white font-heading text-lg flex items-center gap-2">
          <Layout className="w-5 h-5 text-amber-300" /> Homepage Editor
        </h3>
        <div className="flex items-center gap-2">
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white border border-white/15 rounded-md px-3 py-1.5" data-testid="homepage-preview-btn">
            <Eye className="w-3.5 h-3.5" /> Preview
          </a>
          <Button size="sm" disabled={saving} onClick={save} className="h-9 bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="homepage-save-btn">
            <Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* ANNOUNCEMENT */}
      <div className="rounded-xl border border-white/10 bg-[#0d0f12] p-4" data-testid="homepage-announcement-editor">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm"><Megaphone className="w-4 h-4 text-amber-300" /> Announcement Banner</div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Enabled</span>
            <Switch checked={!!cfg.announcement.enabled} onCheckedChange={(v) => setAnn("enabled", v)} data-testid="announcement-enabled-toggle" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <Input value={cfg.announcement.text || ""} onChange={(e) => setAnn("text", e.target.value)} placeholder="Announcement text" className="md:col-span-3 bg-[#14181f] border-white/10 text-white h-9" data-testid="announcement-text-input" />
          <Input value={cfg.announcement.link_url || ""} onChange={(e) => setAnn("link_url", e.target.value)} placeholder="Link URL (optional)" className="bg-[#14181f] border-white/10 text-white h-9" data-testid="announcement-link-url" />
          <Input value={cfg.announcement.link_label || ""} onChange={(e) => setAnn("link_label", e.target.value)} placeholder="Link label (optional)" className="bg-[#14181f] border-white/10 text-white h-9" data-testid="announcement-link-label" />
        </div>
      </div>

      {/* HERO */}
      <div className="rounded-xl border border-white/10 bg-[#0d0f12] p-4" data-testid="homepage-hero-editor">
        <div className="flex items-center gap-2 text-white font-semibold text-sm"><Sparkles className="w-4 h-4 text-amber-300" /> Hero</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <Label className="text-slate-300 text-xs uppercase tracking-widest">Tagline (pill)</Label>
            <Input value={cfg.hero.tagline || ""} onChange={(e) => setHero("tagline", e.target.value)} className="mt-1.5 bg-[#14181f] border-white/10 text-white h-9" data-testid="hero-tagline-input" />
          </div>
          <div>
            <Label className="text-slate-300 text-xs uppercase tracking-widest">Title</Label>
            <Input value={cfg.hero.title || ""} onChange={(e) => setHero("title", e.target.value)} className="mt-1.5 bg-[#14181f] border-white/10 text-white h-9" data-testid="hero-title-input" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-slate-300 text-xs uppercase tracking-widest">Subtitle</Label>
            <Textarea value={cfg.hero.subtitle || ""} onChange={(e) => setHero("subtitle", e.target.value)} className="mt-1.5 bg-[#14181f] border-white/10 text-white" rows={2} data-testid="hero-subtitle-input" />
          </div>
          <FeaturedPicker
            type={cfg.hero.featured_type}
            id={cfg.hero.featured_id}
            onChange={(t, i) => setCfg({ ...cfg, hero: { ...cfg.hero, featured_type: t, featured_id: i } })}
          />
        </div>
      </div>

      {/* SECTIONS */}
      <div className="rounded-xl border border-white/10 bg-[#0d0f12] p-4" data-testid="homepage-sections-editor">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold text-sm">Sections (drag order with ⇅)</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={addBuiltin} data-testid="add-builtin-section"><Plus className="w-3.5 h-3.5 mr-1" /> Built-in</Button>
            <Button size="sm" variant="outline" className="h-8 border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={addCustom} data-testid="add-custom-section"><Plus className="w-3.5 h-3.5 mr-1" /> Custom</Button>
          </div>
        </div>
        <div className="space-y-3">
          {cfg.sections.map((s, idx) => (
            <SectionCard
              key={s.id}
              section={s}
              idx={idx}
              onPatch={(patch) => updateSection(idx, patch)}
              onRemove={() => removeSection(idx)}
              onUp={() => move(idx, -1)}
              onDown={() => move(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === cfg.sections.length - 1}
            />
          ))}
          {cfg.sections.length === 0 && (
            <div className="text-slate-500 text-sm text-center py-8">No sections yet. Add one above.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
function FeaturedPicker({ type, id, onChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load current featured item display
  useEffect(() => {
    (async () => {
      if (!type || !id) { setCurrent(null); return; }
      try {
        const r = await api.get(type === "series" ? `/series/${id}` : `/movies/${id}`);
        setCurrent(r.data);
      } catch { setCurrent(null); }
    })();
  }, [type, id]);

  const search = async () => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api.get(`/movies?q=${encodeURIComponent(q)}&limit=5`),
        api.get(`/series?q=${encodeURIComponent(q)}&limit=5`),
      ]);
      const combined = [
        ...(m.data || []).map((x) => ({ ...x, _type: "movie" })),
        ...(s.data || []).map((x) => ({ ...x, _type: "series" })),
      ].slice(0, 10);
      setResults(combined);
    } catch { toast.error("Search failed"); }
    setLoading(false);
  };

  const pick = (item) => {
    onChange(item._type, item.id);
    setResults([]);
    setQ("");
  };

  const clear = () => onChange(null, null);

  return (
    <div className="md:col-span-2 mt-1">
      <Label className="text-slate-300 text-xs uppercase tracking-widest">Featured hero item (optional)</Label>
      {current ? (
        <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-white/10 bg-[#14181f] p-3" data-testid="hero-featured-current">
          {current.poster_url
            ? <img src={fileUrl(current.poster_url)} alt="" className="w-10 h-14 object-cover rounded" />
            : <div className="w-10 h-14 bg-white/5 rounded" />}
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium truncate">{current.title}</div>
            <div className="text-[11px] text-slate-500">{type === "series" ? "TV Series" : "Movie"}</div>
          </div>
          <Button size="sm" variant="outline" className="h-7 border-rose-500/40 text-rose-300 hover:bg-rose-500/10" onClick={clear} data-testid="hero-featured-clear">Clear</Button>
        </div>
      ) : (
        <div className="mt-1.5">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search a movie or TV series…" className="bg-[#14181f] border-white/10 text-white h-9" data-testid="hero-featured-search" />
            <Button size="sm" variant="outline" className="h-9 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={search}><Search className="w-3.5 h-3.5" /></Button>
          </div>
          {loading && <div className="text-xs text-slate-500 mt-2">Searching…</div>}
          {results.length > 0 && (
            <ul className="mt-2 rounded-lg border border-white/10 bg-[#14181f] divide-y divide-white/5 max-h-56 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r._type}-${r.id}`}>
                  <button type="button" onClick={() => pick(r)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left" data-testid={`hero-featured-pick-${r.id}`}>
                    {r.poster_url ? <img src={fileUrl(r.poster_url)} alt="" className="w-8 h-11 object-cover rounded" /> : <div className="w-8 h-11 bg-white/5 rounded" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm truncate">{r.title}</div>
                      <div className="text-[11px] text-slate-500">{r._type === "series" ? "TV Series" : "Movie"}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
function SectionCard({ section, idx, onPatch, onRemove, onUp, onDown, isFirst, isLast }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#14181f] p-3" data-testid={`section-card-${idx}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-col -gap-1">
          <button type="button" onClick={onUp} disabled={isFirst} className="disabled:opacity-30 text-slate-400 hover:text-white" aria-label="Move up" data-testid={`section-up-${idx}`}><ChevronUp className="w-4 h-4" /></button>
          <button type="button" onClick={onDown} disabled={isLast} className="disabled:opacity-30 text-slate-400 hover:text-white" aria-label="Move down" data-testid={`section-down-${idx}`}><ChevronDown className="w-4 h-4" /></button>
        </div>
        <GripVertical className="w-4 h-4 text-slate-600" />
        <Badge className={`text-[10px] uppercase ${section.type === "custom" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-sky-500/15 text-sky-300 border-sky-500/40"}`}>{section.type}</Badge>
        <Input value={section.title} onChange={(e) => onPatch({ title: e.target.value })} className="flex-1 min-w-[200px] bg-[#0d0f12] border-white/10 text-white h-8" data-testid={`section-title-${idx}`} />
        {section.type === "built-in" && (
          <Select value={section.source} onValueChange={(v) => onPatch({ source: v })}>
            <SelectTrigger className="w-56 bg-[#0d0f12] border-white/10 text-white h-8" data-testid={`section-source-${idx}`}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#0d0f12] border-white/10 text-white">
              {BUILTIN_SOURCES.map((b) => <SelectItem key={b.v} value={b.v}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input type="number" min={1} max={30} value={section.limit || 12} onChange={(e) => onPatch({ limit: Number(e.target.value) })} className="w-20 bg-[#0d0f12] border-white/10 text-white h-8" title="Max items" data-testid={`section-limit-${idx}`} />
        <div className="flex items-center gap-1 text-xs text-slate-400 pl-2">
          <Switch checked={!!section.enabled} onCheckedChange={(v) => onPatch({ enabled: v })} data-testid={`section-enabled-${idx}`} />
        </div>
        <button type="button" onClick={onRemove} className="text-rose-400 hover:text-rose-300 p-1" aria-label="Remove" data-testid={`section-remove-${idx}`}><Trash2 className="w-4 h-4" /></button>
      </div>

      {/* Custom items editor */}
      {section.type === "custom" && (
        <CustomSectionItems
          items={section.items || []}
          onChange={(items) => onPatch({ items })}
        />
      )}
    </div>
  );
}

function CustomSectionItems({ items, onChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api.get(`/movies?q=${encodeURIComponent(q)}&limit=8`),
        api.get(`/series?q=${encodeURIComponent(q)}&limit=8`),
      ]);
      const combined = [
        ...(m.data || []).map((x) => ({ ...x, _type: "movie" })),
        ...(s.data || []).map((x) => ({ ...x, _type: "series" })),
      ].slice(0, 16);
      setResults(combined);
    } catch { toast.error("Search failed"); }
    setLoading(false);
  };

  const add = (r) => {
    if (items.some((it) => it.id === r.id && it.type === r._type)) return;
    onChange([...items, { type: r._type, id: r.id, title: r.title, poster_url: r.poster_url }]);
  };
  const remove = (idx) => { const arr = [...items]; arr.splice(idx, 1); onChange(arr); };
  const moveItem = (idx, delta) => {
    const next = idx + delta;
    if (next < 0 || next >= items.length) return;
    const arr = [...items]; [arr[idx], arr[next]] = [arr[next], arr[idx]]; onChange(arr);
  };

  return (
    <div className="mt-3 pl-10">
      {/* Chip list of current items */}
      {items.length === 0 ? (
        <div className="text-slate-500 text-xs mb-2">No items yet. Search below to add movies or TV series.</div>
      ) : (
        <ul className="flex flex-wrap gap-2 mb-3">
          {items.map((it, idx) => (
            <li key={`${it.type}-${it.id}`} className="flex items-center gap-2 rounded-md bg-[#0d0f12] border border-white/10 px-2 py-1.5" data-testid={`custom-item-${idx}`}>
              {it.poster_url ? <img src={fileUrl(it.poster_url)} alt="" className="w-6 h-9 object-cover rounded-sm" /> : <div className="w-6 h-9 bg-white/5 rounded-sm" />}
              <div className="flex flex-col leading-tight max-w-[180px]">
                <span className="text-white text-xs truncate">{it.title || `${it.type} ${it.id.slice(-4)}`}</span>
                <span className="text-[10px] text-slate-500">{it.type}</span>
              </div>
              <div className="flex flex-col -gap-1">
                <button type="button" onClick={() => moveItem(idx, -1)} className="text-slate-500 hover:text-white"><ChevronUp className="w-3 h-3" /></button>
                <button type="button" onClick={() => moveItem(idx, 1)} className="text-slate-500 hover:text-white"><ChevronDown className="w-3 h-3" /></button>
              </div>
              <button type="button" onClick={() => remove(idx)} className="text-rose-400 hover:text-rose-300" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search to add movies / TV series…" className="bg-[#0d0f12] border-white/10 text-white h-8" />
        <Button size="sm" variant="outline" className="h-8 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={search}><Search className="w-3.5 h-3.5" /></Button>
      </div>
      {loading && <div className="text-xs text-slate-500 mt-2">Searching…</div>}
      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-white/10 bg-[#0d0f12] divide-y divide-white/5 max-h-56 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r._type}-${r.id}`}>
              <button type="button" onClick={() => add(r)} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 text-left">
                {r.poster_url ? <img src={fileUrl(r.poster_url)} alt="" className="w-6 h-9 object-cover rounded-sm" /> : <div className="w-6 h-9 bg-white/5 rounded-sm" />}
                <span className="text-white text-xs flex-1 truncate">{r.title}</span>
                <span className="text-[10px] text-slate-500">{r._type}</span>
                <Plus className="w-3.5 h-3.5 text-amber-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
