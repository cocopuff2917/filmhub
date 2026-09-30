import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Shield, ShieldOff, Ban, CheckCircle, Users, Network, ChevronDown, ChevronUp, MessageSquare, RotateCcw, Trash, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import MovieForm from "@/components/forms/MovieForm";
import ActorForm from "@/components/forms/ActorForm";
import SeriesForm from "@/components/forms/SeriesForm";
import MessageUserDialog from "@/components/MessageUserDialog";

export default function Admin() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (initializing) return;
    if (!user) { navigate("/login"); return; }
    if (!["moderator", "admin"].includes(user.role)) { navigate("/"); }
  }, [user, initializing, navigate]);

  if (initializing || !user || !["moderator", "admin"].includes(user.role) && !["moderator", "admin"].includes(user.effective_role)) return null;

  const canManageRoles = user.role === "admin" || user.effective_role === "admin";

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
          <TabsTrigger value="ips" data-testid="tab-ips">IP Overlap</TabsTrigger>
          <TabsTrigger value="trash" data-testid="tab-trash">Trash</TabsTrigger>
          <TabsTrigger value="collections" data-testid="tab-collections">Collections</TabsTrigger>
          {canManageRoles && <TabsTrigger value="roles" data-testid="tab-roles">Custom Roles</TabsTrigger>}
        </TabsList>
        <TabsContent value="movies" className="mt-6"><EntityAdmin kind="movie" /></TabsContent>
        <TabsContent value="series" className="mt-6"><EntityAdmin kind="series" /></TabsContent>
        <TabsContent value="actors" className="mt-6"><EntityAdmin kind="actor" /></TabsContent>
        <TabsContent value="users" className="mt-6"><UsersTab currentRole={user.effective_role || user.role} /></TabsContent>
        <TabsContent value="ips" className="mt-6"><IpOverlapTab /></TabsContent>
        <TabsContent value="trash" className="mt-6"><TrashTab currentRole={user.effective_role || user.role} /></TabsContent>
        <TabsContent value="collections" className="mt-6"><CollectionsTab /></TabsContent>
        {canManageRoles && <TabsContent value="roles" className="mt-6"><RolesTab /></TabsContent>}
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
  const [customRoles, setCustomRoles] = useState([]);
  const [query, setQuery] = useState("");
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [duration, setDuration] = useState("7");
  const [customDays, setCustomDays] = useState("");
  const [reason, setReason] = useState("");
  const [messageTarget, setMessageTarget] = useState(null);
  const [ipData, setIpData] = useState({});
  const [ipLoading, setIpLoading] = useState({});
  const [ipOpen, setIpOpen] = useState({});

  const load = async () => {
    const [u, r] = await Promise.all([api.get("/moderation/users"), api.get("/roles")]);
    setUsers(u.data); setCustomRoles(r.data);
  };
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
    if (duration === "permanent") {
      // no duration_days
    } else if (duration === "custom") {
      const n = Number(customDays);
      if (!n || n <= 0) { toast.error("Enter a valid number of days"); return; }
      body.duration_days = n;
    } else {
      body.duration_days = Number(duration);
    }
    try {
      await api.post(`/moderation/users/${suspendTarget.id}/suspend`, body);
      toast.success("User suspended");
      setSuspendTarget(null); setReason(""); setDuration("7"); setCustomDays(""); load();
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

  const toggleIps = async (uid) => {
    const isOpen = !!ipOpen[uid];
    setIpOpen((s) => ({ ...s, [uid]: !isOpen }));
    if (isOpen) return;
    if (ipData[uid]) return;
    setIpLoading((s) => ({ ...s, [uid]: true }));
    try {
      const r = await api.get(`/moderation/users/${uid}/ips`);
      setIpData((s) => ({ ...s, [uid]: r.data }));
    } catch (e) { toast.error("Failed to load IPs"); }
    setIpLoading((s) => ({ ...s, [uid]: false }));
  };

  const setCustomRole = async (uid, crid) => {
    try {
      await api.patch(`/moderation/users/${uid}/custom-role`, { custom_role_id: crid || null });
      toast.success(crid ? "Custom role assigned" : "Custom role removed");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
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
            <div key={u.id} data-testid={`user-row-${u.id}`}>
            <div className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-sm text-slate-400 flex-shrink-0">
                {u.avatar_url ? <img src={fileUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : (u.name?.[0] || "?")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{u.name}</div>
                <div className="text-xs text-slate-400 truncate">{u.email}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge className={
                    u.role === "admin" ? "bg-rose-500/15 text-rose-300 border-rose-500/40" :
                    u.role === "moderator" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" :
                    "bg-white/5 text-slate-300 border-white/10"
                  }>{u.role}</Badge>
                  {u.custom_role && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-semibold" style={{ color: u.custom_role.color, borderColor: u.custom_role.color + "66", background: u.custom_role.color + "22" }}>
                      {u.custom_role.name}
                    </span>
                  )}
                  {u.ip_count > 0 && (
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">{u.ip_count} IP{u.ip_count !== 1 && "s"}</span>
                  )}
                  {isSuspended(u) && <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/40">Suspended{u.suspended_until === "permanent" ? " (permanent)" : ` until ${u.suspended_until?.slice(0,10)}`}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleIps(u.id)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`ips-toggle-${u.id}`}>
                  <Network className="w-4 h-4 mr-1" /> IPs
                  {ipOpen[u.id] ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                </Button>
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
                {currentRole === "admin" && u.role !== "admin" && (
                  <Select
                    value={u.custom_role?.id || "__none__"}
                    onValueChange={(v) => setCustomRole(u.id, v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="w-[160px] h-9 bg-[#0d0f12] border-white/10 text-white text-xs" data-testid={`custom-role-select-${u.id}`}>
                      <SelectValue placeholder="Custom role…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#14181f] text-white border-white/10">
                      <SelectItem value="__none__">No custom role</SelectItem>
                      {customRoles.map((cr) => (
                        <SelectItem key={cr.id} value={cr.id}>
                          <span style={{ color: cr.color }}>●</span> <span className="ml-1">{cr.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {u.role !== "admin" && (
                  <Button size="sm" variant="outline" onClick={() => setMessageTarget(u)} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200" data-testid={`message-user-${u.id}`}>
                    <MessageSquare className="w-4 h-4 mr-1" /> Message
                  </Button>
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
            {ipOpen[u.id] && (
              <div className="mt-2 rounded-lg border border-white/10 bg-[#0d0f12] p-4 ml-13" data-testid={`ip-panel-${u.id}`}>
                {ipLoading[u.id] ? (
                  <div className="text-sm text-slate-500">Loading IPs...</div>
                ) : !ipData[u.id] || !ipData[u.id].ips?.length ? (
                  <div className="text-sm text-slate-500">No IPs recorded yet for this user.</div>
                ) : (
                  <div className="space-y-3">
                    {ipData[u.id].ips.map((entry, i) => (
                      <div key={i} className="rounded border border-white/10 bg-[#14181f] p-3">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <div className="font-mono text-amber-400 text-sm" data-testid={`ip-address-${u.id}-${i}`}>{entry.ip}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {entry.count} sign-in{entry.count !== 1 && "s"} • last {entry.last_seen?.slice(0, 19).replace("T", " ")}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500">
                            first {entry.first_seen?.slice(0, 10)}
                          </div>
                        </div>
                        {entry.shared_with && entry.shared_with.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <div className="text-[10px] uppercase tracking-widest text-rose-300 font-semibold mb-2">
                              Shared with {entry.shared_with.length} other account{entry.shared_with.length !== 1 && "s"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {entry.shared_with.map((s) => (
                                <Link to={`/user/${s.id}`} key={s.id} className="flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-500/30 pl-1 pr-3 py-1 hover:bg-rose-500/20 transition" data-testid={`shared-account-${s.id}`}>
                                  <div className="w-5 h-5 rounded-full bg-[#1e2430] overflow-hidden flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
                                    {s.avatar_url ? <img src={fileUrl(s.avatar_url)} alt="" className="w-full h-full object-cover" /> : (s.name?.[0] || "?")}
                                  </div>
                                  <span className="text-xs text-white">{s.name}</span>
                                  <span className="text-[10px] text-rose-200/70">{s.role}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
        </div>

        {suspendTarget && (
          <Dialog open={!!suspendTarget} onOpenChange={(v) => { if (!v) { setSuspendTarget(null); setReason(""); setDuration("7"); setCustomDays(""); } }}>
            <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-lg" data-testid="suspend-user-dialog">
              <DialogHeader>
                <DialogTitle>Suspend {suspendTarget.name}?</DialogTitle>
                <DialogDescription className="text-slate-400">
                  The user will only see "Support" — your identity is hidden from them. They keep read-only access to their inbox.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-400">Duration</label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="mt-1 bg-[#0d0f12] border-white/10 text-white" data-testid="suspend-duration-select"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#14181f] text-white border-white/10">
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="custom">Custom…</SelectItem>
                      <SelectItem value="permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {duration === "custom" && (
                  <div>
                    <label className="text-xs uppercase tracking-widest text-slate-400">Days</label>
                    <Input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="e.g. 45" className="mt-1 bg-[#0d0f12] border-white/10 text-white" data-testid="suspend-custom-days" />
                  </div>
                )}
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-400">Reason (private — not shown to user)</label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Internal note visible only to moderators" className="mt-1 bg-[#0d0f12] border-white/10 text-white" data-testid="suspend-reason-input" />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setSuspendTarget(null)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                <Button onClick={submitSuspend} className="bg-rose-500 hover:bg-rose-600 text-white font-semibold" data-testid="suspend-confirm-btn">
                  <Ban className="w-4 h-4 mr-1" /> Confirm suspension
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
      <MessageUserDialog
        open={!!messageTarget}
        onOpenChange={(v) => { if (!v) setMessageTarget(null); }}
        targetUser={messageTarget}
        onSent={() => { setMessageTarget(null); load(); }}
      />
    </Card>
  );
}


function IpOverlapTab() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => { try { const r = await api.get("/moderation/ip-groups"); setGroups(r.data); } catch {} setLoading(false); })();
  }, []);
  return (
    <Card className="bg-[#14181f] border-white/10 text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5" /> Shared IP Addresses ({groups.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-slate-500 text-sm">Loading...</div> : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0d0f12] py-16 text-center text-slate-500 text-sm">
            No IPs are shared by multiple accounts yet.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.ip} className="rounded-lg border border-white/10 bg-[#0d0f12] p-4" data-testid={`ip-group-${g.ip}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="font-mono text-amber-400 text-lg">{g.ip}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{g.count} accounts sharing this address</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {g.users.map((u) => (
                    <Link to={`/user/${u.id}`} key={u.id} className="flex items-center gap-2 rounded-full bg-[#14181f] border border-white/10 pl-1 pr-3 py-1 hover:border-amber-500/40 hover:bg-amber-500/5 transition">
                      <div className="w-6 h-6 rounded-full bg-[#1e2430] overflow-hidden flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
                        {u.avatar_url ? <img src={fileUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : (u.name?.[0] || "?")}
                      </div>
                      <span className="text-xs text-white">{u.name}</span>
                      <span className="text-[10px] text-slate-500">{u.role}</span>
                      {u.suspended_until && <Ban className="w-3 h-3 text-rose-400" />}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [permGroups, setPermGroups] = useState({});
  const [editing, setEditing] = useState(null);
  const empty = { name: "", color: "#f59e0b", description: "", permissions: [] };
  const [form, setForm] = useState(empty);

  const load = async () => {
    const [r, p] = await Promise.all([api.get("/roles"), api.get("/roles/permissions")]);
    setRoles(r.data); setPermGroups(p.data);
  };
  useEffect(() => { load(); }, []);

  const togglePerm = (key) => {
    setForm((f) => {
      const has = f.permissions.includes(key);
      return { ...f, permissions: has ? f.permissions.filter((p) => p !== key) : [...f.permissions, key] };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.patch(`/roles/${editing.id}`, form); toast.success("Role updated"); }
      else { await api.post("/roles", form); toast.success("Role created"); }
      setEditing(null); setForm(empty); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this role? Users assigned to it will lose the badge.")) return;
    try { await api.delete(`/roles/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const derivedBase = (() => {
    const perms = new Set(form.permissions);
    if ([...perms].some((p) => ["user.assign_role", "user.assign_custom_role", "roles.manage"].includes(p))) return "admin";
    if ([...perms].some((p) => ["content.delete","content.lock","user.suspend","user.view_ips","thread.moderate","comment.moderate","content.edit_locked"].includes(p))) return "moderator";
    return "user";
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>{editing ? "Edit Role" : "New Custom Role"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm text-slate-300">Name</label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Trusted Editor" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="role-name-input" />
            </div>
            <div>
              <label className="text-sm text-slate-300">Badge color</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-12 h-10 rounded border border-white/10 bg-[#0d0f12] cursor-pointer" data-testid="role-color-input" />
                <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="bg-[#0d0f12] border-white/10 text-white font-mono text-xs" />
                <span className="ml-auto text-[10px] px-2 py-1 rounded border uppercase tracking-widest font-semibold" style={{ color: form.color, borderColor: form.color + "66", background: form.color + "22" }}>
                  {form.name || "Preview"}
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-300">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" />
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-sm text-slate-300 font-semibold">Permissions</label>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">Derived tier: <span className={derivedBase === "admin" ? "text-rose-400" : derivedBase === "moderator" ? "text-sky-400" : "text-slate-400"}>{derivedBase}</span></span>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {Object.entries(permGroups).map(([group, items]) => (
                  items.length === 0 ? null : (
                    <div key={group}>
                      <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold mb-2">{group}</div>
                      <div className="space-y-1.5">
                        {items.map((p) => (
                          <label key={p.key} className="flex items-start gap-3 rounded border border-white/10 bg-[#0d0f12] px-3 py-2 cursor-pointer hover:border-amber-500/40 transition">
                            <input type="checkbox" checked={form.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} className="mt-0.5 w-4 h-4 accent-amber-500" data-testid={`perm-${p.key}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white">{p.label}</div>
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                                <span>{p.key}</span>
                                <span className={p.tier === "admin" ? "text-rose-400" : "text-sky-400"}>{p.tier}</span>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="role-submit-btn">{editing ? "Update role" : "Create role"}</Button>
              {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(empty); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-[#14181f] border-white/10 text-white">
        <CardHeader><CardTitle>All Custom Roles ({roles.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="rounded-lg bg-[#0d0f12] border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] px-2 py-1 rounded border uppercase tracking-widest font-semibold" style={{ color: r.color, borderColor: r.color + "66", background: r.color + "22" }}>{r.name}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-300 truncate">{r.description || <span className="text-slate-600">No description</span>}</div>
                    <div className="text-xs text-slate-500">Tier: <span className={r.base === "admin" ? "text-rose-400" : r.base === "moderator" ? "text-sky-400" : ""}>{r.base}</span> • {r.permissions.length} permission{r.permissions.length !== 1 && "s"}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setForm({ name: r.name, color: r.color, description: r.description || "", permissions: r.permissions || [] }); }} className="border-white/20 text-white hover:bg-white/10 hover:text-white">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(r.id)} className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                </div>
                {r.permissions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.permissions.map((p) => (
                      <span key={p} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {roles.length === 0 && <div className="text-slate-500 text-sm">No custom roles yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrashTab({ currentRole }) {
  const [trash, setTrash] = useState({ movies: [], series: [], actors: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const isAdmin = currentRole === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/moderation/trash");
      setTrash(r.data || { movies: [], series: [], actors: [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load trash");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const restore = async (kind, id) => {
    setBusyId(id);
    try {
      await api.post(`/moderation/${kind}/${id}/restore`);
      toast.success("Restored");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Restore failed");
    }
    setBusyId(null);
  };

  const purge = async (kind, id, title) => {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await api.delete(`/moderation/${kind}/${id}/purge`);
      toast.success("Permanently deleted");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
    setBusyId(null);
  };

  const totalCount =
    (trash.movies?.length || 0) + (trash.series?.length || 0) + (trash.actors?.length || 0);

  const renderRow = (item) => (
    <div
      key={`${item.type}-${item.id}`}
      className="flex items-center gap-3 rounded-lg bg-[#0d0f12] border border-white/10 p-3"
      data-testid={`trash-row-${item.type}-${item.id}`}
    >
      <div className="w-12 h-16 rounded overflow-hidden bg-[#1e2430] border border-white/10 flex-shrink-0">
        {item.poster_url ? (
          <img src={fileUrl(item.poster_url)} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-white/5 text-slate-300 border-white/10 uppercase">{item.type}</Badge>
          {item.release_date && (
            <span className="text-xs text-slate-500">{item.release_date.slice(0, 4)}</span>
          )}
        </div>
        <div className="mt-1 font-semibold text-white truncate">{item.title}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Deleted{item.deleted_by_name ? ` by ${item.deleted_by_name}` : ""}
          {item.deleted_at ? ` • ${item.deleted_at.slice(0, 19).replace("T", " ")}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => restore(item.type, item.id)}
          disabled={busyId === item.id}
          className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
          data-testid={`trash-restore-${item.type}-${item.id}`}
        >
          <RotateCcw className="w-4 h-4 mr-1" /> Restore
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => purge(item.type, item.id, item.title)}
            disabled={busyId === item.id}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            data-testid={`trash-purge-${item.type}-${item.id}`}
          >
            <Trash className="w-4 h-4 mr-1" /> Delete forever
          </Button>
        )}
      </div>
    </div>
  );

  const Section = ({ label, items }) =>
    items.length === 0 ? null : (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold pt-2">
          {label} ({items.length})
        </div>
        {items.map(renderRow)}
      </div>
    );

  return (
    <Card className="bg-[#14181f] border-white/10 text-white" data-testid="trash-tab">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> Trash ({totalCount})
        </CardTitle>
        <div className="text-xs text-slate-500">
          {isAdmin
            ? "Restore any deleted item, or permanently delete it."
            : "Restore any deleted item. Only admins can permanently delete."}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0d0f12]/50 py-16 text-center" data-testid="trash-empty">
            <Trash2 className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="mt-3 text-slate-400 text-sm">Trash is empty. Deleted movies, series and actors show up here.</div>
          </div>
        ) : (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <Section label="Movies" items={trash.movies || []} />
            <Section label="TV Series" items={trash.series || []} />
            <Section label="Actors" items={trash.actors || []} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CollectionsTab() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | {id, name, ...}
  const [form, setForm] = useState({ name: "", description: "", poster_url: "", backdrop_url: "" });
  const [expanded, setExpanded] = useState({}); // id -> collection detail
  const [detailLoading, setDetailLoading] = useState({});
  const [pickerFor, setPickerFor] = useState(null); // collection id when picking title
  const [pickQuery, setPickQuery] = useState("");
  const [pickResults, setPickResults] = useState([]);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/collections"); setCollections(r.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing({}); setForm({ name: "", description: "", poster_url: "", backdrop_url: "" }); };
  const startEdit = (c) => { setEditing(c); setForm({ name: c.name || "", description: c.description || "", poster_url: c.poster_url || "", backdrop_url: c.backdrop_url || "" }); };
  const cancel = () => { setEditing(null); setForm({ name: "", description: "", poster_url: "", backdrop_url: "" }); };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) { toast.error("Name required (min 2 chars)"); return; }
    try {
      if (editing && editing.id) {
        await api.patch(`/collections/${editing.id}`, form);
        toast.success("Collection updated");
      } else {
        await api.post("/collections", form);
        toast.success("Collection created");
      }
      cancel(); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? Titles will be detached (not deleted).`)) return;
    try { await api.delete(`/collections/${c.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const toggleExpand = async (c) => {
    const isOpen = !!expanded[c.id];
    if (isOpen) { setExpanded((s) => ({ ...s, [c.id]: null })); return; }
    setDetailLoading((s) => ({ ...s, [c.id]: true }));
    try {
      const r = await api.get(`/collections/${c.id}`);
      setExpanded((s) => ({ ...s, [c.id]: r.data }));
    } catch { toast.error("Failed to load titles"); }
    setDetailLoading((s) => ({ ...s, [c.id]: false }));
  };

  const detachTitle = async (cid, kind, tid) => {
    try {
      await api.post(`/collections/${cid}/remove`, { title_type: kind, title_id: tid });
      const r = await api.get(`/collections/${cid}`);
      setExpanded((s) => ({ ...s, [cid]: r.data }));
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const openPicker = (cid) => { setPickerFor(cid); setPickQuery(""); setPickResults([]); };
  const closePicker = () => { setPickerFor(null); setPickQuery(""); setPickResults([]); };
  const runPickSearch = async () => {
    const q = pickQuery.trim();
    if (!q) { setPickResults([]); return; }
    try {
      const r = await api.get(`/search/suggest?q=${encodeURIComponent(q)}`);
      const movies = (r.data.movies || []).map((x) => ({ ...x, type: "movie" }));
      const series = (r.data.series || []).map((x) => ({ ...x, type: "series" }));
      setPickResults([...movies, ...series]);
    } catch { setPickResults([]); }
  };
  const addToCollection = async (kind, id) => {
    try {
      await api.post(`/collections/${pickerFor}/add`, { title_type: kind, title_id: id });
      toast.success("Added");
      const r = await api.get(`/collections/${pickerFor}`);
      setExpanded((s) => ({ ...s, [pickerFor]: r.data }));
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <Card className="bg-[#14181f] border-white/10 text-white">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Collections ({collections.length})</CardTitle>
        {editing === null && (
          <Button onClick={startCreate} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="collection-new-btn">
            <Plus className="w-4 h-4 mr-1" /> New Collection
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing !== null && (
          <form onSubmit={submit} className="mb-6 rounded-xl border border-white/10 bg-[#0d0f12] p-5 space-y-3" data-testid="collection-form">
            <div>
              <label className="text-xs uppercase tracking-widest text-slate-400">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 bg-[#14181f] border-white/10 text-white" placeholder="e.g. The Lord of the Rings Collection" data-testid="collection-name-input" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-slate-400">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 bg-[#14181f] border-white/10 text-white" placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">Poster URL</label>
                <Input value={form.poster_url} onChange={(e) => setForm({ ...form, poster_url: e.target.value })} className="mt-1 bg-[#14181f] border-white/10 text-white" placeholder="/uploads/... or full URL" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">Backdrop URL</label>
                <Input value={form.backdrop_url} onChange={(e) => setForm({ ...form, backdrop_url: e.target.value })} className="mt-1 bg-[#14181f] border-white/10 text-white" placeholder="/uploads/... or full URL" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="collection-save-btn">Save</Button>
              <Button type="button" variant="outline" onClick={cancel} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : collections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0d0f12]/50 py-16 text-center">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="mt-3 text-slate-400 text-sm">No collections yet. Group franchise titles to power the collection pages.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-[#0d0f12]" data-testid={`collection-row-${c.id}`}>
                <div className="flex items-center gap-3 p-3">
                  {c.poster_url ? <img src={fileUrl(c.poster_url)} alt="" className="w-10 h-14 rounded object-cover border border-white/10" /> : (
                    <div className="w-10 h-14 rounded bg-[#1e2430] border border-white/10 flex items-center justify-center"><Layers className="w-4 h-4 text-slate-500" /></div>
                  )}
                  <Link to={`/collection/${c.id}`} className="flex-1 min-w-0 hover:text-amber-400 transition">
                    <div className="font-semibold text-white truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.total_count} title{c.total_count !== 1 && "s"} · {c.movie_count} movie{c.movie_count !== 1 && "s"} · {c.series_count} series</div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggleExpand(c)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`collection-toggle-${c.id}`}>
                      {expanded[c.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Titles
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(c)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid={`collection-edit-${c.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(c)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid={`collection-delete-${c.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {expanded[c.id] && (
                  <div className="border-t border-white/5 p-3 space-y-3">
                    {detailLoading[c.id] ? (
                      <div className="text-slate-500 text-sm">Loading titles…</div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {(expanded[c.id].titles || []).length === 0 && <div className="text-slate-500 text-sm">No titles attached. Use "Add title" below.</div>}
                          {(expanded[c.id].titles || []).map((t) => (
                            <div key={`${t.kind}-${t.id}`} className="flex items-center gap-2 rounded-full bg-[#14181f] border border-white/10 pl-1 pr-2 py-1">
                              {t.poster_url ? <img src={fileUrl(t.poster_url)} alt="" className="w-6 h-9 rounded object-cover" /> : <div className="w-6 h-9 rounded bg-[#1e2430]" />}
                              <span className="text-xs text-white">{t.title}</span>
                              <span className="text-[10px] text-slate-500 uppercase">{t.kind}{t.year && ` · ${t.year}`}</span>
                              <button type="button" onClick={() => detachTitle(c.id, t.kind, t.id)} className="text-slate-500 hover:text-rose-300" title="Remove from collection">
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <Button size="sm" onClick={() => openPicker(c.id)} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid={`collection-add-title-${c.id}`}>
                          <Plus className="w-4 h-4 mr-1" /> Add title
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {pickerFor && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={closePicker}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl border border-white/10 bg-[#14181f] p-5" data-testid="collection-add-dialog">
              <div className="flex items-center gap-2 text-sm text-slate-300 mb-3"><Plus className="w-4 h-4" /> Add a movie or series to this collection</div>
              <div className="flex gap-2">
                <Input autoFocus value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runPickSearch(); } }} className="bg-[#0d0f12] border-white/10 text-white" placeholder="Search movies & series…" data-testid="collection-add-search" />
                <Button onClick={runPickSearch} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Search</Button>
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
                {pickResults.length === 0 && <div className="text-slate-500 text-sm py-4">Type a title and press Enter.</div>}
                {pickResults.map((r) => (
                  <button key={`${r.type}-${r.id}`} type="button" onClick={() => addToCollection(r.type, r.id)} className="w-full flex items-center gap-3 rounded-lg border border-white/10 bg-[#0d0f12] hover:border-amber-500/40 hover:bg-amber-500/5 p-2 text-left" data-testid={`collection-add-result-${r.id}`}>
                    {r.poster_url ? <img src={fileUrl(r.poster_url)} alt="" className="w-8 h-12 rounded object-cover" /> : <div className="w-8 h-12 rounded bg-[#1e2430]" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{r.title}</div>
                      <div className="text-xs text-slate-500 uppercase">{r.type}{r.year && ` · ${r.year}`}</div>
                    </div>
                    <Plus className="w-4 h-4 text-amber-400" />
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={closePicker} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Close</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


