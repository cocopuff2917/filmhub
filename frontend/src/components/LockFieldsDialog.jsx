import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

// lockable field configs per entity type
const LOCKABLE = {
  movie: [
    { field: "title", label: "Title" },
    { field: "synopsis", label: "Description / Synopsis" },
    { field: "release_date", label: "Release date" },
    { field: "genres", label: "Genres" },
    { field: "poster_url", label: "Poster" },
    { field: "backdrop_url", label: "Backdrop" },
    { field: "gallery", label: "Gallery" },
    { field: "cast", label: "Cast members" },
    { field: "trailer_url", label: "Trailer" },
    { field: "is_trending", label: "Trending flag" },
  ],
  series: [
    { field: "title", label: "Title" },
    { field: "synopsis", label: "Description / Synopsis" },
    { field: "first_air_date", label: "First air date" },
    { field: "last_air_date", label: "End date / Last air date" },
    { field: "status", label: "Status" },
    { field: "genres", label: "Genres" },
    { field: "poster_url", label: "Poster" },
    { field: "backdrop_url", label: "Backdrop" },
    { field: "gallery", label: "Gallery" },
    { field: "main_cast", label: "Main cast" },
    { field: "seasons", label: "Seasons & Episodes" },
    { field: "trailer_url", label: "Trailer" },
  ],
  actor: [
    { field: "name", label: "Name" },
    { field: "bio", label: "Biography" },
    { field: "photo_url", label: "Headshot" },
    { field: "gallery", label: "Gallery" },
    { field: "birth_date", label: "Date of birth" },
    { field: "death_date", label: "Date of death" },
    { field: "place_of_birth", label: "Place of birth" },
    { field: "place_of_death", label: "Place of death" },
  ],
};

export default function LockFieldsDialog({ open, onOpenChange, entityType, entity, onSaved }) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(entity?.locked_fields || []);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLocked(entity?.locked_fields || []); }, [entity]);

  if (!user || !["moderator", "admin"].includes(user.role)) return null;

  const options = LOCKABLE[entityType] || [];
  const toggle = (field) => setLocked((prev) => prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]);

  const save = async () => {
    setBusy(true);
    try {
      const endpoint = entityType === "movie" ? `/movies/${entity.id}/lock`
        : entityType === "series" ? `/series/${entity.id}/lock`
        : `/actors/${entity.id}/lock`;
      const r = await api.patch(endpoint, { locked_fields: locked });
      toast.success("Field locks updated");
      onOpenChange(false);
      onSaved && onSaved(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-lg" data-testid="lock-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-amber-400" /> Protect Fields from Edits</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-400">
          Locked fields can only be changed by moderators or admins. Non-mod editors will see a lock and get a 403 if they try to modify.
        </p>
        <div className="mt-4 max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {options.map((opt) => (
            <label key={opt.field} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0d0f12] px-4 py-3 cursor-pointer hover:border-amber-500/40 transition">
              <div className="flex items-center gap-3">
                {locked.includes(opt.field) ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-slate-500" />}
                <div>
                  <div className="text-sm font-semibold text-white">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{opt.field}</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={locked.includes(opt.field)}
                onChange={() => toggle(opt.field)}
                className="w-4 h-4 accent-amber-500"
                data-testid={`lock-toggle-${opt.field}`}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-4 border-t border-white/10">
          <Button onClick={save} disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="lock-save-btn">Save locks</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LockedBadge({ lockedFields }) {
  if (!lockedFields || lockedFields.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-amber-400 font-semibold" data-testid="locked-badge">
      <Lock className="w-3 h-3" />
      {lockedFields.length} locked field{lockedFields.length !== 1 && "s"}
    </span>
  );
}
