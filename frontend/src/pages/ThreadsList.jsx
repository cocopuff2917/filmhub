import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Plus, Flag, LifeBuoy, Users } from "lucide-react";
import { toast } from "sonner";

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

const catIcon = {
  support: <LifeBuoy className="w-4 h-4" />,
  report: <Flag className="w-4 h-4" />,
  general: <Users className="w-4 h-4" />,
};
const catColor = {
  support: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  report: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  general: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

export default function ThreadsList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "all";
  const status = params.get("status") || "all";
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const q = {};
    if (category !== "all") q.category = category;
    if (status !== "all") q.status = status;
    try { const r = await api.get("/threads", { params: q }); setThreads(r.data); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category, status]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (!v || v === "all") p.delete(k); else p.set(k, v);
    setParams(p);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <MessageSquare className="w-4 h-4" /> Community Forum
      </div>
      <div className="mt-2 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-4xl font-bold text-white">Threads</h1>
        {user && (
          <Button onClick={() => setCreateOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="new-thread-btn">
            <Plus className="w-4 h-4 mr-2" /> New Thread
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Tabs value={category} onValueChange={(v) => setParam("category", v)}>
          <TabsList className="bg-[#14181f] border border-white/10">
            <TabsTrigger value="all" data-testid="threads-tab-all">All</TabsTrigger>
            <TabsTrigger value="support" data-testid="threads-tab-support">Support</TabsTrigger>
            <TabsTrigger value="report" data-testid="threads-tab-report">Reports</TabsTrigger>
            <TabsTrigger value="general" data-testid="threads-tab-general">General</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={status} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="w-[140px] bg-[#14181f] border-white/10 text-white"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#14181f] text-white border-white/10">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-8 space-y-3">
        {loading ? <div className="text-slate-500">Loading...</div> :
          threads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-16 text-center text-slate-500 text-sm">
              No threads yet. Start the conversation!
            </div>
          ) : threads.map((t) => (
            <Link to={`/threads/${t.id}`} key={t.id} className="block rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition" data-testid={`thread-row-${t.id}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                  {t.user_avatar ? <img src={fileUrl(t.user_avatar)} alt="" className="w-full h-full object-cover" /> : (t.user_name?.[0] || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={catColor[t.category]}>
                      <span className="inline-flex items-center gap-1">{catIcon[t.category]}{t.category}</span>
                    </Badge>
                    {t.status === "closed" && <Badge className="bg-white/5 text-slate-400 border-white/10">closed</Badge>}
                    {t.entity_title && <span className="text-xs text-slate-500">on <span className="text-amber-400">{t.entity_title}</span></span>}
                  </div>
                  <div className="mt-1 font-heading text-white font-semibold line-clamp-1">{t.title}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{t.user_name}</span>
                    <span>•</span>
                    <span>{timeAgo(t.last_activity_at || t.created_at)}</span>
                    <span>•</span>
                    <span>{t.message_count} repl{t.message_count !== 1 ? "ies" : "y"}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
      </div>

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
        <DialogHeader><DialogTitle>Start a Thread</DialogTitle></DialogHeader>
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
