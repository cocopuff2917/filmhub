import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Shield, ShieldOff, Ban, CheckCircle, Users } from "lucide-react";
import { toast } from "sonner";
import MovieForm from "@/components/forms/MovieForm";
import ActorForm from "@/components/forms/ActorForm";
import SeriesForm from "@/components/forms/SeriesForm";

export default function Admin() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (initializing) return;
    if (!user) { navigate("/login"); return; }
    if (!["moderator", "admin"].includes(user.role)) { navigate("/"); }
  }, [user, initializing, navigate]);

  if (initializing || !user || !["moderator", "admin"].includes(user.role)) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <Shield className="w-4 h-4" /> {user.role === "admin" ? "Admin" : "Moderator"} Console
      </div>
      <h1 className="mt-2 font-heading text-4xl font-bold text-white">Manage Catalog</h1>

      <Tabs defaultValue="movies" className="mt-8">
        <TabsList className="bg-[#14181f] border border-white/10">
          <TabsTrigger value="movies" data-testid="tab-movies">Movies</TabsTrigger>
          <TabsTrigger value="series" data-testid="tab-series">TV Series</TabsTrigger>
          <TabsTrigger value="actors" data-testid="tab-actors">Actors</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="movies" className="mt-6"><EntityAdmin kind="movie" /></TabsContent>
        <TabsContent value="series" className="mt-6"><EntityAdmin kind="series" /></TabsContent>
        <TabsContent value="actors" className="mt-6"><EntityAdmin kind="actor" /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab currentRole={user.role} /></TabsContent>
      </Tabs>
    </div>
  );
}

function EntityAdmin({ kind }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState("list"); // list | form

  const endpoint = kind === "movie" ? "/movies" : kind === "series" ? "/series" : "/actors";
  const label = kind === "movie" ? "Movie" : kind === "series" ? "Series" : "Actor";

  const load = async () => { const r = await api.get(endpoint); setItems(r.data); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

  const del = async (id) => {
    if (!window.confirm(`Delete this ${label.toLowerCase()}?`)) return;
    try { await api.delete(`${endpoint}/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed to delete"); }
  };

  const onSaved = () => { setMode("list"); setEditing(null); load(); };

  if (mode === "form") {
    return (
      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>{editing ? `Edit ${label}` : `New ${label}`}</CardTitle></CardHeader>
        <CardContent>
          {kind === "movie" && <MovieForm movie={editing} onSaved={onSaved} onCancel={() => { setMode("list"); setEditing(null); }} />}
          {kind === "series" && <SeriesForm series={editing} onSaved={onSaved} onCancel={() => { setMode("list"); setEditing(null); }} />}
          {kind === "actor" && <ActorForm actor={editing} onSaved={onSaved} onCancel={() => { setMode("list"); setEditing(null); }} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#14181f] border-white/10 text-white">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All {label}s ({items.length})</CardTitle>
        <Button onClick={() => { setEditing(null); setMode("form"); }} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid={`admin-new-${kind}`}>
          + New {label}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3" data-testid={`admin-${kind}-row-${it.id}`}>
              <div className={`${kind === "actor" ? "w-14 h-14 rounded-full" : "w-14 h-20 rounded"} bg-[#1e2430] overflow-hidden flex-shrink-0`}>
                {(it.poster_url || it.photo_url) && <img src={fileUrl(it.poster_url || it.photo_url)} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{it.title || it.name}</div>
                <div className="text-xs text-slate-400 truncate">
                  {kind === "movie" && (it.release_date || "—")}
                  {kind === "series" && `${it.first_air_date?.slice(0, 4) || "—"} • ${it.season_count || 0}s ${it.episode_count || 0}ep`}
                  {kind === "actor" && (it.birth_date || "—")}
                </div>
                {it.is_trending && <Badge className="mt-1 bg-amber-500/15 text-amber-300 border-amber-500/40">Trending</Badge>}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEditing(it); setMode("form"); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`edit-${kind}-${it.id}`}><Edit className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => del(it.id)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10" data-testid={`delete-${kind}-${it.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          {items.length === 0 && <div className="text-slate-500 text-sm col-span-2">No {label.toLowerCase()}s yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function UsersTab({ currentRole }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [duration, setDuration] = useState("7");
  const [reason, setReason] = useState("");

  const load = async () => { const r = await api.get("/moderation/users"); setUsers(r.data); };
  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  const isSuspended = (u) => {
    const s = u.suspended_until;
    if (!s) return false;
    if (s === "permanent") return true;
    try { return new Date(s) > new Date(); } catch { return false; }
  };

  const submitSuspend = async () => {
    const body = { reason };
    if (duration !== "permanent") body.duration_days = Number(duration);
    try {
      await api.post(`/moderation/users/${suspendTarget.id}/suspend`, body);
      toast.success("User suspended");
      setSuspendTarget(null); setReason(""); setDuration("7"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const unsuspend = async (uid) => {
    if (!window.confirm("Lift suspension?")) return;
    await api.post(`/moderation/users/${uid}/unsuspend`); toast.success("Unsuspended"); load();
  };

  const setRole = async (uid, role) => {
    try { await api.patch(`/moderation/users/${uid}/role`, { role }); toast.success(`Role set to ${role}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <Card className="bg-[#14181f] border-white/10 text-white">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> All Users ({users.length})</CardTitle>
        <Input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs bg-[#0d0f12] border-white/10 text-white" data-testid="users-search-input" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3" data-testid={`user-row-${u.id}`}>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-sm text-slate-400 flex-shrink-0">
                {u.avatar_url ? <img src={fileUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : (u.name?.[0] || "?")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{u.name}</div>
                <div className="text-xs text-slate-400 truncate">{u.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={
                    u.role === "admin" ? "bg-rose-500/15 text-rose-300 border-rose-500/40" :
                    u.role === "moderator" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" :
                    "bg-white/5 text-slate-300 border-white/10"
                  }>{u.role}</Badge>
                  {isSuspended(u) && <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/40">Suspended{u.suspended_until === "permanent" ? " (permanent)" : ` until ${u.suspended_until?.slice(0,10)}`}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentRole === "admin" && u.role !== "admin" && (
                  <Select value={u.role} onValueChange={(v) => setRole(u.id, v)}>
                    <SelectTrigger className="w-[140px] h-9 bg-[#0d0f12] border-white/10 text-white text-xs" data-testid={`role-select-${u.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#14181f] text-white border-white/10">
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {u.role !== "admin" && (
                  isSuspended(u) ? (
                    <Button size="sm" variant="outline" onClick={() => unsuspend(u.id)} className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" data-testid={`unsuspend-${u.id}`}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Unsuspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setSuspendTarget(u)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid={`suspend-${u.id}`}>
                      <Ban className="w-4 h-4 mr-1" /> Suspend
                    </Button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {suspendTarget && (
          <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/5 p-5">
            <div className="font-heading text-lg text-white mb-3">Suspend {suspendTarget.name}?</div>
            <div className="grid grid-cols-[200px_1fr] gap-3 items-end">
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">Duration</label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1 bg-[#0d0f12] border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#14181f] text-white border-white/10">
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">Reason</label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for suspension" className="mt-1 bg-[#0d0f12] border-white/10 text-white" data-testid="suspend-reason-input" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={submitSuspend} className="bg-rose-500 hover:bg-rose-600 text-white font-semibold" data-testid="suspend-confirm-btn">
                <Ban className="w-4 h-4 mr-1" /> Confirm suspension
              </Button>
              <Button variant="outline" onClick={() => setSuspendTarget(null)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
