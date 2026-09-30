import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import ForumSidebar from "@/components/ForumSidebar";

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

const catLabel = { support: "Support", general: "General", report: "Reports" };

export default function ThreadsList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "all";
  const status = params.get("status") || "all";
  const [q, setQ] = useState(params.get("q") || "");
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const p = {};
    if (category !== "all") p.category = category;
    if (status !== "all") p.status = status;
    try {
      const r = await api.get("/threads", { params: p });
      setThreads(r.data);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category, status]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (!v || v === "all") p.delete(k); else p.set(k, v);
    setParams(p);
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter(
      (t) => (t.title || "").toLowerCase().includes(query) || (t.body || "").toLowerCase().includes(query)
    );
  }, [threads, q]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((t) => {
      const key = t.category || "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col lg:flex-row bg-[#0a0d14] min-h-[calc(100vh-64px)]" data-testid="threads-list-page">
      <ForumSidebar activeCategory={category} onNewDiscussion={() => setCreateOpen(true)} />

      <main className="flex-1 min-w-0 px-4 sm:px-8 py-8">
        <h1 className="font-heading text-3xl text-white font-bold mb-6" data-testid="threads-heading">CineVerse Forum</h1>

        {/* Search row */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-6">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the forums..."
            className="flex-1 bg-[#0d1220] border-white/10 text-white placeholder:text-slate-500"
            data-testid="forum-search-input"
          />
          <Select value={category} onValueChange={(v) => setParam("category", v)}>
            <SelectTrigger className="w-full sm:w-40 bg-[#0d1220] border-white/10 text-white" data-testid="forum-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#14181f] text-white border-white/10">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="report">Reports</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger className="w-full sm:w-36 bg-[#0d1220] border-white/10 text-white" data-testid="forum-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="bg-[#14181f] text-white border-white/10">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={load}
            className="bg-white/10 hover:bg-white/15 text-white border border-white/10"
            data-testid="forum-search-btn"
          >
            Search
          </Button>
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-[#0d1220]/50 py-16 text-center text-slate-500 text-sm">
            No threads yet. Start the conversation!
          </div>
        ) : (
          grouped.map(([cat, rows]) => (
            <section key={cat} className="rounded-lg overflow-hidden border border-white/5 mb-8" data-testid={`forum-section-${cat}`}>
              <div className="px-5 py-3 bg-white/[0.04] border-b border-white/5">
                <span className="text-sm text-slate-400">Support</span>
                <span className="mx-2 text-slate-500">›</span>
                <span className="text-sm font-semibold text-white">{catLabel[cat] || "General"}</span>
              </div>
              <ul className="divide-y divide-white/5 bg-[#0d1220]/40">
                {rows.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/threads/${t.id}`}
                      className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.03] transition"
                      data-testid={`thread-row-${t.id}`}
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                        {t.user_avatar ? (
                          <img src={fileUrl(t.user_avatar)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (t.user_name?.[0] || "?")
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{t.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span className="text-slate-400">{t.user_name}</span> replied
                          <span className="mx-1">·</span>
                          <span className="underline decoration-dotted">{timeAgo(t.last_activity_at || t.created_at)}</span>
                        </div>
                        {t.body && (
                          <p className="mt-2 text-sm text-slate-400 line-clamp-1">{t.body}</p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          {t.status === "closed" ? (
                            <span className="uppercase font-bold text-slate-500 line-through" data-testid={`thread-status-${t.id}`}>Closed</span>
                          ) : (
                            <span className="uppercase font-bold text-emerald-400" data-testid={`thread-status-${t.id}`}>Open</span>
                          )}
                          <span className="text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <MessageSquare className="w-3.5 h-3.5" /> {t.message_count || 0}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      <NewThreadDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(t) => navigate(`/threads/${t.id}`)} />
    </div>
  );
}

function NewThreadDialog({ open, onOpenChange, onCreated }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("support");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (title.trim().length < 3) { toast.error("Title must be at least 3 characters"); return; }
    setBusy(true);
    try {
      const r = await api.post("/threads", { title, body, category });
      onOpenChange(false);
      setTitle(""); setBody(""); setCategory("support");
      toast.success("Thread created");
      onCreated && onCreated(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#14181f] border-white/10 text-white max-w-lg">
        <DialogHeader><DialogTitle>New Discussion</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-slate-300">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" data-testid="thread-category-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#14181f] text-white border-white/10">
                <SelectItem value="support">Support — I need help</SelectItem>
                <SelectItem value="general">General — Discussion</SelectItem>
                <SelectItem value="report">Report — Content issue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-300">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" required data-testid="thread-title-input" />
          </div>
          <div>
            <Label className="text-slate-300">Body</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1.5 bg-[#0d0f12] border-white/10 text-white" required data-testid="thread-body-input" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="thread-create-btn">Create thread</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/20 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
