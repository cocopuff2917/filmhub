import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Edit, LockKeyhole, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import CastEditDialog from "@/components/CastEditDialog";
import ImageUpload, { GalleryUpload } from "@/components/ImageUpload";

const episodePath = (seriesId, seasonNumber, episodeNumber) =>
  `/series/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`;

function EpisodeCredits({ title, members = [], emptyMessage, testId, action, canEditMembers = false, onEditMember, onRemoveMember, isMemberLocked }) {
  return (
    <section className="border-t border-white/10 pt-6" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">{title}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{members.length}</span>
          {action}
        </div>
      </div>
      {members.length ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {members.map((member, index) => {
            const locked = isMemberLocked?.(member);
            return (
              <div key={`${member.actor?.id || member.actor_id}-${index}`} className="flex min-w-0 items-center gap-2">
                <Link to={member.actor?.id ? `/actor/${member.actor.id}` : "#"} className="flex min-w-0 flex-1 items-center gap-3 group">
                  <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-[#1e2430] flex items-center justify-center text-slate-400">
                    {member.actor?.photo_url ? <img src={fileUrl(member.actor.photo_url)} alt="" className="h-full w-full object-cover" /> : (member.actor?.name?.[0] || "?")}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white group-hover:text-amber-400">{member.actor?.name || "Unknown actor"}</div>
                    {member.character_name && <div className="truncate text-xs text-slate-400">as {member.character_name}</div>}
                  </div>
                </Link>
                {canEditMembers && <div className="flex flex-shrink-0 items-center gap-1">
                  {locked && <LockKeyhole className="h-3.5 w-3.5 text-amber-400" aria-label="Locked guest star" />}
                  <Button type="button" size="icon" variant="ghost" onClick={() => onEditMember(index)} disabled={locked} aria-label="Edit guest star" title="Edit guest star" className="h-8 w-8 text-slate-400 hover:text-amber-300"><Edit className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => onRemoveMember(index)} disabled={locked} aria-label="Remove guest star" title="Remove guest star" className="h-8 w-8 text-slate-400 hover:text-rose-300"><X className="h-3.5 w-3.5" /></Button>
                </div>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{emptyMessage}</p>
      )}
    </section>
  );
}

export default function EpisodeDetail() {
  const { id, seasonNumber, episodeNumber } = useParams();
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingMainCast, setEditingMainCast] = useState(false);
  const [selectedMainCast, setSelectedMainCast] = useState([]);
  const [savingMainCast, setSavingMainCast] = useState(false);
  const [guestDialog, setGuestDialog] = useState({ open: false, index: null });
  const [savingGuestStars, setSavingGuestStars] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [episodeDetailsDraft, setEpisodeDetailsDraft] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/series/${id}`)
      .then((response) => { if (active) setSeries(response.data); })
      .catch(() => { if (active) setSeries(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const season = (series?.seasons || []).find((item) => Number(item.season_number) === Number(seasonNumber));
    const episode = (season?.episodes || []).find((item) => Number(item.episode_number) === Number(episodeNumber));
    setSelectedMainCast(episode?.main_cast_actor_ids || []);
    setEditingMainCast(false);
  }, [series, seasonNumber, episodeNumber]);

  const toggleMainCast = (actorId, checked) => setSelectedMainCast((current) => (
    checked ? [...new Set([...current, actorId])] : current.filter((id) => id !== actorId)
  ));

  const saveMainCast = async () => {
    setSavingMainCast(true);
    try {
      const response = await api.patch(`/series/${id}/seasons/${seasonNumber}/episodes/${episodeNumber}/main-cast`, {
        main_cast_actor_ids: selectedMainCast,
      });
      setSeries(response.data);
      setEditingMainCast(false);
      toast.success("Episode cast updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update episode cast");
    } finally {
      setSavingMainCast(false);
    }
  };

  const persistGuestStars = async (guestStars) => {
    setSavingGuestStars(true);
    try {
      const response = await api.patch(`/series/${id}/seasons/${seasonNumber}/episodes/${episodeNumber}/guest-stars`, {
        guest_stars: guestStars.map(({ actor_id, character_name }) => ({ actor_id, character_name })),
      });
      setSeries(response.data);
      toast.success("Episode guest stars updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update episode guest stars");
    } finally {
      setSavingGuestStars(false);
    }
  };

  if (loading) return <main className="mx-auto max-w-7xl px-4 py-20 text-slate-400">Loading episode...</main>;
  if (!series) return <main className="mx-auto max-w-7xl px-4 py-20 text-slate-400">Series not found.</main>;

  const season = (series.seasons || []).find((item) => Number(item.season_number) === Number(seasonNumber));
  const episode = (season?.episodes || []).find((item) => Number(item.episode_number) === Number(episodeNumber));
  if (!season || !episode) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 text-center text-slate-400">
        <h1 className="font-heading text-2xl font-bold text-white">Episode not found</h1>
        <Link to={`/series/${id}`} className="mt-4 inline-flex items-center gap-2 text-amber-400 hover:text-amber-300"><ArrowLeft className="h-4 w-4" /> Back to {series.title}</Link>
      </main>
    );
  }

  const episodes = [...(season.episodes || [])].sort((a, b) => a.episode_number - b.episode_number);
  const episodeIndex = episodes.findIndex((item) => Number(item.episode_number) === Number(episodeNumber));
  const previousEpisode = episodes[episodeIndex - 1];
  const nextEpisode = episodes[episodeIndex + 1];
  const episodeMainCastLocked = (series.locked_main_cast_episodes || []).includes(`${seasonNumber}:${episodeNumber}`);
  const canEditLocked = ["admin", "moderator"].includes(user?.effective_role || user?.role) || (user?.permissions || []).includes("content.edit_locked");
  const canEditGuestStars = !!user && (!(series.locked_fields || []).includes("seasons") || canEditLocked);
  const canEditEpisodeDetails = !!user && (!(series.locked_fields || []).includes("seasons") || canEditLocked);
  const guestStars = episode.guest_stars || [];
  const guestStarLocked = (member) => (series.locked_guest_stars || []).includes(`${seasonNumber}:${episodeNumber}:${member.actor_id}`);
  const saveGuestStar = (row) => {
    const current = episode.guest_stars || [];
    if (current.some((guest, index) => index !== guestDialog.index && guest.actor_id === row.actor_id)) {
      toast.error("This actor is already a guest star on this episode.");
      return;
    }
    const next = guestDialog.index == null
      ? [...current, row]
      : current.map((guest, index) => index === guestDialog.index ? row : guest);
    persistGuestStars(next);
  };
  const removeGuestStar = (index) => persistGuestStars(guestStars.filter((_, guestIndex) => guestIndex !== index));
  const episodeStillUrl = editingDetails ? episodeDetailsDraft?.still_url : episode.still_url;
  const episodePhotos = [...new Set(((editingDetails ? episodeDetailsDraft?.stills : episode.stills) || []).filter(Boolean))];
  const still = episodeStillUrl || episodePhotos[0] || series.backdrop_url || series.poster_url;
  const additionalEpisodePhotos = episodePhotos.filter((image) => image !== still);
  const hasEpisodeStill = !!episodeStillUrl || episodePhotos.includes(still);

  const beginDetailsEdit = () => {
    setEpisodeDetailsDraft({
      name: episode.name || "",
      air_date: episode.air_date || "",
      overview: episode.overview || "",
      still_url: episode.still_url || "",
      stills: episode.stills || [],
    });
    setEditingDetails(true);
  };

  const saveEpisodeDetails = async () => {
    setSavingDetails(true);
    try {
      const response = await api.patch(`/series/${id}/seasons/${seasonNumber}/episodes/${episodeNumber}/details`, {
        name: episodeDetailsDraft.name,
        air_date: episodeDetailsDraft.air_date || null,
        overview: episodeDetailsDraft.overview,
        still_url: episodeDetailsDraft.still_url,
        stills: episodeDetailsDraft.stills,
      });
      setSeries(response.data);
      setEditingDetails(false);
      toast.success("Episode details updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update episode details");
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0d12] text-white" data-testid="episode-detail-page">
      <section className="border-b border-white/10 bg-[#10151d]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-400" aria-label="Breadcrumb">
            <Link to={`/series/${id}`} className="hover:text-amber-400">{series.title}</Link>
            <ChevronRight className="h-4 w-4" />
            <span>{season.name || `Season ${season.season_number}`}</span>
          </nav>
          <div className="mt-8 max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Season {season.season_number} · Episode {episode.episode_number}</div>
            <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl" data-testid="episode-title">{episode.name || `Episode ${episode.episode_number}`}</h1>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8">
        <article className="min-w-0 space-y-8">
          {still && (
            <figure className="overflow-hidden rounded-lg bg-[#14181f]">
              <div className="aspect-video">
                <img src={fileUrl(still)} alt={hasEpisodeStill ? `${episode.name || "Episode"} still` : `${series.title} artwork`} className="h-full w-full object-cover" />
              </div>
              {!hasEpisodeStill && <figcaption className="px-3 py-2 text-xs text-slate-500">Series artwork</figcaption>}
            </figure>
          )}
          <section className="border-y border-white/10 py-5" data-testid="episode-details">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-bold">Episode Details</h2>
              {canEditEpisodeDetails && (editingDetails ? (
                <div className="flex gap-2">
                  <Button type="button" onClick={saveEpisodeDetails} disabled={savingDetails} className="bg-amber-500 text-black hover:bg-amber-600"><Save className="h-4 w-4" />{savingDetails ? "Saving" : "Save"}</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingDetails(false)} disabled={savingDetails} className="text-slate-300"><X className="h-4 w-4" />Cancel</Button>
                </div>
              ) : <Button type="button" size="sm" variant="outline" onClick={beginDetailsEdit} className="border-white/15 text-slate-200"><Edit className="h-3.5 w-3.5" />Edit</Button>)}
            </div>
            {editingDetails ? (
              <div className="mt-4 space-y-4" data-testid="episode-details-editor">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="sm:col-span-2"><span className="text-xs text-slate-500">Episode title</span><Input value={episodeDetailsDraft.name} onChange={(event) => setEpisodeDetailsDraft((draft) => ({ ...draft, name: event.target.value }))} disabled={savingDetails} className="mt-1 bg-[#14181f] border-white/10 text-white" data-testid="episode-name-input" /></label>
                  <label><span className="text-xs text-slate-500">Air date</span><Input type="date" value={episodeDetailsDraft.air_date} onChange={(event) => setEpisodeDetailsDraft((draft) => ({ ...draft, air_date: event.target.value }))} disabled={savingDetails} className="mt-1 bg-[#14181f] border-white/10 text-white" data-testid="episode-air-date-input" /></label>
                </div>
                <div><div className="mb-1 text-xs text-slate-500">Episode still</div><ImageUpload value={episodeDetailsDraft.still_url} onChange={(value) => setEpisodeDetailsDraft((draft) => ({ ...draft, still_url: value }))} canDelete={(user?.permissions || []).includes("content.delete") || ["admin", "moderator"].includes(user?.effective_role || user?.role)} testid="episode-still-upload" /></div>
                <div><div className="mb-1 text-xs text-slate-500">Additional stills</div><GalleryUpload value={episodeDetailsDraft.stills} onChange={(value) => setEpisodeDetailsDraft((draft) => ({ ...draft, stills: value }))} canDelete={(user?.permissions || []).includes("content.delete") || ["admin", "moderator"].includes(user?.effective_role || user?.role)} testid="episode-stills-gallery" /></div>
              </div>
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Season</dt><dd className="mt-1 text-sm text-slate-200">{season.name || `Season ${season.season_number}`}</dd></div>
                <div><dt className="text-xs text-slate-500">Episode</dt><dd className="mt-1 text-sm text-slate-200">{episode.episode_number}</dd></div>
                <div><dt className="text-xs text-slate-500">Air date</dt><dd className="mt-1 flex items-center gap-1.5 text-sm text-slate-200">{episode.air_date ? <><CalendarDays className="h-4 w-4 text-slate-500" />{episode.air_date}</> : "Not announced"}</dd></div>
              </dl>
            )}
          </section>
          <section data-testid="episode-overview">
            <h2 className="font-heading text-xl font-bold">Plot</h2>
            {editingDetails ? (
              <Textarea value={episodeDetailsDraft.overview} onChange={(event) => setEpisodeDetailsDraft((draft) => ({ ...draft, overview: event.target.value }))} disabled={savingDetails} rows={5} className="mt-3 max-w-3xl bg-[#14181f] border-white/10 text-white" data-testid="episode-overview-input" />
            ) : <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-300">{episode.overview || "No episode overview has been added yet."}</p>}
          </section>
          <EpisodeCredits
            title="Main Cast"
            members={episode.main_cast_members || []}
            emptyMessage="No main-cast credits are listed for this episode."
            testId="episode-main-cast"
            action={<>
              {episodeMainCastLocked && <span className="inline-flex items-center gap-1 text-xs text-amber-400"><LockKeyhole className="h-3.5 w-3.5" />Locked</span>}
              {user && !editingMainCast && (!episodeMainCastLocked || canEditLocked) && <Button type="button" size="sm" variant="outline" onClick={() => setEditingMainCast(true)} className="border-white/15 text-slate-200"><Edit className="h-3.5 w-3.5" />Edit</Button>}
            </>}
          />
          {editingMainCast && (
            <section className="border-t border-white/10 pt-6" data-testid="episode-main-cast-editor">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-bold">Edit Main Cast</h2>
                  <p className="mt-1 text-sm text-slate-400">Choose which series cast members appear in this episode.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={saveMainCast} disabled={savingMainCast} className="bg-amber-500 text-black hover:bg-amber-600"><Save className="h-4 w-4" />{savingMainCast ? "Saving" : "Save"}</Button>
                  <Button type="button" variant="ghost" onClick={() => { setSelectedMainCast(episode.main_cast_actor_ids || []); setEditingMainCast(false); }} disabled={savingMainCast} className="text-slate-300"><X className="h-4 w-4" />Cancel</Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(series.main_cast || []).filter((member) => member.actor?.id).map((member) => (
                  <label key={member.actor.id} className="flex items-center gap-3 border border-white/10 bg-[#14181f] px-3 py-2.5 text-sm text-slate-200">
                    <input type="checkbox" className="accent-amber-400" checked={selectedMainCast.includes(member.actor.id)} onChange={(event) => toggleMainCast(member.actor.id, event.target.checked)} />
                    <span className="min-w-0"><span className="block truncate font-medium">{member.actor.name}</span>{member.character_name && <span className="block truncate text-xs text-slate-500">as {member.character_name}</span>}</span>
                  </label>
                ))}
                {(series.main_cast || []).filter((member) => member.actor?.id).length === 0 && <p className="text-sm text-slate-500">Add actors to the series Main Cast section before assigning episode credits.</p>}
              </div>
            </section>
          )}
          <EpisodeCredits
            title="Guest Stars"
            members={guestStars}
            emptyMessage="No guest stars are listed for this episode."
            testId="episode-guest-stars"
            canEditMembers={canEditGuestStars}
            onEditMember={(index) => setGuestDialog({ open: true, index })}
            onRemoveMember={removeGuestStar}
            isMemberLocked={(member) => guestStarLocked(member) && !canEditLocked}
            action={canEditGuestStars && <Button type="button" size="sm" variant="outline" onClick={() => setGuestDialog({ open: true, index: null })} disabled={savingGuestStars} className="border-white/15 text-slate-200"><Plus className="h-3.5 w-3.5" />Add guest star</Button>}
          />
          {additionalEpisodePhotos.length > 0 && (
            <section className="border-t border-white/10 pt-6">
              <h2 className="font-heading text-xl font-bold">Episode Stills</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {additionalEpisodePhotos.map((image, index) => <img key={`${image}-${index}`} src={fileUrl(image)} alt={`${episode.name || "Episode"} still ${index + 2}`} className="aspect-video w-full rounded-md object-cover" loading="lazy" />)}
              </div>
            </section>
          )}
        </article>

        <aside className="space-y-6">
          <section className="border-y border-white/10 py-5">
            <Link to={`/series/${id}`} className="text-xs uppercase tracking-widest text-slate-400 hover:text-amber-400">Back to series</Link>
            <h2 className="mt-2 font-heading text-lg font-bold">{series.title}</h2>
            <div className="mt-1 text-sm text-slate-400">{season.name || `Season ${season.season_number}`}</div>
          </section>
          <nav className="grid grid-cols-2 gap-3" aria-label="Episode navigation">
            {previousEpisode ? (
              <Link to={episodePath(id, seasonNumber, previousEpisode.episode_number)} className="flex items-center gap-2 border border-white/10 p-3 text-sm text-slate-300 hover:border-amber-500/40 hover:text-white"><ArrowLeft className="h-4 w-4 flex-shrink-0" /><span className="min-w-0"><span className="block text-[10px] uppercase text-slate-500">Previous</span><span className="block truncate">{previousEpisode.name || `Episode ${previousEpisode.episode_number}`}</span></span></Link>
            ) : <div />}
            {nextEpisode && <Link to={episodePath(id, seasonNumber, nextEpisode.episode_number)} className="flex items-center justify-end gap-2 border border-white/10 p-3 text-right text-sm text-slate-300 hover:border-amber-500/40 hover:text-white"><span className="min-w-0"><span className="block text-[10px] uppercase text-slate-500">Next</span><span className="block truncate">{nextEpisode.name || `Episode ${nextEpisode.episode_number}`}</span></span><ArrowRight className="h-4 w-4 flex-shrink-0" /></Link>}
          </nav>
        </aside>
      </div>
      <CastEditDialog
        open={guestDialog.open}
        onOpenChange={(open) => setGuestDialog((current) => ({ ...current, open }))}
        actors={guestStars.map((guest) => guest.actor).filter(Boolean)}
        value={guestDialog.index == null ? null : guestStars[guestDialog.index] || null}
        onSave={saveGuestStar}
      />
    </main>
  );
}