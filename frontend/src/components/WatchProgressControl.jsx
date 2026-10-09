import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

const STATUSES = [
  ["plan_to_watch", "Plan to watch"],
  ["watching", "Watching"],
  ["watched", "Watched"],
  ["dropped", "Dropped"],
];

export default function WatchProgressControl({ kind, entityId }) {
  const { user } = useAuth();
  const [status, setStatus] = useState("plan_to_watch");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [minutes, setMinutes] = useState("");
  const [hasProgress, setHasProgress] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !entityId) return undefined;
    let active = true;
    api.get(`/watch-progress/${kind}/${entityId}`)
      .then(({ data }) => {
        if (!active) return;
        setStatus(data.status || "plan_to_watch");
        setHasProgress(!!data.has_progress);
        setSeason(data.season_number ?? "");
        setEpisode(data.episode_number ?? "");
        setMinutes(data.minutes_watched ?? "");
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user, kind, entityId]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put(`/watch-progress/${kind}/${entityId}`, {
        status,
        season_number: kind === "series" && season !== "" ? Number(season) : null,
        episode_number: kind === "series" && episode !== "" ? Number(episode) : null,
        minutes_watched: kind === "movie" && minutes !== "" ? Number(minutes) : null,
      });
      setHasProgress(true);
      toast.success("Watch progress saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save watch progress");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await api.delete(`/watch-progress/${kind}/${entityId}`);
      setStatus("plan_to_watch");
      setSeason("");
      setEpisode("");
      setMinutes("");
      setHasProgress(false);
      toast.success("Watch progress cleared");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not clear watch progress");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 text-sm text-slate-400"><Link to="/login" className="text-amber-400 hover:text-amber-300">Sign in</Link> to track your progress.</div>;
  }

  return (
    <form onSubmit={save} className="mx-auto flex max-w-7xl flex-wrap items-end gap-3 border-b border-white/10 px-4 py-5 sm:px-6 lg:px-8" data-testid={`watch-progress-${kind}`}>
      <div className="min-w-[180px] flex-1">
        <label htmlFor={`watch-status-${kind}`} className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-400">Your status</label>
        <select id={`watch-status-${kind}`} value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-md border border-white/15 bg-[#14181f] px-3 text-sm text-white" data-testid="watch-status-select">
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {kind === "series" ? (
        <>
          <label className="text-xs text-slate-400">Season<input type="number" min="0" value={season} onChange={(event) => setSeason(event.target.value)} className="mt-1 block h-10 w-24 rounded-md border border-white/15 bg-[#14181f] px-3 text-sm text-white" data-testid="watch-season-input" /></label>
          <label className="text-xs text-slate-400">Episode<input type="number" min="0" value={episode} onChange={(event) => setEpisode(event.target.value)} className="mt-1 block h-10 w-24 rounded-md border border-white/15 bg-[#14181f] px-3 text-sm text-white" data-testid="watch-episode-input" /></label>
        </>
      ) : (
        <label className="text-xs text-slate-400">Minutes watched<input type="number" min="0" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-1 block h-10 w-36 rounded-md border border-white/15 bg-[#14181f] px-3 text-sm text-white" data-testid="watch-minutes-input" /></label>
      )}
      <Button type="submit" disabled={saving} className="h-10 bg-amber-500 font-semibold text-black hover:bg-amber-600" data-testid="watch-progress-save">{saving ? "Saving…" : "Save progress"}</Button>
      {hasProgress && <Button type="button" onClick={clear} disabled={saving} variant="outline" className="h-10 border-white/20 text-white hover:bg-white/10 hover:text-white" title="Clear progress" data-testid="watch-progress-clear"><RotateCcw className="mr-2 h-4 w-4" /> Clear</Button>}
    </form>
  );
}
