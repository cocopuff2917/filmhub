import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";
import { useAuth } from "@/context/AuthContext";
import CatalogAssistant from "@/components/CatalogAssistant";
import CatalogDuplicateWarning from "@/components/CatalogDuplicateWarning";

export default function SeriesForm({ series, onSaved, onCancel }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isModerator = ["admin", "moderator"].includes(user?.effective_role || user?.role);
  const canEditImdb = isModerator || (user?.permissions || []).includes("content.edit_imdb_id");
  const [actors, setActors] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const empty = {
    title: "", imdb_id: "", first_air_date: "", last_air_date: "", genres: "",
    synopsis: "", poster_url: "", backdrop_url: "", trailer_url: "",
    status: "Ongoing", is_trending: false, main_cast: [], seasons: [], gallery: [],
  };
  const [form, setForm] = useState(empty);

  useEffect(() => { api.get("/actors").then((r) => setActors(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    (async () => {
      if (series?.id) {
        // fetch full details
        const full = (await api.get(`/series/${series.id}`)).data;
        setExpandedSeasons(Object.fromEntries((full.seasons || []).map((season, index, seasons) => [season.season_number, index === seasons.length - 1])));
        setExpandedEpisodes({});
        setForm({
          title: full.title, imdb_id: full.imdb_id || "", first_air_date: full.first_air_date || "", last_air_date: full.last_air_date || "",
          genres: (full.genres || []).join(", "), synopsis: full.synopsis || "",
          poster_url: full.poster_url || "", backdrop_url: full.backdrop_url || "",
          trailer_url: full.trailer_url || "", status: full.status || "Ongoing",
          is_trending: !!full.is_trending, gallery: full.gallery || [],
          main_cast: (full.main_cast || []).map((c) => ({ actor_id: c.actor?.id || c.actor_id, character_name: c.character_name })),
          seasons: (full.seasons || []).map((se) => ({
            season_number: se.season_number, name: se.name || "", air_date: se.air_date || "",
            overview: se.overview || "", poster_url: se.poster_url || "", is_last_season: !!se.is_last_season,
            episodes: (se.episodes || []).map((ep) => ({
              episode_number: ep.episode_number, name: ep.name || "", air_date: ep.air_date || "",
              overview: ep.overview || "", still_url: ep.still_url || "",
              stills: ep.stills || (ep.still_url ? [ep.still_url] : []),
              main_cast_actor_ids: ep.main_cast_actor_ids || [],
              guest_stars: (ep.guest_stars || []).map((gs) => ({ actor_id: gs.actor?.id || gs.actor_id, character_name: gs.character_name })),
            })),
          })),
        });
      } else {
        setExpandedSeasons({});
        setExpandedEpisodes({});
        setForm(empty);
      }
    })();
    // eslint-disable-next-line
  }, [series?.id]);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
        ...(!series?.id ? { imdb_id: form.imdb_id || null } : {}),
      genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
      main_cast: form.main_cast.filter((c) => c.actor_id && c.character_name).map(({ actor_id, character_name }) => ({ actor_id, character_name })),
      seasons: form.seasons.map((se) => ({
        ...se, season_number: Number(se.season_number),
        episodes: (se.episodes || []).map((ep) => ({
          ...ep, episode_number: Number(ep.episode_number),
          main_cast_actor_ids: [...new Set(ep.main_cast_actor_ids || [])].filter((actorId) => form.main_cast.some((member) => member.actor_id === actorId)),
          guest_stars: (ep.guest_stars || []).filter((g) => g.actor_id && g.character_name),
        })),
      })),
    };
    if (series?.id && !canEditImdb) delete payload.imdb_id;
    try {
      let result;
      if (series?.id) {
        result = (await api.patch(`/series/${series.id}`, payload)).data;
        toast.success("Series updated");
      } else {
        result = (await api.post("/series", payload)).data;
        toast.success("Series created");
      }
      onSaved && onSaved(result);
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail && typeof detail === "object") {
        toast.error(detail.message || "This IMDb ID already exists", {
          action: detail.url ? { label: "Edit existing", onClick: () => navigate(detail.url) } : undefined,
        });
      } else {
        toast.error(detail || "Failed to save series");
      }
    }
  };

  const updMain = (i, k, v) => { const n = [...form.main_cast]; n[i] = { ...n[i], [k]: v }; setForm({ ...form, main_cast: n }); };
  const addMain = () => setForm((current) => ({ ...current, main_cast: [...current.main_cast, { actor_id: "", character_name: "" }] }));
  const removeMain = (castIndex) => setForm((current) => ({ ...current, main_cast: current.main_cast.filter((_, index) => index !== castIndex) }));

  const addSeason = () => {
    const nextNum = (form.seasons[form.seasons.length - 1]?.season_number || 0) + 1;
    setForm({ ...form, seasons: [...form.seasons, { season_number: nextNum, name: "", air_date: "", overview: "", poster_url: "", episodes: [] }] });
    setExpandedSeasons((current) => ({ ...current, [nextNum]: true }));
  };
  const updSeason = (i, k, v) => { const n = [...form.seasons]; n[i] = { ...n[i], [k]: v }; setForm({ ...form, seasons: n }); };
    const setLastSeason = (seasonIndex, checked) => setForm((current) => ({
      ...current,
      seasons: current.seasons.map((season, index) => ({ ...season, is_last_season: checked && index === seasonIndex })),
    }));
  const remSeason = (i) => {
    const seasonNumber = form.seasons[i]?.season_number;
    setForm({ ...form, seasons: form.seasons.filter((_, x) => x !== i) });
    setExpandedSeasons((current) => { const next = { ...current }; delete next[seasonNumber]; return next; });
  };

  const addEp = (si) => {
    const eps = form.seasons[si].episodes || [];
    const nextNum = (eps[eps.length - 1]?.episode_number || 0) + 1;
    const n = [...form.seasons];
    n[si] = { ...n[si], episodes: [...eps, { episode_number: nextNum, name: "", air_date: "", overview: "", still_url: "", stills: [], main_cast_actor_ids: [], guest_stars: [] }] };
    setForm({ ...form, seasons: n });
    setExpandedEpisodes((current) => ({ ...current, [`${form.seasons[si].season_number}:${nextNum}`]: true }));
  };
  const updEp = (si, ei, k, v) => {
    const n = [...form.seasons]; const eps = [...n[si].episodes];
    eps[ei] = { ...eps[ei], [k]: v }; n[si] = { ...n[si], episodes: eps }; setForm({ ...form, seasons: n });
  };
  const toggleEpisodeMainCast = (si, ei, actorId, checked) => {
    const selected = form.seasons[si].episodes[ei].main_cast_actor_ids || [];
    const next = checked
      ? [...new Set([...selected, actorId])]
      : selected.filter((id) => id !== actorId);
    updEp(si, ei, "main_cast_actor_ids", next);
  };
  const remEp = (si, ei) => {
    const n = [...form.seasons]; n[si] = { ...n[si], episodes: n[si].episodes.filter((_, x) => x !== ei) }; setForm({ ...form, seasons: n });
  };

  const addGuest = (si, ei) => {
    const n = [...form.seasons]; const eps = [...n[si].episodes];
    eps[ei] = { ...eps[ei], guest_stars: [...(eps[ei].guest_stars || []), { actor_id: "", character_name: "" }] };
    n[si] = { ...n[si], episodes: eps }; setForm({ ...form, seasons: n });
  };
  const updGuest = (si, ei, gi, k, v) => {
    const n = [...form.seasons]; const eps = [...n[si].episodes]; const gs = [...(eps[ei].guest_stars || [])];
    gs[gi] = { ...gs[gi], [k]: v }; eps[ei] = { ...eps[ei], guest_stars: gs };
    n[si] = { ...n[si], episodes: eps }; setForm({ ...form, seasons: n });
  };
  const remGuest = (si, ei, gi) => {
    const n = [...form.seasons]; const eps = [...n[si].episodes];
    eps[ei] = { ...eps[ei], guest_stars: eps[ei].guest_stars.filter((_, x) => x !== gi) };
    n[si] = { ...n[si], episodes: eps }; setForm({ ...form, seasons: n });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="text-slate-300">Title</Label>
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-title-input" />
        {!series?.id && <CatalogDuplicateWarning kind="series" title={form.title} date={form.first_air_date} />}
      </div>
      {!series?.id && <CatalogAssistant kind="series" title={form.title} date={form.first_air_date} synopsis={form.synopsis} genres={form.genres} onApply={(suggestions) => setForm((current) => ({
        ...current,
        synopsis: suggestions.synopsis || current.synopsis,
        tagline: suggestions.tagline || current.tagline,
        genres: suggestions.genres?.length ? suggestions.genres.join(", ") : current.genres,
        keywords: suggestions.keywords?.length ? suggestions.keywords.join(", ") : current.keywords,
      }))} />}
      {!series?.id && <div>
        <Label className="text-slate-300">IMDb ID</Label>
        <Input required={!series?.id} pattern="tt[0-9]{7,10}" title="Enter an IMDb ID such as tt1234567" value={form.imdb_id} onChange={(e) => setForm({ ...form, imdb_id: e.target.value.trim() })} placeholder="tt1234567" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-imdb-input" />
      </div>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-slate-300">First air date</Label>
          <Input type="date" value={form.first_air_date} onChange={(e) => setForm({ ...form, first_air_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-first-air-input" />
        </div>
        <div>
          <Label className="text-slate-300">Last air date</Label>
          <Input type="date" value={form.last_air_date} onChange={(e) => setForm({ ...form, last_air_date: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-last-air-input" />
        </div>
        <div>
          <Label className="text-slate-300">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1.5 bg-[#0d0f12] border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#14181f] text-white border-white/10">
              <SelectItem value="Ongoing">Ongoing</SelectItem>
              <SelectItem value="Returning">Returning</SelectItem>
              <SelectItem value="Ended">Ended</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-slate-300">Genres (comma separated)</Label>
        <Input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Drama, Thriller" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-genres-input" />
      </div>
      <div>
        <Label className="text-slate-300">Synopsis</Label>
        <Textarea rows={3} value={form.synopsis} onChange={(e) => setForm({ ...form, synopsis: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="series-synopsis-input" />
      </div>
      <div>
        <Label className="text-slate-300">Trailer URL</Label>
        <Input value={form.trailer_url} onChange={(e) => setForm({ ...form, trailer_url: e.target.value })} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-slate-300 block mb-2">Poster</Label>
          <ImageUpload value={form.poster_url} onChange={(v) => setForm({ ...form, poster_url: v })} testid="series-poster-upload" />
        </div>
        <div>
          <Label className="text-slate-300 block mb-2">Backdrop</Label>
          <ImageUpload value={form.backdrop_url} onChange={(v) => setForm({ ...form, backdrop_url: v })} />
        </div>
      </div>
      <div>
        <Label className="text-slate-300 block mb-2">Gallery ({(form.gallery || []).length} images)</Label>
        <GalleryUpload value={form.gallery} onChange={(v) => setForm({ ...form, gallery: v })} testid="series-gallery-upload" />
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 px-4 py-3">
        <Switch checked={form.is_trending} onCheckedChange={(v) => setForm({ ...form, is_trending: v })} data-testid="series-trending-switch" />
        <Label className="text-slate-300 cursor-pointer">Mark as trending</Label>
      </div>

      <section className="border-t border-white/10 pt-4" data-testid="series-main-cast-editor">
        <div className="mb-3 flex items-center justify-between">
          <Label className="text-slate-300 text-base">Main Cast</Label>
          <Button type="button" variant="outline" onClick={addMain} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-8"><Plus className="w-4 h-4 mr-1" /> Add cast member</Button>
        </div>
        <div className="space-y-2">
          {form.main_cast.map((member, castIndex) => (
            <div key={castIndex} className="flex items-center gap-2">
              <Select value={member.actor_id} onValueChange={(value) => updMain(castIndex, "actor_id", value)}>
                <SelectTrigger className="flex-1 bg-[#0d0f12] border-white/10 text-white"><SelectValue placeholder="Select actor" /></SelectTrigger>
                <SelectContent className="bg-[#14181f] text-white border-white/10 max-h-64">
                  {actors.map((actor) => <SelectItem key={actor.id} value={actor.id}>{actor.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Character" value={member.character_name} onChange={(event) => updMain(castIndex, "character_name", event.target.value)} className="flex-1 bg-[#0d0f12] border-white/10 text-white" />
              <Button type="button" variant="ghost" aria-label="Remove cast member" onClick={() => removeMain(castIndex)} className="text-slate-400 hover:text-red-400"><X className="w-4 h-4" /></Button>
            </div>
          ))}
          {!form.main_cast.length && <p className="text-xs text-slate-500">Add series cast here, then select appearances on each episode.</p>}
        </div>
      </section>

      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-slate-300 text-base">Seasons & Episodes</Label>
          <Button type="button" variant="outline" onClick={addSeason} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 h-8" data-testid="series-add-season">
            <Plus className="w-4 h-4 mr-1" /> Add season
          </Button>
        </div>
        <div className="space-y-4">
          {form.seasons.map((season, si) => (
            <div key={si} className="rounded-lg border border-white/10 bg-[#0d0f12] p-4">
              <div className="flex items-center justify-between mb-3">
                <button type="button" aria-expanded={!!expandedSeasons[season.season_number]} onClick={() => setExpandedSeasons((current) => ({ ...current, [season.season_number]: !current[season.season_number] }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {expandedSeasons[season.season_number] ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-amber-400" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />}
                  <span className="font-heading text-white">Season {season.season_number}{season.name ? ` · ${season.name}` : ""}</span>
                  <span className="truncate text-xs text-slate-500">{season.episodes?.length || 0} episodes</span>
                </button>
                <Button type="button" variant="ghost" onClick={() => remSeason(si)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-7">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {expandedSeasons[season.season_number] && <div data-testid={`series-season-editor-${season.season_number}`}>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-slate-400">Season #</Label>
                  <Input type="number" value={season.season_number} onChange={(e) => updSeason(si, "season_number", e.target.value)} className="mt-1 bg-[#14181f] border-white/10 text-white h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-400">Name</Label>
                  <Input value={season.name} onChange={(e) => updSeason(si, "name", e.target.value)} placeholder="Optional" className="mt-1 bg-[#14181f] border-white/10 text-white h-9" />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Air date</Label>
                  <Input type="date" value={season.air_date} onChange={(e) => updSeason(si, "air_date", e.target.value)} className="mt-1 bg-[#14181f] border-white/10 text-white h-9" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-400">Overview</Label>
                  <Input value={season.overview} onChange={(e) => updSeason(si, "overview", e.target.value)} className="mt-1 bg-[#14181f] border-white/10 text-white h-9" />
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs text-slate-400 block mb-1">Season poster</Label>
                <ImageUpload value={season.poster_url} onChange={(v) => updSeason(si, "poster_url", v)} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="accent-amber-400" checked={!!season.is_last_season} onChange={(event) => setLastSeason(si, event.target.checked)} data-testid={`series-last-season-${season.season_number}`} />
                Mark as last season
              </label>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs uppercase tracking-widest text-amber-400">Episodes</Label>
                  <Button type="button" variant="outline" onClick={() => addEp(si)} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Episode
                  </Button>
                </div>
                <div className="space-y-2">
                  {(season.episodes || []).map((ep, ei) => (
                    <details key={ei} open={!!expandedEpisodes[`${season.season_number}:${ep.episode_number}`]} onToggle={(event) => setExpandedEpisodes((current) => ({ ...current, [`${season.season_number}:${ep.episode_number}`]: event.currentTarget.open }))} className="rounded bg-[#14181f] border border-white/10">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden">
                        <span className="min-w-0 truncate text-sm font-medium text-white">S{season.season_number}·E{ep.episode_number} · {ep.name || "Untitled episode"}</span>
                        <span className="flex flex-shrink-0 items-center gap-3 text-xs text-slate-500"><span>{ep.air_date || "No air date"}</span><span>{(ep.main_cast_actor_ids || []).length} cast · {(ep.guest_stars || []).length} guests</span></span>
                      </summary>
                      <div className="border-t border-white/10 p-3">
                      <div className="grid grid-cols-[60px_1fr_130px_auto] gap-2 items-end">
                        <div>
                          <Label className="text-xs text-slate-400">E#</Label>
                          <Input type="number" value={ep.episode_number} onChange={(e) => updEp(si, ei, "episode_number", e.target.value)} className="mt-1 bg-[#0d0f12] border-white/10 text-white h-9" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-400">Title</Label>
                          <Input value={ep.name} onChange={(e) => updEp(si, ei, "name", e.target.value)} className="mt-1 bg-[#0d0f12] border-white/10 text-white h-9" />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-400">Air date</Label>
                          <Input type="date" value={ep.air_date} onChange={(e) => updEp(si, ei, "air_date", e.target.value)} className="mt-1 bg-[#0d0f12] border-white/10 text-white h-9" />
                        </div>
                        <Button type="button" variant="ghost" onClick={() => remEp(si, ei)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-9">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <Input placeholder="Overview (optional)" value={ep.overview} onChange={(e) => updEp(si, ei, "overview", e.target.value)} className="mt-2 bg-[#0d0f12] border-white/10 text-white text-sm h-9" />
                      <div className="mt-3" data-testid={`episode-main-cast-${season.season_number}-${ep.episode_number}`}>
                        <Label className="text-xs text-slate-400 block mb-2">Main cast appearing in this episode</Label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {form.main_cast.filter((member) => member.actor_id).map((member, castIndex) => (
                            <label key={member.actor_id} className="flex items-center gap-1.5 text-xs text-slate-300">
                              <input type="checkbox" className="accent-amber-400" checked={(ep.main_cast_actor_ids || []).includes(member.actor_id)} onChange={(event) => toggleEpisodeMainCast(si, ei, member.actor_id, event.target.checked)} data-testid={`episode-main-cast-toggle-${season.season_number}-${ep.episode_number}-${castIndex}`} />
                              {actors.find((actor) => actor.id === member.actor_id)?.name || "Actor"}
                              {member.character_name && <span className="text-slate-500">as {member.character_name}</span>}
                            </label>
                          ))}
                          {!form.main_cast.some((member) => member.actor_id) && <span className="text-xs text-slate-500">Add actors to the series main cast first.</span>}
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-xs text-slate-400 block mb-1">Episode stills ({(ep.stills || []).length} images)</Label>
                        <GalleryUpload value={ep.stills || []} onChange={(v) => updEp(si, ei, "stills", v)} />
                      </div>

                      <div className="mt-3 pl-3 border-l-2 border-amber-500/40">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Guest stars</span>
                          <Button type="button" variant="outline" onClick={() => addGuest(si, ei)} className="border-white/20 text-white hover:bg-white/10 hover:text-white h-6 text-xs">
                            <Plus className="w-3 h-3 mr-1" /> Guest
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {(ep.guest_stars || []).map((gs, gi) => (
                            <div key={gi} className="flex items-center gap-2">
                              <Select value={gs.actor_id} onValueChange={(v) => updGuest(si, ei, gi, "actor_id", v)}>
                                <SelectTrigger className="flex-1 bg-[#0d0f12] border-white/10 text-white h-8 text-xs"><SelectValue placeholder="Actor" /></SelectTrigger>
                                <SelectContent className="bg-[#14181f] text-white border-white/10 max-h-56">
                                  {actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input placeholder="Character" value={gs.character_name} onChange={(e) => updGuest(si, ei, gi, "character_name", e.target.value)} className="flex-1 bg-[#0d0f12] border-white/10 text-white h-8 text-xs" />
                              <Button type="button" variant="ghost" onClick={() => remGuest(si, ei, gi)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"><X className="w-3 h-3" /></Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
              </div>}
            </div>
          ))}
          {form.seasons.length === 0 && <div className="text-sm text-slate-500 py-4">No seasons yet — click "Add season" to start.</div>}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-white/10">
        <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="series-submit-btn">
          {series?.id ? "Update Series" : "Create Series"}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
      </div>
    </form>
  );
}
