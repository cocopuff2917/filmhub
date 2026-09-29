import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ban, Shield, Star, Edit as EditIcon, Ban as BanIcon, User as UserIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import ImageUpload from "@/components/ImageUpload";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UserProfile() {
  const { id } = useParams();
  const { user: current, refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [avatarEdit, setAvatarEdit] = useState(false);
  const [newAvatar, setNewAvatar] = useState("");

  const load = async () => {
    try { const r = await api.get(`/users/${id}`); setProfile(r.data); }
    catch (e) {
      if (e.response?.status === 404) setProfile({ notFound: true });
      else setProfile({ notFound: true });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const isSelf = current && current.id === id;
  const isMod = current && ["moderator", "admin"].includes(current.role);

  const saveAvatar = async () => {
    try {
      await api.patch("/auth/me/avatar", { avatar_url: newAvatar });
      toast.success("Avatar updated");
      setAvatarEdit(false);
      await refresh();
      load();
    } catch { toast.error("Failed to update avatar"); }
  };

  if (!profile) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;
  if (profile.notFound) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">User not found.</div>;

  const roleColor = profile.role === "admin" ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : profile.role === "moderator" ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
    : "bg-white/5 text-slate-300 border-white/10";

  return (
    <div>
      <section className="hero-radial">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
            <div className="rounded-full overflow-hidden aspect-square bg-[#1e2430] border border-white/10 relative">
              {profile.avatar_url ? (
                <img src={fileUrl(profile.avatar_url)} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 font-display text-5xl">{profile.name?.[0] || <UserIcon className="w-10 h-10" />}</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Member Profile</div>
              <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-tight text-white" data-testid="user-name">{profile.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {profile.custom_role ? (
                  <span
                    className="text-xs px-2 py-1 rounded border uppercase tracking-widest font-semibold"
                    style={{ color: profile.custom_role.color, borderColor: profile.custom_role.color + "66", background: profile.custom_role.color + "22" }}
                    data-testid="user-custom-role"
                  >
                    {profile.custom_role.name}
                  </span>
                ) : (
                  <Badge className={roleColor} data-testid="user-role">
                    {profile.role === "admin" && <Shield className="w-3 h-3 mr-1" />}
                    {profile.role === "moderator" && <Shield className="w-3 h-3 mr-1" />}
                    {profile.role}
                  </Badge>
                )}
                {profile.edit_count > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40" data-testid="user-edit-count">
                    <EditIcon className="w-3 h-3 mr-1" /> {profile.edit_count} edit{profile.edit_count !== 1 && "s"}
                  </Badge>
                )}
                {profile.weekly_edit_count > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40" data-testid="user-weekly-count">
                    {profile.weekly_edit_count} this week
                  </Badge>
                )}
                {profile.is_suspended && (
                  <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/40" data-testid="user-suspended-badge">
                    <Ban className="w-3 h-3 mr-1" /> Suspended
                  </Badge>
                )}
                <span className="text-xs text-slate-500">Joined {timeAgo(profile.created_at)}</span>
              </div>

              {profile.is_suspended && (
                <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200" data-testid="user-suspended-panel">
                  <div className="font-semibold mb-1">This account is currently suspended.</div>
                  {profile.suspension_reason && (
                    <div className="text-rose-300/80">Reason: {profile.suspension_reason}</div>
                  )}
                  {profile.suspended_until === "permanent"
                    ? <div className="text-rose-300/80 text-xs mt-1">Duration: permanent</div>
                    : profile.suspended_until
                    ? <div className="text-rose-300/80 text-xs mt-1">Until: {profile.suspended_until.slice(0, 19).replace("T", " ")}</div>
                    : null}
                  <div className="mt-2 text-xs text-slate-400">Only moderators and the user themselves can see this panel.</div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                {isSelf && (
                  <Button variant="outline" onClick={() => { setNewAvatar(profile.avatar_url || ""); setAvatarEdit(true); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-avatar-btn">
                    <Upload className="w-4 h-4 mr-2" /> Change Avatar
                  </Button>
                )}
              </div>

              {avatarEdit && (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#14181f] p-5 max-w-md">
                  <label className="text-sm text-slate-300 block mb-2">Upload new avatar</label>
                  <ImageUpload value={newAvatar} onChange={setNewAvatar} shape="circle" testid="avatar-upload" />
                  <div className="mt-3 flex gap-2">
                    <Button onClick={saveAvatar} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="save-avatar-btn">Save</Button>
                    <Button variant="outline" onClick={() => setAvatarEdit(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Ratings */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><Star className="w-4 h-4" /> Ratings</div>
        <h2 className="mt-2 font-heading text-3xl font-bold text-white">Rated Movies</h2>
        {(!profile.reviews || profile.reviews.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">No rated movies yet.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {profile.reviews.map((r) => (
              <Link to={`/movie/${r.movie_id}`} key={r.id} className="flex items-center gap-4 rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition" data-testid={`user-review-${r.id}`}>
                <div className="w-12 h-16 rounded bg-[#1e2430] overflow-hidden flex-shrink-0">
                  {r.movie_poster_url && <img src={fileUrl(r.movie_poster_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-white font-semibold truncate">{r.movie_title || "(deleted movie)"}</span>
                    <span className="flex items-center gap-1 text-amber-400 font-bold"><Star className="w-4 h-4 fill-amber-400" /> {r.rating}</span>
                  </div>
                  {r.text && <div className="text-sm text-slate-400 mt-1 line-clamp-2">{r.text}</div>}
                  <div className="text-xs text-slate-500 mt-0.5">{timeAgo(r.created_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Edit stats */}
      {profile.edit_count > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6" data-testid="user-edit-stats">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Total edits</div>
              <div className="mt-1 font-display text-3xl text-amber-400">{profile.edit_count}</div>
            </div>
            <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">This week</div>
              <div className="mt-1 font-display text-3xl text-emerald-400">{profile.weekly_edit_count || 0}</div>
            </div>
            <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Created</div>
              <div className="mt-1 font-display text-3xl text-sky-400">{profile.edit_breakdown?.create || 0}</div>
            </div>
            <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Updated</div>
              <div className="mt-1 font-display text-3xl text-white">{profile.edit_breakdown?.update || 0}</div>
            </div>
          </div>
          {profile.edit_by_type && Object.keys(profile.edit_by_type).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(profile.edit_by_type).map(([k, v]) => (
                <div key={k} className="rounded-full bg-[#14181f] border border-white/10 px-3 py-1 text-xs text-slate-300">
                  <span className="text-slate-500 uppercase tracking-widest">{k}s</span> <span className="text-white font-semibold ml-1">{v}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Edit history */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><EditIcon className="w-4 h-4" /> Contributions</div>
        <h2 className="mt-2 font-heading text-3xl font-bold text-white">Edit History</h2>
        {(!profile.edits || profile.edits.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">No edits recorded yet.</div>
        ) : (
          <ol className="mt-6 relative border-l border-white/10 ml-2 space-y-4">
            {profile.edits.map((e) => (
              <li key={e.id} className="pl-6 relative" data-testid={`user-edit-${e.id}`}>
                <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#0d0f12] border border-white/20" />
                <div className="text-sm">
                  <Link to={`/${e.entity_type === "series" ? "series" : e.entity_type === "movie" ? "movie" : "actor"}/${e.entity_id}`} className="text-white font-medium hover:text-amber-400">
                    {e.entity_title || "(deleted)"}
                  </Link>
                  <span className="ml-2 text-xs uppercase tracking-widest text-amber-400">{e.action}</span>
                  <span className="ml-2 text-xs text-slate-500">{timeAgo(e.created_at)}</span>
                </div>
                {e.summary && <div className="text-xs text-slate-400 mt-0.5">{e.summary}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
