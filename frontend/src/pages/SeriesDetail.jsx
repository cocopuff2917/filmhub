import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, Tv, Users, PlayCircle, UserPlus, Edit, Trash2, ImageIcon, Flag, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EntityEditDialog from "@/components/EntityEditDialog";
import EditHistoryPanel from "@/components/EditHistoryPanel";
import SimilarSection from "@/components/SimilarSection";
import DiscussionSection from "@/components/DiscussionSection";
import ReportDialog from "@/components/ReportDialog";
import LockFieldsDialog from "@/components/LockFieldsDialog";

export default function SeriesDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const load = async () => { try { const r = await api.get(`/series/${id}`); setSeries(r.data); } catch {} };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const canDelete = user && ["moderator", "admin"].includes(user.role);

  const del = async () => {
    if (!window.confirm(`Delete "${series.title}"?`)) return;
    try { await api.delete(`/series/${id}`); toast.success("Deleted"); navigate("/"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!series) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const startYear = series.first_air_date ? series.first_air_date.slice(0, 4) : "";
  const endYear = series.last_air_date ? series.last_air_date.slice(0, 4) : "";
  const yearRange = startYear ? (endYear && endYear !== startYear ? `${startYear} – ${endYear}` : startYear) : "";
  const backdrop = series.backdrop_url ? fileUrl(series.backdrop_url) : (series.poster_url ? fileUrl(series.poster_url) : null);
  const poster = series.poster_url ? fileUrl(series.poster_url) : null;
  const sortedSeasons = [...(series.seasons || [])].sort((a, b) => (a.season_number || 0) - (b.season_number || 0));

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {backdrop && <img src={backdrop} alt="" className="w-full h-full object-cover blur-sm opacity-30" />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0f12]/70 via-[#0d0f12]/85 to-[#0d0f12]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,240px)_1fr] lg:grid-cols-[minmax(0,300px)_1fr] gap-8 items-start">
            <div className="rounded-xl overflow-hidden bg-[#1e2430] border border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] aspect-[2/3]">
              {poster ? <img src={poster} alt={series.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-2xl">NO POSTER</div>}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
                <Tv className="w-4 h-4" /> TV Series
                {series.status && <span className="text-slate-500 normal-case tracking-normal">• {series.status}</span>}
              </div>
              <h1 className="mt-4 font-display text-5xl sm:text-6xl lg:text-7xl leading-none tracking-tight text-white" data-testid="series-title">{series.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-slate-300">
                {yearRange && <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400" /> {yearRange}</span>}
                <span>{series.season_count} season{series.season_count !== 1 && "s"}</span>
                <span>{series.episode_count} episode{series.episode_count !== 1 && "s"}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(series.genres || []).map((g) => <Badge key={g} className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">{g}</Badge>)}
              </div>
              <p className="mt-6 text-slate-300 leading-relaxed max-w-3xl" data-testid="series-synopsis">{series.synopsis || "No synopsis available."}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {series.trailer_url && (
                  <a href={series.trailer_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white"><PlayCircle className="w-4 h-4 mr-2" /> Watch Trailer</Button>
                  </a>
                )}
                {user && (
                  <Button variant="outline" onClick={() => setEditOpen(true)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-series-btn">
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                )}
                {user && (
                  <Button variant="outline" onClick={() => setReportOpen(true)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="report-series-btn">
                    <Flag className="w-4 h-4 mr-2" /> Report a Problem
                  </Button>
                )}
                {canDelete && (
                  <>
                    <Button variant="outline" onClick={() => setLockOpen(true)} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200" data-testid="lock-series-btn">
                      <Lock className="w-4 h-4 mr-2" /> Locks{series.locked_fields?.length ? ` (${series.locked_fields.length})` : ""}
                    </Button>
                    <Button variant="outline" onClick={del} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="delete-series-btn">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Cast */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><Users className="w-4 h-4" /> Main Cast</div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Series Regulars</h2>
        {(!series.main_cast || series.main_cast.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No main cast added yet.</div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {series.main_cast.map((c, idx) => (
              <Link to={`/actor/${c.actor.id}`} key={idx} className="group block rounded-xl overflow-hidden bg-[#14181f] border border-white/5 poster-hover">
                <div className="aspect-square bg-[#1e2430] overflow-hidden">
                  {c.actor.photo_url ? <img src={fileUrl(c.actor.photo_url)} alt={c.actor.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-xl">{c.actor.name?.[0] || "?"}</div>}
                </div>
                <div className="p-3">
                  <div className="font-semibold text-white text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{c.actor.name}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">as {c.character_name}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Seasons & Episodes */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">Seasons & Episodes</h2>
        {sortedSeasons.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No seasons added yet.</div>
        ) : (
          <Accordion type="single" collapsible className="mt-6 space-y-3" defaultValue={`s-${sortedSeasons[0].season_number}`}>
            {sortedSeasons.map((season) => (
              <AccordionItem key={season.season_number} value={`s-${season.season_number}`} className="border border-white/10 rounded-xl bg-[#14181f] px-4 data-[state=open]:border-amber-500/40">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-14 h-20 rounded-md overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center flex-shrink-0">
                      {season.poster_url ? <img src={fileUrl(season.poster_url)} alt="" className="w-full h-full object-cover" /> : <span className="font-display text-amber-400 text-xl">S{season.season_number}</span>}
                    </div>
                    <div>
                      <div className="font-heading text-lg font-semibold text-white">
                        {season.name || `Season ${season.season_number}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {season.episodes?.length || 0} episode{(season.episodes?.length || 0) !== 1 && "s"}
                        {season.air_date && ` • ${season.air_date}`}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {season.overview && <p className="text-sm text-slate-400 mb-4">{season.overview}</p>}
                  <div className="space-y-3">
                    {(season.episodes || []).sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0)).map((ep, i) => {
                      const stills = (ep.stills && ep.stills.length > 0) ? ep.stills : (ep.still_url ? [ep.still_url] : []);
                      return (
                      <div key={i} className="rounded-lg bg-[#0d0f12] border border-white/10 overflow-hidden">
                        <div className="flex flex-col sm:flex-row">
                          {stills.length > 0 && (
                            <div className="sm:w-52 h-32 sm:h-auto flex-shrink-0 bg-[#1e2430] overflow-hidden">
                              <img src={fileUrl(stills[0])} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 p-4">
                            <div className="flex items-baseline gap-3">
                              <span className="font-display text-amber-400 text-xl">E{ep.episode_number}</span>
                              <div className="flex-1">
                                <div className="font-heading text-white font-semibold">{ep.name || `Episode ${ep.episode_number}`}</div>
                                {ep.air_date && <div className="text-xs text-slate-500 mt-0.5">{ep.air_date}</div>}
                              </div>
                            </div>
                            {ep.overview && <p className="mt-2 text-sm text-slate-400">{ep.overview}</p>}
                            {stills.length > 1 && (
                              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {stills.slice(1).map((s, si2) => (
                                  <div key={si2} className="rounded overflow-hidden aspect-video bg-[#1e2430] border border-white/5">
                                    <img src={fileUrl(s)} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            )}
                            {ep.guest_stars && ep.guest_stars.length > 0 && (
                              <div className="mt-3">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2">
                                  <UserPlus className="w-3.5 h-3.5" /> Guest Stars
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {ep.guest_stars.map((gs, gi) => (
                                    <Link key={gi} to={`/actor/${gs.actor.id}`} className="flex items-center gap-2 rounded-full bg-[#14181f] border border-white/10 pl-1 pr-3 py-1 hover:border-amber-500/40 hover:bg-amber-500/5 transition">
                                      <div className="w-6 h-6 rounded-full bg-[#1e2430] overflow-hidden flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                                        {gs.actor.photo_url ? <img src={fileUrl(gs.actor.photo_url)} alt="" className="w-full h-full object-cover" /> : <span>{gs.actor.name?.[0]}</span>}
                                      </div>
                                      <span className="text-xs text-white">{gs.actor.name}</span>
                                      <span className="text-xs text-slate-500">as {gs.character_name}</span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                    {(!season.episodes || season.episodes.length === 0) && <div className="text-sm text-slate-500">No episodes yet.</div>}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      {/* Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><ImageIcon className="w-4 h-4" /> Media</div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Gallery</h2>
        {series.gallery && series.gallery.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
            {series.gallery.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden aspect-video bg-[#1e2430] border border-white/5">
                <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No gallery images yet. Edit this series to upload some.</div>
        )}
      </section>

      {/* Similar */}
      <SimilarSection kind="series" entityId={id} />

      {/* Discussion */}
      <DiscussionSection entityType="series" entityId={id} />

      {/* History */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <EditHistoryPanel key={historyKey} entityType="series" entityId={id} onReverted={load} />
      </section>

      <EntityEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entityType="series"
        entity={series}
        onSaved={() => { load(); setHistoryKey((k) => k + 1); }}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="series" entityId={id} entityTitle={series.title} />
      <LockFieldsDialog open={lockOpen} onOpenChange={setLockOpen} entityType="series" entity={series} onSaved={(d) => { setSeries(d); setHistoryKey((k) => k + 1); }} />
    </div>
  );
}
