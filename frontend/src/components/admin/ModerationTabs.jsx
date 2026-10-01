import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Film, Tv, UserRound, Layers, Trash2, Ban, FileWarning,
  Clock, Activity, TrendingUp, History, RotateCcw, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

// ---------- shared helpers ----------
function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
function roleTint(role) {
  if (role === "admin") return "text-rose-300 border-rose-500/40 bg-rose-500/10";
  if (role === "moderator") return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  return "text-slate-300 border-white/10 bg-white/5";
}
function actionTint(action) {
  if (action === "delete" || action === "suspend") return "text-rose-300";
  if (action === "update" || action === "suspend-update") return "text-amber-300";
  if (action === "create") return "text-emerald-300";
  if (action === "unsuspend" || action === "restore") return "text-emerald-300";
  if (action === "revert") return "text-sky-300";
  return "text-slate-300";
}

// =====================================================
// DASHBOARD TAB
// =====================================================
export function DashboardTab() {
  const [data, setData] = useState(null);
  const load = async () => {
    try { const r = await api.get("/moderation/stats"); setData(r.data); }
    catch (e) { toast.error("Failed to load stats"); }
  };
  useEffect(() => { load(); }, []);

  if (!data) return <div className="text-slate-400 py-8" data-testid="dashboard-loading">Loading dashboard…</div>;

  const cards = [
    { label: "Movies", value: data.content.movies, icon: Film, tint: "from-rose-500/20 to-rose-500/0" },
    { label: "TV Series", value: data.content.series, icon: Tv, tint: "from-sky-500/20 to-sky-500/0" },
    { label: "Actors", value: data.content.actors, icon: UserRound, tint: "from-fuchsia-500/20 to-fuchsia-500/0" },
    { label: "Collections", value: data.content.collections, icon: Layers, tint: "from-indigo-500/20 to-indigo-500/0" },
    { label: "Users", value: data.users.total, sub: `+${data.users.new_7d} this week`, icon: Users, tint: "from-emerald-500/20 to-emerald-500/0" },
    { label: "Moderators", value: data.users.moderators, icon: Users, tint: "from-amber-500/20 to-amber-500/0" },
    { label: "Open Reports", value: data.reports.open, icon: FileWarning, tint: "from-orange-500/20 to-orange-500/0", danger: data.reports.open > 0 },
    { label: "Active Suspensions", value: data.users.active_suspensions, icon: Ban, tint: "from-rose-500/20 to-rose-500/0", danger: data.users.active_suspensions > 0 },
    { label: "Edits (24h)", value: data.activity.edits_24h, sub: `${data.activity.edits_7d} in 7d`, icon: Activity, tint: "from-teal-500/20 to-teal-500/0" },
    { label: "Trash", value: data.content.trash, icon: Trash2, tint: "from-slate-500/20 to-slate-500/0" },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-tab">
      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`relative overflow-hidden rounded-xl border bg-[#0d0f12] p-4 ${c.danger ? "border-rose-500/40" : "border-white/10"}`}
              data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${c.tint} pointer-events-none`} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">{c.label}</div>
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <div className={`mt-2 font-heading text-3xl font-bold ${c.danger ? "text-rose-300" : "text-white"}`}>{c.value.toLocaleString()}</div>
                {c.sub && <div className="text-[11px] text-slate-500 mt-0.5">{c.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* TWO-COLUMN: recent edits + active suspensions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-[#0d0f12]" data-testid="recent-edits-panel">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <History className="w-4 h-4 text-amber-300" /> Recent edits
            </div>
            <span className="text-[11px] text-slate-500">Last {data.recent_edits.length}</span>
          </div>
          <ul className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {data.recent_edits.map((e) => (
              <li key={e.id} className="px-4 py-2.5 hover:bg-white/5 transition-colors text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`uppercase text-[10px] font-bold tracking-widest ${actionTint(e.action)}`}>{e.action}</span>
                  <span className="text-white/90 truncate max-w-[260px]">{e.entity_title || "—"}</span>
                  <Badge className={`${roleTint(e.user_role)} text-[10px]`}>{e.user_name || "—"}</Badge>
                  <span className="text-[10px] text-slate-500 ml-auto">{timeAgo(e.created_at)}</span>
                </div>
                {e.summary && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{e.summary}</div>}
              </li>
            ))}
            {data.recent_edits.length === 0 && <li className="px-4 py-6 text-slate-500 text-sm">No recent edits.</li>}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d0f12]" data-testid="active-suspensions-panel">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Ban className="w-4 h-4 text-rose-300" /> Active suspensions
            </div>
            <span className="text-[11px] text-slate-500">{data.users.active_suspensions} total</span>
          </div>
          <ul className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {data.active_suspensions.map((u) => (
              <li key={u.id} className="px-4 py-2.5 hover:bg-white/5 flex items-center gap-3 text-sm" data-testid={`active-sus-${u.id}`}>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center text-xs text-white flex-shrink-0">
                  {u.avatar_url ? <img src={fileUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : (u.name?.[0]?.toUpperCase() || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate font-medium">{u.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {u.suspended_until === "permanent" ? "permanent" : `until ${u.suspended_until?.slice(0, 10)}`}
                    {u.suspension_reason ? ` · ${u.suspension_reason}` : ""}
                  </div>
                </div>
                <Link to={`/user/${u.id}`} className="text-[11px] text-amber-400 hover:text-amber-300 inline-flex items-center gap-1" data-testid={`view-user-${u.id}`}>
                  View <ArrowRight className="w-3 h-3" />
                </Link>
              </li>
            ))}
            {data.active_suspensions.length === 0 && <li className="px-4 py-6 text-slate-500 text-sm">No active suspensions.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// REPORTS TAB — thread category=report
// =====================================================
export function ReportsTab() {
  const [status, setStatus] = useState("open");
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/threads?category=report${status === "all" ? "" : `&status=${status}`}&limit=200`);
      setThreads(r.data);
    } catch { toast.error("Failed to load reports"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const changeStatus = async (id, newStatus) => {
    try {
      await api.patch(`/threads/${id}/status`, { status: newStatus });
      toast.success(`Report ${newStatus}`);
      load();
    } catch { toast.error("Failed to update"); }
  };

  return (
    <div className="space-y-4" data-testid="reports-tab">
      <div className="flex items-center gap-3">
        <h3 className="text-white font-heading text-lg">Reports Queue</h3>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40 bg-[#0d0f12] border-white/10 text-white h-8" data-testid="reports-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0d0f12] border-white/10 text-white">
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500">{threads.length} shown</span>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0d0f12] overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-400 text-sm">Loading…</div>
        ) : threads.length === 0 ? (
          <div className="p-6 text-slate-500 text-sm">No reports.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {threads.map((t) => (
              <li key={t.id} className="px-4 py-3 hover:bg-white/5" data-testid={`report-${t.id}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-1 self-stretch rounded ${t.status === "open" ? "bg-rose-500" : "bg-slate-600"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/threads/${t.id}`} className="text-white font-medium hover:text-amber-300 truncate max-w-md" data-testid={`report-title-${t.id}`}>
                        {t.title}
                      </Link>
                      <Badge className={`text-[10px] uppercase ${t.status === "open" ? "bg-rose-500/15 text-rose-300 border-rose-500/40" : "bg-white/5 text-slate-300 border-white/10"}`}>{t.status}</Badge>
                      {t.entity_type && <Badge className="text-[10px] bg-white/5 text-slate-300 border-white/10">{t.entity_type}</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      by {t.user_name || "—"} · {timeAgo(t.created_at)} · {t.message_count || 0} replies
                    </div>
                    {t.body && <div className="text-[12px] text-slate-400 mt-1 line-clamp-2">{t.body}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === "open" ? (
                      <Button size="sm" variant="outline" className="h-7 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => changeStatus(t.id, "closed")} data-testid={`close-report-${t.id}`}>Close</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => changeStatus(t.id, "open")} data-testid={`reopen-report-${t.id}`}>Reopen</Button>
                    )}
                    <Link to={`/threads/${t.id}`} className="h-7 inline-flex items-center text-xs px-3 rounded border border-amber-500/50 text-amber-300 hover:bg-amber-500/10" data-testid={`open-report-${t.id}`}>Open</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// =====================================================
// SUSPENSIONS TAB
// =====================================================
export function SuspensionsTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [includeExpired, setIncludeExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/moderation/suspensions?include_expired=${includeExpired}${q ? `&q=${encodeURIComponent(q)}` : ""}&limit=500`);
      setRows(r.data);
    } catch { toast.error("Failed to load suspensions"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeExpired]);

  const unsuspend = async (id, name) => {
    if (!window.confirm(`Lift suspension on ${name}?`)) return;
    try {
      await api.post(`/moderation/users/${id}/unsuspend`);
      toast.success("Suspension lifted");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4" data-testid="suspensions-tab">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-white font-heading text-lg">Suspensions</h3>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search name or email…"
          className="w-64 bg-[#0d0f12] border-white/10 text-white h-8"
          data-testid="suspensions-search"
        />
        <Button size="sm" variant="outline" className="h-8 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={load} data-testid="suspensions-search-btn">Search</Button>
        <label className="inline-flex items-center gap-2 text-xs text-slate-300 ml-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => setIncludeExpired(e.target.checked)}
            className="accent-amber-500"
            data-testid="suspensions-include-expired"
          />
          Include expired
        </label>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} shown</span>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0d0f12] overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-slate-500 text-sm">No suspensions.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-[11px] uppercase tracking-widest">
              <tr>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Reason</th>
                <th className="text-left px-4 py-2 font-medium">Until</th>
                <th className="text-left px-4 py-2 font-medium">By</th>
                <th className="text-left px-4 py-2 font-medium">Started</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-white/5" data-testid={`sus-row-${u.id}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center text-xs text-white flex-shrink-0">
                        {u.avatar_url ? <img src={fileUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" /> : (u.name?.[0]?.toUpperCase() || "?")}
                      </div>
                      <div>
                        <div className="text-white font-medium">{u.name}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </div>
                      {!u.is_active && <Badge className="text-[10px] bg-white/5 text-slate-400 border-white/10">expired</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-300 max-w-[280px] truncate">{u.suspension_reason || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {u.suspended_until === "permanent"
                      ? <Badge className="text-[10px] bg-rose-500/10 text-rose-300 border-rose-500/40">permanent</Badge>
                      : u.suspended_until?.slice(0, 10) || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{u.suspended_by_name || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-[11px]">{u.suspended_at ? timeAgo(u.suspended_at) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link to={`/user/${u.id}`} className="text-[11px] text-amber-400 hover:text-amber-300" data-testid={`sus-view-${u.id}`}>View</Link>
                      {u.is_active && (
                        <Button size="sm" variant="outline" className="h-7 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" onClick={() => unsuspend(u.id, u.name)} data-testid={`sus-lift-${u.id}`}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Unsuspend
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =====================================================
// EDIT HISTORY TAB — filterable browser
// =====================================================
export function EditHistoryTab() {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    entity_type: "all",
    action: "all",
    date_from: "",
    date_to: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.entity_type !== "all") params.set("entity_type", filters.entity_type);
      if (filters.action !== "all") params.set("action", filters.action);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      params.set("limit", "200");
      const r = await api.get(`/edits?${params.toString()}`);
      setEdits(r.data);
    } catch { toast.error("Failed to load edits"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const resetFilters = () => {
    setFilters({ q: "", entity_type: "all", action: "all", date_from: "", date_to: "" });
    setTimeout(load, 0);
  };

  return (
    <div className="space-y-4" data-testid="edits-tab">
      <h3 className="text-white font-heading text-lg">Edit History</h3>

      <div className="rounded-xl border border-white/10 bg-[#0d0f12] p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
        <Input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search title, summary, user…"
          className="md:col-span-2 bg-[#14181f] border-white/10 text-white h-8"
          data-testid="edits-search"
        />
        <Select value={filters.entity_type} onValueChange={(v) => setFilters({ ...filters, entity_type: v })}>
          <SelectTrigger className="bg-[#14181f] border-white/10 text-white h-8" data-testid="edits-entity-filter"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#0d0f12] border-white/10 text-white">
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="movie">Movies</SelectItem>
            <SelectItem value="series">TV Series</SelectItem>
            <SelectItem value="actor">Actors</SelectItem>
            <SelectItem value="user">Users</SelectItem>
            <SelectItem value="collection">Collections</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.action} onValueChange={(v) => setFilters({ ...filters, action: v })}>
          <SelectTrigger className="bg-[#14181f] border-white/10 text-white h-8" data-testid="edits-action-filter"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#0d0f12] border-white/10 text-white">
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="restore">Restore</SelectItem>
            <SelectItem value="revert">Revert</SelectItem>
            <SelectItem value="suspend">Suspend</SelectItem>
            <SelectItem value="suspend-update">Update Suspension</SelectItem>
            <SelectItem value="unsuspend">Unsuspend</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          className="bg-[#14181f] border-white/10 text-white h-8"
          data-testid="edits-date-from"
        />
        <Input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          className="bg-[#14181f] border-white/10 text-white h-8"
          data-testid="edits-date-to"
        />
        <div className="md:col-span-6 flex items-center gap-2 justify-end">
          <Button size="sm" variant="outline" className="h-8 border-white/15 text-slate-200 hover:bg-white/10 hover:text-white" onClick={resetFilters} data-testid="edits-reset">Reset</Button>
          <Button size="sm" className="h-8 bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={load} data-testid="edits-apply">Apply</Button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0d0f12] overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-400 text-sm">Loading…</div>
        ) : edits.length === 0 ? (
          <div className="p-6 text-slate-500 text-sm">No edits match these filters.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {edits.map((e) => (
              <li key={e.id} className="px-4 py-2.5 hover:bg-white/5 text-sm" data-testid={`edit-${e.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`uppercase text-[10px] font-bold tracking-widest ${actionTint(e.action)}`}>{e.action}</span>
                  <Badge className="text-[10px] bg-white/5 border-white/10 text-slate-300">{e.entity_type}</Badge>
                  <span className="text-white/90 truncate max-w-md font-medium">{e.entity_title || "—"}</span>
                  {e.user_name && <Badge className={`${roleTint(e.user_role)} text-[10px]`}>{e.user_name}</Badge>}
                  <span className="text-[10px] text-slate-500 ml-auto">{timeAgo(e.created_at)}</span>
                </div>
                {e.summary && <div className="text-[11px] text-slate-400 mt-0.5">{e.summary}</div>}
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-white/5">{edits.length} entries (max 200). Narrow filters to refine.</div>
      </div>
    </div>
  );
}
